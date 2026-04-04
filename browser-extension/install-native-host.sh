#!/bin/bash
# Gila Native Messaging Host Installer
# Registers the native messaging host with Chrome/Chromium so the
# browser extension can automatically discover the bridge port and token.
#
# Usage:
#   ./install-native-host.sh <extension-id>
#
# To find your extension ID:
#   1. Go to chrome://extensions
#   2. Enable Developer mode
#   3. Load the browser-extension/ folder
#   4. Copy the ID shown under the extension name

set -e

EXTENSION_ID="${1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.rpyncierto.gila"
HOST_SCRIPT="${SCRIPT_DIR}/native-host/gila_bridge_host.py"
HOST_MANIFEST_SRC="${SCRIPT_DIR}/native-host/${HOST_NAME}.json"

if [ -z "$EXTENSION_ID" ]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo ""
  echo "To find the extension ID:"
  echo "  1. Open chrome://extensions"
  echo "  2. Load the browser-extension/ folder"
  echo "  3. Copy the ID (e.g., abcdefghijklmnopqrstuvwxyz)"
  exit 1
fi

# Determine Chrome native messaging directory
# Chrome
CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
# Chromium / Brave / Edge
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
EDGE_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"

# Create the manifest with the correct path and extension ID
create_manifest() {
  local target_dir="$1"
  mkdir -p "$target_dir"

  cat > "${target_dir}/${HOST_NAME}.json" << EOF
{
  "name": "${HOST_NAME}",
  "description": "Gila Password Manager — Bridge Config Provider",
  "path": "${HOST_SCRIPT}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF
  echo "  Installed to: ${target_dir}/${HOST_NAME}.json"
}

echo "Installing Gila native messaging host..."
echo "  Extension ID: ${EXTENSION_ID}"
echo "  Host script:  ${HOST_SCRIPT}"
echo ""

# Install for all detected browsers
installed=0

if [ -d "$HOME/.config/google-chrome" ]; then
  create_manifest "$CHROME_DIR"
  installed=1
fi

if [ -d "$HOME/.config/chromium" ]; then
  create_manifest "$CHROMIUM_DIR"
  installed=1
fi

if [ -d "$HOME/.config/BraveSoftware/Brave-Browser" ]; then
  create_manifest "$BRAVE_DIR"
  installed=1
fi

if [ -d "$HOME/.config/microsoft-edge" ]; then
  create_manifest "$EDGE_DIR"
  installed=1
fi

# Fallback: install for Chromium if nothing detected
if [ "$installed" -eq 0 ]; then
  echo "  No browser config found, installing for Chromium as default..."
  create_manifest "$CHROMIUM_DIR"
fi

# Make the host script executable
chmod +x "$HOST_SCRIPT"

echo ""
echo "Done! The extension will now auto-connect to the Gila desktop app."
echo "Restart your browser for changes to take effect."
