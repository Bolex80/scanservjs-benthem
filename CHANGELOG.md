# Changelog — Benthem Scanner (scanservjs-benthem)

Format per household convention: dated entries, newest first.

## 19/11/2026 — v1.1.0-benthem.3 — Scan & Archive (backend deployed)

New subsystem (`doc-pipeline/`): scan documents straight to PDF, file them in
tank-fast-documents (folder chosen **first** in a dialog), then independently
classify (local `gemma4:e4b`, PII-redacted input) and index into the right Qdrant
library. Full details in `doc-pipeline/SPEC.md`.

- `doc-pipeline.service` live on **ai-agents `.60:8792`** (FastAPI, sequential queue,
  `MemoryMax=1500M`); runs through `/home/alex/workspace/.qdrant-ingest-venv`
  (extended with fastapi/uvicorn/python-multipart/pytest; venv now has pip).
- `sweep_scanner_staging.py` wired into `qdrant_reindex_weekly.sh` (re-appends archived
  scans after the delete-first weekly reindex).
- VM105 RAM decision: **no balloon raise** — pipeline is ~150 MiB resident with a
  single-job queue capped at 1500M; balloon already at max 16 GiB and raising the
  ceiling needs a VM reboot (gateway restart). Re-evaluate after a week of real use.
- Share reality check 19/11: tank-fast-documents share root is **server-side
  read-only**, existing subfolders writable (verified with touch); the dialog offers
  existing folders only.
- `gemma4:e4b` note (Ollama 0.40.16 on .30): thinking model — classification sets
  `think: false` so the JSON library answer lands in `content` (empty `content` +
  thinking-in-`message.thinking` was the first E2E failure).
- E2E verified against the real share + real Qdrant (throwaway
  `scanner-archive-test` collection, then deleted): save/classify/stage/index all
  green, sweep idempotent, PII annotation works, test artifacts removed.

## 13/11/2026 — URL change: Homer entry and Pangolin domain

- Alex created the Pangolin resource **`https://scan.bolex.es`** (auth-gated; the app has no
  login of its own, Pangolin provides it) and the Homer dashboard entry was switched from
  `http://192.168.2.229:8080` to the new domain. Homelab-side detail: Homer config on LXC 201
  (backup `config.yml.2026-11-13-scanurl.bak`), verified by render.

## 07/11/2026 — v1.0.0-benthem.2 (restyle after Alex's feedback)

Deployed and verified on LXC 229 at 13:16 CET. Changes from Alex's review:

- Palette: teal/green replaced by an **elegant indigo** system (light `#4F46E5`,
  dark `#818CF8`), with calm violet-tinted neutrals; all accent shadows/rings changed.
- Logo: new **colorful gradient mark** (`ProductMark.vue` — indigo→violet→pink tile,
  white scan glyph, cyan beam) used in the app bar, About page and `favicon.svg`.
- Scan actions: **Preview now sits beside the Scan CTA** in the sticky action bar
  (Preview = tonal secondary, Scan = filled primary); the button was removed from the
  end of the Output/filters card (Clear stays there).
- About page: reference rows for **this fork** (`Bolex80/scanservjs-benthem`, source +
  issues), the **original upstream project** (sbs20/scanservjs, heart icon) and the API
  docs — deployed 14:39 CET (backup `client.bak-20261107-1439`).

## 07/11/2026 — v1.0.0-benthem.1

First Benthem edition. Fork of upstream sbs20/scanservjs v3.3.0 (GPL-2.0).

- Fork upstream v3.3.0; `app-server/` kept byte-identical for easy upstream merges.
- Visual overhaul of `app-ui/` per `DESIGN.md`: new light/dark palettes (teal accent),
  bundled Inter variable font, redesigned app bar with quick theme toggle, restructured
  scan view (two-column desktop, sticky mobile CTA), polished files browser, batch dialog,
  settings and about pages.
- Product name in UI: "Benthem Scanner" (all 21 locales).
- Test harness: local build + `/api` proxy to production scanner API (`scripts/serve-test.sh`).
- Deployment: in-place swap of `/usr/lib/scanservjs/client` on LXC 229 with dated backup and
  one-command rollback (`scripts/deploy-229.sh`).
