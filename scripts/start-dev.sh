#!/bin/bash
# Start Gila in dev mode (Vite + Tauri) silently in the background.
# Used by the autostart desktop entry.

export PATH="$HOME/.nvm/versions/node/v24.3.0/bin:$HOME/.cargo/bin:$PATH"
cd /home/rpyncierto/Desktop/music-admin/gila

npm run tauri dev > /tmp/gila-dev.log 2>&1 &
