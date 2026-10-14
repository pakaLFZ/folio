/**
 * `folio block add|rm`: a text box or code block on a slide in one
 * revision-checked write, its added `block:<letter>` slot and its content
 * together (spec/slides/blocks.md).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { blockAdd, blockRemove, type BlockRequest, type CodeLanguage } from "@folio/core";
import { writeShape } from "./shapecmd.js";

const ADD_USAGE = "usage: folio block add <deck>/<id> --style card|callout|code|<style> --box x,y,w,h [--text T | --code-file F [--language L]] [--columns N] [--rev R] [--worker W] [--json]";
const RM_USAGE = "usage: folio block rm <deck>/<id> block:a [--rev R] [--worker W]";

/** `folio block add|rm ...` */
export async function blockCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "add") return blockAddCommand(rest);
  if (sub === "rm") return blockRmCommand(rest);
  throw new Error(`${ADD_USAGE}\n${RM_USAGE}`);
}

/** The request the flags of `folio block add` describe. */
function blockRequest(v: Record<string, string | undefined>): BlockRequest {
  if (!v.style || !v.box) throw new Error(`--style and --box are required\n${ADD_USAGE}`);
  if (v.text !== undefined && v["code-file"] !== undefined) throw new Error("a block holds text or code, not both: give --text or --code-file");
  if (v.language !== undefined && v["code-file"] === undefined) throw new Error("--language goes with --code-file");
  const box = v.box.split(",").map(Number);
  const columns = v.columns === undefined ? undefined : Number(v.columns);
  if (columns !== undefined && !Number.isInteger(columns)) throw new Error(`--columns is a whole number from 1 to 4, got ${v.columns}`);
  const code = v["code-file"] === undefined ? undefined : readFileSync(v["code-file"], "utf8").replace(/\n$/, "");
  return { style: v.style, box, text: v.text, code, language: v.language as CodeLanguage | undefined, columns };
}

async function blockAddCommand(args: string[]): Promise<number> {
  const options = Object.fromEntries(["style", "box", "text", "code-file", "language", "columns", "rev", "worker"].map((k) => [k, { type: "string" as const }]));
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { ...options, json: { type: "boolean" } } });
  if (positionals.length < 1) throw new Error(ADD_USAGE);
  const request = blockRequest(values as Record<string, string | undefined>);
  return writeShape(positionals[0]!, values, (spec, pack) => blockAdd(spec, pack, request));
}

async function blockRmCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { rev: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  if (positionals.length < 2) throw new Error(RM_USAGE);
  return writeShape(positionals[0]!, values, (spec, pack) => blockRemove(spec, pack, positionals[1]!));
}
