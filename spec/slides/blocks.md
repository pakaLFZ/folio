# Slides: blocks (text boxes and code blocks styled by the pack)

## Demand

- "can u add a dynamic component (see if we want such feature), e.g. I want
  code showing block and other text kind of box, which other kind of text box
  has a white background with multiple column option, which the box height
  auto adjusts with the content inside. how do u think we should design and
  call this kind of thing? should we create a new class of stuff so that
  other user can create their components as well?" *(user, 2026-10-13)*
- After the design was discussed: "block is fine. code default is python but
  can you make it adjustable for popular languages? implement with agent"
  *(user, 2026-10-13)*
- On a 21-line VASP INCAR that an agent had split over two code blocks side
  by side to get two columns: "when I say 2 column I mean they share the
  same gray backgrould" *(user, 2026-10-13)*. So `columns` applies to code
  too: one box, one fill, border and padding, the lines split over the
  columns in order.
- Standing: text never shrinks (`overflow.md`); "It must be easy to learn
  and use for agents" and "Slide template can allow overwrite thus freeform
  as long as typescript accept it" *(user, 2026-10-13)*.
- Reading, stated for the work: a block is a slot of a new role, `block`,
  named `block:<x>`. Its look is a named **block style** from the pack's
  `blocks`, as tables take `tables` and shapes take `shapes`; the slide may
  lay any field of the style over it, and the slide wins. "Other users
  create their components" by adding a named style to a pack: declarative
  JSON, validated, refused by path with an example. No user code runs.

## Behaviour

### Block styles (pack)

- The pack's optional top-level `blocks` maps a style name to a style. Every
  field has a default, so `{}` is folio's neutral text block:

  | Field | Default | Meaning |
  |-------|---------|---------|
  | `description` | null | One plain sentence: what the style is for (printed by `folio prompt`). |
  | `kind` | `"text"` | `"text"` (marked-up text) or `"code"` (source code). |
  | `fill` | null | Background: a hex, `ink`, a pack colour, or null for none. |
  | `border` | null | `{"color": C, "width": pt, "dash": "solid"\|"dash"\|"dot", "side": "all"\|"left"\|"top"\|"right"\|"bottom"}`; defaults `ink`, 1 pt, solid, all. `side: "left"` draws a callout bar. |
  | `radius` | 0 | Corner radius, pt. |
  | `padding` | 12 | Space between the border and the text on every side, pt. |
  | `columns` | 1 | 1 to 4. Text flows from one column into the next, as in a newspaper; code lines are split over the columns in order. |
  | `columnGap` | 18 | Space between columns, pt. |
  | `grow` | true | true: the box's height follows the content and the slot's box height is the maximum. false: the box is the slot's box. |
  | `text` | `{}` | Role style fields (`font`, `size`, `weight`, `italic`, `lineHeight`, `align`, `color`, ...) laid over the pack's `body` role. |
  | `language` | `"python"` | Code: the language when the slide names none. |
  | `lineNumbers` | false | Code: numbers in a gutter left of the code. |
  | `syntax` | readable on the fill | Code: `{"keyword", "string", "comment", "number", "function", "type", "meta"}` colours. |

- `fill`, `border` (`color`, `width`, `dash`) and `padding` are the text
  slot's own box style fields (`overrides.md`, "A text slot's box style",
  core `boxstyle.ts`): one vocabulary for every box. Blocks add `side` to the
  border.
- The text colour, when neither the style nor the slide names one: on a
  block with a fill, near-black (`#111111`) or white, whichever reads on the
  fill; on a block without a fill, the background's ink.
- `syntax` colours not given default by the fill: a light palette (dark
  blue keywords, green strings, grey italic comments) on a light fill or
  none, a dark palette on a dark fill. Every colour is a hex, `ink` or a
  pack colour.
- `default` is implied when the pack does not define it: folio's neutral
  style (a text block, no fill, no border, 12 pt padding, one column, grows).
- Pack load refuses, each by path with the fix:
  - a colour that is not a hex, `ink` or a pack colour
    (`blocks.card.border.color: "navy" is not a colour: ...`);
  - `columns` outside 1 to 4;
  - a `code` style without a `text.font` the pack ships in `fonts` (`blocks.code.text.font: a code style names a
    monospace font the pack ships in "fonts" (fonts: Liberation Sans,
    Liberation Mono)`);
  - a `language` not in the list below;
  - a block slot not named `block:<x>`, a block slot's `style` that names no
    block style, and a `hook` on a block slot whose style is `code`.

### Shipped styles

Both `plain` and `lectern` ship (adding them keeps each pack's version):

- `card`: white fill, a thin grey border, 12 pt padding, two columns, grows.
- `callout`: a light tint of the pack's palette as fill, a 4 pt coloured bar
  on the left (`border.side: "left"`), one column, grows.
- `code`: kind `code`, Liberation Mono, python, a light fill matching the
  pack (`plain`: `light` grey; `lectern`: `smoke`), no line numbers.

Both packs ship Liberation Mono (Regular and Bold, SIL Open Font License
1.1, the licence file beside it, the same text as Liberation Sans's).

### Block slots (layout and slide)

- A block slot is `{"role": "block", "box": [x, y, w, maxH], "style":
  "<name>"}`, named `block:<x>`. `style` names a block style; without it the
  slot is `default`. A layout may declare one; a slide adds one by override.
- A slide lays style fields over the named style with
  `overrides.slots.block:a.block` (`{"columns": 3, "fill": "light"}`), a
  partial block style, deep merged as every override is; it may pick another
  style with `overrides.slots.block:a.style`. Precedence: the slide's
  `block` fields > the slot's `style` > `default`. The slot's `text`
  override is laid over the style's `text` last.
- The slide's prop of a text block is its text, a string with inline markup
  (`**bold**`, `X_{sub}`, `X^{sup}` and `rich-text.md` styled runs), or null.
- The slide's prop of a code block is `{"code": "...", "language": "rust"}`,
  or a plain string (the style's language, python unless the style says
  otherwise). `{"code": ...}` on a text block is refused naming the block's
  kind and style and the code styles that would take it.
- Languages: `python`, `bash`, `shell`, `javascript`, `typescript`, `json`,
  `toml`, `yaml`, `c`, `cpp`, `rust`, `go`, `java`, `sql`, `r`, `julia`,
  `fortran`, `latex`, `markdown`, `text` (no highlighting). Any other is
  refused naming the list: `/elements/s/props/block:a/language: "kotlin" is
  not a code language; languages: python, bash, ...`.
- A text block whose layout names a text hook runs it as a text slot does
  (`spec/hooks/hooks.md`); a code block takes no hook, so no chemistry
  subscripting touches code.

### Drawing

- A block is HTML at exact pt, the same in the live view, thumbnails,
  `folio shot` and `folio pdf`: its fill, border and radius on the box, the
  padding inside, then the text.
- **Columns.** With `grow`, the columns are balanced: the text is split so
  the columns end level, and the box is as tall as the balanced columns plus
  the padding. Without `grow`, the first column fills the box's height
  before the next one starts.
- **Code.** Whitespace is kept exactly (tabs, indentation, blank lines), no
  inline markup is read and no hook runs. It is highlighted by highlight.js
  (core build with one import per language): the same synchronous code in
  the live page and the print page, so screen, shot and PDF agree. Tokens
  take the style's `syntax` colours; everything else the text colour.
  `lineNumbers` adds a gutter of right-aligned numbers in the comment
  colour.
- **Code columns.** A code block with `columns` above 1 is still one box:
  one fill, border, radius and padding round all its columns, `columnGap`
  between them. Its lines go into the columns in order: with `grow`,
  ceil(lines / columns) to a column (21 lines in 2 columns: 11 and 10);
  without `grow`, each column takes the lines the box's height holds before
  the next one starts, and the last column takes whatever is left, running
  past the box (FOLIO-OVF-006). With `lineNumbers` each column has its own
  gutter, the numbers continuing from the column before. The width a line
  is measured against is its own column's. The editor's text area edits the
  whole code at once.
- **Code never wraps.** A line wider than the box runs past its right edge
  and is `FOLIO-OVF-007`, naming the lines. Wrapping code would change what
  the code says to a reader (an indented continuation is not a new line),
  so folio warns instead.
- A block with `grow` is drawn at its content's height. A slot placed
  `below` it moves with it (`tables.md`, Below flow): a block's rendered
  bottom is its top plus its drawn height.
- An empty block in Edit mode shows its frame and the placeholder ("Text"
  for text, "Code" for code).

### Overflow

- A block whose content needs more than its box's height (with `grow`: the
  maximum; without: the box; a block placed `below` another: its laid-out
  height) is `FOLIO-OVF-006`: `Block block:a needs 212 pt; its box holds
  180 pt.` It is drawn in full past its box; text never shrinks.
- A code line wider than the box is `FOLIO-OVF-007`: `Code block block:b:
  line 4 runs 38 pt past the box; code never wraps.` (one warning per block,
  naming every such line).
- In Edit mode an overflowing block carries `data-overflow="block"` or
  `"code-width"` and the danger outline.

### Agents

- `folio block add <deck>/<id> --style card|callout|code|<any pack style>
  --box x,y,w,h [--text T | --code-file F [--language L]] [--columns N]`
  adds the next free `block:<letter>` slot and its content in one
  revision-checked write and prints the slot name. `--columns` lays
  `{"columns": N}` over the style. A refused block writes nothing and prints
  each problem by path.
- `folio block rm <deck>/<id> block:a` removes an added block and its
  content in one write; a layout's block slot keeps its slot and loses its
  content.
- `folio prompt` lists the pack's block styles (name, kind, description) and
  the languages, with one example command.

### Editor

- A text block is typed into in place, as a text slot: click into it, type,
  leave to save.
- A code block is edited as plain text: a click opens a monospace text area
  over the block, at least as tall as the code so no line sits out of sight
  below a fixed box, with the raw code (Tab inserts two spaces); leaving it
  saves, Escape reverts. The language stays as it was.
- Inserting a block from the editor: the Text box tool's popover (pinned
  above the tool, `editing.md`) opens with a **Style** picker: "Text box"
  (the plain text box, with its font, colour and box options) or one of the
  pack's block styles (a code style marked "(code)"). With a block style
  picked the popover is headed "Next block", its text box options give way
  to a **Language** picker for a code style ("python (style)" keeps the
  style's), and a drag on the slide draws the next `block:<x>` slot in that
  style and selects it, the caret in it for text. Reading, stated for the
  work: one tool draws every kind of text box, so the Text box tool gained a
  picker rather than a second Block tool beside it.
- Typing straight after the release is never lost (2026-10-13, a full-suite
  run lost the first letter under load): the new block or text box exists
  only once its write returns, so from the release until its caret is in it
  the page holds every key typed (ahead of the tool keys, so a typed "t" or
  "o" picks no tool) and types them into the box when it takes focus. The
  same holds for the Text box tool's plain text boxes.
- A selected block (pressed on its edge, as a text box) moves and resizes
  by its frame and handles, Delete removes it, and the popover is headed
  "Block a" with its Style and Language; each change is one write. Moving a
  code block to a text style keeps its code as its text.
## Never

- User-written rendering code (a component in JavaScript, a template
  language): a block is data the pack declares.
- A full component system with props and slots of its own.
- Text in a block that shrinks to fit, and code that wraps to fit.
- Highlighting that differs between the screen and the PDF (an asynchronous
  highlighter that the print page could capture before it finishes).
- A language guessed from the code.

## Status

- `folio pptx` captures code blocks as 3× print-page pictures with source in alt text. Text, card and callout blocks become editable text runs (`rich-text.md`). *Superseded 2026-10-13: every block used to be a picture.*
- `folio pack export --pptx` and `pack merge` do not carry block styles yet.
- A report (2026-10-13) of a code block losing its last line: the deck's
  write log shows `folio block add` storing all 22 lines and, 79 s later, a
  save from the editor's code text area storing 21. No folio code removes a
  line (the CLI strips only the file's final newline; the text area saves
  its value as it is; code takes no hook), so it was an edit in the text
  area. That text area was then clipped to its fixed 204 pt box with 356 pt
  of code in it, so the last lines were out of sight while editing; it now
  grows to the code's height.
- Drafts: a block drawn in the editor will be a draft (`overrides.slots.<name>.draft`)
  once the editor's draft flag lands; `folio block add` stays final.

## Where it lives

`packages/core/src/blocks.ts` (style schema, languages, value schema,
resolved block, syntax defaults), `blockedit.ts` (the add and remove
patches), `pack.ts` (`blocks`, refusals), `overrides.ts` (`block`
refinement), `overflow.ts` (OVF-006, OVF-007), `catalog.ts` (prompt);
`packages/web/src/slide/BlockSlot.tsx`, `CodeBlock.tsx`, `highlight.ts`,
`LayoutView.tsx`; `packages/web/src/editor/blockModel.ts`,
`BlockOptions.tsx`, `TextTools.tsx`, `ShapeLayer.tsx`;
`packages/cli/src/blockcmd.ts`; `packages/server/packs/plain/pack.json`,
`templates/lectern/pack.json` and their `fonts/`.

## Checks

`packages/core/test/blocks.test.ts` (style defaults and refusals by path,
language list and refusal, value by kind, precedence of slide fields, syntax
defaults by fill, grow and overflow warnings, add and remove patches, prompt
lines); `e2e/blocks.mjs` (a two-column card grows as text is added and the
`below` slot moves; python and rust code blocks show highlight colours in
`folio shot`; an unknown language is refused; OVF-006 past the maximum
height and OVF-007 for a too-long code line); `e2e/block-editor.mjs` (the
Text box tool's Style picker draws a card and a rust code block, typing and
the code text area save, the block's popover restyles it, Delete removes it;
with the CPU slowed 6x, a block and a text box keep every letter typed
straight after the release).
