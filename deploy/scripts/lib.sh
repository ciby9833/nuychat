#!/usr/bin/env bash

set -euo pipefail

NUYCHAT_ROOT="${NUYCHAT_ROOT:-/srv/nuychat}"
APP_DIR="${APP_DIR:-$NUYCHAT_ROOT/nuyess-chat}"
ENV_DIR="${ENV_DIR:-$NUYCHAT_ROOT/env}"
WWW_DIR="${WWW_DIR:-$NUYCHAT_ROOT/www}"
RELEASES_DIR="${RELEASES_DIR:-$NUYCHAT_ROOT/releases}"
API_ENV_FILE="${API_ENV_FILE:-$ENV_DIR/nuychat-api.env}"
API_SERVICE_NAME="${API_SERVICE_NAME:-nuychat-api}"

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

log() {
  printf '[%s] %s\n' "$(date +"%F %T")" "$*"
}

require_path() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    echo "Required path not found: $path" >&2
    exit 1
  fi
}

ensure_dirs() {
  mkdir -p "$RELEASES_DIR"
  mkdir -p "$WWW_DIR/platform-admin" "$WWW_DIR/tenant-admin" "$WWW_DIR/agent-workspace" "$WWW_DIR/customer-web"
}

ensure_api_env_link() {
  ln -sfn "$API_ENV_FILE" "$APP_DIR/apps/api/.env"
}

current_branch() {
  git -C "$APP_DIR" branch --show-current
}

current_commit() {
  git -C "$APP_DIR" rev-parse HEAD
}

checkout_ref() {
  local ref="$1"
  git -C "$APP_DIR" fetch --all --tags --prune

  if git -C "$APP_DIR" show-ref --verify --quiet "refs/heads/$ref"; then
    git -C "$APP_DIR" checkout "$ref"
    git -C "$APP_DIR" pull --ff-only origin "$ref"
    return
  fi

  if git -C "$APP_DIR" show-ref --verify --quiet "refs/remotes/origin/$ref"; then
    git -C "$APP_DIR" checkout -B "$ref" "origin/$ref"
    return
  fi

  git -C "$APP_DIR" checkout "$ref"
}

build_all() {
  ensure_api_env_link
  pnpm -C "$APP_DIR" install
  pnpm -C "$APP_DIR" --filter @nuychat/api db:migrate
  pnpm -C "$APP_DIR" build
}

publish_static() {
  "$APP_DIR/deploy/scripts/publish-static.sh"
}

restart_api() {
  systemctl restart "$API_SERVICE_NAME"
  systemctl --no-pager --full status "$API_SERVICE_NAME"
}
