/** Inline markup for slide text. */
export interface Run {
  text: string;
  bold: boolean;
  script: "none" | "sub" | "sup";
  size?: number;
  color?: string;
  font?: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: string;
}
export type RunStyle = Omit<Run, "text">;
const TOKEN = /\*\*|_\{([^{}]*)\}|\^\{([^{}]*)\}/g;
const FLAGS = ["bold", "italic", "underline", "strike", "sub", "sup"];

function legacy(source: string, base: Partial<RunStyle> = {}): Run[] {
  const runs: Run[] = [];
  let bold = base.bold ?? false;
  let last = 0;
  const push = (text: string, script: Run["script"]) => {
    if (text) runs.push({ ...base, text, bold, script: script === "none" ? base.script ?? "none" : script });
  };
  for (const match of source.matchAll(TOKEN)) {
    push(source.slice(last, match.index), "none");
    if (match[0] === "**") bold = !bold;
    else push(match[1] ?? match[2] ?? "", match[1] !== undefined ? "sub" : "sup");
    last = match.index + match[0].length;
  }
  push(source.slice(last), "none");
  return runs;
}

function styled(source: string): Partial<RunStyle> {
  const style: Partial<RunStyle> = {};
  for (const item of source.split(";")) {
    const [key, ...value] = item.split("=");
    const v = value.join("=");
    if (key === "size") style.size = Number(v);
    else if (key === "color" || key === "font" || key === "highlight") style[key] = v;
    else if (key === "sub" || key === "sup") style.script = key;
    else if (key === "bold" || key === "italic" || key === "underline" || key === "strike") style[key] = true;
  }
  return style;
}

function spanAt(source: string, start: number): { end: number; attrs: string; content: string } | null {
  const bar = source.indexOf("|", start + 2);
  if (bar < 0) return null;
  const attrs = source.slice(start + 2, bar);
  if (!attrs || attrs.includes("[")) return null;
  let content = "";
  for (let i = bar + 1; i < source.length; i++) {
    if (source[i] === "\\" && i + 1 < source.length) content += source[++i];
    else if (source.slice(i, i + 2) === "]]") return { end: i + 2, attrs, content };
    else content += source[i];
  }
  return null;
}

/** Parse a slot string into visible runs. */
export function parseMarkup(source: string): Run[] {
  const runs: Run[] = [];
  let pos = 0;
  while (pos < source.length) {
    const open = source.indexOf("[[", pos);
    if (open < 0) return [...runs, ...legacy(source.slice(pos))];
    runs.push(...legacy(source.slice(pos, open)));
    const span = spanAt(source, open);
    if (!span) return [...runs, ...legacy(source.slice(open))];
    runs.push(...legacy(span.content, styled(span.attrs)));
    pos = span.end;
  }
  return runs;
}

function attributes(run: Run): string[] {
  const attrs: string[] = [];
  if (run.size !== undefined) attrs.push(`size=${run.size}`);
  if (run.color) attrs.push(`color=${run.color}`);
  if (run.font) attrs.push(`font=${run.font}`);
  if (run.highlight) attrs.push(`highlight=${run.highlight}`);
  for (const flag of FLAGS) if (flag === run.script || (flag in run && run[flag as keyof Run] === true)) attrs.push(flag);
  return attrs;
}

/** Serialize runs, retaining the original syntax where possible. */
export function serializeMarkup(runs: Run[]): string {
  let out = "";
  let bold = false;
  for (const run of runs) {
    const explicit = run.size !== undefined || !!(run.color || run.font || run.highlight || run.italic || run.underline || run.strike);
    if (explicit) {
      if (bold) out += "**", bold = false;
      out += `[[${attributes(run).join(";")}|${run.text.replace(/[\\|\]]/g, (c) => `\\${c}`)}]]`;
    } else {
      if (run.bold !== bold) out += "**", bold = run.bold;
      out += run.script === "sub" ? `_{${run.text}}` : run.script === "sup" ? `^{${run.text}}` : run.text;
    }
  }
  return bold ? `${out}**` : out;
}

export const plainText = (source: string): string => parseMarkup(source).map((r) => r.text).join("");

export type ListKind = "bullet" | "number";
export interface Paragraph {
  runs: Run[];
  kind: ListKind | null;
  level: number;
  ordinal: number;
  marker: string;
}

function linesOf(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const run of runs) for (const [index, part] of run.text.split("\n").entries()) {
    if (index) lines.push([]);
    if (part) lines.at(-1)!.push({ ...run, text: part });
  }
  return lines;
}

function withoutPrefix(runs: Run[], length: number): Run[] {
  let remaining = length;
  return runs.flatMap((run) => {
    const text = run.text.slice(remaining);
    remaining = Math.max(0, remaining - run.text.length);
    return text ? [{ ...run, text }] : [];
  });
}

function alphabetic(value: number): string {
  let n = value;
  let result = "";
  while (n > 0) { n--; result = String.fromCharCode(97 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
}

function roman(value: number): string {
  const symbols: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let n = value;
  let result = "";
  for (const [amount, symbol] of symbols) while (n >= amount) { result += symbol; n -= amount; }
  return result;
}

/** Parse visible paragraphs, numbering each run at its level; a nested run does not interrupt the one around it. */
export function parseParagraphs(source: string): Paragraph[] {
  const counters = [0, 0, 0];
  const kinds: (ListKind | null)[] = [null, null, null];
  let previous: Paragraph | null = null;
  return linesOf(parseMarkup(source)).map((line) => {
    const visible = line.map((run) => run.text).join("");
    const match = /^( *)(- |\d+\. )/.exec(visible);
    const valid = match && match[1]!.length % 2 === 0 && match[1]!.length <= 4;
    const kind = valid ? match[2] === "- " ? "bullet" : "number" : null;
    const level = kind ? match![1]!.length / 2 + 1 : 0;
    const runs = kind ? withoutPrefix(line, match![0].length) : /^\\(?:- |\d+\. )/.test(visible) ? withoutPrefix(line, 1) : line;
    if (!kind || kind !== kinds[level - 1]) counters.fill(0, kind ? level - 1 : 0);
    else counters.fill(0, level);
    kinds.fill(null, kind ? level : 0);
    if (kind) kinds[level - 1] = kind;
    if (kind === "number") counters[level - 1]!++;
    const ordinal = kind === "number" ? counters[level - 1]! : 0;
    const marker = kind === "bullet" ? ["•", "–", "▪"][level - 1]! : kind === "number" ? level === 1 ? `${ordinal}.` : level === 2 ? `${alphabetic(ordinal)}.` : `${roman(ordinal)}.` : "";
    previous = { runs, kind, level, ordinal, marker };
    return previous;
  });
}

/** Invalid list indentation is reported using one-based slot line numbers. */
export function listProblems(source: string): string[] {
  return linesOf(parseMarkup(source)).flatMap((line, index) => {
    const visible = line.map((run) => run.text).join("");
    const match = /^( *)(?:- |\d+\. )/.exec(visible);
    if (!match || (match[1]!.length % 2 === 0 && match[1]!.length <= 4)) return [];
    return [`line ${index + 1}: list indentation must be 0, 2, or 4 spaces (levels 1–3); repair the leading spaces`];
  });
}

/** Validate explicit runs, naming each bad run and its repair. */
export function markupProblems(source: string, colors: string[], fonts: string[]): string[] {
  const problems: string[] = [];
  let pos = 0;
  let index = 0;
  while ((pos = source.indexOf("[[", pos)) >= 0) {
    index++;
    const span = spanAt(source, pos);
    if (!span) { problems.push(`run ${index}: unclosed [[...|text]]; close it with ]]`); break; }
    const seen = new Set<string>();
    for (const item of span.attrs.split(";")) {
      const [key, ...tail] = item.split("=");
      const value = tail.join("=");
      const fix = `run ${index} (${item}):`;
      if (seen.has(key!)) problems.push(`${fix} repeated attribute; keep one ${key}`);
      seen.add(key!);
      if (key === "size" && !(Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 400)) problems.push(`${fix} size must be above 0 and at most 400 pt, e.g. size=24`);
      else if (key === "font" && !fonts.includes(value)) problems.push(`${fix} use a pack font: ${fonts.join(", ")}`);
      else if ((key === "color" || key === "highlight") && !colors.includes(value) && value !== "ink" && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) problems.push(`${fix} use a pack colour (${colors.join(", ")}), ink, or #RRGGBB`);
      else if (!["size", "font", "color", "highlight", ...FLAGS].includes(key!)) problems.push(`${fix} unknown attribute; use size, color, font, highlight, ${FLAGS.join(", ")}`);
      else if (FLAGS.includes(key!) && value) problems.push(`${fix} flags have no value; write ${key}`);
    }
    if (seen.has("sub") && seen.has("sup")) problems.push(`run ${index}: sub and sup conflict; keep one script`);
    pos = span.end;
  }
  return problems;
}
