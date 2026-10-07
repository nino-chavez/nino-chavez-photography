#!/bin/bash
# start-wrangler.mjs is the copy beside this script (2026-10-07: it was a scratchpad copy that
# passed secrets as --binding argv).
HERE="$(cd "$(dirname "$0")" && pwd)"
# Serves the f25bbcb build (before) under wrangler pages dev on 8810.
export PATH=/Users/nino/.nvm/versions/node/v22.22.0/bin:$PATH
cd /Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a59116e7b27563182
exec node "$HERE/start-wrangler.mjs" /private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/builds/base/.svelte-kit/cloudflare 8810
