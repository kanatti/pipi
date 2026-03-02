#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPI_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="$HOME/.local/bin"

mkdir -p "$INSTALL_DIR"

# Install manager and worker binaries
cp "$PIPI_ROOT/bin/pimanager" "$INSTALL_DIR/pimanager"
cp "$PIPI_ROOT/bin/piworker" "$INSTALL_DIR/piworker"
chmod +x "$INSTALL_DIR/pimanager"
chmod +x "$INSTALL_DIR/piworker"

echo "✓ Installed pimanager and piworker to $INSTALL_DIR"
