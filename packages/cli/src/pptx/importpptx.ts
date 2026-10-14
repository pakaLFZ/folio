/**
 * `folio pack import <file.pptx> --name <pack> [--from-slides]`: read the
 * pptx, build the draft, and write it as a new pack folder with its report.
 * An existing pack is never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadPackDir, newJsonText } from "@folio/server";
import { readModel } from "./model.js";
import { Pptx } from "./ooxml.js";
import { buildDraft } from "./topack.js";

export interface ImportResult {
  dir: string;
  lines: string[];
  ok: boolean;
}

/** Refuse a bad name, a missing file, or a pack that already exists. */
function refuse(file: string, name: string | undefined, dest: string): void {
  if (!name) throw new Error("usage: folio pack import <file.pptx> --name <pack> [--from-slides]; --name is the new pack's folder under templates/");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`"${name}" is not a pack name: use lower-case letters, digits and hyphens, e.g. --name ${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-pack"}`);
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  if (existsSync(dest)) throw new Error(`${dest} already exists; import under another name with --name <new>, then copy layouts in with folio pack merge <new> ${name}`);
}

/**
 * Import a pptx as a new draft pack.
 *
 * @param templatesDir - the workspace's `templates/`.
 * @returns the folder, the lines to print, and whether the draft loads.
 */
export function importPptx(file: string, name: string | undefined, templatesDir: string, fromSlides: boolean): ImportResult {
  const dest = join(templatesDir, name ?? "");
  refuse(file, name, dest);
  const pptx = new Pptx(readFileSync(file));
  const draft = buildDraft(pptx, readModel(pptx), name!, basename(file), fromSlides);
  const staging = join(templatesDir, `.${name}.importing-${process.pid}`);
  for (const [path, bytes] of draft.files) {
    mkdirSync(dirname(join(staging, path)), { recursive: true });
    writeFileSync(join(staging, path), bytes);
  }
  mkdirSync(staging, { recursive: true });
  writeFileSync(join(staging, "pack.json"), newJsonText(draft.pack));
  const layouts = Object.keys(draft.pack.layouts);
  const master = new Set([...draft.layoutOf.values()].map((v) => v.layout)).size;
  const head = [`Source: ${basename(file)}, ${draft.model.canvas.w} x ${draft.model.canvas.h} pt, ${draft.model.layouts.length} PowerPoint layouts and ${draft.model.slides.length} slides.`, `Result: ${layouts.length} layouts (${master} from the master${fromSlides ? `, ${layouts.length - master} proposed from the slides` : ""}), backgrounds ${Object.keys(draft.pack.backgrounds).join(", ")}, table styles ${Object.keys(draft.pack.tables).join(", ") || "none"}.`];
  writeFileSync(join(staging, "import-report.md"), draft.report.markdown(name!, head));
  renameSync(staging, dest);
  const loaded = loadPackDir(dest);
  const check = loaded.ok ? `folio pack check: ${name}@1 is a valid pack` : `folio pack check: not valid yet:\n  ${loaded.problems.join("\n  ")}`;
  return { dir: dest, ok: loaded.ok, lines: [`imported ${basename(file)} as ${dest}`, ...head, check, `${draft.report.count} items to resolve in ${join(dest, "import-report.md")}; read folio pack guide first`] };
}
