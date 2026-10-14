# Live: agents writing in parallel

## Demand

- A **multi-worker workflow**: several agents build different slides in
  parallel. Many writers on one slide is not needed. *(user)*
- Editing must be fast. *(user)*
- "It must be easy to learn and use for agents" *(user, 2026-10-13)*
- "A product pitched at AI agents carries its target shape as documentation
  and as a refusal ... every refusal names what was missing and the command
  that fixes it." *(user's standing rule)* The dogfood of 2026-10-13 found
  `folio patch` accepting an unknown prop, a table row with too many cells
  and an unknown hook input key, printing only a new revision; the errors
  surfaced only on a later `folio check`.
- Dogfood, 2026-10-13: "An agent has no CLI to delete, reorder or duplicate
  slides (the editor rail can). `folio new` adds; nothing else." and "I
  rewrote deck.json `order` to 9 slides, but `folio pdf` still printed 10
  pages: a slide file not in `order` (s010) was still printed. Find out why
  ... An agent that edits `order` expects it to be the deck."
  *(user, 2026-10-13)*
- An agent building a real deck on Windows: "is there a way to write a slide
  in one call (layout + all slot texts) rather than `folio new` then several
  `folio patch`?" *(user, 2026-10-13, relayed)*

## Behaviour

- A slide is one file, `decks/<deck>/slides/<id>.json`, a json-render flat spec
  whose root element is the layout. Its revision is the hash of its bytes, so
  an edit from any writer, a text editor included, changes it.
- `folio new <deck> --template LAYOUT --worker W` takes the next id under a
  lock and appends it to the order; `folio patch <deck>/<id> patch.json --rev R`
  applies an RFC 6902 patch only if the revision still matches (exit 3, and
  the server's 409, otherwise). Both work with or without a server running.
- **One call makes a filled slide.** `folio new <deck> --template LAYOUT
  --props FILE|- [--after ID] [--worker W]` reads a JSON object from FILE (or
  stdin for `-`) and writes it as the new slide's props: slot name to content,
  plus `background` and `overrides` as a slide may hold them. A value that
  starts with `{` is read as the JSON itself (kept for older scripts; on
  Windows a file or stdin avoids the shell's quoting). Example:
  `folio new talk --template note-figure --props s.json` with s.json
  `{"title": "CO2 moves along the channel", "note": "...", "fig:a": "fig/path.png"}`.
  - The slide is checked exactly as `folio patch` checks a write (the same
    guard, the same messages: an unknown slot, a table row of the wrong
    length, an unknown hook input). A refused slide writes nothing: no id is
    taken, nothing is appended to `order`, and the exit is 2.
  - A props value that is not a JSON object, unreadable JSON or a missing
    file is refused before anything is written, naming the problem and the
    shape to write (`--props must be a JSON object {"<slot>": <content>}`).
  - `--after ID` places the slide right after that slide instead of at the
    end; an `--after` that names no slide of the deck is refused before
    anything is written, listing the deck's ids (`folio slide list <deck>`).
  - It prints the id and revision as `folio new` always has.
- `folio slide rm <deck> <id>[,<id>...]` archives the slides (never deletes:
  the files move to `slides/.archive/<date>/`, the rail's own Delete);
  `folio slide move <deck> <id> --to N | --after ID | --before ID` reorders
  one slide; `folio slide dup <deck> <id> [--after ID]` duplicates a slide,
  by default right after itself; `folio slide list <deck> [--json]` prints
  id, layout, title text and active warning count, in presentation order.
  Each goes through the same `DeckStore` method the editor rail's action
  calls (`archiveSlides`, `moveSlide`/`moveSlides`, `duplicateSlide`), so a
  write lands the same way whichever side makes it, and a running server's
  file watcher picks it up and publishes it to open browsers without a
  restart, the same as any other CLI write.
- **A slide file that exists but is not listed in `deck.json`'s `order`**
  (left behind by a hand edit of `order`, or written directly) still renders
  and prints: `slideOrder` appends every such file after the listed slides,
  sorted by id, so a slide a worker wrote before the order caught up is never
  silently dropped. This is deliberate, not a bug, but it must never be a
  silent surprise to an agent that edited `order` expecting it to be the
  whole deck: every such file is reported as `FOLIO-ORD-001` (a note, so it
  never fails a build) on `folio check`, `folio status`, the warnings API and
  `folio slide list`'s count, naming the slide and how to add it to `order`
  (`folio slide move`) or drop it (`folio slide rm`).
- Every write is atomic (temporary file, then rename) and appended to
  `.folio/log/YYYY-MM-DD.jsonl` with the worker's name.
- The HTTP API is the same for the browser, the CLI and `folio_client`:
  `PATCH /<deck8>/slides/<id>` with `If-Match`, `POST /<deck8>/slides`,
  duplicate, archive, order.
- **A write that breaks the slide's schema is refused.** `folio patch`,
  `folio new --props`, `PATCH /<deck8>/slides/<id>` and `POST /<deck8>/slides`
  check the slide as it would be written against its layout (after the
  slide's own overrides are applied, so a slot an override adds is a valid
  prop) and each hook call against the hook's input schema. A problem the
  write introduces answers 422 (CLI exit 2), nothing is written, the current
  revision is returned, and every problem is listed on its own line by JSON
  path: `/elements/s/props/foo: "foo" is not a slot of layout title; its
  slots are title, author (and background, overrides)`.
  - Only problems the write **adds** refuse it. A slide already broken by a
    hand edit still takes a patch that fixes one thing at a time, and an edit
    of an unrelated slot.
  - Warnings (overflow, character limits, missing figure files, hook runs)
    never refuse; only schema errors do.
  - The browser editor saves through the same route. It writes only text or
    null into text slots, a path into a figure slot and validated overrides,
    so a typing flow never meets a refusal; if it ever does, the save fails
    with the server's message and the slide keeps its stored revision.
- **Every refusal says what is allowed.** An unknown prop lists the layout's
  slots; an unknown hook input key lists the hook's keys; a wrong type names
  the expected shape with a tiny example; a figure slot whose hook call is
  wrong names `folio hook show <pack>/<hook>` for a full example. A table row
  of the wrong length says how many cells the table's columns need.
- Direct file edits cannot be refused, so `folio check` words the same
  problems the same way (`FOLIO-SPEC-001`, `FOLIO-HOOK-001`).
- `folio show` prints a slide with its revision; `folio prompt` prints the
  pack's agent instructions, including that `folio new` only adds and the
  `slide` subcommands are how to remove, reorder or copy one, the one-call
  form `folio new ... --props` with a short example built from the pack's
  first layout, and `folio layouts <deck>` for every slot box in one table
  (`packs.md`); `folio status`
  and `folio check` report.

## Never

- One file per deck (open-slide's `index.tsx`): parallel workers collide.
- A save that overwrites without a revision check.
- A write that prints a new revision for a slide that no longer matches its
  layout, leaving the error for a later `folio check`.
- A refusal that names only what is wrong (`Unrecognized key: "foo"`,
  `must NOT have additional properties`) without what is allowed.
- Silently dropping, or silently keeping, a slide file `order` does not list:
  either would surprise an agent that just edited `order`. It renders (so no
  slide vanishes unexplained) and is warned about by name (so no slide lingers
  unexplained).
- A CLI delete: archive only, same as the rail.
- `folio new --props` writing an empty slide and then patching it: a refused
  fill would leave an empty slide and a used id behind.

## Where it lives

`packages/server/src/deckstore.ts`, `fsutil.ts`, `routes-deck.ts`,
`checks.ts` (`FOLIO-ORD-001`), `packages/core/src/deck.ts` (`slideOrder`),
`warnings.ts`, `packages/cli/src/deckcmds.ts`, `slidecmds.ts`,
`overridecmd.ts` (the `slide` dispatcher), `python/folio_client/`, `packages/core/src/writecheck.ts` (the problems a
write may not add, and their wording), `packages/core/src/hookinputs.ts`
(`validateHookInputs`).

## Checks

`e2e/workers.sh` (two workers create 15 slides each at once and patch all 30
in parallel: ids unique, all in the order, every patch lands, the log names
each worker), `e2e/slide-cli.mjs` (`rm`, `move --to/--after/--before`, `dup`,
`list`; a running server's manifest and warnings endpoints see each change
without a restart; a file left out of `order` still renders, appended last,
and is reported as `FOLIO-ORD-001` naming the fix), `packages/server/test/checks.test.ts`
(`FOLIO-ORD-001` fires for an unlisted file and not for a listed one);
`e2e/write-refusals.mjs` (patch, new and the HTTP route refuse
an unknown prop, a long table row and an unknown hook input with 422, the file
unchanged and the message listing what is allowed; a broken slide still takes
an unrelated patch); unit tests in `packages/core/test/writecheck.test.ts`;
`packages/cli/test/newprops.test.ts` (`new --props` from a file and stdin
writes the filled slide in one write; `--after` places it; an unknown slot, a
long table row, bad JSON and an unknown `--after` write nothing and take no
id).
