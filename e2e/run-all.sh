#!/bin/bash
# Run every check at once, or only the checks named: bash e2e/run-all.sh [name ...]. Each check serves its own
# copy of the fixture decks on a free port, so runs never share a server, a port or a deck. At most
# FOLIO_E2E_JOBS checks run together (default: half the cores, at most 6). Prints one line per check as it
# ends, with its pass count and wall time, then every check again slowest first; full output goes to one log per
# check. Before the checks start, the CLI is built once to JavaScript (FOLIO_E2E_BIN) and one headless Chromium is
# started for all browser checks to share (FOLIO_E2E_BROWSER); see e2e/lib/build.mjs and e2e/lib/browser.mjs.
REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 2
[ -f packages/web/dist/index.html ] || { echo "packages/web/dist is missing: run pnpm build:web"; exit 2; }
CORES=$(node -p "require('os').availableParallelism()")
JOBS=${FOLIO_E2E_JOBS:-$(( CORES / 2 < 6 ? (CORES / 2 > 0 ? CORES / 2 : 1) : 6 ))}
LOGS=$REPO/scratch/e2e/logs-$(date +%Y%m%d-%H%M%S)-$$
mkdir -p "$LOGS"
CHECKS=(undo hooks-queue hooks-any-slot workers export-pdf pptx-export comments board inbox zoom pane-resize rail-select comment-search flood chat resume multitab vitest theme slide-actions placeholders comment-toolbar editing chrome-toggles pdf-lines rail-spacing overflow-typing template-manager tables questions overrides plot-trace table-trace pack-tools shot freeform slide-cli write-refusals render-errors shapes shape-editor viewing textbox watch blocks block-editor drafts elements smooth-nav deck-export vocab new-deck print-tall rich-text lists slot-boxes live-refresh region-click held-port)
[ $# -gt 0 ] && CHECKS=("$@")

# Seconds since a `now` stamp (awk, which every platform has; Git Bash has no bc). macOS date has no %N.
now() { node -p "Date.now() / 1000"; }
elapsed() { awk -v s="$1" -v e="$(now)" 'BEGIN { print e - s }'; }

one() {
  local run=$1 name=${1#*-} log=$LOGS/$1.log start=$(now) code passes
  case $name in
    vitest) node e2e/lib/timeout.mjs 300 pnpm exec vitest run ;;
    workers) node e2e/lib/timeout.mjs 300 bash e2e/workers.sh ;;
    *) set --; grep -q "chromium.launch" "e2e/$name.mjs" && set -- --import ./e2e/lib/browser.mjs
       node e2e/lib/timeout.mjs 300 node "$@" "e2e/$name.mjs" ;;
  esac < /dev/null > "$log" 2>&1
  code=$?
  passes=$(grep -oE 'Tests +[0-9]+ passed \([0-9]+\)' "$log" | sed -E 's/Tests +([0-9]+) passed \(([0-9]+)\)/\1\/\2/')
  [ -z "$passes" ] && passes="$(grep -c '^PASS' "$log")/$(grep -cE '^(PASS|FAIL)' "$log")"
  echo "$code" > "$LOGS/$run.status"
  printf '%-8s %-16s %7s passed  %6.1f s\n' "$([ "$code" = 0 ] && echo ok || echo FAILED)" "$name" "$passes" "$(elapsed "$start")" | tee "$LOGS/$run.line"
}
export -f one now elapsed
export LOGS

START=$(now)
FOLIO_E2E_BIN=$(node e2e/lib/build.mjs) || { echo "building the CLI failed"; exit 2; }
node e2e/lib/browser.mjs "${LOGS#"$REPO"/}/browser.ws" > "$LOGS/browser.log" 2>&1 &
BROWSER_PID=$!
stop_browser() {
  kill "$BROWSER_PID" 2>&1 && wait "$BROWSER_PID"
  kill -0 "$BROWSER_PID" 2>/dev/null && echo "shared browser $BROWSER_PID is still running"
}
trap stop_browser EXIT
for _ in $(seq 300); do [ -f "$LOGS/browser.ws" ] && break; sleep 0.1; done
[ -f "$LOGS/browser.ws" ] || { echo "the shared browser did not start; see $LOGS/browser.log"; exit 2; }
FOLIO_E2E_BROWSER=$(cat "$LOGS/browser.ws")
export FOLIO_E2E_BIN FOLIO_E2E_BROWSER
RUNS=()
for i in "${!CHECKS[@]}"; do RUNS+=("$(printf '%02d' "$i")-${CHECKS[$i]}"); done
printf '%s\n' "${RUNS[@]}" | xargs -P "$JOBS" -I{} bash -c 'one {}'
echo "slowest first:"
awk '{ print $(NF - 1), $0 }' "$LOGS"/*.line | sort -nr | cut -d' ' -f2-
failed=0
for run in "${RUNS[@]}"; do [ "$(cat "$LOGS/$run.status" 2>/dev/null)" = 0 ] || { failed=$((failed + 1)); echo "  failed: ${run#*-}, log $LOGS/$run.log"; }; done
printf '%d checks, %d failed, %d at a time, %.1f s wall; logs in %s\n' "${#CHECKS[@]}" "$failed" "$JOBS" "$(elapsed "$START")" "$LOGS"
[ "$failed" = 0 ]
