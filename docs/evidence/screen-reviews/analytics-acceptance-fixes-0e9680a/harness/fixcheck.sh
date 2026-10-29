#!/bin/bash
# usage: fixcheck.sh <runname> <role> <engine>  — phone loads of the surfaces that overflowed at large text
export PATH=/Users/nino/.nvm/versions/node/v22.22.0/bin:$PATH
cd /Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a59116e7b27563182
H=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/h2
for f in albums album-Re7kho photos sites data settings; do
  node $H/cap.mjs $3 $2 $1 $f phone
done
echo "# done" >> /private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/$1/run.log
