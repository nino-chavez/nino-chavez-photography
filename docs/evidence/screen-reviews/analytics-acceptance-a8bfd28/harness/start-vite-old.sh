#!/bin/bash
# The pre-rebuild tree (196bd11) under vite dev with the write-blocking preload, to prove its GET pages write nothing before it is run under wrangler.
S=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9
export PATH=/Users/nino/.nvm/versions/node/v22.22.0/bin:$PATH
cd /private/tmp/claude-501/oldbuild
echo '{}' > $S/scenario-old.json
export ADMIN_EMAILS=walk-owner@example.test
export WALK_SCENARIO_FILE=$S/scenario-old.json
export OUTBOUND_LOG=$S/outbound-old.log
export NODE_OPTIONS="--import $S/preload.mjs"
exec node --env-file=/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.env.local node_modules/.bin/vite dev --port 5422 --host 127.0.0.1
