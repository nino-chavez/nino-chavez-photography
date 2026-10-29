#!/bin/bash
# Uncommitted acceptance-walk launcher: this worktree's vite dev server reading production (read-only; the preload blocks any write),
# the project's .env.local exported into the process only. ADMIN_EMAILS is a test value for the local owner harness.
S=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9
export PATH=/Users/nino/.nvm/versions/node/v22.22.0/bin:$PATH
cd /Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ae2da4a794cf8c96c
echo '{}' > $S/scenario.json
export ADMIN_EMAILS=walk-owner@example.test
export WALK_SCENARIO_FILE=$S/scenario.json
export OUTBOUND_LOG=$S/outbound.log
export NODE_OPTIONS="--import $S/preload.mjs"
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=analytics.ninochavez.co
exec node --env-file=/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.env.local node_modules/.bin/vite dev --port 5421 --host 127.0.0.1
