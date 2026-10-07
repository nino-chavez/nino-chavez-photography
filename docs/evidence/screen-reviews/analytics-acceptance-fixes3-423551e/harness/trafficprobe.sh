#!/bin/bash
S=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
cd ~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf
export WALK_SCENARIO_FILE=$S/scenario.json
export OUTBOUND_LOG=$S/outbound-probe.log
export NODE_OPTIONS="--import $S/preload.mjs"
exec node --env-file=~/Workspace/dev/sites/nino/nino-chavez-photography/.env.local --import tsx $S/h5/trafficprobe.mjs
