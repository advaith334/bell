#!/bin/bash
# Builds the pilcrow-helper binary. Kept as a plain swiftc invocation rather than a
# SwiftPM package because the helper is a single file with no dependencies
# beyond system frameworks.
set -euo pipefail

HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HELPER_DIR/dist"

mkdir -p "$OUT_DIR"

swiftc \
  -O \
  -target arm64-apple-macosx13.0 \
  -framework AppKit \
  -framework ApplicationServices \
  -o "$OUT_DIR/pilcrow-helper" \
  "$HELPER_DIR/main.swift"

echo "built $OUT_DIR/pilcrow-helper"
