#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

TARGET_REF="${1:-$(current_branch)}"

require_path "$APP_DIR"
require_path "$API_ENV_FILE"
ensure_dirs

PREV_BRANCH="$(current_branch || true)"
PREV_COMMIT="$(current_commit)"
RELEASE_ID="$(timestamp)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

mkdir -p "$RELEASE_DIR"

cat > "$RELEASE_DIR/manifest.env" <<EOF
release_id=$RELEASE_ID
target_ref=$TARGET_REF
previous_branch=$PREV_BRANCH
previous_commit=$PREV_COMMIT
started_at=$(date +"%F %T")
EOF

log "Deploy start: ref=$TARGET_REF previous_commit=$PREV_COMMIT"

checkout_ref "$TARGET_REF"
build_all
publish_static
restart_api

NEW_COMMIT="$(current_commit)"

cat >> "$RELEASE_DIR/manifest.env" <<EOF
deployed_commit=$NEW_COMMIT
finished_at=$(date +"%F %T")
EOF

ln -sfn "$RELEASE_DIR" "$RELEASES_DIR/latest"

log "Deploy success: release=$RELEASE_ID commit=$NEW_COMMIT"
