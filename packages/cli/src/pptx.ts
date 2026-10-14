/** `folio pptx`: render hook outputs, then write a deck PowerPoint file. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportDeckPptx } from "@folio/server";
import { withFigures } from "./figures.js";

/** Export one deck as editable slides and print every picture approximation. */
export async function pptxCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: "string" }, slides: { type: "string" }, wait: { type: "string" } } });
  return withFigures(positionals[0] ?? ".", Number(values.wait ?? 120) * 1000, async ({ headless, store, pending }) => {
    const ids = values.slides?.split(",").map((s) => s.trim()).filter(Boolean);
    const output = await exportDeckPptx(headless.app, store, { get: async () => headless.browser }, headless.base, ids);
    const path = resolve(values.out ?? output.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, output.bytes);
    process.stdout.write(`wrote ${path} (${output.slides} slides)\n`);
    for (const line of output.approximations) process.stdout.write(`picture: ${line}\n`);
    for (const line of output.drafts) process.stdout.write(`left out: ${line} (draft)\n`);
    if (pending.length) process.stdout.write(`figures still drawing: ${pending.join(", ")}\n`);
    return 0;
  });
}
