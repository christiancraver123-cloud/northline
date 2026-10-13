#!/bin/bash
# Opens Northline so your PHONE can use it too (password-protected). Lives next to the "Northline Command Center (new)" folder.
# Same Wi-Fi: open the address it prints on your phone. Anywhere (recommended): install Tailscale on the Mac + phone, sign in to both.
cd "$(dirname "$0")/Northline Command Center (new)" || exit 1
command -v node >/dev/null 2>&1 && dirname "$(command -v node)" > .node-bin  # lets Northline.app use this same Node
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Get it from https://nodejs.org"; read -r -p "Press Enter to close"; exit 1; fi
[ -d node_modules ] || { echo "First run: installing packages…"; npm ci || { read -r -p "Install failed. Press Enter to close"; exit 1; }; }
npx tsx scripts/import-references.ts --root "../AI Influencers" >/dev/null 2>&1 || true
if [ ! -f .phone-login ]; then
  echo "Choose a password for phone access (8+ characters). You'll type it once on your phone. It stays on this Mac."
  read -rs PW; echo
  if [ ${#PW} -lt 8 ]; then echo "Too short. Run this again."; read -r -p "Press Enter to close"; exit 1; fi
  { printf 'NORTHLINE_ADMIN_PASSWORD=%q\n' "$PW"; printf 'NORTHLINE_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"; } > .phone-login
  chmod 600 .phone-login; unset PW
fi
set -a; . ./.phone-login; set +a
export NORTHLINE_AUTH_DISABLED=false
LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
TS=$(command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null | head -1)
TSNAME=$(command -v tailscale >/dev/null 2>&1 && tailscale status --json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
export NORTHLINE_LAN_HOSTS="${LAN},${TS},${TSNAME}"
echo ""
echo "Northline is starting (keep this window open; close it to stop)."
[ -n "$TS" ] && echo "  Anywhere (Tailscale):  http://${TSNAME:-$TS}:3100"
[ -n "$LAN" ] && echo "  Same Wi-Fi:            http://$LAN:3100   (shared Wi-Fi like a dorm/house network: prefer Tailscale)"
echo "  On this Mac:           http://localhost:3100"
echo "Log in with the password you chose. Forgot it? Delete the hidden .phone-login file in the app folder and run this again."
( sleep 8; if [ -d "/Applications/Google Chrome.app" ]; then open -na "Google Chrome" --args --app=http://localhost:3100; else open "http://localhost:3100"; fi ) &
npm run dev -- -H 0.0.0.0 -p 3100
