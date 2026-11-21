#!/usr/bin/env bash
# Writes the apple-app-site-association the web image serves at
# https://gym.magjan.dev/.well-known/apple-app-site-association (web/nginx.conf.template), from
# web/well-known/apple-app-site-association.template with the signing team's Team ID in it.
# Without it the iPhone app's associated domains (applinks, webcredentials) do nothing.
#
#   OPENGYM_TEAM_ID=ABCDE12345 frontend/scripts/ios-aasa.sh   (or the Team ID in ios/App/Signing.xcconfig)
#
# Then commit frontend/public/.well-known/apple-app-site-association and deploy the web image.
set -euo pipefail
FRONTEND="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$FRONTEND/.." && pwd)"
TEAM="${OPENGYM_TEAM_ID:-$(sed -n 's/^OPENGYM_TEAM_ID *= *//p' "$FRONTEND/ios/App/Signing.xcconfig" | tr -d '[:space:]')}"
if [[ ! "$TEAM" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "No Team ID: set OPENGYM_TEAM_ID or fill it in ios/App/Signing.xcconfig (10 letters and digits)." >&2
  exit 1
fi
OUT="$FRONTEND/public/.well-known/apple-app-site-association"
mkdir -p "$(dirname "$OUT")"
sed "s/TEAMID/$TEAM/g" "$ROOT/web/well-known/apple-app-site-association.template" > "$OUT"
echo "Wrote $OUT for $TEAM.dev.magjan.gym"
