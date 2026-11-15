#!/bin/sh
# Lit les options de l'add-on (/data/options.json) ; /data est persistant (clés VAPID, abonnements, cache)
export DATA_DIR=/data
export PORT=8080
export VAPID_SUBJECT="$(jq -r '.vapid_subject' /data/options.json)"
export REFRESH_MS="$(( $(jq -r '.refresh_minutes' /data/options.json) * 60000 ))"
exec node /app/server.js
