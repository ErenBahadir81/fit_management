#!/usr/bin/env bash
# Print a v1 (legacy Next.js monolith) file from git history for reference.
# Usage: pnpm legacy src/lib/services/fatigue.ts   |   pnpm legacy --ls
set -euo pipefail
if [[ "${1:-}" == "--ls" ]]; then git ls-tree -r --name-only v1-legacy; exit 0; fi
git show "v1-legacy:${1:?path required}"
