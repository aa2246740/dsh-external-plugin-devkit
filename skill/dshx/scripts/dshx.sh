#!/usr/bin/env bash
# Find a DeepSeek Harness checkout that contains dshx, then exec the CLI.
set -euo pipefail

is_harness() {
  local dir="$1"
  [[ -f "$dir/apps/cli/src/bin.ts" && -f "$dir/tools/dshx/src/cli.ts" ]]
}

walk_up() {
  local dir
  dir="$(cd "$1" && pwd)"
  while true; do
    if is_harness "$dir"; then
      printf '%s\n' "$dir"
      return 0
    fi
    local parent
    parent="$(dirname "$dir")"
    if [[ "$parent" == "$dir" ]]; then
      return 1
    fi
    dir="$parent"
  done
}

config_path() {
  if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    printf '%s\n' "${XDG_CONFIG_HOME}/dshx/harness"
  else
    printf '%s\n' "${HOME}/.config/dshx/harness"
  fi
}

resolve_root() {
  local explicit=""
  local expect_harness=0
  local token
  for token in "$@"; do
    if [[ "$expect_harness" -eq 1 ]]; then
      explicit="$token"
      expect_harness=0
      continue
    fi
    if [[ "$token" == "--harness" ]]; then
      expect_harness=1
    fi
  done
  if [[ "$expect_harness" -eq 1 ]]; then
    echo "dshx: --harness requires a path" >&2
    return 1
  fi
  if [[ -n "$explicit" ]]; then
    if ! is_harness "$explicit"; then
      echo "dshx: --harness is not a Harness checkout with tools/dshx: $explicit" >&2
      return 1
    fi
    (cd "$explicit" && pwd -P)
    return 0
  fi

  local selected=""
  local selected_sources=""
  add_candidate() {
    local source="$1"
    local path="$2"
    local physical
    if ! physical="$(cd "$path" 2>/dev/null && pwd -P)" || ! is_harness "$physical"; then
      echo "dshx: $source does not name a Harness checkout with tools/dshx: $path" >&2
      return 1
    fi
    if [[ -z "$selected" ]]; then
      selected="$physical"
      selected_sources="$source"
      return 0
    fi
    if [[ "$selected" != "$physical" ]]; then
      echo "dshx: conflicting Harness checkouts: $selected_sources -> $selected; $source -> $physical" >&2
      echo "dshx: pass --harness <path>; do not choose by precedence" >&2
      return 1
    fi
    selected_sources="$selected_sources,$source"
  }

  if [[ -n "${DSHX_HARNESS:-}" ]]; then
    add_candidate "DSHX_HARNESS" "$DSHX_HARNESS" || return 1
  fi

  local cfg
  cfg="$(config_path)"
  if [[ -f "$cfg" ]]; then
    local remembered=""
    IFS= read -r remembered < "$cfg" || true
    if [[ -z "$remembered" ]]; then
      echo "dshx: $cfg is empty" >&2
      return 1
    fi
    add_candidate "$cfg" "$remembered" || return 1
  fi

  local walked=""
  if walked="$(walk_up "$PWD")"; then
    add_candidate "cwd" "$walked" || return 1
  fi

  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  if walked="$(walk_up "$here")"; then
    add_candidate "skill" "$walked" || return 1
  fi

  if [[ -n "$selected" ]]; then
    printf '%s\n' "$selected"
    return 0
  fi

  echo "dshx: cannot find a DeepSeek Harness checkout (looked for apps/cli/src/bin.ts and tools/dshx/src/cli.ts)." >&2
  echo "dshx: pass --harness, set DSHX_HARNESS, run dshx setup, or clone https://github.com/aa2246740/dsh-external-plugin-devkit.git into <harness>/tools/dshx" >&2
  return 1
}

root="$(resolve_root "$@")"
cd "$root"
exec node --import tsx/esm tools/dshx/src/cli.ts "$@"
