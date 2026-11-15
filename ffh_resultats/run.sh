#!/bin/sh
# Lit les options de l'add-on (/data/options.json) ; /data est persistant (clés VAPID, abonnements, feuilles, état Tailscale)
export DATA_DIR=/data
export PORT=8080
export VAPID_SUBJECT="$(jq -r '.vapid_subject' /data/options.json)"
export REFRESH_MS="$(( $(jq -r '.refresh_minutes' /data/options.json) * 60000 ))"

AUTHKEY="$(jq -r '.tailscale_authkey // empty' /data/options.json)"
TS_HOST="$(jq -r '.tailscale_hostname // "hockey"' /data/options.json)"
if [ -n "$AUTHKEY" ]; then
  # Publication via Tailscale Funnel : seul ce site (port 8080) est exposé, jamais Home Assistant
  mkdir -p /data/tailscale /var/run/tailscale
  tailscaled --tun=userspace-networking --state=/data/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock > /tmp/tailscaled.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 1; done
  if tailscale up --authkey="$AUTHKEY" --hostname="$TS_HOST" --accept-dns=false --accept-routes=false; then
    tailscale funnel --bg 8080 && echo "Funnel actif : $(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')" || echo "Funnel : échec (HTTPS et Funnel autorisés dans la console Tailscale ?)"
  else
    echo "Tailscale : connexion impossible (clé invalide ou expirée ?)"
  fi
fi
exec node /app/server.js
