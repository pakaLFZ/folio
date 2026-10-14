/**
 * `import-report.md`: everything the importer could not know for sure, each
 * item with the command that settles it. Nothing is guessed silently.
 */

export const SECTIONS = {
  roles: "Guessed roles and slot names",
  unmapped: "Shapes with no folio counterpart",
  fonts: "Fonts",
  backgrounds: "Backgrounds",
  tables: "Table styles",
  proposals: "Layouts proposed from the slides",
  notes: "Usage notes and descriptions",
} as const;

export type Section = keyof typeof SECTIONS;

export class Report {
  readonly items: Record<Section, string[]> = { roles: [], unmapped: [], fonts: [], backgrounds: [], tables: [], proposals: [], notes: [] };

  private readonly tallies = new Map<string, { section: Section; items: string[] }>();

  add(section: Section, line: string): void {
    if (!this.items[section].includes(line)) this.items[section].push(line);
  }

  /** Gather many occurrences of one finding into a single line that lists where it was met. */
  tally(section: Section, line: string, where: string): void {
    const entry = this.tallies.get(line) ?? { section, items: [] };
    if (!entry.items.includes(where)) entry.items.push(where);
    this.tallies.set(line, entry);
  }

  get count(): number {
    return Object.values(this.items).reduce((n, list) => n + list.length, 0) + this.tallies.size;
  }

  /**
   * The report as Markdown.
   *
   * @param head - lines describing the import (source, counts).
   */
  markdown(pack: string, head: string[]): string {
    const lines = [`# Import report: ${pack}`, "", ...head, "", "Read `folio pack guide` before resolving these. Each item ends with the command that settles it; `folio pack check templates/" + pack + "` must pass after every change.", ""];
    for (const [key, title] of Object.entries(SECTIONS) as [Section, string][]) {
      const tallied = [...this.tallies].filter(([, t]) => t.section === key).map(([line, t]) => `${line} (${t.items.length}: ${t.items.join("; ")})`);
      const all = [...this.items[key], ...tallied];
      lines.push(`## ${title}`, "", ...(all.length ? all.map((l) => `- ${l}`) : ["- Nothing to resolve."]), "");
    }
    return `${lines.join("\n").trimEnd()}\n`;
  }
}

/** A lower-case, hyphenated name from any text: `Title, Text and Content` -> `title-text-and-content`. */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** A name not yet in `taken`: the name itself, then `-2`, `-3`, ... */
export function unique(name: string, taken: Set<string> | Record<string, unknown>): string {
  const has = (n: string) => (taken instanceof Set ? taken.has(n) : n in taken);
  if (!has(name)) return name;
  for (let i = 2; ; i++) if (!has(`${name}-${i}`)) return `${name}-${i}`;
}
