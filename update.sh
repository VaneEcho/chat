#!/bin/bash
set -e

# chat one-command update. Designed for a server checkout that sits
# next to a server-customized compose file:
#
#   <dir>/compose.yaml   server-customized compose (traefik, etc.)
#   <dir>/src/           this repository (git clone of VaneEcho/chat)
#
# Run: bash <dir>/src/update.sh   (first run clones the source if missing)

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SRC_DIR/.git" ]; then
	echo "No checkout at $SRC_DIR - cloning VaneEcho/chat..."
	git clone https://github.com/VaneEcho/chat.git "$SRC_DIR"
fi

cd "$SRC_DIR"
git pull --ff-only

COMPOSE_DIR="$(dirname "$SRC_DIR")"
cd "$COMPOSE_DIR"
docker compose up -d --build
echo "Done. $(docker compose ps chat | tail -1)"