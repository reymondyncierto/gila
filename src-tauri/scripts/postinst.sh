#!/bin/bash
# Post-install script for Gila .deb/.rpm package
# Creates an XDG autostart entry for the user who installed the package.

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")
AUTOSTART_DIR="$REAL_HOME/.config/autostart"

mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/gila.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Gila
Comment=The Apex Vault — Password Manager
Exec=/usr/bin/gila
Terminal=false
StartupNotify=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=3
EOF

chown "$REAL_USER:$REAL_USER" "$AUTOSTART_DIR/gila.desktop"
