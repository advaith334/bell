#!/bin/bash
# Regenerates assets/icon.icns and the menu bar template images.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/assets"

mkdir -p "$ASSETS"

swift "$ROOT/scripts/make-icons.swift" "$ASSETS"
iconutil -c icns "$ASSETS/icon.iconset" -o "$ASSETS/icon.icns"
rm -rf "$ASSETS/icon.iconset"

echo "wrote $ASSETS/icon.icns"
