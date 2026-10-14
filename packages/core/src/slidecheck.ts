/**
 * Checks of a slide's content that need no rendering: does the spec match its
 * layout, and do text slots respect the pack's character rules.
 */
import { hookedTextOf } from "./hooks.js";
import { plainText } from "./markup.js";
import { draftsOf } from "./drafts.js";
import { slideLayout } from "./overrides.js";
import type { Pack } from "./pack.js";
import { resolveAliases, slideRoot, type SlideSpec } from "./schema.js";
import { makeWarning, type FolioWarning } from "./warnings.js";
import { slidePropProblems } from "./writecheck.js";

/**
 * Validate a slide against its pack.
 *
 * @param where - deck and slide id.
 * @param spec - the parsed slide spec.
 * @param pack - the deck's pack.
 * @param at - the time of the check (ISO).
 * @param hooked - the last good output of each text slot's hook, with the
 *   input it was made from; the character rule measures what is shown.
 * @returns FOLIO-SPEC-002 when the layout is unknown, else one FOLIO-SPEC-001 per
 *   schema problem (`slidePropProblems`: an unknown slot, a wrong type, an
 *   override problem, each saying what is allowed), and
 *   FOLIO-TXT-001 per slot over its role's `maxChars`, and FOLIO-DRF-001 per
 *   draft the user drew.
 */
export function slideContentWarnings(where: { deck: string; slide: string }, spec: SlideSpec, pack: Pack, at: string, hooked: Record<string, { input: unknown; output: unknown } | null> = {}): FolioWarning[] {
  const root = slideRoot(spec);
  if (!root) return [makeWarning("FOLIO-SPEC-003", where, { reason: `root "${spec.root}" names no element` }, { at })];
  const layout = pack.layouts[root.layout];
  if (!layout) return [makeWarning("FOLIO-SPEC-002", where, { layout: root.layout, pack: pack.name }, { at })];
  const out: FolioWarning[] = slidePropProblems(spec, pack).map(({ jsonPath, reason }) => makeWarning("FOLIO-SPEC-001", where, { layout: root.layout, jsonPath, reason }, { at, subject: jsonPath }));
  const props = resolveAliases(root.props, layout.aliases);
  for (const [slotName, slot] of Object.entries(slideLayout(pack, root.layout, props)!.slots)) {
    const limit = pack.rules.maxChars[slot.role];
    const raw = props[slotName];
    if (!limit || typeof raw !== "string") continue;
    const value = hookedTextOf(raw, hooked[slotName]);
    const chars = [...plainText(value)].length;
    if (chars > limit) out.push(makeWarning("FOLIO-TXT-001", { ...where, slot: slotName }, { slot: slotName, chars, limit }, { at }));
  }
  for (const d of draftsOf(pack, spec, `<deck>/${where.slide}`)) out.push(makeWarning("FOLIO-DRF-001", { ...where, slot: d.slot }, { slot: d.slot, what: d.what, add: d.add, rm: d.rm }, { at }));
  return out;
}
