# Changelog — Benthem Scanner (scanservjs-benthem)

Format per household convention: dated entries, newest first.

## 07/11/2026 — v1.0.0-benthem.2 (restyle after Alex's feedback)

Deployed and verified on LXC 229 at 13:16 CET. Changes from Alex's review:

- Palette: teal/green replaced by an **elegant indigo** system (light `#4F46E5`,
  dark `#818CF8`), with calm violet-tinted neutrals; all accent shadows/rings changed.
- Logo: new **colorful gradient mark** (`ProductMark.vue` — indigo→violet→pink tile,
  white scan glyph, cyan beam) used in the app bar, About page and `favicon.svg`.
- Scan actions: **Preview now sits beside the Scan CTA** in the sticky action bar
  (Preview = tonal secondary, Scan = filled primary); the button was removed from the
  end of the Output/filters card (Clear stays there).

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
