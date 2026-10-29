#!/bin/bash
S=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9
role=$1
for f in album- data photos; do
  $S/c.sh cap.mjs webkit $role r3-$role-webkit $f phone
done
echo "# all done" >> $S/r3-$role-webkit/run.log
