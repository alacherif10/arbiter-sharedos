#!/bin/bash
# switch-room.sh — update poll.js to a new Arena room + token, restart the watcher.
# Usage: ./switch-room.sh <ROOM_ID> <MEMBER_TOKEN> [<AFTER_SEQ>]

set -e
ROOM="$1"
TOKEN="$2"
AFTER="${3:-0}"

if [ -z "$ROOM" ] || [ -z "$TOKEN" ]; then
  echo "Usage: $0 <ROOM_ID> <MEMBER_TOKEN> [<AFTER_SEQ>]"
  exit 1
fi

# Patch poll.js constants
sed -i "s|^const ROOM = .*|const ROOM = \"$ROOM\";|" poll.js
sed -i "s|^const TOKEN = .*|const TOKEN = \"$TOKEN\";|" poll.js
sed -i "s|^let after = .*|let after = $AFTER;|" poll.js

echo "poll.js updated:"
grep -E "^const ROOM|^const TOKEN|^let after" poll.js

echo ""
echo "Restart poll.js manually in its terminal (Ctrl-C, then: node poll.js)"
