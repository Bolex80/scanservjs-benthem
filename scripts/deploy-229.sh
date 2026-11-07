#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
HOP=${HOP:-alex@192.168.2.10}
VMID=${VMID:-229}
CLIENT_DIR=${CLIENT_DIR:-/usr/lib/scanservjs/client}
SSH_BIN=${SSH_BIN:-ssh}
SCP_BIN=${SCP_BIN:-scp}
PCT_BIN=${PCT_BIN:-/usr/sbin/pct}
DRY_RUN=0
DIST_ARG=""

usage() {
  cat <<'EOF'
Usage: scripts/deploy-229.sh [--dry-run] [dist-dir]

Deploy an already-built dist directory to LXC 229 through alex@192.168.2.10.
The current client is renamed to client.bak-YYYYMMDD-HHMM. Nothing is restarted.
Environment overrides: DIST_DIR, HOP, VMID, CLIENT_DIR, SSH_BIN, SCP_BIN.
EOF
}

while (( $# )); do
  case $1 in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n $DIST_ARG ]]; then
        echo "Only one dist-dir may be supplied" >&2
        exit 2
      fi
      DIST_ARG=$1
      ;;
  esac
  shift
done
if (( $# )); then
  echo "Unexpected arguments: $*" >&2
  exit 2
fi

DIST_DIR=${DIST_ARG:-${DIST_DIR:-"$REPO_ROOT/app-ui/dist"}}
if [[ ! -d $DIST_DIR || ! -s $DIST_DIR/index.html ]]; then
  echo "Built client not found: $DIST_DIR/index.html" >&2
  exit 1
fi
DIST_DIR=$(cd -- "$DIST_DIR" && pwd)
PARENT_DIR=${CLIENT_DIR%/*}
STAMP=$(date +%Y%m%d-%H%M)
BACKUP_DIR="$PARENT_DIR/client.bak-$STAMP"
STAGE_DIR="$PARENT_DIR/client.new-$STAMP-$$"
TOKEN="$STAMP-$$"
HOP_ARCHIVE="/tmp/scanservjs-client-$TOKEN.tar.gz"
LXC_ARCHIVE="/tmp/scanservjs-client-$TOKEN.tar.gz"

if (( DRY_RUN )); then
  cat <<EOF
DRY RUN: no SSH/SCP commands, writes, deployment or service restart will run.
Source: $DIST_DIR
1. Read ownership and mode first:
   ssh $HOP "sudo -n $PCT_BIN exec $VMID -- stat -c '%u:%g:%a' $CLIENT_DIR"
2. Archive the dist directory and copy it to $HOP:/tmp, then:
   sudo -n $PCT_BIN push $VMID /tmp/<archive>.tar.gz /tmp/<archive>.tar.gz
3. Inside LXC $VMID, extract to $PARENT_DIR/client.new-<timestamp>-<pid>.
   Apply the detected numeric uid:gid recursively and the current client mode
   to the new root directory. Verify the staged index.html before swapping.
4. Rename $CLIENT_DIR to $PARENT_DIR/client.bak-\${STAMP}.
   Rename the staged directory to $CLIENT_DIR; restore the backup if this fails.
5. Remove transfer archives and staging residue.
No service restart or reload is performed.
EOF
  exit 0
fi

META=$("$SSH_BIN" "$HOP" "sudo -n $PCT_BIN exec $VMID -- stat -c '%u:%g:%a' $CLIENT_DIR")
if [[ ! $META =~ ^([0-9]+):([0-9]+):([0-9]+)$ ]]; then
  echo "Could not read numeric ownership/mode from $CLIENT_DIR: $META" >&2
  exit 1
fi
CLIENT_UID=${BASH_REMATCH[1]}
CLIENT_GID=${BASH_REMATCH[2]}
CLIENT_MODE=${BASH_REMATCH[3]}
printf 'Current %s: uid=%s gid=%s mode=%s\n' "$CLIENT_DIR" "$CLIENT_UID" "$CLIENT_GID" "$CLIENT_MODE"

LOCAL_ARCHIVE=$(mktemp "${TMPDIR:-/tmp}/scanservjs-client-$TOKEN.XXXXXX.tar.gz")
HOP_COPIED=0
LXC_COPIED=0
cleanup() {
  rm -f -- "$LOCAL_ARCHIVE" || true
  if (( HOP_COPIED )); then
    "$SSH_BIN" "$HOP" "rm -f -- $HOP_ARCHIVE" >/dev/null 2>&1 || true
  fi
  if (( LXC_COPIED )); then
    "$SSH_BIN" "$HOP" "sudo -n $PCT_BIN exec $VMID -- rm -f -- $LXC_ARCHIVE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

tar -C "$DIST_DIR" -czf "$LOCAL_ARCHIVE" .
"$SCP_BIN" "$LOCAL_ARCHIVE" "$HOP:$HOP_ARCHIVE"
HOP_COPIED=1
"$SSH_BIN" "$HOP" "sudo -n $PCT_BIN push $VMID $HOP_ARCHIVE $LXC_ARCHIVE"
LXC_COPIED=1

run_lxc_script() {
  local command="sudo -n $PCT_BIN exec $VMID -- sh -s --"
  local arg quoted
  for arg in "$@"; do
    printf -v quoted '%q' "$arg"
    command+=" $quoted"
  done
  "$SSH_BIN" "$HOP" "$command"
}

run_lxc_script \
  "$LXC_ARCHIVE" "$CLIENT_DIR" "$BACKUP_DIR" "$STAGE_DIR" \
  "$CLIENT_UID" "$CLIENT_GID" "$CLIENT_MODE" <<'REMOTE'
set -eu
archive=$1
client=$2
backup=$3
stage=$4
uid=$5
gid=$6
mode=$7
restore_on_exit=0

cleanup_remote() {
  rc=$?
  rm -f -- "$archive"
  if [ "$restore_on_exit" -eq 1 ] && [ ! -e "$client" ] && [ -d "$backup" ]; then
    mv -- "$backup" "$client"
  fi
  if [ -d "$stage" ]; then
    rm -rf -- "$stage"
  fi
  exit "$rc"
}
trap cleanup_remote EXIT

test -d "$client"
test ! -e "$backup"
test ! -e "$stage"
mkdir -- "$stage"
tar -xzf "$archive" -C "$stage" --no-same-owner
test -s "$stage/index.html"
chown -R "$uid:$gid" "$stage"
chmod "$mode" "$stage"

mv -- "$client" "$backup"
restore_on_exit=1
mv -- "$stage" "$client"
restore_on_exit=0
test -s "$client/index.html"
printf 'Deployed %s; backup retained at %s\n' "$client" "$backup"
REMOTE

LXC_COPIED=0
"$SSH_BIN" "$HOP" "rm -f -- $HOP_ARCHIVE"
HOP_COPIED=0
printf 'Deployment complete. No service was restarted. Backup: %s\n' "$BACKUP_DIR"
