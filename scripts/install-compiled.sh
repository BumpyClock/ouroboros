#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${HOME}/.local/bin"
OUT_FILE="${DEST_DIR}/ouroboros"

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [ -x "${HOME}/.bun/bin/bun" ]; then
  BUN_BIN="${HOME}/.bun/bin/bun"
else
  echo "bun not found. install from https://bun.sh first."
  exit 1
fi

mkdir -p "${DEST_DIR}"

"${BUN_BIN}" build --compile --outfile "${OUT_FILE}" "${REPO_ROOT}/ouroboros.ts"
chmod +x "${OUT_FILE}"

if [ ! -s "${OUT_FILE}" ]; then
  echo "compile failed: empty output file: ${OUT_FILE}"
  exit 1
fi

if command -v file >/dev/null 2>&1; then
  FILE_DESC="$(file -b "${OUT_FILE}")"
  case "${FILE_DESC}" in
    *ELF* | *Mach-O* | *PE32* | *MS-DOS*executable*)
      ;;
    *)
      echo "compile failed: output is not an executable (${FILE_DESC})"
      echo "try upgrading/downgrading bun and rerun."
      exit 1
      ;;
  esac
fi

echo "installed: ${OUT_FILE}"
