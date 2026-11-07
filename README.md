# Benthem Scanner

A visually redesigned front-end for [scanservjs](https://github.com/sbs20/scanservjs) v3.3.0 —
the same engine, device support and REST API, with a modern, sleek interface: light/dark theme
(quick toggle in the app bar), clearly designed controls, a prominent primary **Scan** action,
and a polished result browser. Deployed in the Benthem household at
`http://192.168.2.229:8080` (LXC 229 `printscan`, Canon PIXMA TS8750 via SANE/eSCL).

## What is different from upstream

Presentational layer only (`app-ui/`): design tokens, Vuetify palette (light + dark),
typography (bundled Inter), restyled navigation, scan view, batch dialog, files browser,
settings and about pages, plus a quick theme toggle. The backend (`app-server/`) is
byte-identical to upstream v3.3.0 and all upstream features, translations and keyboard/API
behavior are preserved. License: GPL-2.0 (inherited); © Sam Strachan for the original work —
see `LICENSE` and `README.upstream.md`.

## Layout

| Path | Purpose |
|---|---|
| `app-ui/` | Vue 3 + Vuetify 4 client (redesigned here) |
| `app-server/` | scanservjs server — identical to upstream |
| `scripts/` | Test-harness proxy and LXC 229 deploy/rollback |
| `DESIGN.md` | The binding design spec for this edition |
| `CHANGELOG.md` | Version history of this edition |

## Serving the redesigned client in production

The server (`express.static('client')`) serves any bundle dropped into its `client/` directory.
Deployment therefore is: build `app-ui`, back up `/usr/lib/scanservjs/client` on the LXC,
copy the new `dist/` contents in. See `scripts/deploy-229.sh`.

## Development

```bash
cd app-ui && npm install && npm run build   # output: app-ui/dist
```

Test against a real scanner server without deploying: `scripts/serve-test.sh` serves the built
client locally and proxies `/api` to the production API.
