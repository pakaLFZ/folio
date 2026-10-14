---
name: folio
description: Work on a folio slide deck or workspace (a folder with folio.toml, decks/<name>/slides/*.json, the folio CLI or editor). Use whenever you write, fix or review slides in folio, whenever the user mentions slides, a deck, comments, the inbox or questionnaires in folio, and before any other step of such a task, because the user leaves comments in the editor while you work and you must keep a live watch on them.
---

# Working on a folio deck

The user reviews your slides in the folio editor while you work. They leave
comments on a slide region, write follow-ups in existing threads, and answer
your questionnaires there. You will not see any of it unless you watch.

## Starting a deck

Run `folio quickstart` first: a worked example from `init-deck` to a pptx,
one command per step. The four things agents get wrong:

- Run folio from the workspace root, the folder holding `folio.toml`.
- A figure is a path relative to the deck: copy a picture from elsewhere
  into `decks/<deck>/fig/` and write `"fig/name.png"`, never an absolute path.
- Run `folio doctor` first and fix each FAIL. Hooks use `[runtimes] python`
  in `folio.local.toml`, else python3 or python on PATH; with neither, every
  hooked text slot reports FOLIO-HOOK-006.
- Write each slide in one call: `folio new <deck> --template LAYOUT
  --worker <name> --props FILE|-` with every slot's content.

## 1. First: arm the watch

Before anything else on a folio task, start a watch on the user's actions.
One line arrives per new comment, per user message in a thread, per reopen or
hold, and per submitted questionnaire. Your own replies never print.

```
folio watch --deck decks/<deck>
```

A line looks like:

```
2026-10-13T09:12:03.120Z message c7f3a2 decks/talk s004 [title, fig:a] user: "make the arrow red" -> folio comment show c7f3a2
```

Pick the way your tools allow:

- **Claude Code, Monitor tool** (preferred): run `folio watch --deck decks/<deck>`
  as a Monitor command with `timeout_ms` at its maximum and a description such
  as "folio comments on <deck>". Every line becomes a notification. When the
  monitor expires, re-arm it with `--since <time of the last line you saw>`
  so nothing in between is lost.
- **Bash `run_in_background`**: run `folio watch --deck decks/<deck> --once`;
  it exits 0 after one line. Handle the line, then re-arm with
  `folio watch --deck decks/<deck> --once --since <that line's time>`.
- **No background tools**: run `folio inbox --status queue` before and after
  every step, and act on anything new there.

Leave out `--deck` to watch every deck of the workspace. Add
`--for comments,answers,viewing` to also hear when the user moves to another
slide. `--json` gives one JSON object per line instead.

## 2. On each line

1. Read it in full: `folio comment show <cid>` (thread, the slots the region
   covered, the sketch marks, the screenshot paths). The region, the sketch
   and the screenshots are part of the instruction; look at the screenshot.
   For an `answers` line, run the command it names: `folio answers <deck> <id>`.
2. Take it: `folio comment assign <cid> <your worker name>`, so a parallel
   worker does not answer it too.
3. Do it.
4. Reply: `folio comment reply <cid> "what changed" --answered --worker <name>`.
   `--answered` moves it to Review for the user. Only the user resolves.
5. Say in one line in chat what you did.

A comment that arrives mid-task is handled before the task goes on, unless
it is long; then reply at once with "seen, will do after <current step>"
(without `--answered`) and come back to it. A `held` line means the user
parked that comment: stop working on it. Never answer a held comment.

## 3. The working loop

- `folio prompt decks/<deck>` first: the pack's rules, layouts, slot names,
  vocabulary, how to make figures and how to ask. Follow it. Its Vocabulary
  section is the user's own words for slide text (`folio vocab show`); after
  the user edits text, `folio vocab edits decks/<deck>` lists the rewrites,
  and `folio vocab add` records the rule. A Never word is FOLIO-VOC-001.
- `folio viewing` tells you which deck, slide and slot the user has open:
  "this slide" means that one.
- Write slides with `folio new`, `folio patch` (with `--rev`), `folio slide
  rm|move|dup`, `folio shape add`, `folio text add`, `folio override`. A
  refused write says what is allowed; fix it and write again.
- Look at what you made: `folio shot decks/<deck> --sheet` (and `--changed`
  after an edit). Check every page you touched.
- `folio check decks/<deck>`: warnings (overflow, missing figures, open
  comments). Text never shrinks to fit; shorten it instead.
- Blocked on a decision only the user can make? Ask with a questionnaire,
  inside a comment conversation: when a user's comment needs a decision,
  reply to it with one (`folio ask decks/<deck> --comment <cid> --file q.json
  --worker <name>`, see `folio prompt`); without `--comment` it starts a new
  conversation. The user answers it in that comment's chat, and the watch
  prints the answers when they come. Never ask what you can find out.

## 4. Rules

- Run folio from the workspace folder (the one holding `folio.toml`); the
  deck paths the watch prints are relative to it.
- Every write names you: `--worker <name>`.
- Never resolve a comment: only the user resolves; you mark it answered.
- The user's unsent drafts are not yours to see; work only from sent comments.
- Keep the watch armed until the task is over; re-arm it whenever it ends.
