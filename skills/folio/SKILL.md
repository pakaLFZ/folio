---
name: folio
description: Make, fix and review slide decks with folio, an agent-first slide framework (JSON slides in template packs, a live browser editor, PDF and editable PPTX out). Use whenever the user asks for slides, a deck, a talk or a presentation built with folio, mentions folio.toml, decks/<name>/slides/*.json, the folio CLI, its editor, comments, the inbox or questionnaires, or wants a PowerPoint turned into a folio template. Covers installing folio, writing slides, figures, templates and answering the user's comments live.
---

# folio

folio decks are folders of JSON slides filled into a template pack. The user
watches them in a browser editor while you write, and leaves comments there.
Everything you do goes through the `folio` command; every refusal it prints
names what was wrong and the command that fixes it, so read refusals and
follow them.

## 0. Get folio running

Run `folio doctor`. If `folio` is not found, install it:
`npm install -g https://github.com/pakaLFZ/folio/releases/latest/download/folio.tgz`
and `npx playwright install chromium`
([references/install.md](references/install.md) has Python, workspaces and
building from source). Then run `folio doctor` again and fix each FAIL with
the command printed under it. The user opens the editor by typing `folio`
alone; you use the explicit commands.

## Starting a deck

Run `folio quickstart` first: a worked example from `init-deck` to a pptx,
one command per step ([references/quickstart.md](references/quickstart.md)).
The four things agents get wrong:

- Run folio from the workspace root, the folder holding `folio.toml`.
- A figure is a path relative to the deck: copy a picture from elsewhere
  into `decks/<deck>/fig/` and write `"fig/name.png"`, never an absolute path.
- Run `folio doctor` first and fix each FAIL. Hooks use `[runtimes] python`
  in `folio.local.toml`, else python3 or python on PATH; with neither, every
  hooked text slot reports FOLIO-HOOK-006.
- Write each slide in one call: `folio new <deck> --template LAYOUT
  --worker <name> --props FILE|-` with every slot's content.

## 1. First: arm the watch

Before writing anything, start a watch on the user's actions. One line
arrives per new comment, per user message in a thread, per reopen or hold,
and per submitted questionnaire. Your own replies never print.

```
folio watch --deck decks/<deck>
```

Run it in the background with whatever your tools allow (a monitor, a
background shell with `--once` re-armed with `--since <last line's time>`, or
`folio inbox --status queue` between steps). Details and the line format:
[references/comments.md](references/comments.md).

## 2. On each line

1. Read it in full: `folio comment show <cid>`. The region, the sketch and
   the screenshot are part of the instruction; look at the screenshot.
2. Take it: `folio comment assign <cid> <your worker name>`.
3. Do it.
4. Reply: `folio comment reply <cid> "what changed" --answered --worker <name>`.
   Only the user resolves.

A comment that arrives mid-task comes first unless it is long; then reply
"seen, will do after <step>" without `--answered`. Never answer a `held` one.

## 3. The working loop

- `folio prompt decks/<deck>`: the pack's layouts, slot names, line and
  character limits, text markup, lists, shapes, blocks, figures, the user's
  vocabulary and how to ask questions. It is generated from the pack: follow
  it rather than guessing slot names.
- `folio viewing`: the deck, slide and slot the user has open now; "this
  slide" means that one.
- Write: `folio new`, `folio patch <deck>/<id> p.json --rev R`, `folio slide
  rm|move|dup|list`, `folio shape|text|block add`, `folio override`. A refused
  write says what is allowed; fix it and write again.
- Figures: a pack hook when one fits, else your own script drawn at the
  slot's size and traced ([references/figures.md](references/figures.md)).
- Look at what you made: `folio shot decks/<deck> --sheet` (`--changed`
  after an edit), and open the PNGs. Check every page you touched.
- `folio check decks/<deck>`: every warning. Text never shrinks to fit;
  shorten it. `folio codes` explains every code.
- Output: `folio pdf decks/<deck>`, `folio pptx decks/<deck> --out x.pptx`,
  `folio deck export decks/<deck>` (one zip with the pack and figures).
- Blocked on a decision only the user can make? `folio ask` a questionnaire
  in the comment's chat and wait with `folio answers <deck> <id> --wait`.
  Never ask what you can find out.

## 4. Templates

Pick a pack with `folio init-deck <dir> --template PACK@V`; without
`--template` the deck uses the built-in `plain@1`. To make a template from a
PowerPoint or from scratch, read `folio pack guide` first, then
[references/packs.md](references/packs.md).

## 5. Rules

- Every write names you: `--worker <name>`.
- Never resolve a comment; mark it answered. Never read the user's drafts.
- Never edit `pack.json` by hand while decks use it: `folio pack edit`
  keeps versions and protects decks.
- Keep the watch armed until the task is over.
- Every command: [references/cli.md](references/cli.md), or `folio --help`.
