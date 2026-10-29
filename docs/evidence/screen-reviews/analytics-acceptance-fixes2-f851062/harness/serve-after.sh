#!/bin/bash
# Serves the f25bbcb build (before) under wrangler pages dev on 8810.
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
cd ~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ade1328cb3fa1ed6e
export INSPECTOR=9230
exec node /private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/start-wrangler.mjs /private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/builds/after/.svelte-kit/cloudflare 8811
