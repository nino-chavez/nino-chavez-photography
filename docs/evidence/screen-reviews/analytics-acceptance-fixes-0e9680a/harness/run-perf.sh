#!/bin/bash
# Usage: run-perf.sh <port> <output-name> [paths]
# Same settings for before and after: 10 loads per page and device, 1.5 s gap, round-robin, Chromium, mobile throttle as the script fixes it.
export PATH=/Users/nino/.nvm/versions/node/v22.22.0/bin:$PATH
cd /Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a59116e7b27563182
export ANALYTICS_MEASURE_ORIGIN=http://127.0.0.1:$1
export ANALYTICS_MEASURE_PATHS=${3:-/photography/analytics/data}
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Users/nino/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell
export ANALYTICS_MEASURE_RUNS=10
export ANALYTICS_MEASURE_GAP_MS=1500
export ANALYTICS_MEASURE_OUTPUT=/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/perf2/$2.json
# warm both in-process caches before load 1, as the earlier local comparison did
for p in $(echo "$ANALYTICS_MEASURE_PATHS" | tr ',' ' '); do curl -s -o /dev/null "$ANALYTICS_MEASURE_ORIGIN$p"; done
exec node scripts/measure-analytics-performance.mjs
