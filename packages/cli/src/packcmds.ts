/**
 * `folio pack ...` and `folio ack`. A pack is one portable folder; import
 * validates a folder (or a git URL) and installs it, moving a replaced pack
 * to `templates/.archive/`. Importing a pptx, merging, editing, exporting and
 * the guide live in `packtoolcmds.ts`.
 */
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { execa } from "execa";
import { packJsonSchema } from "@folio/core";
import { archive, findWorkspace, FolioApp, loadConfig, loadPackDir, toPosix } from "@folio/server";
import { editCommand, exportCommand, guideCommand, importPptxCommand, mergeCommand } from "./packtoolcmds.js";
import { attachServices } from "./services.js";

const SKIP = (src: string) => !/__pycache__|\/\.git(\/|$)/.test(toPosix(src));

/**
 * Validate a pack folder.
 *
 * @returns the pack's name and version; throws listing every problem.
 */
function validate(dir: string): { name: string; version: number; layouts: number; roles: number } {
  const result = loadPackDir(dir);
  if (!result.ok) throw new Error(`${dir} is not a valid pack:\n  ${result.problems.join("\n  ")}\nThe pack.json schema: folio pack schema`);
  const { pack } = result.loaded;
  return { name: pack.name, version: pack.version, layouts: Object.keys(pack.layouts).length, roles: Object.keys(pack.roles).length };
}

/**
 * Fetch a pack given as a git URL into a temporary folder.
 *
 * @returns the local folder.
 */
async function fetchPack(source: string): Promise<string> {
  if (!/^(https?|git|ssh):\/\/|^git@/.test(source)) return resolve(source);
  const dir = mkdtempSync(join(tmpdir(), "folio-pack-"));
  await execa("git", ["clone", "--depth", "1", source, dir]);
  return dir;
}

const PACK_USAGE = "usage: folio pack guide | schema | check <dir> | import <file.pptx> --name <pack> [--from-slides] | import <dir|git-url> | merge <src> <dst> [--layouts a,b] [--rename a=b] | edit <pack> layout add|rename|remove ... | edit <pack> set <path>=<json> | export <pack|deck> [--out DIR] [--zip F] [--pptx F]";

/** `folio pack guide | schema | check | import | merge | edit | export` */
export async function packCommand(args: string[]): Promise<number> {
  const [verb, target] = args;
  if (verb === "guide") return guideCommand();
  if (verb === "merge") return mergeCommand(args);
  if (verb === "edit") return editCommand(args);
  if (verb === "export") return exportCommand(args);
  if (verb === "import" && /\.pptx$/i.test(target ?? "")) return importPptxCommand(args);
  if (verb === "schema") return void process.stdout.write(`${JSON.stringify(packJsonSchema(), null, 2)}\n`), 0;
  if (verb === "check") {
    const p = validate(resolve(target ?? "."));
    process.stdout.write(`${p.name}@${p.version} is a valid pack: ${p.layouts} layout${p.layouts === 1 ? "" : "s"}, ${p.roles} role${p.roles === 1 ? "" : "s"}\n`);
    return 0;
  }
  if (verb === "import") {
    if (!target) throw new Error("usage: folio pack import <folder|git-url>, or folio pack import <file.pptx> --name <pack>");
    const source = await fetchPack(target);
    const p = validate(source);
    const config = loadConfig(findWorkspace("."));
    const dest = join(config.templatesDir, p.name);
    if (existsSync(dest)) process.stdout.write(`previous ${p.name} moved to ${archive(dest, join(config.templatesDir, ".archive"))}\n`);
    cpSync(source, dest, { recursive: true, filter: SKIP });
    process.stdout.write(`installed ${p.name}@${p.version} at ${dest}; decks use it as "template": "${p.name}@${p.version}"\n`);
    return 0;
  }
  throw new Error(PACK_USAGE);
}

/** `folio ack <warning-id> --reason "..." [--until YYYY-MM-DD] [--deck D]`: acknowledge a warning. */
export async function ackCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { reason: { type: "string" }, until: { type: "string" }, deck: { type: "string" }, worker: { type: "string" } } });
  const id = positionals[0];
  if (!id || !values.reason?.trim()) throw new Error('usage: folio ack <warning-id> --reason "why this is fine" [--until YYYY-MM-DD]');
  const app = new FolioApp(loadConfig(findWorkspace(values.deck ?? ".")));
  attachServices(app, false);
  const decks = values.deck ? [app.workspace.findDeck(values.deck)!] : [...app.workspace.decks.values()];
  for (const store of decks) {
    const warning = app.warnings.deckWarnings(store).find((w) => w.id === id && w.state !== "absent");
    if (!warning) continue;
    if (warning.source === "comment") throw new Error("a comment cannot be acknowledged; it closes when its thread is resolved");
    app.warnings.acknowledge(store, warning, { by: values.worker ?? "cli", reason: values.reason.trim(), at: new Date().toISOString(), status: "accepted", ...(values.until ? { until: values.until } : {}) });
    process.stdout.write(`acknowledged ${warning.code} on ${warning.location.slide}${warning.location.slot ? `/${warning.location.slot}` : ""}\n`);
    await app.close();
    return 0;
  }
  await app.close();
  throw new Error(`no active warning ${id}; ids are printed by folio check --json`);
}



/** `folio codes`: the warning code catalog as Markdown, the source of docs/warnings.md. */
export async function codesCommand(): Promise<number> {
  const { WARNING_CODES } = await import("@folio/core");
  const lines = ["# folio warning codes", "", "Every warning folio reports, from `packages/core/src/warnings.ts`. A warning never fails a build; `error` is a severity label only. Codes are never reused.", ""];
  for (const [code, e] of Object.entries(WARNING_CODES)) {
    lines.push(`## ${code}`, "", `- Severity: ${e.severity}; kind: ${e.kind}; source: ${e.source}`, `- Message: ${e.template.replace(/\{(\w+)\}/g, "<$1>")}`, "");
  }
  process.stdout.write(`${lines.join("\n")}`);
  return 0;
}
