# Slides: the vocabulary bank, the user's words for slide text

## Demand

- "learn my language, log them into local vocabulary bank"
  *(user, 2026-10-09)*: before writing any slide text, read the bank; after
  the user edits a slide's text, compare it with what was written and log
  what changed, with the date and the slide.
- "Vocabulary bank try one deck per bank with easy import or inherit from
  other bank with template Vocabulary bank as default" *(user, 2026-10-13)*.
- Proposed to the user on 2026-10-13 and not objected to: a "Never" word is
  a **warning, never a refusal**; folio **records the user's text edits
  automatically** as evidence, and the agent writes the rule.
- "U can add a new collapsable at slide tab to show voca bank"
  *(user, 2026-10-13)*.
- "And better the voca bank is editable by user" *(user, 2026-10-13)*.
- "vocab check dont leave reddot on page" *(user, 2026-10-13)*.
- The format is the bank the user already keeps: a "Use | Never | Since"
  word table, phrasing rules, an abstract structure with sentence frames and
  a worked example, and a dated log of the user's edits.

## Behaviour

- **Where a bank lives.** Each deck may have its own bank,
  `decks/<deck>/vocabulary.md`; each pack may ship a default bank,
  `templates/<pack>/vocabulary.md`. A deck with no bank of its own uses its
  pack's bank. Adding the file to a pack keeps the pack's version.
- **The file** is plain Markdown in the user's format. Only the first table
  whose header is `Use | Never | Since` is parsed (one entry per row); every
  other section is passed through as text. An optional front matter at the
  top says what the bank inherits and what it drops:

  ```
  ---
  inherits: [pack, decks/other-deck]
  drop: [pocket]
  ---
  ```

  `inherits` lists `pack` (the deck's own pack), `templates/<pack>` (another
  pack's bank) or `decks/<deck>` (another deck's resolved bank); it is
  `[pack]` when left out, and `[]` inherits nothing.
- **Resolution, nearest first.** The deck's own entries come first, then
  each inherited bank in the order listed, each resolved the same way (a
  cycle is cut and named). An entry is named by its Use cell (case and
  spacing ignored): the nearest entry of a name wins and farther ones of the
  same name are hidden. A `drop` item removes an inherited entry whose Use
  cell it names, or one Never term of an inherited entry. Other sections
  (Phrasing, Abstract structure, ...) resolve by heading: the nearest bank
  that holds a heading with any text gives that whole section; an empty
  section does not hide a farther one.
- **The edit log** is a section whose heading starts with "Status" or
  contains "log"; it is shown by `folio vocab show` and never sent to an
  agent with the rules.
- **Never terms.** A Never cell is split on commas outside brackets. A term
  is descriptive, and never matched, when it is wholly in brackets
  ("(no other name)"), starts with "any " ("any other name for it"), still
  holds a bracket ("site ids (C44, C46)") or holds a spaced slash
  ("towards / away from the viewer"). Matching is whole-word,
  case-insensitive and Unicode-normalised (NFKC: "CO₂" in the bank matches
  "CO_{2}" and "CO2" on a slide); a multi-word term matches across any run
  of spaces.
- **FOLIO-VOC-001** (warning): every text slot (title, subtitle, body,
  label, caption, note, and added text boxes) of every slide is checked
  against the resolved Never terms, in `folio check` and in the editor's
  warning flow: "s004/note uses "utilise"; the vocabulary bank says use "use"
  (2026-10-10, user: "plain words"))". It never refuses a write and never rewrites text.
- **No red dot.** FOLIO-VOC-001 never puts the red dot on a slide in the
  editor's rail; any other failure on the same slide still does. It stays
  in `folio check`, `folio status`, `folio prompt` and `folio shot` for
  agents: a shot's `--json` counts and its sheet caption count it as a
  warning (the caption is read by agents, not the user's page).
- **Agents read it automatically.** `folio prompt <deck>` ends with a
  "Vocabulary" section: the resolved word table, the phrasing rules and the
  abstract frames (every section but the edit log), and how to log what the
  user changes.
- **Edits recorded automatically.** When the user saves a text slot in the
  editor (on blur, as the editor already saves) and the text differs from
  what was there, the server appends a record to
  `decks/<deck>/.folio/vocab-edits.jsonl`: deck, slide, slot, before, after,
  time, and who wrote the before (from the deck's write log). A second save
  of the same slot by the user within two minutes, starting from the last
  record's after, extends that record instead of adding one; a burst that
  ends where it began leaves no record.
- **Commands.**
  - `folio vocab show <deck> [--resolved] [--json]`: the files that make the
    bank and the deck's own entries; with `--resolved`, the effective bank
    with each entry's origin.
  - `folio vocab init <deck> [--from <deck|pack>]`: create the deck's bank,
    inheriting from its pack; with `--from`, a self-contained copy of that
    bank resolved (`inherits: []`). Refused when the deck has a bank.
  - `folio vocab inherit <deck> <deck|pack>`: add to `inherits`.
  - `folio vocab import <deck> <file.md|deck|pack>`: merge entries and
    section lines in, skipping duplicates, and naming each conflict (same
    Use, other Never), which is left out.
  - `folio vocab add <deck> --use T --never "a, b" [--quote Q] [--slide
    sNNN]`: append a row dated today (`2026-10-13, slide s004, user:
    "..."`).
  - `folio vocab edits <deck> [--since DATE] [--json]`: the recorded
    rewrites, oldest first.
  - `folio vocab export <deck>`: the resolved bank as one text block, for an
    agent's brief.
- **The Slide tab's Vocabulary bank.** A third collapsible section of the
  Slide tab, below Templates, in the same component (chevron, header row,
  remembered open state), **closed by default**. It shows the resolved
  bank, editable:
  - the words as rows: Use and Never edit in place (click, Enter or
    leaving saves, Escape cancels); under each, a mark of where the word
    comes from (`deck`, `pack`, or the other deck's name) and its Since;
  - a bin on each row (shown on hover or focus) asks with the app's
    Cancel / Confirm popover, then deletes the word;
  - a last row adds a word (Use, Never; Since is today's date);
  - each other section but the edit log (Phrasing, Abstract structure,
    Content) as a plain text field, saved when it is left.
  Every change is one `POST /<deck8>/vocabulary` against the bank's
  revision, through the same core function the CLI uses, and lands in the
  deck's own `vocabulary.md`: an inherited row edited becomes the deck's own
  row (its mark turns to `deck`), an inherited row deleted becomes a `drop`
  item, and a deck without a bank gets one inheriting its pack on the first
  edit. The pack's bank and other decks' banks are never written from the
  editor. A change made against an old revision (the file was edited
  meanwhile) is applied once more on the current one. Every slide's
  FOLIO-VOC-001 is recomputed and published after a change, and when the
  file changes on disk.
- **Deck export** carries `decks/<deck>/vocabulary.md` and the pack's
  `vocabulary.md` with the deck and the pack.

## Never

- Rewriting the user's text automatically to the bank's words.
- Refusing a slide write over a Never word.
- One global bank shared by every deck.
- Writing the pack's bank or another deck's bank from the editor.

## Status

- A bank inherited from another deck (`decks/<deck>`) is not carried by
  `folio deck export`; `folio vocab init --from` makes a self-contained copy
  first when the deck must travel.
- Warnings follow a bank edit when the slide is next checked (`folio check`
  recomputes every slide); the live editor shows the change on the slide's
  next write.

## Where it lives

`packages/core/src/vocabulary.ts` (parse, resolve, Never terms, matching,
rendering, file edits), `vocabwarn.ts` (FOLIO-VOC-001, the text edits of a
patch, coalescing), `warnings.ts`; `packages/core/src/vocabedit.ts`, `vocabops.ts` (one change, shared by the
editor and the CLI); `packages/server/src/vocab.ts` (bank files, layers,
edit records), `routes-vocab.ts`, `checks.ts`, `routes-deck.ts`, `app.ts`;
`packages/web/src/editor/VocabularyBank.tsx`, `TemplateManager.tsx`,
`packages/web/src/warnings/useWarnings.ts` (`marksRail`);
`packages/cli/src/vocabcmds.ts`, `deckcmds.ts` (prompt);
`templates/lectern/vocabulary.md`, `packages/server/packs/plain/vocabulary.md`;
`docs/warnings.md`.

## Checks

`packages/core/test/vocabulary.test.ts` (the table parsed; resolution order,
drop and section merge; Never-term skip rules; matching with CO₂ subscripts
and multi-word terms; edit coalescing); `e2e/vocab.mjs` (a deck inherits the
pack bank; a slide with "pocket" gets FOLIO-VOC-001; `folio vocab add` adds a
word and the warning follows; an editor text edit appears in `folio vocab
edits`; `folio prompt` holds the bank; the Slide tab's section is closed
by default and opens on a word of the lectern bank; a slide whose only
finding is FOLIO-VOC-001 has no rail dot, and one that also overflows has; a Never cell edited
there changes the deck's file and the warning follows; a word added there;
an inherited word deleted there becomes a drop line, the pack's file
untouched).
