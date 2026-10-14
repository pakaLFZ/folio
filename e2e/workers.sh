#!/bin/bash
# Two workers create slides at the same time in a scratch deck of a fresh workspace, then patch different slides
# in parallel. Every id must be unique, every slide must be in the order, and every patch must land.
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
FOLIO="node ${FOLIO_E2E_BIN:-$REPO/packages/cli/bin/folio.mjs}"
W=$(cd "$REPO" && node -e 'import("./e2e/lib/server.mjs").then((m) => console.log(m.workspace({ decks: [], name: "workers" })))')
cd "$W" || exit 2
D=decks/workers
$FOLIO init-deck $D --template lectern@1 --title "Workers test" >/dev/null
run() { for i in $(seq 1 15); do $FOLIO new $D --template note-figure --worker $1 --props "{\"title\":\"$1 $i\"}"; done; }
run w1 > w1.out & run w2 > w2.out & wait
ids=$(cat w1.out w2.out | awk '{print $1}' | sort)
created=$(echo "$ids" | grep -c .)
unique=$(echo "$ids" | sort -u | grep -c .)
ordered=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$D/deck.json', 'utf8')).order.length)")
echo "created: $created, unique: $unique, in order: $ordered"
for id in $ids; do echo "[{\"op\":\"add\",\"path\":\"/elements/s/props/caption\",\"value\":\"caption of $id\"}]" | $FOLIO patch $D/$id - --worker w$((RANDOM % 2 + 1)) >/dev/null & done; wait
ok=$(node -e "const fs = require('fs'); for (const id of process.argv.slice(1)) console.log(JSON.parse(fs.readFileSync('$D/slides/' + id + '.json', 'utf8')).elements.s.props.caption === 'caption of ' + id)" $ids | grep -c true)
echo "patched correctly: $ok"
echo "log records by worker: $(cat $D/.folio/log/*.jsonl | node -e "const n = {}; for (const l of require('fs').readFileSync(0, 'utf8').split('\n').filter(Boolean)) n[JSON.parse(l).worker] = (n[JSON.parse(l).worker] ?? 0) + 1; console.log(JSON.stringify(n))")"
[ "$created" = 30 ] && [ "$unique" = 30 ] && [ "$ordered" = 30 ] && [ "$ok" = 30 ] && echo "PASS  30 slides from two workers, all unique, ordered and patched" && exit 0
echo "FAIL  workers in $W"
exit 1
