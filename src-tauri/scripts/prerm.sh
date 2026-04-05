#!/bin/bash
# Pre-remove script for Gila .deb/.rpm package
# Removes the XDG autostart entry.

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")

rm -f "$REAL_HOME/.config/autostart/gila.desktop"
