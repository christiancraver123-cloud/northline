#!/bin/bash
# Double-click to open Northline at http://localhost:3100 (opens in its own app window when Google Chrome is installed).
# First run installs packages (a few minutes). Your old app ("Start Northline") is untouched.
cd "$(dirname "$0")/Northline Command Center (new)" || exit 1
command -v node >/dev/null 2>&1 && dirname "$(command -v node)" > .node-bin  # lets Northline.app use this same Node
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Get the LTS version from https://nodejs.org, then double-click this again."; read -r -p "Press Enter to close"; exit 1; fi
if [ ! -d node_modules ]; then echo "First run: installing packages…"; npm ci || { read -r -p "Install failed. Press Enter to close"; exit 1; }; fi
echo "Loading the six master faces (skips any already loaded)…"
npx tsx scripts/import-references.ts --root "../AI Influencers" >/dev/null 2>&1 || echo "(master faces not loaded — check the AI Influencers folder)"
PKG="../_Backups/Creator Asset Package 2026-10-12"
if [ -d "$PKG" ] && [ ! -f .data/.library-2026-10-12-done ]; then
  echo "One time: sorting the creator image package onto each creator's page (about a minute)…"
  npx tsx scripts/import-library.ts --dir "$PKG" --batch 2026-10-12 > .data-library-import.log 2>&1 && mkdir -p .data && touch .data/.library-2026-10-12-done && echo "Done." || echo "(image sort failed — see .data-library-import.log)"
fi
( sleep 8; if [ -d "/Applications/Google Chrome.app" ]; then open -na "Google Chrome" --args --app=http://localhost:3100; else open "http://localhost:3100"; fi ) &
echo "Northline is starting on http://localhost:3100 — keep this window open. Close it to stop."
npm run dev -- -p 3100
