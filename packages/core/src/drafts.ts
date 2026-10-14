/**
 * Drafts: added slots the user drew in the editor, marked `draft: true` in the
 * slide's overrides. A draft is the user's sketch of intent for an agent, not
 * slide content: it shows in Edit only, is left out of View, the PDF and
 * shots, and `folio check` lists each one as FOLIO-DRF-001 with the command
 * that draws the real element and the one that removes the draft
 * (spec/slides/drafts.md).
 */
import { slideLayout, type RefinedSlot } from "./overrides.js";
import type { Pack } from "./pack.js";
import { slideRoot, type SlideSpec } from "./schema.js";

/** One draft on a slide, described for an agent. */
export interface Draft {
  slot: string;
  what: string;
  add: string;
  rm: string;
}

const KIND_NAMES: Record<string, string> = { rect: "rectangle", ellipse: "ellipse", arrow: "arrow", line: "line" };
const r = (n: number) => Math.round(n * 10) / 10;
const pt = (p: number[]) => `(${r(p[0]!)}, ${r(p[1]!)})`;

/** A shape draft: what it is, and how to draw it for real. */
function shapeDraft(ref: string, name: string, box: number[], value: Record<string, unknown>): Omit<Draft, "slot"> {
  const kind = String(value.kind ?? "rect");
  const rm = `folio shape rm ${ref} ${name}`;
  if (kind === "arrow" || kind === "line") {
    const [x, y, w, h] = box as [number, number, number, number];
    const [from, to] = [(value.from as number[]) ?? [0, h / 2], (value.to as number[]) ?? [w, h / 2]];
    const [a, b] = [[x + from[0]!, y + from[1]!], [x + to[0]!, y + to[1]!]];
    return { what: `a draft ${kind} from ${pt(a)} to ${pt(b)}`, add: `folio shape add ${ref} ${kind} --from ${r(a[0]!)},${r(a[1]!)} --to ${r(b[0]!)},${r(b[1]!)}`, rm };
  }
  const words = typeof value.text === "string" && value.text ? ` reading "${value.text}"` : "";
  return { what: `a draft ${KIND_NAMES[kind] ?? kind} at [${box.map(r).join(", ")}]${words}`, add: `folio shape add ${ref} ${kind} --box ${box.map(r).join(",")}`, rm };
}

/** Any other draft: a text box, or a slot of another role. */
function slotDraft(ref: string, name: string, slot: RefinedSlot, value: unknown): Omit<Draft, "slot"> {
  const box = slot.box.map(r).join(",");
  const words = typeof value === "string" && value ? ` reading "${value}"` : "";
  if (slot.role === "block") return { what: `a draft ${slot.style ?? "block"} block at [${box.replace(/,/g, ", ")}]${words}`, add: `folio block add ${ref} --style ${slot.style ?? "card"} --box ${box}${words ? ` --text ${JSON.stringify(value)}` : ""}`, rm: `folio block rm ${ref} ${name}` };
  if (/^text:/.test(name)) return { what: `a draft text box at [${box.replace(/,/g, ", ")}]${words}`, add: `folio text add ${ref} --box ${box}${words ? ` --text ${JSON.stringify(value)}` : ""}`, rm: `folio text rm ${ref} ${name}` };
  return { what: `a draft ${slot.role} slot ${name} at [${box.replace(/,/g, ", ")}]`, add: `folio override ${ref} 'slots.<name>=...' without "draft"`, rm: `folio override ${ref} --clear slots.${name}` };
}

/**
 * The drafts on a slide, each with what it shows and the commands an agent uses.
 *
 * @param ref - the slide as the CLI names it, `<deck>/<id>`.
 * @returns one entry per slot marked `draft`, in slot order; none when the slide has no valid layout.
 */
export function draftsOf(pack: Pack, spec: SlideSpec, ref: string): Draft[] {
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!root || !layout) return [];
  return Object.entries(layout.slots)
    .filter(([, slot]) => slot.draft)
    .map(([name, slot]) => {
      const value = root.props[name];
      const described = slot.role === "shape" && value && typeof value === "object" ? shapeDraft(ref, name, slot.box, value as Record<string, unknown>) : slotDraft(ref, name, slot, value);
      return { slot: name, ...described };
    });
}
