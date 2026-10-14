/**
 * The import itself: a read pptx becomes a draft pack. Each base layout of
 * the master (its variants folded into backgrounds) becomes a folio layout;
 * `--from-slides` adds layouts measured from the slides; text styles are
 * settled last, once every slot has been seen.
 */
import { newDraft, type Draft, type DraftPack } from "./draft.js";
import { proposeFromSlides } from "./fromslides.js";
import type { Model } from "./model.js";
import type { Pptx } from "./ooxml.js";
import { addLayout, placeholderSlot } from "./placeholders.js";
import { slug, unique } from "./report.js";
import { nameSlots, type DraftSlot } from "./slots.js";
import { importTableStyles } from "./tablestyle.js";
import { groupDecorations, groupLayouts, registerGroup } from "./variants.js";
import { importFonts } from "./fonts.js";

/** Every base layout of the master, its variants folded into backgrounds. */
function importLayouts(draft: Draft): void {
  const { groups, nearMisses } = groupLayouts(draft.model.layouts);
  for (const [variant, base] of nearMisses) {
    draft.report.add("notes", `"${variant.name}" reads like a variant of "${base.name}" but its placeholders sit elsewhere, so it is its own layout (${slug(variant.name)}); if the boxes should match, keep one and remove the other: folio pack edit ${draft.pack.name} layout remove ${slug(variant.name)}`);
  }
  for (const raw of groups) {
    const group = registerGroup(draft, raw);
    const name = unique(slug(group.name), draft.pack.layouts);
    const where = `layout "${group.name}"`;
    const slots = group.base.shapes.filter((s) => s.ph).map((s) => placeholderSlot(draft, s, group.base, null, where)).filter((s): s is DraftSlot => Boolean(s));
    const variants = group.members.filter((m) => m.word).map((m) => `${m.word} (${m.background})`);
    const description = `"${group.name}" layout of ${draft.source}${variants.length ? `; its variants ${variants.join(", ")} are backgrounds` : ""}.`;
    addLayout(draft, name, { description, background: group.members[0]!.background, slots: nameSlots(slots), decorations: groupDecorations(draft, group, name), master: group.base.master });
    for (const m of group.members) draft.layoutOf.set(m.layout.part, { layout: name, background: m.background });
  }
}

/** The report's closing notes: usage notes to write, layouts to keep or drop. */
function closingNotes(draft: Draft): void {
  const pack = draft.pack.name;
  draft.report.add("notes", `no layout carries a usage note; write one for each layout you keep, saying when to choose it: folio pack edit ${pack} set layouts.<layout>.usage='{"when": "...", "how": "..."}'`);
  draft.report.add("notes", `layout descriptions name the PowerPoint layout they came from; rewrite them as what the page is for: folio pack edit ${pack} set layouts.<layout>.description='"..."'`);
  draft.report.add("notes", `drop the layouts the house never uses (folio pack edit ${pack} layout remove <layout>, archived, not deleted), and give the rest the house's names (layout rename <old> <new>)`);
  draft.report.add("notes", `the pack has no house rules; add character limits and guidance if the house has them: folio pack edit ${pack} set rules='{"maxChars": {"title": 90}, "guidance": ["..."]}'`);
}

/**
 * Turn a read pptx into a draft pack.
 *
 * @param fromSlides - also propose layouts measured from the slides.
 * @returns the draft: pack JSON, files to write and the report.
 */
export function buildDraft(pptx: Pptx, model: Model, name: string, source: string, fromSlides: boolean): Draft {
  const draft = newDraft(pptx, model, name, source);
  if (model.masters.length > 1) draft.report.add("notes", `the pptx has ${model.masters.length} slide masters; every master's layouts were imported into one pack, and the first master's theme sets the colours`);
  const tableStyles = importTableStyles(draft);
  importLayouts(draft);
  if (fromSlides) proposeFromSlides(draft, tableStyles);
  draft.styles.finish(draft.pack.roles, draft.pack.layouts);
  importFonts(draft);
  const proposed = Object.keys(draft.pack.layouts).length - new Set([...draft.layoutOf.values()].map((v) => v.layout)).size;
  draft.pack.description = `Draft imported from ${source}: ${Object.keys(draft.pack.layouts).length - proposed} layouts from the slide master${fromSlides ? `, ${proposed} proposed from its slides` : ""}. Resolve import-report.md before using it.`;
  closingNotes(draft);
  return draft;
}

export type { DraftPack };
