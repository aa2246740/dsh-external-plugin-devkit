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
  if [[ -n "${DSHX_HARNESS:-}" ]]; then
    if is_harness "$DSHX_HARNESS"; then
      printf '%s\n' "$DSHX_HARNESS"
      return 0
    fi
    echo "dshx: DSHX_HARNESS is set but is not a Harness checkout with tools/dshx: $DSHX_HARNESS" >&2
    return 1
  fi

  if walk_up "${PWD}"; then
    return 0
  fi

  local here
  here="$(cd "$(dirname "$0")" && pwd)"
  if walk_up "$here"; then
    return 0
  fi

  local cfg
  cfg="$(config_path)"
  if [[ -f "$cfg" ]]; then
    local remembered
    remembered="$(tr -d '[:space:]' < "$cfg")"
    if is_harness "$remembered"; then
      printf '%s\n' "$remembered"
      return 0
    fi
    echo "dshx: $cfg is not a Harness checkout with tools/dshx: $remembered" >&2
    return 1
  fi

  echo "dshx: cannot find a DeepSeek Harness checkout (looked for apps/cli/src/bin.ts and tools/dshx/src/cli.ts)." >&2
  echo "dshx: set DSHX_HARNESS, run dshx setup, or clone https://github.com/aa2246740/dsh-external-plugin-devkit.git into <harness>/tools/dshx" >&2
  return 1
}

root="$(resolve_root)"
cd "$root"
exec node --import tsx/esm tools/dshx/src/cli.ts "$@"
