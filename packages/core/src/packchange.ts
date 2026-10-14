/**
 * What a change to a pack does to the slides written for it: which names a
 * slide can hold (layouts, slots and their kinds, backgrounds, table styles,
 * hooks), whether a change removes one of them (and so bumps the version),
 * and which slides of a deck would stop rendering.
 */
import { contentKind } from "./hookdef.js";
import type { Pack } from "./pack.js";
import { resolveAliases, slideRoot, type SlideSpec } from "./schema.js";
import { slideContentWarnings } from "./slidecheck.js";

/** The names a slide can hold, as `kind:name` strings with the slot's role (`slot:title/fig:a=figure`). */
export function slideFacingNames(pack: Pack, hooks: string[]): Set<string> {
  const names = new Set<string>();
  for (const [layoutName, layout] of Object.entries(pack.layouts)) {
    names.add(`layout:${layoutName}`);
    for (const [slotName, slot] of Object.entries(layout.slots)) names.add(`slot:${layoutName}/${slotName}=${slot.role}`);
  }
  for (const name of Object.keys(pack.backgrounds)) names.add(`background:${name}`);
  for (const name of Object.keys(pack.tables)) names.add(`table style:${name}`);
  for (const name of hooks) names.add(`hook:${name}`);
  return names;
}

/**
 * The version rule: removing or renaming anything a slide can name, or
 * changing a slot's role, bumps the version; adding and changing values keep it.
 *
 * @returns the names `before` had and `after` lacks; empty keeps the version.
 */
export function namesRemoved(before: Pack, after: Pack, hooksBefore: string[], hooksAfter: string[]): string[] {
  const kept = slideFacingNames(after, hooksAfter);
  return [...slideFacingNames(before, hooksBefore)].filter((name) => !kept.has(name));
}

/**
 * The version a change leaves.
 *
 * @returns `before.version` when nothing a slide names was removed, else one more.
 */
export function nextVersion(before: Pack, after: Pack, hooksBefore: string[], hooksAfter: string[]): number {
  return namesRemoved(before, after, hooksBefore, hooksAfter).length ? before.version + 1 : before.version;
}

export interface SlideRef {
  deck: string;
  slide: string;
  spec: SlideSpec;
}

export interface SlideBreak {
  deck: string;
  slide: string;
  reason: string;
}

/** The figure hooks a slide calls by name. */
function hooksCalled(spec: SlideSpec): string[] {
  const props = slideRoot(spec)?.props ?? {};
  return Object.values(props).flatMap((v) => (v && typeof v === "object" && typeof (v as { hook?: unknown }).hook === "string" ? [(v as { hook: string }).hook] : []));
}

/** Problems of a slide against a pack, keyed so the same problem compares equal across packs. */
function slideProblems(ref: SlideRef, pack: Pack, hooks: string[]): Map<string, string> {
  const where = { deck: ref.deck, slide: ref.slide };
  const out = new Map<string, string>();
  for (const w of slideContentWarnings(where, ref.spec, pack, "")) {
    if (!w.code.startsWith("FOLIO-SPEC-")) continue;
    out.set(`${w.code} ${w.args.jsonPath ?? w.args.layout ?? ""}`, w.message);
  }
  for (const hook of hooksCalled(ref.spec)) if (!hooks.includes(hook)) out.set(`hook ${hook}`, `hook "${hook}" is not in pack ${pack.name}`);
  return out;
}

/** Filled slots whose kind (text, figure, table, shape) differs between the two packs. */
function kindChanges(ref: SlideRef, before: Pack, after: Pack): string[] {
  const root = slideRoot(ref.spec);
  const [was, is] = [before.layouts[root?.layout ?? ""], after.layouts[root?.layout ?? ""]];
  if (!root || !was || !is) return [];
  const props = resolveAliases(root.props, was.aliases);
  return Object.entries(props).flatMap(([name, value]) => {
    const [a, b] = [was.slots[name], is.slots[name]];
    if (value == null || !a || !b || contentKind(a.role) === contentKind(b.role)) return [];
    return [`slot ${name} of layout ${root.layout} holds content and would change from a ${contentKind(a.role)} slot to a ${contentKind(b.role)} slot`];
  });
}

/**
 * Slides that render on `before` and would not on `after`.
 *
 * @param slides - every slide of the decks that use the pack.
 * @returns one entry per new problem, naming deck, slide and what breaks;
 *   problems a slide already had are not counted.
 */
export function slideBreaks(before: Pack, after: Pack, slides: SlideRef[], hooksBefore: string[], hooksAfter: string[]): SlideBreak[] {
  const out: SlideBreak[] = [];
  for (const ref of slides) {
    const had = slideProblems(ref, before, hooksBefore);
    for (const [key, message] of slideProblems(ref, after, hooksAfter)) {
      if (!had.has(key)) out.push({ deck: ref.deck, slide: ref.slide, reason: message });
    }
    for (const reason of kindChanges(ref, before, after)) out.push({ deck: ref.deck, slide: ref.slide, reason });
  }
  return out;
}
