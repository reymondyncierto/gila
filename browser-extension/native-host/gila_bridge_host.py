#!/usr/bin/env python3
"""
Gila Native Messaging Host
Reads ~/.gila/bridge.port and ~/.gila/bridge.token and returns them
to the browser extension for automatic connection.
"""

import json
import os
import struct
import sys


def read_message():
    """Read a native messaging message from stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack("=I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data)


def send_message(msg):
    """Send a native messaging message to stdout."""
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def get_bridge_config():
    """Read bridge port and token from ~/.gila/."""
    gila_dir = os.path.join(os.path.expanduser("~"), ".gila")

    port_file = os.path.join(gila_dir, "bridge.port")
    token_file = os.path.join(gila_dir, "bridge.token")

    if not os.path.exists(port_file) or not os.path.exists(token_file):
        return {"error": "gila_not_running", "message": "Bridge files not found. Is Gila running?"}

    try:
        with open(port_file, "r") as f:
            port = int(f.read().strip())
        with open(token_file, "r") as f:
            token = f.read().strip()
        return {"port": port, "token": token}
    except Exception as e:
        return {"error": "read_failed", "message": str(e)}


def main():
    # Read the request from the extension
    request = read_message()

    if request is None:
        return

    action = request.get("action", "get_config")

    if action == "get_config":
        config = get_bridge_config()
        send_message(config)
    else:
        send_message({"error": "unknown_action"})


if __name__ == "__main__":
    main()
