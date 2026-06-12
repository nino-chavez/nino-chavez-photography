#!/usr/bin/env bash
# Blueprint Portal — prep for Cloudflare Pages deploy
#
# Reads docs.tiers[].docs[] from _meta/index.json and copies each entry's
# `source` (repo-relative path, resolved against the portal's parent
# directory) into _docs/<id>.md so the canonical viewer
# (docs/index.html) and the chat function (functions/api/chat.js) can
# serve them from the deploy root.
#
# Manifest-driven; no hardcoded SOURCES table. Entries without a
# `source` field are assumed to already exist at _docs/<id>.md
# (consumers may author directly there when no canonical path applies).
#
# Full rationale: docs/decisions/0003-portal-docs-manifest-driven-sync.md
# in the methodology repo.

set -euo pipefail
PORTAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INITIATIVE_DIR="$(cd "$PORTAL_DIR/.." && pwd)"
DOCS_OUT="$PORTAL_DIR/_docs"
MANIFEST="$PORTAL_DIR/_meta/index.json"

if [ ! -f "$MANIFEST" ]; then
  echo "error: manifest not found at $MANIFEST" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node required for manifest parsing (install Node.js 18+)" >&2
  exit 1
fi

mkdir -p "$DOCS_OUT"

# Extract source:id pairs from the manifest. Skips entries without `source`
# (those are assumed to already exist at _docs/<id>.md).
ENTRIES=$(node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const tiers = (m.docs && m.docs.tiers) || [];
  for (const t of tiers) {
    for (const d of (t.docs || [])) {
      if (d.source && d.id) process.stdout.write(d.source + ":" + d.id + "\n");
    }
  }
' "$MANIFEST")

count=0
missing=0
if [ -n "$ENTRIES" ]; then
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    src="${entry%%:*}"
    id="${entry##*:}"
    if [ -f "$INITIATIVE_DIR/$src" ]; then
      cp -f "$INITIATIVE_DIR/$src" "$DOCS_OUT/$id.md"
      count=$((count + 1))
    else
      echo "warn: source not found: $src (id=$id, expected at $INITIATIVE_DIR/$src)" >&2
      missing=$((missing + 1))
    fi
  done <<< "$ENTRIES"
fi

echo "Synced $count doc(s) into $DOCS_OUT/ ($missing source(s) missing)"
ls -1 "$DOCS_OUT" 2>/dev/null || true
