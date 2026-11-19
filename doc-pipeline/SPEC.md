# Scan & Archive — spec (14/11/2026, approved by Alex)

Scan a document into a searchable PDF, file it in `tank-fast-documents` (user chooses the
folder FIRST in a dialog), then — independently — OCR-index it into the right Qdrant
collection ("library"), chosen automatically by document type with manual override.

Approved approach: **doc-pipeline service on ai-agents (.60) + Benthem Scanner UI
orchestration.** The scanservjs server (`app-server/`) stays byte-identical to upstream.

## Components

| Component | Location | Notes |
|---|---|---|
| `doc-pipeline` | `doc-pipeline/` in this repo, deployed as `doc-pipeline.service` on **.60:8792** | FastAPI + worker thread; heavy work in `qdrant-ingest-venv`, one job at a time |
| UI "Archive" flow | `app-ui/` (Benthem Scanner) | Dialog from the Scan view action bar |
| Weekly sweep | `doc-pipeline/sweep_scanner_staging.py` | Re-appends staged scanner docs after any weekly delete-first reindex |

## Pipeline job (POST /archive on .60:8792)

Upload: multipart (`file`, `folder`, `title`, `collection`=auto|name).
Steps, in order (each failure-tolerant, reported per-step):

1. **save** — copy the upload into `/mnt/tank-fast-documents/<folder>/<title>.pdf`
   (collision → ` (2)` suffix). This is the human source of truth; happens FIRST.
   The share's **root is server-side read-only** (Samba ACL, `dr-xr-x---`) while
   existing subfolders are writable — the tree therefore offers existing folders only.
2. **classify** — quick `extract_text()` (tesseract layer baked at scan time, no GPU),
   then, **classifier tiers (Alex approved option A, 19/11/2026 —
   `DOC_PIPELINE_CLASSIFIER=cloud|local`, default cloud)**:
   1. **Clef** (`clef:27b-cloud` at `https://ollama.com/v1/systemone` via
      `clef_route.clasificar()`, 459–800 ms) — privacy by construction: PII matches
      skip the cloud model entirely; non-PII docs send filename + redacted excerpt
      (clef's own 1200-char cap); collection = `clef_route.TEMAS[tema]` when it is a
      scanner-allowed library and confianza ≥ 0.75 (`work`→liso-docs excluded). Clef
      answers observed: house/factura 0.784, payroll 0.965, family 0.948.
   2. **Local `gemma4:e4b`** (`.30 /api/chat`, `format: json`, `think: false`,
      `num_predict: 400`; content parse with regex fallback over
      `message.thinking`) with the full 24-library list + redacted excerpt.
   3. **Keyword rules** → 4. **`documents`**. All tiers get the PII-redacted text
      (`clef_route.redactar`); DNI/NIE/IBAN/card/clinical hits are annotated (job
      detail + Qdrant payload `pii`), never blocked (indexing is house-local).
      A manual pick skips all models (`classifier=manual`).
3. **stage** — copy the filed PDF into
   `/home/alex/workspace/_qdrant-staging/qdrant-scanner-archive-src/<collection>/`
   + `<name>.meta.json`; the weekly sweep re-appends anything missing after a
   delete-first reindex. Runs BEFORE indexing so the point payload carries the real
   staged path.
4. **index** — chunk + embed (nomic 768d via `.30 /v1`) + upsert continuing
   `max(doc_id)+1`; payload mirrors `qdrant_ingest` keys plus
   `source_project=scanner-archive`, `archive_path`, `staged_path`, `classifier`, `pii`.
   `ocr_pdf_text()` GPU chain (`maternion/LightOnOCR-2` → `glm-ocr:q8_0` → tesseract,
   released after the doc — 0 VRAM at rest) only when the baked text layer is weaker
   than 60 chars. Report: state, per-step states, final path, collection, chunks.

Endpoints: `GET /health`, `GET /folders` (tree under `/mnt/tank-fast-documents`),
`POST /archive`, `GET /jobs/{id}`. CORS open (LAN-only service). One job at a time.

## Archive dialogue (UI)

From the Scan action bar: **Archive** button (tonal secondary, beside Preview/Scan).
Dialog fields: Destination folder (tree picker, default last used), Title
(auto `YYYY-MM-DD-<slug>`), Quality preset (Document 300dpi colour / Photo 600dpi /
Quick 200dpi greyscale → maps to pipeline `OCR | PDF (JPG | high-quality)`,
resolution, colour mode), Library (Auto + curated list). After confirm: scan runs,
result is POSTed to the service, progress chip, final toast with path + library.

Service URL default `http://192.168.2.60:8792`, overridable in Settings (works from
LAN; external Pangolin exposure is Alex's call later).

## Library list (curated; work/LISO/JRC excluded by standing rule)

`documents, personal-nominas, personal-finance, personal-legal, personal-career,
casa-docs, casa-atalaya-golf, busqueda-casa, gina-docs, hugo-docs, sofia-docs,
marcos-docs, junell-docs, junell-finance, junell-legal, junell-career,
junell-health, junell-personal, roberto-finanzas, roberto-personal,
roberto-trabajo, olga-docs, namnam-docs, bentomo`

## Durability & quality

- PDF: searchable (tesseract text layer), JPEG q92, 300 dpi colour default.
- Qdrant text: GPU OCR forced when the embedded text layer is weak (< 60 chars/page
  median) — best index quality; classification text stays cheap.
- Weekly sweep makes scanner docs survive the recreate-style weekly reindex.
- tank-fast-documents already CIFS-mounted on .60 (autofs) — no new mounts.

## RAM decision (Alex pre-authorised adjustments)

VM105 already at balloon max 16 GiB (15316 MiB seen in-guest), 6.9 GiB available,
5.9 GiB swap used (historical). Doc-pipeline is lean (~150 MiB resident, ingest
subprocess capped ~1 GiB, sequential queue). **No live raise now** — raising the
16 GiB ceiling needs a VM reboot (gateway restart). Re-evaluate after a week of real
use; if pressure appears, propose `--memory 20480` + scheduled reboot.

## Out of scope (v1)

Archive-from-Files-view, Telegram completion notifications, external Pangolin
resource for the pipeline service, multi-file batch archive jobs.
