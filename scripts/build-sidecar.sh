#!/usr/bin/env bash
# build-sidecar.sh — Build the Octave Python sidecar binary for Linux / macOS.
#
# The compiled binary is NOT committed to git (see src-python/.gitignore).
# Run this script once before `npm run tauri dev` or `npm run tauri build`.
#
# Prerequisites:
#   pip install pyinstaller
#
# Usage:
#   ./scripts/build-sidecar.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_PYTHON="$REPO_ROOT/src-python"

# Detect target triple
OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" == "Linux" ]]; then
    TARGET="${ARCH}-unknown-linux-gnu"
elif [[ "$OS" == "Darwin" ]]; then
    TARGET="${ARCH}-apple-darwin"
else
    echo "Unsupported OS: $OS" >&2
    exit 1
fi

DEST="$SRC_PYTHON/main-$TARGET"

echo "==> Building Octave Python sidecar ($TARGET)"

# Step 1: install / upgrade PyInstaller
echo "--> Installing PyInstaller..."
python3 -m pip install --quiet --upgrade pyinstaller

# Step 2: build one-file executable
echo "--> Running PyInstaller..."
cd "$SRC_PYTHON"
python3 -m PyInstaller --onefile --name main main.py

# Step 3: copy dist/main → src-python/main-<triple>
BUILT="$SRC_PYTHON/dist/main"
if [[ ! -f "$BUILT" ]]; then
    echo "PyInstaller output not found at $BUILT" >&2
    exit 1
fi

cp -f "$BUILT" "$DEST"
echo "==> Binary written to $DEST"
echo "    You can now run: npm run tauri dev"
