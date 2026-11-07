#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  cat <<'EOF'
Usage: scripts/serve-test.sh [dist-dir]

Serve an already-built client on 127.0.0.1:8089 and proxy /api/* and
/api-docs/* to http://192.168.2.229:8080. This script does not build the UI.

Environment overrides: DIST_DIR, API_BASE, HOST, PORT.
A positional dist-dir overrides DIST_DIR. Relative paths are resolved from the
current working directory.
EOF
  exit 0
fi

if (( $# > 1 )); then
  echo "Usage: scripts/serve-test.sh [dist-dir]" >&2
  exit 2
fi

DIST_DIR=${1:-${DIST_DIR:-"$REPO_ROOT/app-ui/dist"}}
export DIST_DIR
export API_BASE=${API_BASE:-http://192.168.2.229:8080}
export HOST=${HOST:-127.0.0.1}
export PORT=${PORT:-8089}

if [[ ! -f $DIST_DIR/index.html ]]; then
  echo "Built client not found: $DIST_DIR/index.html" >&2
  echo "Build it first with: cd $REPO_ROOT/app-ui && npm run build" >&2
  exit 1
fi

exec node "$REPO_ROOT/scripts/test-server.mjs" "$DIST_DIR"
