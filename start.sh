#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/log"

mkdir -p "$LOG_DIR"

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_service() {
  local name="$1"
  local workdir="$2"
  shift 2

  local pid_file="$LOG_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if is_running "$pid_file"; then
    echo "$name is already running, pid=$(cat "$pid_file")"
    return
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting $name" >> "$log_file"
  (
    cd "$workdir"
    nohup "$@" >> "$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  sleep 1
  if is_running "$pid_file"; then
    echo "$name started, pid=$(cat "$pid_file"), log=$log_file"
  else
    echo "$name failed to start, please check $log_file" >&2
    return 1
  fi
}

start_service "frontend" "$ROOT_DIR/frontend" npm run dev -- --host 0.0.0.0
start_service "backend" "$ROOT_DIR/backend" npm run dev

echo "All services started. Logs are in $LOG_DIR"
