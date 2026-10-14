import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { layoutsCommand } from "../src/layoutscmd.js";

const nusIcl = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "folio-layouts-"));
  cpSync(nusIcl, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  mkdirSync(join(root, "decks/talk/slides"), { recursive: true });
  writeFileSync(join(root, "decks/talk/deck.json"), JSON.stringify({ id: "c0ffee00c0ffee02", title: "Talk", template: "lectern@1", order: [] }));
  return root;
}

/** Run `folio layouts` in this process the way main does: a thrown error is exit 2 on stderr. */
async function folio(root: string, args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((s) => out.push(String(s)) > 0);
  try {
    return { status: await layoutsCommand([join(root, "decks/talk"), ...args]), stdout: out.join(""), stderr: "" };
  } catch (error) {
    return { status: 2, stdout: out.join(""), stderr: (error as Error).message };
  } finally {
    write.mockRestore();
  }
}
const pack = JSON.parse(readFileSync(join(nusIcl, "pack.json"), "utf8"));

describe("folio layouts", () => {
  const root = workspace();

  it("prints the slide size once and every slot's box, figures as file or hook without a schema", async () => {
    const run = await folio(root, []);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.match(/slide 960 x 540 pt/g)).toHaveLength(1);
    expect(run.stdout).toContain("folio hook show lectern/<hook>");
    for (const name of Object.keys(pack.layouts)) expect(run.stdout).toMatch(new RegExp(`^${name}: `, "m"));
    expect(run.stdout).not.toContain('"series"');
    expect(run.stdout.length).toBeLessThan(20_000);
  });

  it("gives a named layout's rows: text limits, the figure's hook and a flowed slot's below as stated", async () => {
    const run = await folio(root, ["note-figure", "plot-table"]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).not.toMatch(/^summary-table:/m);
    expect(run.stdout).toMatch(/^ {2}title +title +\[25\.7, 19\.8, 908\.7, 29\.8\] +26 pt, 1 line, 90 chars, hook chem-subscripts$/m);
    expect(run.stdout).toMatch(/^ {2}fig:a +figure +\[494\.8, 132\.8, 439\.6, 360\.2\] +file or hook line-plot$/m);
    expect(run.stdout).toMatch(/^ {2}table:b +table +\[490, 117\.6, 444\.4, 340\] +14 pt, \d+ rows, style default$/m);
    expect(run.stdout).toMatch(/^ {2}note +note +\[490, 251\.6, 444\.4, 233\] .*below table:b \+12$/m);
    expect(run.stdout).toMatch(/^note-figure: A justified note on the left/m);
    expect(run.stdout).toMatch(/^ {2}background plain$/m);
  });

  it("gives the same as JSON, layouts as an array", async () => {
    const run = await folio(root, ["--json", "plot-table"]);
    const sheet = JSON.parse(run.stdout);
    expect(sheet.slide).toEqual({ w: 960, h: 540, unit: "pt" });
    expect(sheet.layouts.map((l: { name: string }) => l.name)).toEqual(["plot-table"]);
    const slots = Object.fromEntries(sheet.layouts[0].slots.map((s: { name: string }) => [s.name, s]));
    expect(slots["fig:a"]).toEqual({ name: "fig:a", role: "figure", box: pack.layouts["plot-table"].slots["fig:a"].box, takes: "file or hook", hook: "line-plot" });
    expect(slots.note.below).toEqual({ slot: "table:b", gap: 12 });
  });

  it("refuses a layout the pack lacks, listing its layouts", async () => {
    const run = await folio(root, ["nope"]);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/no layout nope in pack lectern@1; its layouts: title, separator, .*; folio layouts .*decks\/talk lists them all/);
  });
});
