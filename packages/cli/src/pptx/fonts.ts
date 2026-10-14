/**
 * Fonts of an import: embedded TrueType or OpenType files are copied into
 * `fonts/`; every other typeface is listed in the report with an open
 * stand-in to consider, since folio only draws the font files a pack carries.
 */
import type { Draft } from "./draft.js";
import { slug } from "./report.js";

const STAND_INS: Record<string, string> = {
  arial: "Liberation Sans (SIL OFL 1.1, metric-compatible with Arial)",
  helvetica: "Liberation Sans (SIL OFL 1.1)",
  "times new roman": "Liberation Serif (SIL OFL 1.1, metric-compatible)",
  "courier new": "Liberation Mono (SIL OFL 1.1, metric-compatible)",
  calibri: "Carlito (SIL OFL 1.1, metric-compatible with Calibri)",
  cambria: "Caladea (SIL OFL 1.1, metric-compatible with Cambria)",
  roboto: "Roboto itself (Apache-2.0)",
  inter: "Inter itself (SIL OFL 1.1)",
  "open sans": "Open Sans itself (SIL OFL 1.1)",
};

const WEIGHT: Record<string, [number, string]> = { regular: [400, "normal"], bold: [700, "normal"], italic: [400, "italic"], boldItalic: [700, "italic"] };

/** Whether bytes are a plain TrueType or OpenType font (not PowerPoint's obfuscated or EOT form). */
function isPlainFont(bytes: Uint8Array): boolean {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  return tag === "\0\u0001\0\0" || tag === "OTTO" || tag === "true";
}

/** Copy the embedded fonts folio can use, and report every typeface the pack does not carry. */
export function importFonts(draft: Draft): void {
  const carried = new Set<string>();
  for (const font of draft.model.embeddedFonts) {
    const bytes = draft.pptx.bytes(font.part);
    if (!isPlainFont(bytes)) {
      draft.report.add("fonts", `"${font.typeface}" (${font.variant}) is embedded in PowerPoint's own font form, which folio cannot read; add the font's own file (see below)`);
      continue;
    }
    const file = `fonts/${slug(font.typeface)}-${slug(font.variant)}.ttf`;
    const [weight, style] = WEIGHT[font.variant] ?? [400, "normal"];
    draft.files.set(file, bytes);
    draft.pack.fonts.push({ family: font.typeface, file, weight, style });
    carried.add(font.typeface);
  }
  const ctx = draft.model.masters[0]!.ctx;
  const used = new Set([ctx.minor, ctx.major, ...Object.values(draft.pack.roles).map((r) => (r as { font?: string }).font).filter((f): f is string => Boolean(f))]);
  for (const family of [...used].filter((f) => !carried.has(f))) {
    const standIn = STAND_INS[family.toLowerCase()];
    draft.report.add("fonts", `"${family}" is not embedded, so the pack draws it with the reader's own fonts (${draft.pack.fontFallback}). Choose a file you may ship${standIn ? `, e.g. ${standIn}` : " (check its licence)"}, copy it with its licence into templates/${draft.pack.name}/fonts/, then: folio pack edit ${draft.pack.name} set fonts='[{"family": "<family>", "file": "fonts/<file>.ttf", "weight": 400}]'${family === ctx.minor ? "" : ` and point the styles that use "${family}" at it (set roles.<style>.font='"<family>"')`}`);
  }
}
