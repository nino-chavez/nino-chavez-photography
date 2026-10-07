#!/bin/bash
# usage: rerun.sh <engine> <role> <runName> <filter...>   Re-captures the surfaces whose id contains each filter into a fresh run folder.
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
cd /private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/h5
engine=$1; role=$2; run=$3; shift 3
for f in "$@"; do
  node cap.mjs $engine $role $run "$f"
done
