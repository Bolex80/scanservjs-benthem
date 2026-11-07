#!/usr/bin/env bash
set -euo pipefail

HOP=${HOP:-alex@192.168.2.10}
VMID=${VMID:-229}
CLIENT_DIR=${CLIENT_DIR:-/usr/lib/scanservjs/client}
SSH_BIN=${SSH_BIN:-ssh}
PCT_BIN=${PCT_BIN:-/usr/sbin/pct}
DRY_RUN=0
BACKUP_NAME=""

usage() {
  cat <<'EOF'
Usage: scripts/rollback-229.sh [--dry-run] client.bak-YYYYMMDD-HHMM

Restore a dated backup inside /usr/lib/scanservjs on LXC 229 through the
192.168.2.10 hop. The backup is retained. Nothing is restarted.
Environment overrides: HOP, VMID, CLIENT_DIR, SSH_BIN.
EOF
}

while (( $# )); do
  case $1 in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n $BACKUP_NAME ]]; then
        echo "Only one backup name may be supplied" >&2
        exit 2
      fi
      BACKUP_NAME=$1
      ;;
  esac
  shift
done

if [[ ! $BACKUP_NAME =~ ^client\.bak-[0-9]{8}-[0-9]{4}$ ]]; then
  echo "Backup must be named client.bak-YYYYMMDD-HHMM (not a path)" >&2
  usage >&2
  exit 2
fi

PARENT_DIR=${CLIENT_DIR%/*}
BACKUP_DIR="$PARENT_DIR/$BACKUP_NAME"
STAMP=$(date +%Y%m%d-%H%M)
STAGE_DIR="$PARENT_DIR/client.restore-$STAMP-$$"
REPLACED_DIR="$PARENT_DIR/client.replaced-$STAMP-$$"

if (( DRY_RUN )); then
  cat <<EOF
DRY RUN: no SSH commands, writes, restore or service restart will run.
Backup to restore: $BACKUP_DIR
1. Stat the current client and backup ownership/modes through $HOP:
   sudo -n $PCT_BIN exec $VMID -- stat -c '%u:%g:%a' $CLIENT_DIR $BACKUP_DIR
2. Copy the retained backup to $STAGE_DIR inside LXC $VMID.
   Reapply the backup numeric uid:gid recursively and its root directory mode.
3. Rename $CLIENT_DIR to $REPLACED_DIR.
   Rename the staged restore to $CLIENT_DIR; put the current client back if
   this fails. Verify index.html, then remove the replaced client directory.
4. Retain $BACKUP_DIR for another restore.
No service restart or reload is performed.
EOF
  exit 0
fi

META=$("$SSH_BIN" "$HOP" "sudo -n $PCT_BIN exec $VMID -- stat -c '%u:%g:%a' $CLIENT_DIR $BACKUP_DIR")
mapfile -t META_LINES <<< "$META"
if (( ${#META_LINES[@]} != 2 )); then
  echo "Could not stat both current client and backup: $META" >&2
  exit 1
fi
for line in "${META_LINES[@]}"; do
  if [[ ! $line =~ ^[0-9]+:[0-9]+:[0-9]+$ ]]; then
    echo "Unexpected stat output: $line" >&2
    exit 1
  fi
done
IFS=: read -r BACKUP_UID BACKUP_GID BACKUP_MODE <<< "${META_LINES[1]}"
printf 'Restoring %s (uid=%s gid=%s mode=%s) to %s\n' \
  "$BACKUP_DIR" "$BACKUP_UID" "$BACKUP_GID" "$BACKUP_MODE" "$CLIENT_DIR"

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
  "$CLIENT_DIR" "$BACKUP_DIR" "$STAGE_DIR" "$REPLACED_DIR" \
  "$BACKUP_UID" "$BACKUP_GID" "$BACKUP_MODE" <<'REMOTE'
set -eu
client=$1
backup=$2
stage=$3
replaced=$4
uid=$5
gid=$6
mode=$7
restore_on_exit=0

cleanup_remote() {
  rc=$?
  if [ "$restore_on_exit" -eq 1 ] && [ ! -e "$client" ] && [ -d "$replaced" ]; then
    mv -- "$replaced" "$client"
  fi
  if [ -d "$stage" ]; then
    rm -rf -- "$stage"
  fi
  exit "$rc"
}
trap cleanup_remote EXIT

test -d "$client"
test -d "$backup"
test ! -e "$stage"
test ! -e "$replaced"
cp -a -- "$backup" "$stage"
test -s "$stage/index.html"
chown -R "$uid:$gid" "$stage"
chmod "$mode" "$stage"

mv -- "$client" "$replaced"
restore_on_exit=1
mv -- "$stage" "$client"
restore_on_exit=0
test -s "$client/index.html"
rm -rf -- "$replaced"
printf 'Restored %s to %s; backup retained\n' "$backup" "$client"
REMOTE

printf 'Rollback complete. No service was restarted. Backup retained: %s\n' "$BACKUP_DIR"
