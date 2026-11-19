#!/usr/bin/env python3
"""Benthem Scanner — archive pipeline core.

Indexes an archived scan PDF into the right Qdrant collection:
  extract text (baked tesseract layer; GPU OCR chain only when weak)
  -> classify (local gemma4:e4b on the GPU VM, redacted input) -> chunk -> embed
  (nomic 768d) -> upsert continuing max(doc_id).

Privacy by design (mirrors clef_route, 27/10/2026): PII detection is local and
deterministic; the classification excerpt is PII-REDACTED before it reaches any
model. Indexing stays local (Qdrant .30 / Ollama .30).

All stateful machinery (chunking, embeddings, OCR chain) is imported from
/home/alex/hermes_data/scripts/qdrant_ingest.py — this module owns no vector logic.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# --- constants ---------------------------------------------------------------

SHARE_ROOT = Path("/mnt/tank-fast-documents")
STAGING_ROOT = Path("/home/alex/workspace/_qdrant-staging/qdrant-scanner-archive-src")
INBOX_ROOT = Path("/tmp/doc-pipeline-inbox")
QDRANT_URL = "http://192.168.2.30:6333"
OLLAMA_CHAT_URL = "http://192.168.2.30:11434/api/chat"
CLASSIFIER_MODEL = "gemma4:e4b"
SOURCE_PROJECT = "scanner-archive"
WEAK_TEXT_CHARS = 60  # below this per document, the PDF's text layer is considered unusable

# PII detection reused from clef_route (local, deterministic).
sys.path.insert(0, "/home/alex/hermes_data/scripts")
try:
    import clef_route  # type: ignore
except Exception:  # pragma: no cover
    clef_route = None  # type: ignore

# Curated libraries for the Archive dialog (work/LISO/JRC systems excluded
# by Alex's standing rule: no LISO material in tank-fast-documents or its indexes).
LIBRARIES: List[Dict[str, str]] = [
    {"name": "documents", "label": "General documents", "label_es": "Documentos generales"},
    {"name": "personal-nominas", "label": "Payslips", "label_es": "Nóminas"},
    {"name": "personal-finance", "label": "Personal finance", "label_es": "Finanzas personales"},
    {"name": "personal-legal", "label": "Personal legal", "label_es": "Legal personal"},
    {"name": "personal-career", "label": "Personal career", "label_es": "Carrera personal"},
    {"name": "casa-docs", "label": "Casa documents", "label_es": "Documentos casa"},
    {"name": "casa-atalaya-golf", "label": "Atalaya del Golf", "label_es": "Atalaya del Golf"},
    {"name": "busqueda-casa", "label": "House search", "label_es": "Búsqueda casa"},
    {"name": "gina-docs", "label": "Gina documents", "label_es": "Documentos Gina"},
    {"name": "hugo-docs", "label": "Hugo documents", "label_es": "Documentos Hugo"},
    {"name": "sofia-docs", "label": "Sofía documents", "label_es": "Documentos Sofía"},
    {"name": "marcos-docs", "label": "Marcos documents", "label_es": "Documentos Marcos"},
    {"name": "junell-docs", "label": "Junell documents", "label_es": "Documentos Junell"},
    {"name": "junell-finance", "label": "Junell finance", "label_es": "Finanzas Junell"},
    {"name": "junell-legal", "label": "Junell legal", "label_es": "Legal Junell"},
    {"name": "junell-career", "label": "Junell career", "label_es": "Carrera Junell"},
    {"name": "junell-health", "label": "Junell health", "label_es": "Salud Junell"},
    {"name": "junell-personal", "label": "Junell personal", "label_es": "Personal Junell"},
    {"name": "roberto-finanzas", "label": "Roberto finance", "label_es": "Finanzas Roberto"},
    {"name": "roberto-personal", "label": "Roberto personal", "label_es": "Personal Roberto"},
    {"name": "roberto-trabajo", "label": "Roberto work", "label_es": "Trabajo Roberto"},
    {"name": "olga-docs", "label": "Olga documents", "label_es": "Documentos Olga"},
    {"name": "namnam-docs", "label": "Ñam Ñam documents", "label_es": "Documentos Ñam Ñam"},
    {"name": "bentomo", "label": "Bentomo documents", "label_es": "Documentos Bentomo"},
]

_FALLBACK_LIBS = [l["name"] for l in LIBRARIES]

# Keyword fallback when the LLM is unreachable/unclear (checked in order).
KEYWORD_RULES = [
    ("personal-nominas", re.compile(r"n[óo]mina|payroll|salario bruto|seidor|ernst\s*&\s*young", re.I)),
    ("personal-legal", re.compile(r"demand|juzgado|burofax|contrato de arrendamiento|abogad", re.I)),
    ("junell-legal", re.compile(r"junell.*(?:legal|demanda)|(?:legal|demanda).*junell", re.I)),
    ("casa-docs", re.compile(r"comunidad de propietarios|catastro|ibi|suministro|escritur", re.I)),
    ("gina-docs", re.compile(r"gina|regina orsel", re.I)),
    ("sofia-docs", re.compile(r"sof[íi]a", re.I)),
    ("hugo-docs", re.compile(r"hugo", re.I)),
    ("marcos-docs", re.compile(r"marcos", re.I)),
    ("personal-finance", re.compile(r"factura|recibo|impuesto|hacienda|seguro|banco", re.I)),
]


# --- importable upstream machinery -------------------------------------------

def load_qi():
    spec = importlib.util.spec_from_file_location(
        "qi", "/home/alex/hermes_data/scripts/qdrant_ingest.py")
    qi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qi)
    return qi


def load_append():
    spec = importlib.util.spec_from_file_location(
        "qaf", "/home/alex/hermes_data/scripts/qdrant_append_files.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --- path helpers -------------------------------------------------------------

def sanitize_title(title: str) -> str:
    t = (title or "").strip()
    if t.lower().endswith(".pdf"):
        t = t[:-4]
    t = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", t)
    t = re.sub(r"\s+", " ", t).strip().strip(".")
    return t[:120]


def safe_destination(folder: str, title: str) -> Path:
    """Resolve the destination file path inside SHARE_ROOT or raise ValueError."""
    rel = (folder or "").replace("\\", "/").strip().strip("/")
    if any(part in ("..", ".") for part in rel.split("/")):
        raise ValueError("folder path contains '.' or '..'")
    root = SHARE_ROOT.resolve()
    dest_dir = (root / rel).resolve()
    if dest_dir != root and root not in dest_dir.parents:
        raise ValueError("folder escapes the documents share")
    if not dest_dir.is_dir():
        raise ValueError(f"folder does not exist: {rel or '/'}")
    name = sanitize_title(title) or f"scan-{datetime.now():%Y-%m-%d}"
    dest = dest_dir / f"{name}.pdf"
    n = 2
    while dest.exists():
        dest = dest_dir / f"{name} ({n}).pdf"
        n += 1
    return dest


# --- classification -----------------------------------------------------------

def detect_pii(text: str, filename: str) -> List[str]:
    if clef_route is None:
        return []
    try:
        return list(clef_route.detectar_pii(text, filename))
    except Exception:
        return []


def redact(text: str) -> str:
    if clef_route is None:
        return re.sub(r"\d{8}[A-Za-z]\b", "[DNI]", text or "")
    try:
        return clef_route.redactar(text)
    except Exception:
        return text or ""


def parse_library_choice(resp: requests.Response) -> str:
    """Content first; thinking models may put the JSON in message.thinking."""
    message = resp.json().get("message", {})
    content = message.get("content") or ""
    if not content.strip():
        content = message.get("thinking") or ""
    try:
        return json.loads(content).get("library", "")
    except Exception:
        m = re.search(r'\{\s*"library"\s*:\s*"([^"]+)"', content)
        return m.group(1) if m else ""


def classify_text(text: str, filename: str) -> Dict[str, Any]:
    """Return {collection, method, pii, clef?}.

    Tier 1: Clef (cloud, `clef:27b-cloud` via clef_route — PII-gated, redacted
    excerpt, TEMAS map, 0.75 threshold; approved by Alex 19/11/2026, option A).
    Tier 2: local gemma4:e4b (redacted excerpt, full 24-library list).
    Tier 3: keyword rules. Tier 4: 'documents'.
    DOC_PIPELINE_CLASSIFIER=local skips tier 1 entirely (house-only mode).
    """
    pii = detect_pii(text, filename)
    excerpt = redact((text or "")[:3500])
    names = [l["name"] for l in LIBRARIES]
    mode = os.environ.get("DOC_PIPELINE_CLASSIFIER", "cloud")

    # Tier 1 — Clef (privacy by construction: PII docs never reach the cloud model)
    if mode != "local" and clef_route is not None and not pii:
        try:
            verdict = clef_route.clasificar(filename, excerpt[:1200])  # clef caps the excerpt
            if verdict and verdict.get("via"):
                tema = verdict.get("tema")
                collection = clef_route.TEMAS.get(tema)
                confidence = verdict.get("confianza", 0)
                acceptable = (
                    collection in names
                    and confidence >= getattr(clef_route, "UMBRAL_TEMA", 0.75)
                )
                if acceptable:
                    return {"collection": collection, "method": "clef", "pii": pii,
                            "clef": {"tema": tema, "tipo": verdict.get("tipo"),
                                     "confianza": confidence}}
                # manual / sensitive-adjacent / work(liso) / low confidence → next tier
        except Exception:
            pass

    # Tier 2 — local gemma4:e4b
    try:
        resp = requests.post(
            OLLAMA_CHAT_URL,
            json={
                "model": CLASSIFIER_MODEL,
                "messages": [{"role": "user", "content": (
                    "Clasifica este documento escaneado en su colección de documentos. "
                    "Responde SOLO JSON {\"library\": \"<un nombre de la lista>\"}. "
                    "Elige siempore la más específica; usa 'documents' para algo general. "
                    "Lista: " + ", ".join(names) + "\n\nDocumento (" + filename + "):\n" + excerpt)}],
                "stream": False,
                "format": "json",
                "think": False,  # gemma4 is a thinking model; JSON must land in content
                "options": {"num_predict": 400, "temperature": 0},
                "keep_alive": -1,  # same residency behaviour as the pinned models
            },
            timeout=90,
        )
        choice = parse_library_choice(resp)
        if choice in names:
            return {"collection": choice, "method": "llm", "pii": pii}
    except Exception:
        pass

    # Tier 3 — keyword rules
    for name, rx in KEYWORD_RULES:
        if rx.search((filename or "") + " " + excerpt):
            return {"collection": name, "method": "keyword", "pii": pii}
    return {"collection": "documents", "method": "default", "pii": pii}


# --- indexing -----------------------------------------------------------------

def collection_exists(client, collection: str) -> bool:
    try:
        client.get_collection(collection)
        return True
    except Exception:
        return False


def index_file(pdf_path: Path, collection: str, archive_path: str,
               title: str, staged_path: str, classifier: str = "scanner") -> Dict[str, Any]:
    """Chunk+embed+upsert one archived PDF, continuing max(doc_id). Never deletes data."""
    qi = load_qi()
    qaf = load_append()
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct as PS, Distance, VectorParams

    client = QdrantClient(url=QDRANT_URL)
    if not collection_exists(client, collection):
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE),
            on_disk_payload=True,
        )
    doc_id = qaf.max_doc_id(client, collection) + 1

    text = qi.extract_text(pdf_path)
    ocr_used = False
    if len(text.strip()) < WEAK_TEXT_CHARS:
        text = qi.ocr_pdf_text(pdf_path)
        ocr_used = True
    if not text.strip():
        return {"collection": collection, "doc_id": doc_id, "chunks": 0,
                "ocr_used": ocr_used, "note": "no text extractable — indexed nothing",
                "points": 0}

    pii = detect_pii(text, pdf_path.name)
    chunks = qi.chunk_text(text, source=pdf_path.name)
    for c in chunks:
        c["doc_id"] = doc_id
        c["title"] = title
        c["type"] = "scan-archive"
        c["file_path"] = str(archive_path)
    vectors = qi.embed_texts([c["text"] for c in chunks])
    structs = [
        PS(
            id=qi.stable_id(collection, c["doc_id"], c["chunk"]),
            vector=vec,
            payload={
                "title": c["title"],
                "doc_id": c["doc_id"],
                "chunk": c["chunk"],
                "type": c["type"],
                "project": SOURCE_PROJECT,
                "source": c["source"],
                "file_path": str(archive_path),
                "text": c["text"],
                "token_len": c["token_len"],
                "staged_path": staged_path,
                "archive_path": str(archive_path),
                "classifier": classifier,
                "pii": pii,
            },
        )
        for c, vec in zip(chunks, vectors)
    ]
    for i in range(0, len(structs), 100):
        client.upsert(collection_name=collection, points=structs[i: i + 100])
    info = client.get_collection(collection)
    return {
        "collection": collection, "doc_id": doc_id, "chunks": len(chunks),
        "ocr_used": ocr_used, "classifier": classifier,
        "pii": pii, "points": len(structs),
        "qdrant_points": info.points_count,
    }


# --- staging ------------------------------------------------------------------

def stage_pdf(pdf_path: Path, collection: str, title: str,
              archive_path: str) -> Optional[Path]:
    """Copy the PDF into the collection's staging dir + meta.json (weekly sweep reads this)."""
    try:
        dest_dir = STAGING_ROOT / collection
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / pdf_path.name
        n = 2
        while dest.exists():
            dest = dest_dir / f"{dest.stem} ({n}).pdf"
            n += 1
        shutil.copyfile(pdf_path, dest)
        meta_path = dest.with_suffix(".meta.json")
        meta_path.write_text(json.dumps({
            "collection": collection,
            "title": title,
            "archive_path": archive_path,
            "staged_at": datetime.now().isoformat(timespec="seconds"),
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        return dest
    except Exception:
        return None


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]
