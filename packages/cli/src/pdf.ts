/**
 * `folio pdf <deck>`: wait for the deck's hook figures (up to a timeout), then
 * print the print page, the same renderer and fonts as the live view, at the
 * pack's canvas size. Warnings and open comments are printed as in `check`;
 * figures still being drawn are listed as stale. Without `--out` the file is
 * the deck folder's name beside it, numbered rather than overwritten.
 * Exits 0 unless asked otherwise.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pdfTarget, printDeck, reprintIfRedrawn, writeFreshPdf } from "@folio/server";
import { withFigures } from "./figures.js";
import { printReport, reportOptions, REPORT_OPTIONS } from "./report.js";
import { commentPreamble } from "./services.js";

/**
 * Make the PDF.
 *
 * @param args - `<deck> [--out FILE] [--wait SECONDS] [--slides s001,s002]` and the report flags.
 * @returns the report's exit code.
 */
export async function pdfCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { ...REPORT_OPTIONS, out: { type: "string" }, wait: { type: "string" }, slides: { type: "string" } } });
  const waitMs = Number(values.wait ?? 120) * 1000;
  return withFigures(positionals[0] ?? ".", waitMs, async ({ headless, store, pending, remeasure }) => {
    const pack = headless.app.workspace.packOf(store);
    const print = () => printDeck(headless.app, store, headless.browser, headless.base, values.slides?.split(","), waitMs);
    const { pdf, measured, warnings } = await reprintIfRedrawn(store, await print(), remeasure, print);
    const beside = pdfTarget(store.dir);
    const out = values.out ? writeOut(resolve(values.out), pdf) : writeFreshPdf(beside.dir, beside.stem, pdf);
    const stale = pending.length ? `figures still drawing when the PDF was made (last good figures used): ${pending.join(", ")}\n` : "";
    const options = reportOptions(values);
    const code = printReport(warnings, new Map([[store.token, store]]), headless.app.config.root, options, `${commentPreamble(headless.app, store)}${stale}`);
    if (options.format === "human") process.stdout.write(`wrote ${out} (${Object.keys(measured).length} slides, ${pack!.pack.canvas.w} x ${pack!.pack.canvas.h} pt)\n`);
    return code;
  });
}

/**
 * Write the file `--out` named, replacing it if it exists: the user asked for that path.
 *
 * @returns the path.
 */
function writeOut(out: string, pdf: Buffer): string {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf);
  return out;
}
