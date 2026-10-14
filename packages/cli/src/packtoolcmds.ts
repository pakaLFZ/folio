/**
 * The pack tools of `folio pack`: import a pptx, merge, edit, export (a
 * folder, a zip, a pptx) and the conversion guide. Every write goes through
 * `applyPackChange`, which validates, protects the workspace's decks and
 * keeps the version rule.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { relative } from "@folio/server";
import { parseArgs } from "node:util";
import { zipSync } from "fflate";
import {
  findWorkspace, layoutAdd, layoutRemove, layoutRename, loadConfig, loadPackDir, openPack, packDirOf, planMerge, setValue, Workspace, writePack, type PackChange,
} from "@folio/server";
import { openDeck } from "./deckcmds.js";
import { importPptx } from "./pptx/importpptx.js";
import { writePptx } from "@folio/server";

const EXPORT_SKIP = /__pycache__|\/\.git(\/|$)|\/\.archive(\/|$)/;
const say = (lines: string[]) => process.stdout.write(`${lines.join("\n")}\n`);

/** The workspace around the current folder. */
function workspace(): Workspace {
  return new Workspace(loadConfig(findWorkspace(".")));
}

/** `folio pack guide`: print the conversion guide. */
export function guideCommand(): number {
  process.stdout.write(readFileSync(new URL("../../../docs/pack-guide.md", import.meta.url), "utf8"));
  return 0;
}

/** `folio pack import <file.pptx> --name <pack> [--from-slides]` */
export function importPptxCommand(args: string[]): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { name: { type: "string" }, "from-slides": { type: "boolean" } } });
  const file = resolve(positionals[1] ?? "");
  const result = importPptx(file, values.name, workspace().config.templatesDir, Boolean(values["from-slides"]));
  say(result.lines);
  return result.ok ? 0 : 2;
}

/** Parse `--rename a=b` flags into a map. */
function renames(list: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list ?? []) {
    const [from, to] = item.split("=");
    if (!from || !to) throw new Error(`--rename ${item}: write --rename <name>=<new> or --rename <kind>.<name>=<new>`);
    out[from] = to;
  }
  return out;
}

/** `folio pack merge <src> <dst> [--layouts a,b] [--rename a=b]...` */
export async function mergeCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { layouts: { type: "string" }, rename: { type: "string", multiple: true } } });
  const [, src, dst] = positionals;
  if (!src || !dst) throw new Error("usage: folio pack merge <src> <dst> [--layouts a,b] [--rename a=b] [--rename <kind>.<name>=<new>]");
  const ws = workspace();
  const source = openPack(packDirOf(ws.config.templatesDir, src));
  const options = { layouts: values.layouts?.split(",").map((s) => s.trim()).filter(Boolean), rename: renames(values.rename) };
  say(await writePack(packDirOf(ws.config.templatesDir, dst), [...ws.decks.values()], (target) => planMerge(source, target, options)));
  return 0;
}

const EDIT_USAGE = "usage: folio pack edit <pack> layout add <name> (--from <layout> | --json <file|->) | layout rename <old> <new> | layout remove <name> | set <path>=<json>";

/** The change one `folio pack edit` asks for. */
function editChange(handle: ReturnType<typeof openPack>, words: string[], values: { from?: string; json?: string }): PackChange {
  const [what, verb, a, b] = words;
  if (what === "set" && verb) return setValue(handle, verb);
  if (what !== "layout" || !a) throw new Error(EDIT_USAGE);
  if (verb === "rename" && b) return layoutRename(handle, a, b);
  if (verb === "remove") return layoutRemove(handle, a);
  if (verb !== "add") throw new Error(EDIT_USAGE);
  if (values.from) return layoutAdd(handle, a, { layout: values.from });
  if (!values.json) throw new Error(`layout add ${a} needs --from <layout> or --json <file|->`);
  const text = values.json === "-" ? readFileSync(0, "utf8") : readFileSync(values.json, "utf8");
  return layoutAdd(handle, a, { json: JSON.parse(text) });
}

/** `folio pack edit <pack> ...` */
export async function editCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { from: { type: "string" }, json: { type: "string" } } });
  const [, pack, ...words] = positionals;
  if (!pack || !words.length) throw new Error(EDIT_USAGE);
  const ws = workspace();
  say(await writePack(packDirOf(ws.config.templatesDir, pack), [...ws.decks.values()], (handle) => editChange(handle, words, values)));
  return 0;
}

/** The pack folder a target names: a pack name or folder, else the pack of a deck. */
function exportSource(target: string): string {
  const ws = workspace();
  try {
    return packDirOf(ws.config.templatesDir, target);
  } catch (error) {
    if (!existsSync(join(resolve(target), "deck.json"))) throw error;
    const { workspace: deckWs, store } = openDeck(target);
    const loaded = deckWs.packOf(store);
    if (!loaded) throw new Error(`pack ${store.deck.template} is not installed in ${deckWs.config.templatesDir}`);
    return loaded.dir;
  }
}

/** Every file of a pack folder that an export carries, relative to it. */
function exportFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (EXPORT_SKIP.test(`/${relative(dir, path)}`) || name.startsWith(".")) continue;
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out.sort();
}

const refuseExisting = (path: string, flag: string) => {
  if (existsSync(path)) throw new Error(`${path} already exists; choose another ${flag}`);
};

/** `folio pack export <pack|deck> [--out DIR] [--zip out.zip] [--pptx out.pptx]` */
export function exportCommand(args: string[]): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: "string" }, zip: { type: "string" }, pptx: { type: "string" } } });
  const dir = exportSource(positionals[1] ?? ".");
  const result = loadPackDir(dir);
  if (!result.ok) throw new Error(`${dir} is not a valid pack:\n  ${result.problems.join("\n  ")}\nfolio pack check ${dir} names them`);
  const { name, version } = result.loaded.pack;
  const files = exportFiles(dir);
  const lines: string[] = [];
  if (values.out || (!values.zip && !values.pptx)) {
    const out = resolve(values.out ?? `${name}-v${version}`);
    refuseExisting(out, "--out");
    for (const file of files) {
      mkdirSync(dirname(join(out, file)), { recursive: true });
      cpSync(join(dir, file), join(out, file));
    }
    lines.push(`exported ${name}@${version} to ${out} (${files.length} files)`);
  }
  if (values.zip) {
    refuseExisting(resolve(values.zip), "--zip");
    writeFileSync(resolve(values.zip), zipSync(Object.fromEntries(files.map((f) => [`${name}/${f}`, readFileSync(join(dir, f))]))));
    lines.push(`wrote ${resolve(values.zip)}: ${files.length} files under ${name}/; unzip it and folio pack import ${name} installs it`);
  }
  if (values.pptx) {
    refuseExisting(resolve(values.pptx), "--pptx");
    writeFileSync(resolve(values.pptx), writePptx(result.loaded.pack, dir));
    lines.push(`wrote ${resolve(values.pptx)}: a slide master with ${Object.keys(result.loaded.pack.layouts).length} layouts and their background variants, no slides`);
  }
  say(lines);
  return 0;
}
