#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <release-id|commit>" >&2
  exit 1
fi

TARGET="$1"
DB_ROLLBACK_STEPS="${DB_ROLLBACK_STEPS:-0}"
ROLLBACK_COMMIT="$TARGET"

if [[ -f "$RELEASES_DIR/$TARGET/manifest.env" ]]; then
  # shellcheck disable=SC1090
  source "$RELEASES_DIR/$TARGET/manifest.env"
  if [[ -z "${previous_commit:-}" ]]; then
    echo "manifest missing previous_commit: $RELEASES_DIR/$TARGET/manifest.env" >&2
    exit 1
  fi
  ROLLBACK_COMMIT="$previous_commit"
fi

require_path "$APP_DIR"
require_path "$API_ENV_FILE"
ensure_dirs

CURRENT_COMMIT="$(current_commit)"
ROLLBACK_ID="rollback-$(timestamp)"
ROLLBACK_DIR="$RELEASES_DIR/$ROLLBACK_ID"
mkdir -p "$ROLLBACK_DIR"

cat > "$ROLLBACK_DIR/manifest.env" <<EOF
release_id=$ROLLBACK_ID
rollback_target=$TARGET
previous_commit=$CURRENT_COMMIT
deployed_commit=$ROLLBACK_COMMIT
started_at=$(date +"%F %T")
EOF

log "Rollback start: current=$CURRENT_COMMIT target=$ROLLBACK_COMMIT"

checkout_ref "$ROLLBACK_COMMIT"

ensure_api_env_link
pnpm -C "$APP_DIR" install

if [[ "$DB_ROLLBACK_STEPS" =~ ^[0-9]+$ ]] && [[ "$DB_ROLLBACK_STEPS" -gt 0 ]]; then
  log "Running db rollback steps: $DB_ROLLBACK_STEPS"
  for ((i = 1; i <= DB_ROLLBACK_STEPS; i++)); do
    pnpm -C "$APP_DIR" --filter @nuychat/api db:rollback
  done
fi

pnpm -C "$APP_DIR" build
publish_static
restart_api

cat >> "$ROLLBACK_DIR/manifest.env" <<EOF
finished_at=$(date +"%F %T")
EOF

ln -sfn "$ROLLBACK_DIR" "$RELEASES_DIR/latest"

log "Rollback success: release=$ROLLBACK_ID commit=$ROLLBACK_COMMIT"
