#!/bin/zsh
# Runs the Northline server. Started by Northline.app through launchd (so it never inherits Intel/Rosetta mode from the app).
NL="$1"; PORT="${2:-3100}"
cd "$NL" || exit 1
[ -f .node-bin ] && export PATH="$(cat .node-bin):$PATH"
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && ! file -L "$(command -v node)" 2>/dev/null | grep -q arm64; then
  for d in /opt/homebrew/bin $(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V -r) /usr/local/bin; do
    [ -x "$d/node" ] && file -L "$d/node" | grep -q arm64 && { export PATH="$d:$PATH"; break; }
  done
fi
echo "node: $(command -v node) arch=$(node -p process.arch 2>/dev/null) node-translated=$(node -p "require('child_process').execSync('sysctl -n sysctl.proc_translated').toString().trim()" 2>/dev/null) · shell uname -m: $(uname -m) translated=$(sysctl -n sysctl.proc_translated 2>/dev/null) · $(date)" > .northline-node.txt
set -a; [ -f .phone-login ] && . ./.phone-login; set +a
export NORTHLINE_AUTH_DISABLED=false
LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
TS=$(command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null | head -1)
export NORTHLINE_LAN_HOSTS="$LAN,$TS"
printf "%s\n%s\n" "$LAN" "$TS" > .phone-address
[ -d node_modules ] || npm ci > .northline-install.log 2>&1
npx tsx scripts/import-references.ts --root "../AI Influencers" > /dev/null 2>&1
PKG="../_Backups/Creator Asset Package 2026-10-12"
if [ -d "$PKG" ] && [ ! -f .data/.library-2026-10-12-done ]; then npx tsx scripts/import-library.ts --dir "$PKG" --batch 2026-10-12 > .data-library-import.log 2>&1 && touch .data/.library-2026-10-12-done; fi
exec npm run dev -- -H 0.0.0.0 -p "$PORT"
