# folio commands by task

`folio --help` lists every command with its flags. Run all of them from the
workspace root. Every write takes `--worker <name>`.

| Task | Command |
|---|---|
| Check the machine | `folio doctor` |
| Serve the editor | `folio serve .` (background); `folio restart`; `folio open <deck>` |
| New deck | `folio init-deck decks/D [--template PACK@V] [--title T]` |
| How to write for this pack | `folio prompt decks/D` |
| Layouts and slot boxes | `folio layouts decks/D [--json] [LAYOUT ...]` |
| Add a slide | `folio new decks/D --template LAYOUT --props FILE\|- [--after ID]` |
| Change a slide | `folio patch decks/D/s003 p.json --rev R` (RFC 6902; exit 3 on a stale revision) |
| Read a slide | `folio show decks/D/s003` |
| Remove, restore, reorder, copy | `folio slide rm\|restore\|move\|dup\|list decks/D ...` |
| Undo the user's last edit | `folio undo decks/D`, `folio redo decks/D` |
| One slide's own box or style | `folio override decks/D/s003 PATH=JSON`, `--clear PATH` |
| Shapes, text boxes, blocks | `folio shape\|text\|block add decks/D/s003 ...`, `... rm decks/D/s003 shape:a` |
| Look at slides | `folio shot decks/D [--sheet] [--changed] [--slides s001-s005] [--marks]` |
| Every warning | `folio check decks/D [--json\|--sarif\|--format github]`; `folio codes` |
| Accept a warning | `folio ack ID --reason "..." [--until DATE]` |
| PDF | `folio pdf decks/D [--out F]` |
| PowerPoint | `folio pptx decks/D --out F` |
| Share a deck | `folio deck export decks/D` / `folio deck import F.folio.zip` |
| Slot size for a figure | `folio box decks/D/s003 fig:a` |
| Run a script with folio_hook | `folio py script.py` |
| Hooks | `folio hook list\|show PACK/HOOK`, `folio run-hook decks/D/s003/fig:a`, `folio queue` |
| Where a figure came from | `folio trace decks/D/s003 fig:a` |
| Watch the user | `folio watch [--deck decks/D] [--once] [--since T]` |
| What the user has open | `folio viewing` |
| Comments | `folio comments decks/D`, `folio comment show\|assign\|reply\|next\|search ...` |
| Board | `folio inbox [--status queue]`, `folio status` |
| Ask the user | `folio ask decks/D [--comment C] --file q.json`, `folio answers decks/D ID --wait` |
| Vocabulary | `folio vocab show\|add\|edits decks/D ...` |
| Packs | `folio pack guide\|schema\|check\|import\|edit\|merge\|export ...` |
| This skill | `folio skill show`, `folio skill install [--user] [--force]`, `folio quickstart` |

A slide file is `{"root": "s", "elements": {"s": {"type": LAYOUT, "props":
{SLOT: CONTENT}, "children": []}}}`. Text markup: `**bold**`, `X_{sub}`,
`X^{sup}`, `[[size=24;color=red;bold|text]]`; lists start a line with `- ` or
`1. `. Text never shrinks to fit: a slot over its line limit is a warning
(FOLIO-OVF-001); shorten the text.

Python workers can drive a running server with `folio_client` (in the
repository's `python/`): `Deck.open`, `new_slide`, `Slide.set`, `comments`,
`reply`.
