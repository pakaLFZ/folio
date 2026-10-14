/**
 * The json-render catalog of a pack: one component per layout, generated at load
 * time, so a new pack or layout needs no code.
 */
import { defineCatalog, type PromptContext } from "@json-render/core";
import { z } from "zod";
import type { HookDef } from "./hookdef.js";
import { slideOverridesSchema } from "./overrides.js";
import { blockValueSchema } from "./blocks.js";
import { blockStyleNames, CODE_LANGUAGES, refinedBlockStyle } from "./blockstyle.js";
import { shapeStyleNames, type Layout, type Pack, type Slot, type Usage } from "./pack.js";
import { defineSlideSchema, figureValueSchema } from "./schema.js";
import { shapeValueSchema } from "./shapes.js";
import { tableRowsThatFit, tableValueSchema } from "./tables.js";
import { textSlots } from "./theme.js";

/** What the prompt template needs beyond json-render's catalog data. */
interface PromptExtras {
  pack: Pack;
  hooks: Record<string, HookDef>;
}

/**
 * The zod props schema of one layout.
 *
 * @param pack - the pack, for its background names.
 * @param layout - the layout whose slots become props; a slide's resolved
 *   layout also holds the slots its overrides add.
 * @returns a strict object: every slot is nullable text, a figure value or a
 *   table value, plus `background` and `overrides`. Unknown keys are rejected so a misspelt slot is caught.
 */
export function layoutPropsSchema(pack: Pack, layout: Pick<Layout, "slots">) {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, slot] of Object.entries(layout.slots)) {
    shape[name] = slot.role === "figure" ? figureValueSchema : slot.role === "table" ? tableValueSchema(Object.keys(pack.tables)) : slot.role === "shape" ? shapeValueSchema(pack) : slot.role === "block" ? blockValueSchema(pack, slot) : z.string().nullable();
  }
  const backgrounds = Object.keys(pack.backgrounds) as [string, ...string[]];
  shape.background = z.enum(backgrounds).nullable();
  shape.overrides = slideOverridesSchema.nullable();
  return z.object(shape).partial().strict();
}

/**
 * A usage note as prompt lines.
 *
 * @param usage - the layout's or pack's note, or null.
 * @returns `When: ...` and `How: ...`, or nothing when there is no note.
 */
export function usageLines(usage: Usage | null): string[] {
  if (!usage) return [];
  return [`When: ${usage.when}`, ...(usage.how ? [`How: ${usage.how}`] : [])];
}

/**
 * Describe one layout for agents: each slot with its role, size and limit.
 *
 * @param pack - the layout's pack.
 * @param name - the layout name.
 * @param layout - the layout.
 * @param hooks - the pack's hooks, to print the inputs of hooked figure slots.
 * @returns plain text lines, one per slot.
 */
export function describeLayout(pack: Pack, name: string, layout: Layout, hooks: Record<string, HookDef>): string[] {
  const lines = [`### ${name}`, layout.description, ...usageLines(layout.usage), `Background: ${layout.background}`];
  const limits = new Map(textSlots(pack, layout).map((t) => [t.name, t]));
  for (const [slotName, slot] of Object.entries(layout.slots)) {
    const text = limits.get(slotName);
    const [, , w, h] = slot.box;
    if (text) {
      const chars = pack.rules.maxChars[slot.role];
      const charNote = chars ? `, at most ${chars} characters` : "";
      lines.push(`- \`${slotName}\` (${slot.role}, ${text.style.size} pt, at most ${text.lineLimit} line${text.lineLimit > 1 ? "s" : ""}${charNote}${flowNote(slot)})${slot.description ? `: ${slot.description}` : ""}${sampleNote(slot)}${textHookNote(slot, hooks)}`);
    } else if (slot.role === "table") {
      lines.push(tableLine(pack, slotName, slot));
    } else if (slot.role === "block") {
      lines.push(blockLine(pack, slotName, slot));
    } else if (slot.role === "shape") {
      lines.push(`- \`${slotName}\` (shape, ${w} x ${h} pt${slot.style ? `, style ${slot.style}` : ""}): {"kind": "rect"|"ellipse"|"arrow"|"line", ...}, see Shapes${slot.description ? `. ${slot.description}` : ""}`);
    } else {
      const hook = slot.hook ? hooks[slot.hook] : undefined;
      const hookNote = hook ? `; or {"hook": "${hook.name}", "inputs": ...} with inputs ${JSON.stringify(hook.inputs)}` : "";
      lines.push(`- \`${slotName}\` (figure, ${w} x ${h} pt): a file path relative to the deck, drawn at exactly this size${hookNote}${sampleNote(slot)}`);
    }
  }
  return lines;
}

/** Where a flowed slot starts: `, starts 12 pt below table:b, so it loses lines as that grows`. */
function flowNote(slot: Slot): string {
  return slot.below ? `, starts ${slot.below.gap} pt below ${slot.below.slot}, so it loses lines as that grows` : "";
}

/**
 * One table slot for agents: its width, how many rows fit, its style and the value shape.
 */
function tableLine(pack: Pack, name: string, slot: Slot): string {
  const [, , w, h] = slot.box;
  const style = pack.tables[slot.tableStyle ?? ""];
  const fit = style ? `, at most ${tableRowsThatFit(style, h)} rows of one line at ${style.size} pt${style.header ? " under a header row" : ""}` : "";
  const flow = flowNote(slot);
  const others = Object.keys(pack.tables).filter((t) => t !== slot.tableStyle);
  const pick = others.length ? `; "tableStyle" may pick ${others.map((t) => `"${t}"`).join(" or ")}` : "";
  return `- \`${name}\` (table, ${w} pt wide${fit}${flow}, style ${slot.tableStyle}): {"columns": [...], "rows": [[...], ...]} with one string per cell, or {"src": "<subject>.table.json"} relative to the deck${pick}${slot.description ? `. ${slot.description}` : ""}${sampleNote(slot)}`;
}

/** One block slot for agents: its size, its style and kind, and what it holds. */
function blockLine(pack: Pack, name: string, slot: Slot): string {
  const [, , w, h] = slot.box;
  const { name: styleName, style } = refinedBlockStyle(pack, slot);
  const holds = style.kind === "code" ? `code: a string of ${style.language}, or {"code": "...", "language": "rust"}` : "text with markup";
  return `- \`${name}\` (block, ${w} pt wide, ${style.grow ? `at most ${h} pt tall, grows with its content` : `${h} pt tall`}${flowNote(slot)}, style ${styleName}, ${style.kind}): ${holds}, see Blocks${slot.description ? `. ${slot.description}` : ""}${sampleNote(slot)}`;
}

/**
 * What an agent must know about a text slot whose layout names a hook.
 *
 * @returns `. Hook "name" rewrites ...` with the hook's description, or "".
 */
function textHookNote(slot: Slot, hooks: Record<string, HookDef>): string {
  const hook = slot.hook ? hooks[slot.hook] : undefined;
  if (!hook) return "";
  return `. Hook "${hook.name}" rewrites this text before it is shown; write the plain text, the slide keeps it as written${hook.description ? ` (${hook.description})` : ""}`;
}

/**
 * The pack's own placeholder of a slot, as a hint of what belongs there.
 *
 * @returns `. Placeholder: "..."` when the slot declares a placeholder, else "".
 */
function sampleNote(slot: Slot): string {
  return slot.placeholder ? `. Placeholder: "${slot.placeholder}"` : "";
}

/** How an agent asks the user a question, printed at the end of every pack's prompt. */
export const ASKING_THE_USER = [
  "## Asking the user",
  "When a decision only the user can make blocks you (which of two framings, whether a figure is final, a fact only they know), ask with a questionnaire instead of guessing. Never ask what you can find out or decide yourself.",
  "A questionnaire is a message in a comment conversation: the user answers it in that comment's chat. When a user's comment needs a decision, reply to it with a questionnaire instead of a question in words.",
  "- `folio ask <deck> --comment <cid> --file q.json --worker NAME` asks inside that comment and prints the questionnaire's id; without `--comment` it starts a new comment conversation (on `slide`, else the first slide).",
  '- q.json: {"title": "...", "intro": "...", "slide": "s003", "questions": [{"id": "framing", "prompt": "...", "kind": "single", "options": ["A", "B"], "other": true, "required": true}]}.',
  "- kinds: `single` (radio, options), `multi` (checkboxes, options, optional min and max), `text` (one line, optional placeholder), `long` (a paragraph); optional `required` and `default`.",
  "- `folio answers <deck> <id> --wait` blocks until the user submits and prints the answers as JSON; `folio ask --withdraw <id>` withdraws a question that no longer matters.",
  "",
  "To act on what the user is looking at, run `folio viewing`.",
  "Keep a watch on the user's comments: `folio watch --deck <deck>` (see the folio skill).",
];

/** How agents are told about per-slide overrides. */
const OVERRIDE_LINES = [
  "Overrides: a slide may override any value its layout gives it in the prop `overrides`, and an override wins over the template:",
  '  {"background": NAME, "decorations": [...], "slots": {SLOT: {"box": [x, y, w, h], "lines": N, "role": ..., "below": {...}, "text": {"size": 16, "color": "#7a0019", ...}, "table": {"headerFill": "#003d7c", ...}}}}',
  "  Every field is the layout's own (`folio pack schema`); `text` holds role style fields, `table` table style fields. Arrays such as a box are replaced whole. An invalid override is refused naming its path.",
  "  Prefer the template: override only when a slide truly needs a change, and set them with `folio override <deck>/<slide> PATH=JSON`.",
  "Added slots: a slot name the layout lacks adds a slot to that slide alone, given in full like a pack slot (at least `role` and `box`; figures are named `fig:<x>`, tables `table:<x>`). The slide's props then hold its content like any slot, and it is measured, warned about and hooked like one. Remove it with `--clear slots.NAME`.",
  `  Example: folio override <deck>/s010 'slots.headline={"role":"title","box":[60,200,840,80]}', then fill it with folio patch: [{"op": "add", "path": "/elements/s/props/headline", "value": "One clear claim"}].`,
];

/** How agents are told about shapes, with the pack's own style and colour names. */
export function shapeLines(pack: Pack): string[] {
  const colors = Object.keys(pack.colors);
  return [
    "Shapes: rectangles, ellipses (a circle is an ellipse in a square box), arrows and lines are slots of role `shape`, named `shape:<x>`. Add one in one write:",
    "  folio shape add <deck>/s010 rect --box 100,120,200,80 --fill \"#f5f5f5\" --text \"Step 1\"   (prints the slot name; `folio shape rm <deck>/s010 shape:a` removes it)",
    "  Also: `circle --box x,y,d`, `arrow --from x,y --to x,y` (slide pt; the box is made round them), `--stroke C --stroke-width PT --dash solid|dash|dot --heads end|start|both|none --radius PT --style S`.",
    '  The slot holds {"kind", "style"?, "fill"?, "stroke"?, "strokeWidth"?, "dash"?, "radius"? (rect), "heads"? (arrow, default end), "from"?/"to"? (arrow, line: pt from the box\'s top-left), "text"? (rect, ellipse: centred, measured like a text slot)}.',
    `  Styles: ${shapeStyleNames(pack).join(", ")}; the slide's fields win over the style. Colours: a hex, "ink" (the background's ink)${colors.length ? `, or ${colors.join(", ")}` : ""}; null for none.`,
    "Drafts: shapes, arrows, lines, text boxes and blocks the user draws in the editor carry `draft: true`. A draft is the user's sketch of intent, not slide content: it shows only in Edit, is left out of the PDF and shots, and `folio check` lists each as FOLIO-DRF-001 with its position.",
    "  When the user's request means a real element, draw it properly (`folio shape add` / `folio text add` / `folio block add` with the template's styles, aligned and sized to the layout) and remove the draft (`folio shape rm` / `folio text rm` / `folio block rm`); never just flip a draft to final without making it right. What you add yourself is final by default.",
    'Text boxes: `folio text add <deck>/s010 --box 100,120,300,60 --text "Note" [--size 14 --font F --color C --bold --italic --align center --fill C --border C --border-width PT --border-dash dash --padding PT]` adds the next free `text:<x>` slot (a body text slot, measured and warned about like any). Any text slot may carry `fill` (background), `border` {"color", "width", "dash"} and `padding` (pt inside the box; the line limit counts from the padded box).',
  ];
}

/** How agents are told about blocks, with the pack's own styles. */
export function blockLines(pack: Pack): string[] {
  const styles = blockStyleNames(pack).map((name) => {
    const { style } = refinedBlockStyle(pack, { style: name });
    const shape = style.kind === "code" ? `code, ${style.language}` : `text, ${style.columns} column${style.columns > 1 ? "s" : ""}`;
    return `  - \`${name}\` (${shape}${style.grow ? ", grows" : ""})${style.description ? `: ${style.description}` : ""}`;
  });
  return [
    "Blocks: a text box or a code block in one of the pack's block styles, a slot of role `block` named `block:<x>`. A block with `grow` is as tall as its content (its box height is the maximum) and a slot placed `below` it moves with it; more than the maximum is a warning, text never shrinks and code never wraps.",
    '  folio block add <deck>/s010 --style card --box 60,120,840,200 --text "**Point**: ..."   (prints the slot name; `--code-file f.py --language python` for code, `--columns N` to override the columns; `folio block rm <deck>/s010 block:a` removes it)',
    '  A text block holds text with markup; a code block a string of code in its style\'s language, or {"code": "...", "language": "rust"}. A slide lays style fields over the style with overrides.slots.block:a.block, e.g. {"columns": 3}.',
    "  Styles:",
    ...styles,
    `  Languages: ${CODE_LANGUAGES.join(", ")}.`,
  ];
}

/** How agents are told to write a whole slide in one call, with an example from the pack's first layout that has text slots. */
function oneCallLines(pack: Pack): string[] {
  const found = Object.entries(pack.layouts).find(([, l]) => textSlots(pack, l).length);
  const name = found?.[0] ?? Object.keys(pack.layouts)[0] ?? "LAYOUT";
  const example = found ? Object.fromEntries(textSlots(pack, found[1]).slice(0, 2).map((t) => [t.name, "..."])) : {};
  return [
    `One call writes a whole slide, checked like a patch: \`folio new <deck> --template ${name} --props slide.json [--after s003]\` with slide.json ${JSON.stringify(example)} (\`--props -\` reads stdin).`,
    "`folio layouts <deck>` lists every layout's slot boxes in one table.",
  ];
}

/** How agents are told to make a figure no hook draws, so it stays traced and sized. */
const FIGURE_LINES = [
  "Figures: use a hook when one fits (`folio hook list`). Otherwise draw it with a Python script and keep it traced:",
  '  from folio_hook import slot_size, save_traced; size = slot_size("<deck>", "<slide>", "fig:a"); fig = plt.figure(figsize=size.figsize)',
  '  save_traced(fig, "<deck>/fig/name.png", script=__file__, inputs=["data.csv"]); then put "fig/name.png" in the slot.',
  "  Run it with `folio py script.py`: the workspace's Python with folio_hook importable (or `pip install -e <folio>/python` into your own).",
  "  `folio box <deck>/<slide> <slot>` prints the same size. When the box changes, `folio check` says so and names the command that draws it again.",
];

/**
 * Generate the agent instructions for a pack's catalog.
 *
 * @param context - json-render's prompt context, plus the folio extras bound in.
 * @returns the full prompt text. Called through `catalog.prompt()`.
 */
function slidePrompt(context: PromptContext, extras: PromptExtras): string {
  const { pack, hooks } = extras;
  const out = [
    context.options.system ?? `You write slides for the folio template pack "${pack.name}@${pack.version}".`,
    ...usageLines(pack.usage),
    "",
    "A slide is one JSON file: {\"root\": \"s\", \"elements\": {\"s\": {\"type\": LAYOUT, \"props\": {SLOT: CONTENT}, \"children\": []}}}.",
    "Text never shrinks to fit. A slot that holds more lines than its limit is reported as a warning; shorten the text.",
    "After writing or changing slides, look at them: `folio shot <deck> --sheet` writes one PNG per slide and sheet-1.png, sheet-2.png, ... (12 slides each, labelled with layout and findings) into <deck>/.shots/; `--changed` shoots only the slides changed since the last shot, `--slides s010-s020` or `--pages 1-10` a part, and `--marks` shows every slot's box and what overflows.",
    `Inline markup in text: **bold**, X_{sub}, X^{sup}; a styled range is [[size=24;color=${Object.keys(pack.colors)[0] ?? "#7a0019"};bold|important]]. Also use font=PACK_FAMILY, highlight=COLOUR, italic, underline, strike, sub or sup. Colour is a pack name, ink or #RRGGBB; font must be in the pack. Plain text stays plain.`,
    "Lists in multiline text slots: start a line with -  for a bullet or 1.  for a numbered item. Nest with exactly two leading spaces per level, up to three levels. Numbered runs restart at 1; written numbers are renumbered. Write \\-  for a literal leading hyphen and space. Lists are not allowed in titles or code blocks.",
    `Backgrounds: ${Object.keys(pack.backgrounds).join(", ")} (prop \`background\`; without it a slide takes its layout's background, named under each layout).`,
    "`folio new` only adds a slide; to remove, reorder or copy one, use `folio slide rm|move|dup <deck> <id>` and `folio slide list <deck>` to see the deck as it stands.",
    ...oneCallLines(pack),
    ...OVERRIDE_LINES,
    ...shapeLines(pack),
    ...blockLines(pack),
    ...FIGURE_LINES,
    "",
    "## Layouts",
  ];
  for (const [name, layout] of Object.entries(pack.layouts)) out.push(...describeLayout(pack, name, layout, hooks), "");
  const rules = [...pack.rules.guidance, ...(context.options.customRules ?? [])];
  if (rules.length) out.push("## Rules", ...rules.map((r) => `- ${r}`));
  out.push("", ...ASKING_THE_USER);
  return out.join("\n").trimEnd() + "\n";
}

/**
 * Build the json-render catalog of a pack.
 *
 * @param pack - a loaded pack.
 * @param hooks - the pack's hooks by name (may be empty).
 * @returns a json-render `Catalog`; `catalog.prompt()` gives the agent
 *   instructions and `catalog.validate(spec)` checks a slide.
 */
export function buildCatalog(pack: Pack, hooks: Record<string, HookDef> = {}) {
  const schema = defineSlideSchema((context) => slidePrompt(context, { pack, hooks }));
  const components: Record<string, { props: z.ZodType; description: string }> = {};
  for (const [name, layout] of Object.entries(pack.layouts)) {
    components[name] = { props: layoutPropsSchema(pack, layout), description: layout.description };
  }
  return defineCatalog(schema, { components });
}
export type FolioCatalog = ReturnType<typeof buildCatalog>;
