# doc-pipeline — scanner archive backend

Binds Benthem Scanner to the household document archive: an "Archive" scan is
saved into `tank-fast-documents` (folder chosen in the UI **first**), then
independently classified and indexed into the right Qdrant library.

Runs on **ai-agents (.60) port 8792** as `doc-pipeline.service`
(`sudo systemctl enable --now doc-pipeline`). Heavy work runs through
`/home/alex/workspace/.qdrant-ingest-venv` (reuses `qdrant_ingest.py`:
chunking, nomic embeddings, the GPU OCR chain). The scanservjs server on
LXC 229 is untouched.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness + share mount + queue depth |
| `GET /folders` | folder tree of `/mnt/tank-fast-documents` (also a flat list) |
| `GET /libraries` | curated Qdrant libraries (UI auto/manual pick) |
| `POST /archive` | multipart `file`(.pdf), `folder`, `title`, `collection`(`auto`/name) → `{job_id}` |
| `GET /jobs/{id}` | job state, per-step detail, result `{path, library, chunks, …}` |

Job steps, in order: **save** (file the PDF in the chosen folder) →
**classify** (local `gemma4:e4b`, PII-redacted input; manual pick skips) →
**stage** (copy into `_qdrant-staging/qdrant-scanner-archive-src/<collection>`)
→ **index** (chunk + nomic 768d embed + upsert, continues `max(doc_id)`;
GPU OCR only when the PDF's baked text layer is weaker than 60 chars).

## Weekly durability

`qdrant_reindex_weekly.sh` recreates collections delete-first, so this repo
stages every archived PDF per collection and `sweep_scanner_staging.py`
(wired after the weekly reindex) re-appends anything missing. The PDF in the
share is the human source of truth; the sweep only repairs the index.

## Privacy

PII detection and redaction reuse `clef_route` (local, deterministic — decision
2026-10-27): DNI/NIE/passport/IBAN/card(Luhn)/clinical vocabulary. Classification
input is redacted before any model sees it; indexing stays on-house
(Qdrant → .30, embeddings → .30, OCR → .30). PII hits are annotated in the job
step detail and in the Qdrant payload as `pii: [...]`.

## Tests

```
/home/alex/workspace/.qdrant-ingest-venv/bin/python -m pip install fastapi uvicorn python-multipart  # one-off
.venv-less run:  /home/alex/workspace/.qdrant-ingest-venv/bin/python -m pytest doc-pipeline/test_pipeline.py -q
```

Real-destination E2E needs the share mounted and Qdrant alive; see SPEC.md.
