/**
 * `--from-slides`: layouts measured from the deck's own slides. A slide that
 * moves its placeholders, deletes some, or adds pictures, text boxes or
 * tables proposes a layout; slides with the same slots at the same boxes are
 * one proposal, and a proposal inside a larger one is folded into it.
 */
import type { Box, Role } from "@folio/core";
import { registerBackground, type Draft } from "./draft.js";
import { resolveTextBox, type Slide } from "./model.js";
import { one, text } from "./ooxml.js";
import { unique } from "./report.js";
import type { Shape } from "./shapes.js";
import { flowUnderTables, growTables, sameSlot } from "./flow.js";
import { keepsName, nameSlots, roleFromName, type DraftSlot } from "./slots.js";
import { addLayout, innerBox, placeholderSlot } from "./placeholders.js";

interface Proposal {
  slide: Slide;
  slides: number[];
  slots: DraftSlot[];
  background: string;
  guesses: string[];
}

const near = (a: Box, b: Box) => a.every((v, i) => Math.abs(v - b[i]!) <= 1);
const slotOf = (p: Proposal, s: DraftSlot) => p.slots.find((x) => sameSlot(x, s));

/** Guess a text box's role from its size and place, saying why. */
function guessRole(box: Box, size: number, lineHeight: number, figures: Box[], canvasH: number): [Role, string] {
  const oneLine = box[3] < size * lineHeight * 1.8;
  const bottom = box[1] + box[3];
  const above = figures.some((f) => f[1] >= bottom - 2 && f[1] <= bottom + 8 && f[0] < box[0] + box[2] && box[0] < f[0] + f[2]);
  if (size >= 24 && box[1] < canvasH * 0.15) return ["title", "large text near the top"];
  if (oneLine && above) return ["label", "one line just above a picture or table"];
  if (oneLine && box[1] > canvasH * 0.85) return ["caption", "one line near the foot of the page"];
  if (oneLine) return ["label", "one line of small text"];
  return size <= 16 ? ["note", "several lines of small text"] : ["body", "several lines of body-size text"];
}

/** A slide shape that is not a placeholder, as a slot (text roles guessed later). */
function freeSlot(draft: Draft, shape: Shape, slide: Slide, tableStyles: Map<string, string>): DraftSlot | null {
  const where = `slide ${slide.number}`;
  if (!shape.box) return null;
  if (shape.kind === "picture") return { preferred: shape.name, role: "figure", box: shape.box };
  if (shape.kind === "table") {
    const id = text(one(one(shape.table, "a:tblPr"), "a:tableStyleId"));
    return { preferred: shape.name, role: "table", box: shape.box, tableStyle: tableStyles.get(id) ?? "default" };
  }
  if (shape.kind === "graphic" || shape.kind === "group") {
    draft.report.tally("roles", `charts, diagrams and groups on slides were taken as one figure slot each`, `${where} "${shape.name}"`);
    return { preferred: shape.name, role: "figure", box: shape.box };
  }
  if (shape.kind === "text" && !shape.text && !roleFromName(shape.name)) {
    draft.report.tally("unmapped", "empty text boxes on slides are left out (an empty box named like a slot, such as note, is kept)", `${where} "${shape.name}"`);
    return null;
  }
  if (shape.kind === "text") {
    const layer = resolveTextBox(shape, slide.layout.master);
    return { preferred: shape.name, role: roleFromName(shape.name) ?? "body", box: innerBox(shape.box, layer.insets), layer };
  }
  draft.report.tally("unmapped", "lines, arrows and drawn shapes on slides are not part of any proposed layout", `${where} "${shape.name}"`);
  return null;
}

/** Guess the role of every text slot whose name does not say it. */
function guessTextRoles(draft: Draft, slots: { slot: DraftSlot; shape: Shape }[], slide: Slide): string[] {
  const figures = slots.filter((s) => s.slot.role === "figure" || s.slot.role === "table").map((s) => s.slot.box);
  const guesses: string[] = [];
  for (const { slot, shape } of slots) {
    if (shape.kind !== "text" || roleFromName(shape.name)) continue;
    const [role, why] = guessRole(slot.box, slot.layer?.size ?? 18, slot.layer?.lineHeight ?? 1.2, figures, draft.model.canvas.h);
    slot.role = role;
    guesses.push(`text box "${shape.name}" ("${shape.text.slice(0, 40)}") is a guessed ${role}: ${why}`);
    if (!keepsName(shape.name, role)) slot.preferred = undefined;
  }
  return guesses;
}

/** The slots a slide proposes, or null when it only fills its layout's placeholders where they stand. */
function slideProposal(draft: Draft, slide: Slide, tableStyles: Map<string, string>): Proposal | null {
  const layoutPh = slide.layout.shapes.filter((s) => s.ph && !["dt", "ftr", "sldNum", "hdr"].includes(s.ph.type));
  const shapes = slide.shapes.filter((s) => !(s.ph && ["dt", "ftr", "sldNum", "hdr"].includes(s.ph.type)));
  const own = shapes.some((s) => !s.ph || (s.box && !layoutPh.some((l) => l.box && near(l.box, s.box!))));
  if (!own && shapes.length === layoutPh.length) return null;
  const pairs: { slot: DraftSlot; shape: Shape }[] = [];
  for (const shape of shapes) {
    const slot = shape.ph && shape.kind === "placeholder" ? placeholderSlot(draft, shape, slide.layout, slide.layout, `slide ${slide.number}`) : freeSlot(draft, shape, slide, tableStyles);
    if (slot && shape.ph && shape.kind !== "placeholder") slot.role = shape.kind === "table" ? "table" : "figure";
    if (slot) pairs.push({ slot, shape });
  }
  const guesses = guessTextRoles(draft, pairs, slide);
  const known = draft.layoutOf.get(slide.layout.part)!;
  const background = slide.background ? registerBackground(draft, slide.background, null, `slide ${slide.number}`) : known.background;
  const slots = nameSlots(pairs.map((p) => p.slot));
  flowUnderTables(slots);
  return { slide, slides: [slide.number], slots, background, guesses };
}

/** Whether every slot of `small` is in `big` with the same name, role and place. */
function inside(small: Proposal, big: Proposal): boolean {
  return small.background === big.background && small.slots.every((s) => slotOf(big, s));
}

/** Fold a proposal into its host: its slides, and the smallest gap under each table. */
function fold(host: Proposal, p: Proposal): void {
  host.slides.push(...p.slides);
  for (const s of p.slots) {
    const h = slotOf(host, s)!;
    if (h.below && s.below) h.below.gap = Math.min(h.below.gap, s.below.gap);
  }
}

/** Merge proposals with the same slots, then fold each into a larger one that holds it. */
function dedupe(proposals: Proposal[]): Proposal[] {
  const kept: Proposal[] = [];
  for (const p of [...proposals].sort((a, b) => b.slots.length - a.slots.length || a.slide.number - b.slide.number)) {
    const host = kept.find((k) => inside(p, k));
    if (host) fold(host, p);
    else kept.push(p);
  }
  for (const k of kept) k.slides.sort((a, b) => a - b);
  return kept.sort((a, b) => a.slides[0]! - b.slides[0]!);
}

/** Add one layout per distinct slide structure, and report each with the slides behind it. */
export function proposeFromSlides(draft: Draft, tableStyles: Map<string, string>): void {
  const proposals = dedupe(draft.model.slides.map((s) => slideProposal(draft, s, tableStyles)).filter((p): p is Proposal => Boolean(p)));
  for (const p of proposals) {
    growTables(p.slots, draft.model.canvas.h);
    const base = draft.layoutOf.get(p.slide.layout.part)!.layout;
    const name = unique(`${base}-s${p.slides[0]}`, draft.pack.layouts);
    const description = `Measured from slide ${p.slides.join(", ")} of ${draft.source} (layout "${p.slide.layout.name}").`;
    addLayout(draft, name, { description, background: p.background, slots: p.slots, decorations: draft.pack.layouts[base].decorations ?? [], master: p.slide.layout.master });
    reportProposal(draft, name, p);
  }
}

/** The report lines of one proposal: where it came from, its flows and its guesses. */
function reportProposal(draft: Draft, name: string, p: Proposal): void {
  const pack = draft.pack.name;
  const slots = p.slots.map((s) => `${s.name} (${s.role})`).join(", ");
  draft.report.add("proposals", `${name}: from slide${p.slides.length > 1 ? "s" : ""} ${p.slides.join(", ")}; slots ${slots}. Keep it under a house name (folio pack edit ${pack} layout rename ${name} <name>) or drop it (layout remove ${name})`);
  for (const s of p.slots.filter((x) => x.below)) {
    draft.report.add("roles", `${name}: ${s.name} flows below ${s.below!.slot} with the smallest gap its slides show (${s.below!.gap} pt), and ${s.below!.slot} may grow down to it; for another gap: folio pack edit ${pack} set layouts.${name}.slots.${s.name}.below.gap=12`);
  }
  for (const g of p.guesses) draft.report.add("roles", `${name} (slide ${p.slides[0]}): ${g}; if wrong: folio pack edit ${pack} set layouts.${name}.slots.<slot>.role='"<role>"'`);
}

