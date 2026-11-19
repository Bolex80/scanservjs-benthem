#!/usr/bin/env python3
"""Benthem Scanner — doc-pipeline service (ai-agents .60:8792).

Contract (see SPEC.md):
  GET  /health
  GET  /folders        -> {root, tree, flat}  (tree of tank-fast-documents)
  GET  /libraries      -> {libraries:[{name,label,label_es}]}
  POST /archive        (multipart: file, folder, title, collection) -> {job_id}
  GET  /jobs/{id}      -> {job_id,state,steps,error,result}

One job at a time (background worker thread); the PDF is filed into the
user-chosen folder FIRST, then classification, staging and indexing run.
"""
from __future__ import annotations

import os
import queue
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import pipeline as pl

JOB_HISTORY = 200
LIST_DIRS_MAX = 1500
TREE_DEPTH = 6
JUNK_DIRS = {"@eaDir", ".stfolder", "$RECYCLE.BIN", "System Volume Information", "#recycle"}


class Job:
    def __init__(self, job_id: str):
        self.id = job_id
        self.state = "queued"
        self.steps: Dict[str, Dict[str, str]] = {}
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.created = datetime.now().isoformat(timespec="seconds")

    def step(self, name: str, state: str, detail: str = "") -> None:
        self.steps[name] = {"state": state, "detail": detail}

    def dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.id,
            "state": self.state,
            "created": self.created,
            "steps": [{"name": k, **v} for k, v in self.steps.items()],
            "result": self.result,
            "error": self.error,
        }


JOBS: Dict[str, Job] = {}
JOBS_LOCK = threading.Lock()
QUEUE: "queue.Queue[Job]" = queue.Queue()


def libraries() -> List[Dict[str, str]]:
    extra = [x.strip() for x in os.environ.get("DOC_PIPELINE_EXTRA_LIBRARIES", "").split(",") if x.strip()]
    return pl.LIBRARIES + [{"name": n, "label": n, "label_es": n} for n in extra]


def library_names() -> List[str]:
    return [l["name"] for l in libraries()]


# --- folder tree ---------------------------------------------------------------

def folder_tree() -> Dict[str, Any]:
    root = pl.SHARE_ROOT
    tree: List[Dict[str, Any]] = []
    flat: List[Dict[str, Any]] = []

    def walk(dir_path: Path, rel: str, depth: int, out: List[Dict[str, Any]]) -> None:
        if depth > TREE_DEPTH or len(flat) >= LIST_DIRS_MAX:
            return
        try:
            entries = sorted(
                [e for e in dir_path.iterdir()
                 if e.is_dir() and not e.name.startswith(".") and e.name not in JUNK_DIRS],
                key=lambda e: e.name.lower())
        except Exception:
            entries = []
        for entry in entries:
            child_rel = f"{rel}{entry.name}/" if rel.endswith("/") or rel == "" else f"{rel}/{entry.name}/"
            node = {"name": entry.name, "path": child_rel, "depth": depth, "children": []}
            out.append(node)
            flat.append({"path": child_rel, "depth": depth})
            walk(entry, child_rel, depth + 1, node["children"])

    walk(root, "", 1, tree)
    return {"root": str(root), "tree": tree, "flat": flat}


# --- worker ---------------------------------------------------------------------

def run_job(job: Job, inbox_pdf: Path, form: Dict[str, Any]) -> None:
    job.state = "running"
    try:
        # 1. save → file the PDF into the chosen folder (human source of truth)
        dest = pl.safe_destination(form["folder"], form["title"])
        pl.INBOX_ROOT.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.copyfile(inbox_pdf, dest)
        job.step("save", "done", str(dest))

        # 2. classify → which library (manual pick skips the model)
        if form["collection"] == "auto":
            qi = pl.load_qi()
            text = qi.extract_text(dest)
            classif = pl.classify_text(text, dest.name)
            collection = classif["collection"]
            pii_hint = classif.get("pii", [])
            classifier = classif["method"]
            job.step("classify", "done", f"{collection} ({classifier}; pii={','.join(pii_hint) or 'no'})")
        else:
            collection = form["collection"]
            classifier = "manual"
            job.step("classify", "skipped", collection)

        # 3. stage → keep a copy in the scanner staging tree for the weekly sweep
        staged = pl.stage_pdf(dest, collection, form["title"], str(dest))
        if staged:
            job.step("stage", "done", str(staged))
        else:
            job.step("stage", "error", "staging copy failed (index still runs)")
        staged_path = str(staged) if staged else ""

        # 4. index → chunk + embed + upsert into the collection
        result = pl.index_file(dest, collection, str(dest), form["title"],
                               staged_path=staged_path, classifier=classifier)
        job.step("index", "done", f"{result['points']} points (doc_id {result['doc_id']})")
        label = next((l["label"] for l in libraries() if l["name"] == collection), collection)
        job.result = {
            "path": str(dest), "folder": form["folder"], "collection": collection,
            "library": label, "chunks": result["chunks"], "points": result["points"],
            "doc_id": result["doc_id"], "ocr_used": result.get("ocr_used", False),
            "staged": staged_path, "note": result.get("note"),
        }
        job.state = "done"
    except Exception as exc:  # noqa: BLE001 — job boundary: convert to error state
        job.error = f"{type(exc).__name__}: {exc}"
        job.state = "error"
        for name, s in job.steps.items():
            if s["state"] in ("pending", ""):
                s["state"] = "skipped"
    finally:
        inbox_pdf.unlink(missing_ok=True)
        with JOBS_LOCK:
            while len(JOBS) > JOB_HISTORY:
                oldest = min(JOBS, key=lambda j: JOBS[j].created)
                del JOBS[oldest]


def worker() -> None:
    while True:
        job = QUEUE.get()
        form = getattr(job, "_form", None)
        inbox_pdf = getattr(job, "_inbox_pdf", None)
        if not form or not inbox_pdf:
            job.state = "error"
            job.error = "malformed queue entry"
            continue
        run_job(job, inbox_pdf, form)


threading.Thread(target=worker, daemon=True).start()

# --- API ---------------------------------------------------------------------------

app = FastAPI(title="Benthem doc-pipeline", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # LAN-only service; the UI may live on :8080 or scan.bolex.es
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    pl.INBOX_ROOT.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> Dict[str, Any]:
    share_ok = pl.SHARE_ROOT.is_dir()
    return {"ok": True, "share": str(pl.SHARE_ROOT), "share_mounted": share_ok,
            "queued": QUEUE.qsize(), "jobs_tracked": len(JOBS)}


@app.get("/folders")
def folders() -> JSONResponse:
    return JSONResponse(folder_tree())


@app.get("/libraries")
def libraries_ep() -> Dict[str, Any]:
    return {"libraries": libraries(), "default": "auto"}


@app.post("/archive")
def archive(file: UploadFile = File(...), folder: str = Form(...),
            title: str = Form("scan"), collection: str = Form("auto")) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "only .pdf uploads are accepted")
    if collection != "auto" and collection not in library_names():
        raise HTTPException(400, f"unknown collection: {collection}")
    try:
        pl.safe_destination(folder, title)  # validate before accepting the upload
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    job = Job(pl.new_job_id())
    inbox = pl.INBOX_ROOT / f"{job.id}.pdf"
    pl.INBOX_ROOT.mkdir(parents=True, exist_ok=True)
    with open(inbox, "wb") as fh:
        fh.write(file.file.read())
    if inbox.stat().st_size == 0:
        inbox.unlink(missing_ok=True)
        raise HTTPException(400, "empty upload")
    job._form = {"folder": folder, "title": title, "collection": collection}  # type: ignore[attr-defined]
    job._inbox_pdf = inbox  # type: ignore[attr-defined]
    with JOBS_LOCK:
        JOBS[job.id] = job
    QUEUE.put(job)
    return {"job_id": job.id, "state": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return job.dict()
