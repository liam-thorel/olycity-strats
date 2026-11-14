#!/usr/bin/env sh
# Envoie la version committée (HEAD) sur le mini PC et relance le conteneur.
# Ne touche ni à data/ (strats, sessions, vidéos) ni au .env du serveur.
set -eu
HOST="${HOST:-root@ak1}"
DIR="${DIR:-/root/olycity-strats}"
cd "$(dirname "$0")/.."
ssh "$HOST" "mkdir -p '$DIR'"
git archive --format=tar HEAD | ssh "$HOST" "tar -x -C '$DIR'"
ssh "$HOST" "cd '$DIR' && test -f .env || { echo 'Il manque $DIR/.env (voir .env.example)'; exit 1; }; docker compose up -d --build && docker compose ps"
