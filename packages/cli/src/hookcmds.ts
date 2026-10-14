/**
 * `folio hook list|show|run` and `folio trace`: a pack's hooks called without
 * a deck, through the deck's own key, cache and runner, and the record of what
 * made the figure a slot shows.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { exampleOf, isTrace, parseSize, pngSize, traceExt, type TraceRecord } from "@folio/core";
import {
  callOfTrace, dropFresh, findHook, findWorkspace, loadConfig, matchesTrace, runDirect, sha256File, slotTrace, tracePath, workspaceCache, Workspace, writeOutput,
  type DirectCall, type DirectResult, type HookCache, type LoadedHook, type TableFileTrace,
} from "@folio/server";
import { boxOf, figureLines } from "./boxcmd.js";
import { openDeck, splitSlideRef } from "./deckcmds.js";

const here = () => new Workspace(loadConfig(findWorkspace(".")));

/** `folio hook list | show <pack>/<hook> | run <pack>/<hook> ...` */
export async function hookCommand(args: string[]): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === "list") return hookList();
  if (verb === "show") return hookShow(rest);
  if (verb === "run") return hookRun(rest);
  throw new Error("usage: folio hook list | show <pack>/<hook> [--json] | run <pack>/<hook> --inputs F|- --size W,H [--unit pt|mm|in] [--dpi N] [--format png|svg|pdf] --out FILE");
}

function hookList(): number {
  const rows = [...here().packs.values()].flatMap((p) => Object.values(p.hooks).map((h) => `${`${p.pack.name}/${h.name}`.padEnd(28)} v${h.version}  ${h.output.padEnd(6)}  ${h.description}`));
  process.stdout.write(rows.length ? `${rows.sort().join("\n")}\n` : "no hooks in this workspace's packs\n");
  return 0;
}

function hookShow(args: string[]): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  const hook = loadHook(here(), positionals[0] ?? "");
  const ref = `${hook.pack}/${hook.name}`;
  const example = hook.example ?? exampleOf(hook.inputs);
  const run = hook.output === "figure" ? `folio hook run ${ref} --inputs example.json --size 120,80 --unit mm --out figure.${hook.outputs}` : `folio hook run ${ref} --inputs example.json --size 400,100 --out out.json`;
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ ref, name: hook.name, version: hook.version, description: hook.description, output: hook.output, runtime: hook.runtime, format: hook.outputs, dpi: hook.dpi, inputs: hook.inputs, example, run })}\n`);
    return 0;
  }
  const lines = [
    `${ref} v${hook.version}: makes a ${hook.output}${hook.output === "figure" ? ` (${hook.outputs}, ${hook.dpi} dpi)` : ""}, runtime ${hook.runtime ?? "none"}`,
    hook.description,
    "",
    "inputs (JSON Schema):",
    JSON.stringify(hook.inputs, null, 2),
    "",
    "example:",
    JSON.stringify(example, null, 2),
    "",
    `run: ${run}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

/** A pack's hook by reference, or an error naming the ones that exist. */
function loadHook(workspace: Workspace, ref: string): LoadedHook & { pack: string } {
  const found = findHook(workspace, ref);
  if (!found.ok) throw new Error(found.reason);
  return found.hook as LoadedHook & { pack: string };
}

/** Read `--inputs`: a file, or `-` for stdin. */
function readInputs(path: string | undefined): unknown {
  if (!path) throw new Error("--inputs is required: a JSON file of the hook's inputs, a trace record, or - for stdin");
  const text = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`--inputs ${path} is not JSON: ${(error as Error).message}`);
  }
}

const RUN_OPTIONS = {
  inputs: { type: "string" }, size: { type: "string" }, unit: { type: "string" }, dpi: { type: "string" }, format: { type: "string" },
  out: { type: "string" }, deck: { type: "string" }, fresh: { type: "boolean" }, json: { type: "boolean" },
} as const;

/** The call `hook run` makes: from a trace record, or from the inputs and `--size`. */
function callOf(values: { size?: string; unit?: string; format?: string }, given: unknown): DirectCall {
  if (isTrace(given)) return { ...callOfTrace(given), ...(values.format ? { format: values.format } : {}) };
  if (!values.size) throw new Error("--size W,H is required (with --unit pt|mm|in, pt by default)");
  const size = parseSize(values.size, values.unit ?? "pt");
  if (!size.ok) throw new Error(size.reason);
  if (values.format && !["png", "svg", "pdf"].includes(values.format)) throw new Error(`--format ${values.format} is not png, svg or pdf`);
  return { input: given, w: size.box.w, h: size.box.h, ...(values.format ? { format: values.format } : {}) };
}

async function hookRun(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: RUN_OPTIONS });
  const workspace = here();
  const given = readInputs(values.inputs);
  const trace = isTrace(given) ? given : null;
  const found = loadHook(workspace, positionals[0] ?? trace?.hook.name ?? "");
  const dpi = values.dpi ? Number(values.dpi) : trace?.dpi || found.dpi;
  if (!Number.isInteger(dpi) || dpi <= 0) throw new Error(`--dpi ${values.dpi} is not a positive whole number`);
  const hook = { ...found, dpi };
  if (trace && trace.hook.stamp !== `${hook.name}@${hook.version}:${trace.hook.scriptHash}`) process.stderr.write(`note: the trace was made by ${trace.hook.stamp}; the hook's files may have changed since\n`);
  const call = callOf(values, given);
  const cache = cacheOf(workspace, values.deck, trace?.base ?? process.cwd());
  const others = [...workspace.decks.values(), workspaceCache(workspace.config.root)];
  const result = await runDirect({ workspace, hook, call, cache, others, fresh: !!values.fresh });
  try {
    return report(result, values, trace, cache);
  } finally {
    if (values.fresh) dropFresh(result);
  }
}

/** The cache a direct call uses: `--deck`'s, else the workspace's (with inputs resolved against `base`). */
function cacheOf(workspace: Workspace, deck: string | undefined, base: string): HookCache {
  if (!deck) return workspaceCache(workspace.config.root, base);
  const store = workspace.findDeck(resolve(deck)) ?? workspace.findDeck(deck);
  if (!store) throw new Error(`no deck at ${deck}`);
  return store;
}

/** Copy the output to `--out` and print what was made. */
function report(result: DirectResult, values: { out?: string; json?: boolean }, trace: TraceRecord | null, cache: HookCache): number {
  if (result.issues.length) {
    process.stderr.write(`inputs fail the hook's schema:\n${result.issues.map((i) => `  ${i.jsonPath}: ${i.reason}`).join("\n")}\n`);
    return 2;
  }
  if (!result.file) {
    const r = result.record;
    process.stderr.write(`the hook failed: ${r?.status}${r?.detail ? `: ${r.detail}` : ""}\n${r?.stderrTail ?? ""}\n`);
    return 1;
  }
  const made = result.trace;
  const out = resolve(values.out ?? `${made?.key ?? "output"}.${made ? traceExt(made) : "out"}`);
  writeOutput(result, out);
  const sha256 = sha256File(out);
  const matches = matchesTrace(out, trace);
  const kept = made && !result.file.includes("folio-fresh-") ? tracePath(cache, made.key) : null;
  if (values.json) process.stdout.write(`${JSON.stringify({ out, key: made?.key, cached: result.cached, sha256, trace: kept, matches })}\n`);
  else {
    const px = made?.format === "png" ? pngSize(readFileSync(out)) : null;
    process.stdout.write(`wrote ${out} (${px ? `${px.w} x ${px.h} px, ` : ""}${made?.hook.stamp.split(":")[0]}, key ${made?.key}, ${result.cached ? "cached" : "drawn"}) sha256 ${sha256}\n`);
    process.stdout.write(`trace ${kept ?? "(a fresh run is not cached)"}\n`);
    if (matches !== null) process.stdout.write(matches ? "matches the trace: same sha256\n" : `differs from the trace: it recorded ${trace!.output.sha256}\n`);
  }
  return matches === false ? 1 : 0;
}

/** `folio trace <deck>/<slide> <slot> [--json]` */
export async function traceCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  if (!positionals[0] || !positionals[1]) throw new Error("usage: folio trace <deck>/<slide> <slot> [--json]");
  const { deck, slide } = splitSlideRef(positionals[0]);
  const { workspace, store } = openDeck(deck);
  const slot = positionals[1];
  const box = boxOf(workspace, store, slide, slot);
  const t = slotTrace(store, slide, slot, box.ok ? { w: box.w, h: box.h } : null);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(t)}\n`);
    return 0;
  }
  const lines: string[] = [];
  if (t.state === "untraced") lines.push(t.path === "inline table" ? `untraced: inline table; ${slot} holds rows typed into the slide` : `untraced: ${slot} shows ${t.path}, a plain image no hook made`);
  if (t.state === "none") lines.push(`${slot} on ${slide} shows no hook output yet${t.phase ? ` (${t.phase})` : ""}`);
  if (t.state === "traced" && t.phase && t.phase !== "ok") lines.push(`note: the slot is ${t.phase}; this is the output it shows now`);
  if (t.file) lines.push(...("kind" in t.file ? figureLines(t.file) : fileLines(t.file)));
  if (t.trace) lines.push(JSON.stringify(t.trace, null, 2), "", `regenerate: ${t.command}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

/** What `folio trace` says of a table file. */
function fileLines(f: TableFileTrace): string[] {
  const drawn = !f.drawn ? "not drawn yet" : f.matches ? `the file drawn ${f.drawn.at}` : `CHANGED since drawn ${f.drawn.at} (drawn sha256 ${f.drawn.sha256})`;
  const lines = [`file: ${f.path}`, `sha256: ${f.sha256 ?? "(missing)"}: ${drawn}`];
  if (f.problem) lines.push(`problem: ${f.problem}`);
  if (!f.source) lines.push("source: none (the file has no source block; folio does not guess one)");
  else {
    lines.push(`source: ${f.source.script}${f.source.at ? ` at ${f.source.at}` : ""}`);
    if (f.source.command) lines.push(`  command: ${f.source.command}`);
    for (const i of f.source.inputs ?? []) lines.push(`  input: ${i.path} sha256 ${i.sha256}`);
  }
  return lines;
}
