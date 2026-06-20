#!/usr/bin/env bash
# Publish doloop-decorations to Open VSX (Cursor) and/or the VS Code Marketplace.
# Set OVSX_TOKEN and/or VSCE_PAT in your env first. Bump package.json version before running.
set -e
npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository
VSIX=$(ls -t *.vsix | head -1); echo "packaged: $VSIX"
if [ -n "$OVSX_TOKEN" ]; then npx --yes ovsx publish "$VSIX" -p "$OVSX_TOKEN" && echo "-> Open VSX"; else echo "skip Open VSX (set OVSX_TOKEN)"; fi
if [ -n "$VSCE_PAT" ]; then npx --yes @vscode/vsce publish -p "$VSCE_PAT" && echo "-> Marketplace"; else echo "skip Marketplace (set VSCE_PAT)"; fi
