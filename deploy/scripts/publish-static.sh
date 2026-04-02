#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

require_path "$APP_DIR/apps/platform-admin/dist"
require_path "$APP_DIR/apps/tenant-admin/dist"
require_path "$APP_DIR/apps/agent-workspace/dist"
require_path "$APP_DIR/apps/customer-web/dist"

ensure_dirs

log "Publishing static assets"

rm -rf "$WWW_DIR/platform-admin"/*
rm -rf "$WWW_DIR/tenant-admin"/*
rm -rf "$WWW_DIR/agent-workspace"/*
rm -rf "$WWW_DIR/customer-web"/*

cp -R "$APP_DIR/apps/platform-admin/dist/." "$WWW_DIR/platform-admin/"
cp -R "$APP_DIR/apps/tenant-admin/dist/." "$WWW_DIR/tenant-admin/"
cp -R "$APP_DIR/apps/agent-workspace/dist/." "$WWW_DIR/agent-workspace/"
cp -R "$APP_DIR/apps/customer-web/dist/." "$WWW_DIR/customer-web/"

log "Static assets published to $WWW_DIR"
