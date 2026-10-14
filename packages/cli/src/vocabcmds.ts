/**
 * `folio vocab`: the deck's vocabulary bank. Every write lands in the deck's
 * own `vocabulary.md`; the pack's bank and other decks' banks are only read.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  entryKey, entryStanding, isEditLog, newBankText, ownResolved, parseBank, renderBank, setFrontMatter, setSection, sinceCell, upsertRow,
  type ResolvedBank, type VocabEdit,
} from "@folio/core";
import { changeDeckBank, deckBank, deckBankFile, deckOrigin, localDay, readVocabEdits, resolveBankRef, writeDeckBank, type DeckStore, type Workspace } from "@folio/server";
import { openDeck } from "./deckcmds.js";

const USAGE = [
  "usage: folio vocab show <deck> [--resolved] [--json]",
  "       folio vocab init <deck> [--from <deck|pack>]",
  "       folio vocab inherit <deck> <deck|pack>",
  "       folio vocab import <deck> <file.md|deck|pack>",
  '       folio vocab add <deck> --use T --never "a, b" [--quote Q] [--slide sNNN]',
  "       folio vocab edits <deck> [--since DATE] [--json]",
  "       folio vocab export <deck>",
].join("\n");

/**
 * Name a bank the way `inherits` does.
 *
 * @param arg - `pack`, a pack name or `templates/<pack>`, a deck folder name or `decks/<deck>`.
 * @returns `pack`, `templates/<pack>` or `decks/<deck>`; throws naming what was looked for.
 */
function bankRef(workspace: Workspace, arg: string): string {
  if (arg === "pack") return "pack";
  const deck = workspace.findDeck(resolve(arg)) ?? workspace.findDeck(arg.replace(/^decks\//, ""));
  if (deck) return deckOrigin(deck);
  const pack = arg.replace(/^templates\//, "").replace(/\/+$/, "");
  if (existsSync(join(workspace.config.templatesDir, pack, "pack.json"))) return `templates/${pack}`;
  throw new Error(`${arg} names no deck under ${workspace.config.decksDir} and no pack under ${workspace.config.templatesDir}; use pack, a deck or a pack name`);
}

/** A bank to copy or import from: a Markdown file, or a bank named as in `inherits`. */
function sourceBank(workspace: Workspace, store: DeckStore, arg: string): ResolvedBank {
  if (arg.endsWith(".md") && existsSync(arg) && statSync(arg).isFile()) return ownResolved(parseBank(readFileSync(arg, "utf8")), basename(arg));
  const { resolved, problems } = resolveBankRef(workspace, store, bankRef(workspace, arg));
  for (const p of problems) process.stderr.write(`note: ${p}\n`);
  return resolved;
}

async function show(store: DeckStore, workspace: Workspace, flags: { resolved?: boolean; json?: boolean }): Promise<number> {
  const bank = deckBank(workspace, store);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ rev: bank.rev, files: bank.files, problems: bank.problems, own: bank.own === null ? null : parseBank(bank.own), resolved: bank.resolved }, null, 2)}\n`);
    return 0;
  }
  const lines = [bank.own === null ? `${deckOrigin(store)} has no bank of its own; it uses its pack's (folio vocab init to make one)` : `${deckOrigin(store)}/vocabulary.md, inherits ${JSON.stringify(parseBank(bank.own).inherits ?? ["pack"])}`];
  lines.push(...bank.files.map((f) => `  ${f.origin}: ${f.path}`), ...bank.problems.map((p) => `  problem: ${p}`), "");
  process.stdout.write(`${lines.join("\n")}\n`);
  const view = flags.resolved ? bank.resolved : bank.own === null ? bank.resolved : ownResolved(parseBank(bank.own), deckOrigin(store));
  process.stdout.write(renderBank(view, { origins: true, log: true }));
  return 0;
}

async function init(store: DeckStore, workspace: Workspace, from: string | undefined): Promise<number> {
  if (existsSync(deckBankFile(store))) throw new Error(`${deckBankFile(store)} exists; use folio vocab import or inherit to add to it`);
  const copy = from ? sourceBank(workspace, store, from) : null;
  const text = copy ? setSection(setFrontMatter(renderBank(copy), { inherits: [] }), "Status (log of the user's edits)", []) : newBankText(["pack"]);
  writeDeckBank(store, text);
  process.stdout.write(`created ${deckBankFile(store)}: ${copy ? `a copy of ${from} (${copy.entries.length} words), inheriting nothing` : "inherits the pack's bank"}\n`);
  return 0;
}

async function inherit(store: DeckStore, workspace: Workspace, arg: string): Promise<number> {
  const ref = bankRef(workspace, arg);
  if (ref === deckOrigin(store)) throw new Error("a deck cannot inherit its own bank");
  const own = deckBank(workspace, store).own ?? newBankText(["pack"]);
  const inherits = parseBank(own).inherits ?? ["pack"];
  if (inherits.includes(ref)) {
    process.stdout.write(`${deckOrigin(store)} already inherits ${ref}\n`);
    return 0;
  }
  writeDeckBank(store, setFrontMatter(own, { inherits: [...inherits, ref] }));
  process.stdout.write(`${deckOrigin(store)} inherits ${JSON.stringify([...inherits, ref])}\n`);
  return 0;
}

/** Lines of the source's sections the target lacks, merged into the deck's own text. */
function mergeSections(text: string, target: ResolvedBank, source: ResolvedBank): { text: string; lines: number } {
  let count = 0;
  for (const section of source.sections) {
    if (section.heading === source.wordsHeading || isEditLog(section.heading)) continue;
    const existing = target.sections.find((s) => s.heading.toLowerCase() === section.heading.toLowerCase())?.lines ?? [];
    const have = new Set(existing.map((l) => l.trim()));
    const missing = section.lines.filter((l) => l.trim() && !have.has(l.trim()));
    if (!missing.length) continue;
    count += missing.length;
    text = setSection(text, section.heading, [...existing, ...missing]);
  }
  return { text, lines: count };
}

async function importBank(store: DeckStore, workspace: Workspace, arg: string): Promise<number> {
  const target = deckBank(workspace, store);
  const source = sourceBank(workspace, store, arg);
  let text = target.own ?? newBankText(["pack"]);
  const conflicts: string[] = [];
  let added = 0;
  let duplicates = 0;
  for (const entry of source.entries) {
    const standing = entryStanding(entry, target.resolved.entries);
    if (standing === "conflict") conflicts.push(entry.use);
    else if (standing === "duplicate") duplicates += 1;
    else (text = upsertRow(text, entry)), (added += 1);
  }
  const merged = mergeSections(text, target.resolved, source);
  writeDeckBank(store, merged.text);
  process.stdout.write(`imported ${arg} into ${deckOrigin(store)}: ${added} words added, ${duplicates} duplicates skipped, ${merged.lines} section lines added\n`);
  for (const use of conflicts) process.stdout.write(`conflict, left out: "${use}" is in the bank with other Never words (edit ${deckBankFile(store)} to choose)\n`);
  return 0;
}

async function add(store: DeckStore, workspace: Workspace, values: { use?: string; never?: string; quote?: string; slide?: string }): Promise<number> {
  if (!values.use || values.never === undefined) throw new Error(USAGE);
  const bank = deckBank(workspace, store);
  const entry = { use: values.use, never: values.never, since: sinceCell(localDay(), values.slide, values.quote) };
  const mine = bank.own === null ? [] : parseBank(bank.own).entries;
  const standing = entryStanding(entry, mine);
  if (standing !== "new") {
    process.stderr.write(standing === "duplicate" ? `"${entry.use}" is already in ${deckOrigin(store)}'s bank with these words; nothing added\n` : `conflict: "${entry.use}" is in ${deckOrigin(store)}'s bank with Never "${mine.find((e) => entryKey(e.use) === entryKey(entry.use))!.never}"; edit ${deckBankFile(store)} to change it\n`);
    return standing === "duplicate" ? 0 : 2;
  }
  const result = await changeDeckBank(workspace, store, { kind: "set", ...entry }, null);
  if (!result.ok) throw new Error(result.reason);
  const shadowed = bank.inherited.entries.find((e) => entryKey(e.use) === entryKey(entry.use));
  process.stdout.write(`added to ${deckBankFile(store)}: | ${entry.use} | ${entry.never} | ${entry.since} |${shadowed ? ` (overrides ${shadowed.origin}'s row)` : ""}\n`);
  return 0;
}

const editLine = (e: VocabEdit): string =>
  [`${e.at.slice(0, 16).replace("T", " ")}  ${e.slide}/${e.slot}  ${e.by} rewrote text by ${e.beforeBy ?? "unknown"}`, `  - ${JSON.stringify(e.before)}`, `  + ${JSON.stringify(e.after)}`].join("\n");

async function edits(store: DeckStore, values: { since?: string; json?: boolean }): Promise<number> {
  const records = readVocabEdits(store).filter((e) => !values.since || e.until >= values.since);
  if (values.json) process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
  else process.stdout.write(records.length ? `${records.map(editLine).join("\n")}\n` : `no text edits by the user recorded in ${deckOrigin(store)}${values.since ? ` since ${values.since}` : ""}\n`);
  return 0;
}

/** `folio vocab <show|init|inherit|import|add|edits|export> <deck> ...` */
export async function vocabCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { resolved: { type: "boolean" }, json: { type: "boolean" }, from: { type: "string" }, use: { type: "string" }, never: { type: "string" }, quote: { type: "string" }, slide: { type: "string" }, since: { type: "string" } },
  });
  const [sub, deckRef, other] = positionals;
  if (!sub || !deckRef) throw new Error(USAGE);
  const { workspace, store } = openDeck(deckRef);
  if (sub === "show") return show(store, workspace, values);
  if (sub === "init") return init(store, workspace, values.from);
  if (sub === "inherit" && other) return inherit(store, workspace, other);
  if (sub === "import" && other) return importBank(store, workspace, other);
  if (sub === "add") return add(store, workspace, values);
  if (sub === "edits") return edits(store, values);
  if (sub !== "export") throw new Error(USAGE);
  process.stdout.write(renderBank(deckBank(workspace, store).resolved));
  return 0;
}

/** The Vocabulary section `folio prompt` ends with: the resolved bank without its edit log. */
export function vocabularyPrompt(workspace: Workspace, store: DeckStore): string {
  const { resolved } = deckBank(workspace, store);
  if (!resolved.entries.length && !resolved.sections.some((s) => s.lines.length && !isEditLog(s.heading))) return "";
  const ref = deckOrigin(store);
  const intro = [
    "## Vocabulary",
    "The user's own words and phrasing for slide text: read it before writing any slide text. A Never word on a slide is warned as FOLIO-VOC-001 (a warning, never a refusal; change it only as the bank says).",
    `After the user edits slide text, \`folio vocab edits ${ref}\` lists each rewrite (before, after, who wrote the before); turn what changed into a rule with \`folio vocab add ${ref} --use T --never "a, b" --quote Q --slide sNNN\`, or a line in the bank's Phrasing.`,
    "",
  ];
  return `\n${intro.join("\n")}${renderBank(resolved, { level: 2, title: false })}`;
}
