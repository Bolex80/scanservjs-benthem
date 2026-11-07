# Changelog — Benthem Scanner (scanservjs-benthem)

Format per household convention: dated entries, newest first.

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
