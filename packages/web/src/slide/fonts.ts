/**
 * Pack fonts as webfonts, so the browser on the PC and headless Chromium on the
 * server break lines with the same metrics.
 */
import type { Pack } from "@folio/core";
import { at } from "../boot";

const installed = new Set<string>();

/**
 * Add `@font-face` rules for a pack's fonts, once per pack.
 *
 * @param pack - the pack.
 * @returns a promise that settles when every face of the pack has loaded (or
 *   failed); measurement waits for it.
 */
export async function installPackFonts(pack: Pack): Promise<void> {
  const key = `${pack.name}@${pack.version}`;
  if (!installed.has(key)) {
    installed.add(key);
    const css = pack.fonts
      .map((f) => `@font-face{font-family:"${f.family}";src:url("${at(`packs/${pack.name}/${f.file}`)}");font-weight:${f.weight};font-style:${f.style};font-display:block}`)
      .join("\n");
    const style = document.createElement("style");
    style.dataset.pack = key;
    style.textContent = css;
    document.head.appendChild(style);
  }
  await Promise.all(pack.fonts.map((f) => document.fonts.load(`${f.style === "italic" ? "italic " : ""}${f.weight} 16px "${f.family}"`).catch(() => [])));
}
