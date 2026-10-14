# Hooks: the queue

## Demand

- "because of the hook, consider add multi worker queue management for this
  hook thing so that one update does not break the whole system."
  *(user, 2026-10-12)*

## Behaviour

- **Derived, not stored.** At start and after every slide or pack change, the
  server computes each hooked slot's cache key and queues only the missing
  outputs. Text, figure and table hooks share this one queue (`hooks.md`). A restart loses nothing: the queue is rebuilt from the slides.
- **Isolation.** Each run is a child process in its own process group, in a
  temporary folder, under `nice`, with an optional address-space cap
  (`[queue] memory_mb`). A timeout or a cancellation kills the whole group.
  The output is checked (exists, decodes, has the box size) before it is
  renamed into the cache, so a half-written figure never replaces a good one.
- **Bursts.** A slot's changes are debounced 300 ms; latest wins: a newer input
  replaces the queued job, or kills the running one.
- **Caps and fairness.** Four jobs at once, two per hook by default
  (`folio.toml`), round-robin across hooks within a priority; one job per slot
  at a time.
- **Priority.** 1: the slide the user is looking at; 2: decks open in a
  browser; 3: slides edited in the last minute; 4: the rest.
- **Circuit breaker.** Three failures in a row of one hook version pause it:
  its slots keep their last good figure with "hook paused"; other hooks keep
  running. `folio queue resume <hook>` (or the Queue tab's Resume) re-arms it.
- **Canary.** When a hook's code changes, a slot whose figure was drawn by the
  older version from the same inputs is a re-draw: the first re-draw runs
  alone; if it succeeds the rest follow; if it fails the rollout stops and the
  old figures stay, marked stale. Fresh requests are not held by a canary.
- **Retry.** One automatic retry, only after a timeout or a kill by signal.
- **Visibility.** `folio queue [--json]` and the Queue tab show running,
  queued, paused, stopped rollouts and recent failures; every state change is
  logged; `folio status` names paused hooks; `folio pdf` waits for the deck's
  jobs. Breaker, rollouts and proven versions survive a restart in
  `.folio/queue-state.json`.

## Never

- Redis or BullMQ (an extra service on a shared login node).
- Worker threads (piscina): a crash would take the server down.
- A canary that gates every job of a new hook version: one bad input on a
  never-run hook then blocked every other slot. Rejected 2026-10-12.
- A canary run left marked running after a restart (it is reset to waiting).

## Where it lives

`packages/core/src/queue.ts` (`nextJobs`, `breakerState`, `rolloutStep`),
`packages/server/src/hooks/service.ts`, `ledger.ts`, `runner.ts`, `warm.ts`,
`packages/cli/src/queuecmds.ts`, `packages/web/src/hooks/QueueTab.tsx`.

## Checks

`e2e/hooks-queue.mjs`: cache hit; schema path; failure keeps the last good
figure and `check` exits 0; ten quick edits run only the last; a hung hook is
killed at its timeout (with its one retry) while others finish; three failures
pause a hook and others keep running; a changed hook re-draws behind one
canary; a broken script stops the rollout after one run and old figures stay
stale; a server killed mid-run rebuilds its queue with every cached PNG whole.
Unit tests for `nextJobs`, `breakerState`, `rolloutStep`.
