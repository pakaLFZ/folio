/**
 * Code highlighting for code blocks: highlight.js's core with one grammar per
 * language folio lists, registered once at import. It is synchronous, so the
 * live page and the print page colour the same code before it is measured.
 * The HTML is split into lines, each closing and reopening the spans that
 * cross it, so every line can be measured and numbered on its own.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import fortran from "highlight.js/lib/languages/fortran";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import julia from "highlight.js/lib/languages/julia";
import latex from "highlight.js/lib/languages/latex";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import type { CodeLanguage } from "@folio/core";

const GRAMMARS = { bash, c, cpp, fortran, go, ini, java, javascript, json, julia, latex, markdown, python, r, rust, sql, typescript, yaml };
for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar);

/** The grammar each folio language uses; `text` has none. */
const GRAMMAR_OF: Record<CodeLanguage, keyof typeof GRAMMARS | null> = {
  python: "python", bash: "bash", shell: "bash", javascript: "javascript", typescript: "typescript", json: "json", toml: "ini", yaml: "yaml",
  c: "c", cpp: "cpp", rust: "rust", go: "go", java: "java", sql: "sql", r: "r", julia: "julia", fortran: "fortran", latex: "latex", markdown: "markdown", text: null,
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Highlight code, one HTML string per source line.
 *
 * @param code - the source, whitespace kept.
 * @param language - a folio language.
 * @returns the lines as HTML with `hljs-*` spans; `text` is escaped only.
 */
export function highlightLines(code: string, language: CodeLanguage): string[] {
  const grammar = GRAMMAR_OF[language];
  const html = grammar ? hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value : escapeHtml(code);
  return splitLines(html);
}

/** Split highlighted HTML at its newlines, closing the open spans at each line's end and reopening them on the next. */
function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = "";
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === "\n") {
      lines.push(line + "</span>".repeat(open.length));
      line = open.join("");
    } else {
      if (part.startsWith("<span")) open.push(part);
      else if (part === "</span>") open.pop();
      line += part;
    }
  }
  lines.push(line);
  return lines;
}
