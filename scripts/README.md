# Test harness and LXC 229 deployment

These scripts use the production scanner API at `http://192.168.2.229:8080`.
The test server binds to loopback only by default. Deployment and rollback do
**not** restart or reload scanservjs.

## API paths in this v3.3.0 checkout

The UI and `app-server/src/express-configurer.js` use **`/api/v1`**, not
`/api/v2`:

- `GET|DELETE /api/v1/context`
- `GET /api/v1/files`
- `GET|PUT|DELETE /api/v1/files/{filename}`
- `GET /api/v1/files/{filename}/thumbnail` (binary JPEG)
- `POST /api/v1/files/{filename}/actions/{actionName}`
- `GET|POST|DELETE /api/v1/preview`
- `POST /api/v1/scan`
- `GET /api/v1/system`
- `GET /api-docs/swagger.json` and `/api-docs/*`

The proxy forwards all `/api/*` and `/api-docs/*` requests, so it is not limited
to this route list. Methods, query strings, request bodies, content types,
status codes and binary response bytes are preserved.

## 1. Serve a built UI locally: `serve-test.sh`

Build once if needed, then serve the resulting directory:

```bash
cd app-ui
npm ci                 # skip when another agent already installed dependencies
npm run build
cd ..
scripts/serve-test.sh
```

Open <http://127.0.0.1:8089/>. To test another already-built directory:

```bash
scripts/serve-test.sh /absolute/or/relative/path/to/dist
```

Environment overrides:

```bash
API_BASE=http://192.168.2.229:8080 HOST=127.0.0.1 PORT=8089 \
  DIST_DIR=app-ui/dist scripts/serve-test.sh
```

`API_BASE` must be an HTTP(S) origin without a path. `serve-test.sh` does not
build the UI; it fails if `index.html` is absent. `test-server.mjs` is the
dependency-free Node stdlib implementation and can also be invoked directly:

```bash
node scripts/test-server.mjs app-ui/dist
```

Static responses use streaming files and API responses are streamed without
JSON/text conversion, so PDF downloads and JPEG thumbnails remain binary.

**The API is real production:** Scan, Preview, rename, delete and action buttons
will operate on the real scanner/files. Use read-only pages when mutation is
not intended. The harness is for local testing, not exposure as a second public
UI service.

Quick checks while it is running:

```bash
curl -fsS http://127.0.0.1:8089/
curl -fsS http://127.0.0.1:8089/api/v1/system
curl -fsS http://127.0.0.1:8089/api/v1/files
```

Stop it with Ctrl-C. Dependency-free stub tests cover static serving, methods,
queries, bodies, content types, JSON and binary proxying, and dry-run safety:

```bash
node --test scripts/*.test.mjs
```

## 2. Deploy a built UI: `deploy-229.sh`

Preview the complete plan without any SSH/SCP calls or writes:

```bash
scripts/deploy-229.sh --dry-run app-ui/dist
```

An actual deployment (only when separately authorized) is:

```bash
scripts/deploy-229.sh app-ui/dist
```

The script:

1. Requires a non-empty `index.html` in the supplied dist directory.
2. Through the hop, stats the existing client's numeric uid, gid and root mode
   **before** changing anything.
3. Creates a tar.gz locally, copies it to the hop's `/tmp`, then uses `pct push`
   to place it in the LXC's `/tmp`.
4. Extracts to a staging directory under `/usr/lib/scanservjs`, verifies the
   staged `index.html`, reapplies the captured ownership recursively and the
   existing root-directory mode. Other file modes come from the built tar.
5. Renames `client` to `client.bak-YYYYMMDD-HHMM`, then renames staging to
   `client`. If the second rename fails, the original is put back.
6. Cleans transfer/staging residue. The dated backup remains. It never invokes
   `systemctl`, restarts a service or reboots anything.

A repeated deployment in the same minute refuses to overwrite an existing
backup; wait for the next minute or retain that backup elsewhere first.

## 3. Roll back: `rollback-229.sh`

Use the exact backup basename printed by deployment:

```bash
scripts/rollback-229.sh --dry-run client.bak-20261107-1234
scripts/rollback-229.sh client.bak-20261107-1234
```

Rollback stats both directories, copies the backup to a staging directory,
reapplies its ownership and mode, and swaps it into place. A failed swap puts
the current client back. On success the replaced client is removed and the
dated backup is retained for another restore. Only the strict basename format
`client.bak-YYYYMMDD-HHMM` is accepted; paths and traversal are rejected.

For both scripts, `HOP`, `VMID` and `CLIENT_DIR` can be overridden for a test
environment. Defaults are `alex@192.168.2.10`, `229` and
`/usr/lib/scanservjs/client`.

## Why the hop is required

Direct SSH to `192.168.2.229` is not available to this agent. All container
operations therefore go through:

```text
this host --ssh/scp--> alex@192.168.2.10 --sudo /usr/sbin/pct--> LXC 229
```

The hop account needs key authentication and passwordless sudo for `pct`.
Transferring a whole dist directory uses a tar archive because it is reliable
for directory trees and avoids nested shell quoting for file contents. The
archive is copied with `scp`, pushed with `pct push`, and extracted by `pct exec
... sh`. Deployment/rollback shell programs arrive on `pct exec`'s stdin rather
than being interpolated into multiple SSH quoting layers.

Example read-only inspection:

```bash
ssh alex@192.168.2.10 \
  "sudo -n /usr/sbin/pct exec 229 -- stat -c '%u:%g:%a' /usr/lib/scanservjs/client"
```

The transfer mechanism can be proved without touching the client by pushing a
scratch file to `/tmp` in the LXC, pulling it back with `pct pull`, comparing
bytes, and removing all scratch copies. A file created by `pct pull` on the hop
can be root-owned; clean that hop-side pulled copy with `sudo -n rm -f` rather
than an unprivileged `rm`.
