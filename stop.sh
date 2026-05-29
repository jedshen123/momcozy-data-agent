#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/log"

kill_tree() {
  local pid="$1"
  local signal="${2:-TERM}"

  if command -v pgrep >/dev/null 2>&1; then
    local child
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
      kill_tree "$child" "$signal"
    done
  fi

  kill "-$signal" "$pid" 2>/dev/null || true
}

stop_service() {
  local name="$1"
  local pid_file="$LOG_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running: missing $pid_file"
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    echo "$name is not running: stale pid file removed"
    rm -f "$pid_file"
    return
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] stopping $name pid=$pid" >> "$log_file"
  kill_tree "$pid" TERM

  for _ in {1..10}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "$name stopped"
      return
    fi
    sleep 1
  done

  echo "$name did not stop gracefully, forcing stop"
  kill_tree "$pid" KILL
  rm -f "$pid_file"
  echo "$name stopped"
}

stop_service "frontend"
stop_service "backend"

echo "All services stopped."
