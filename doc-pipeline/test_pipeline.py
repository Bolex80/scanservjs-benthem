#!/usr/bin/env python3
"""Unit tests for the doc-pipeline core (offline: no Qdrant, no share, no GPU)."""
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as pl  # noqa: E402


@pytest.fixture()
def share_tree(tmp_path, monkeypatch):
    (tmp_path / "Documents" / "Scans").mkdir(parents=True)
    (tmp_path / "Documents" / "@eaDir").mkdir()
    (tmp_path / "Nóminas").mkdir()
    monkeypatch.setattr(pl, "SHARE_ROOT", tmp_path)
    return tmp_path


def test_sanitize_title():
    assert pl.sanitize_title("Informe/2026:v2?.pdf") == "Informe 2026 v2"
    assert pl.sanitize_title("  *.pdf ") == ""
    assert len(pl.sanitize_title("a" * 300)) == 120
    assert pl.sanitize_title('x:"<y>|z') == "x y z"


def test_safe_destination_rejects_escape(share_tree):
    with pytest.raises(ValueError):
        pl.safe_destination("../etc", "t")
    with pytest.raises(ValueError):
        pl.safe_destination("/etc", "t")
    with pytest.raises(ValueError):
        pl.safe_destination("Missing/Folder", "t")


def test_safe_destination_collision(share_tree):
    (share_tree / "Documents" / "a.pdf").touch()
    p1 = pl.safe_destination("Documents", "a")
    p1.touch()  # simulate the job having saved it there
    p2 = pl.safe_destination("Documents", "a")
    assert p1.name == "a (2).pdf"
    assert p2.name == "a (3).pdf"


def test_folder_tree(share_tree):
    import server
    data = server.folder_tree()
    paths = [f["path"] for f in data["flat"]]
    assert "Documents/" in paths
    assert "Documents/Scans/" in paths
    assert "Nóminas/" in paths
    assert not any("@eaDir" in p for p in paths)
    names = [n["name"] for n in data["tree"]]
    assert set(names) == {"Documents", "Nóminas"}


def test_libraries_env_extra(monkeypatch):
    import server
    monkeypatch.setenv("DOC_PIPELINE_EXTRA_LIBRARIES", "scanner-archive-test")
    names = [l["name"] for l in server.libraries()]
    assert "scanner-archive-test" in names
    assert "documents" in names


def test_classify_fallback_keywords(monkeypatch):
    # LLM + Clef unreachable/skipped: keyword rules decide.
    monkeypatch.setenv("DOC_PIPELINE_CLASSIFIER", "local")
    monkeypatch.setattr(pl, "OLLAMA_CHAT_URL", "http://127.0.0.1:9/api/chat")
    r = pl.classify_text("NÓMINA mayo Seidor salario bruto 2.000", "nomina-05.pdf")
    assert r["collection"] == "personal-nominas"
    assert r["method"] == "keyword"
    r2 = pl.classify_text("", "sin-tema.pdf")
    assert r2["collection"] == "documents"


def test_clef_tier(monkeypatch, ):
    """Clef (cloud) wins when confident and the collection is scanner-allowed."""
    import types
    from pathlib import Path as _P
    share = _P("/tmp/clef-fake-root")
    monkeypatch.setattr(pl, "clef_route", types.SimpleNamespace(
        detectar_pii=lambda t, n: [],
        redactar=lambda t: t,
        clasificar=lambda nombre, extracto: {
            "tema": "payroll", "tipo": "factura", "confianza": 0.91, "via": "ollama"},
        TEMAS={"payroll": "personal-nominas", "work": "liso-docs"},
        UMBRAL_TEMA=0.75,
    ))
    monkeypatch.setattr(pl, "OLLAMA_CHAT_URL", "http://127.0.0.1:9/api/chat")

    def fail_if_called(*a, **k):
        raise AssertionError("local LLM must not be called when Clef is confident")

    monkeypatch.setattr("requests.post", fail_if_called)
    r = pl.classify_text("nómina de mayo", "nomina.pdf")
    assert r["collection"] == "personal-nominas" and r["method"] == "clef"
    assert r["clef"]["tema"] == "payroll"

    # tema=work maps to liso-docs (excluded) → falls through to keyword tier
    monkeypatch.setattr(pl, "KEYWORD_RULES",
                        [("documents", pl.re.compile(r".", pl.re.S))])
    pl.re  # noqa: B018 — pipeline imports `re` as a module attribute
    monkeypatch.setattr(pl.clef_route, "clasificar",
                        lambda n, e: {"tema": "work", "tipo": "informe", "confianza": 0.95, "via": "ollama"})

    def ok_local(*a, **k):
        class R:
            status_code = 200

            def json(self):
                return {"message": {"content": "not json"}}

        return R()

    monkeypatch.setattr("requests.post", ok_local)
    r2 = pl.classify_text("informe tecnico", "informe.pdf")
    assert r2["collection"] == "documents"  # keyword fallback, not liso-docs


def test_pii_redaction():
    text = "DNI 48012573J IBAN ES12 1234 5678 9012 3456 7890 y tarjeta"
    pii = pl.detect_pii(text, "doc.pdf")
    assert "dni" in pii
    assert "iban" in pii
    red = pl.redact(text)
    assert "48012573J" not in red
    assert "[IBAN]" in red


def test_classified_excerpt_is_redacted(monkeypatch):
    """The text sent to the classifier must not contain raw PII."""
    captured = {}
    monkeypatch.setenv("DOC_PIPELINE_CLASSIFIER", "local")

    class FakeResp:
        status_code = 200

        def json(self):
            return {"message": {"content": json.dumps({"library": "documents"})}}

    def fake_post(url, json=None, timeout=None):
        captured["content"] = json["messages"][0]["content"]
        return FakeResp()

    monkeypatch.setattr("requests.post", fake_post)
    pl.classify_text("Contrato con DNI 48012573J dentro", "contrato.pdf")
    assert "48012573J" not in captured["content"]
    assert "[DNI]" in captured["content"]


def test_server_endpoints(share_tree, monkeypatch):
    import server

    enqueued = []
    monkeypatch.setattr(server.QUEUE, "put", lambda job: enqueued.append(job))
    client = TestClient(server.app)

    assert client.get("/health").json()["ok"] is True
    libs = [l["name"] for l in client.get("/libraries").json()["libraries"]]
    assert "documents" in libs

    # non-pdf rejected (folder/title present — only the extension is wrong)
    r = client.post("/archive", files={"file": ("x.txt", b"no")},
                    data={"folder": "Documents/Scans", "title": "t"})
    assert r.status_code == 400

    # unknown collection rejected
    r = client.post("/archive", files={"file": ("x.pdf", b"no")},
                    data={"folder": "Documents/Scans", "title": "t", "collection": "nope"})
    assert r.status_code == 400

    # unknown folder rejected
    r = client.post("/archive", files={"file": ("x.pdf", b"no")}, data={"folder": "Nope", "title": "t"})
    assert r.status_code == 400

    # valid request queues (worker disabled by the monkeypatch above)
    r = client.post("/archive",
                    files={"file": ("x.pdf", b"%PDF-fake")},
                    data={"folder": "Documents/Scans", "title": "Test Doc", "collection": "auto"})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    assert len(enqueued) == 1
    assert enqueued[0].id == job_id

    assert client.get("/jobs/unknown").status_code == 404
    body = client.get(f"/jobs/{job_id}").json()
    assert body["job_id"] == job_id
