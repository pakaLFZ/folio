import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { makeSlideSpec } from "@folio/core";
import { newCommand } from "../src/deckcmds.js";

const lecternDir = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));
const bin = fileURLToPath(new URL("../bin/folio.mjs", import.meta.url));

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "folio-newprops-"));
  cpSync(lecternDir, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const deck = join(root, "decks/talk");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "c0ffee00c0ffee01", title: "Talk", template: "lectern@1", order: ["s001", "s002"] }));
  for (const id of ["s001", "s002"]) writeFileSync(join(deck, `slides/${id}.json`), JSON.stringify(makeSlideSpec("note-figure", { title: id })));
  return root;
}

/** Run `folio new` in this process the way main does: a thrown error is exit 2 on stderr. */
async function folioNew(args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => out.push(String(s)) > 0);
  const e = vi.spyOn(process.stderr, "write").mockImplementation((s) => err.push(String(s)) > 0);
  try {
    return { status: await newCommand(args), stdout: out.join(""), stderr: err.join("") };
  } catch (error) {
    return { status: 2, stdout: out.join(""), stderr: `folio new: ${(error as Error).message}\n` };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

const order = (root: string) => JSON.parse(readFileSync(join(root, "decks/talk/deck.json"), "utf8")).order as string[];
const props = (root: string, id: string) => JSON.parse(readFileSync(join(root, `decks/talk/slides/${id}.json`), "utf8")).elements.s.props;
const slideFiles = (root: string) => readdirSync(join(root, "decks/talk/slides")).filter((f) => f.endsWith(".json")).sort();

describe("folio new --props", () => {
  it("writes the filled slide in one call from a file, at the end, and after a given slide", async () => {
    const root = workspace();
    const deck = join(root, "decks/talk");
    writeFileSync(join(root, "s.json"), JSON.stringify({ title: "CO2 moves", note: "It was moved.", "fig:a": "fig/a.png" }));
    const fromFile = await folioNew([deck, "--template", "note-figure", "--props", join(root, "s.json")]);
    expect(fromFile.status, fromFile.stderr).toBe(0);
    expect(fromFile.stdout).toMatch(/^s003 rev \w+\n$/);
    expect(props(root, "s003")).toEqual({ title: "CO2 moves", note: "It was moved.", "fig:a": "fig/a.png" });
    expect(order(root)).toEqual(["s001", "s002", "s003"]);

    const after = await folioNew([deck, "--template", "title", "--props", '{"title": "Part two"}', "--after", "s001"]);
    expect(after.status, after.stderr).toBe(0);
    expect(order(root)).toEqual(["s001", "s004", "s002", "s003"]);
  });

  it("reads --props - from stdin", () => {
    const root = workspace();
    const run = spawnSync(process.execPath, [bin, "new", "decks/talk", "--template", "title", "--props", "-"], { cwd: root, input: JSON.stringify({ title: "Part two", author: "A. B." }), encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(props(root, "s003")).toEqual({ title: "Part two", author: "A. B." });
  }, 30_000); // spawns the CLI: tsx's cold start alone can pass the 5 s default under a parallel run

  it("refuses what folio patch refuses, and bad props or an unknown --after, writing nothing and taking no id", async () => {
    const root = workspace();
    const deck = join(root, "decks/talk");
    writeFileSync(join(root, "array.json"), "[1]");
    const table = JSON.stringify({ "table:a": { columns: ["gas"], rows: [["co2", "n2"]] } });
    const cases: [string[], RegExp][] = [
      [["--template", "note-figure", "--props", '{"titel": "x"}'], /422 refused, nothing written; no slide was made:\n {2}\/elements\/s\/props\/titel: "titel" is not a slot of layout note-figure/],
      [["--template", "summary-table", "--props", table], /table:a\/rows\/0: row 1 has 2 cells; the table has 1 columns/],
      [["--template", "note-figure", "--props", "{not json"], /--props is not JSON .*write a JSON object/],
      [["--template", "note-figure", "--props", join(root, "array.json")], /--props must be a JSON object, not an array/],
      [["--template", "note-figure", "--props", join(root, "missing.json")], /missing.json: no such file/],
      [["--template", "note-figure", "--after", "s099"], /--after s099: no such slide in .*; its slides: s001, s002 \(folio slide list /],
    ];
    for (const [args, message] of cases) {
      const run = await folioNew([deck, ...args]);
      expect(run.status, run.stdout).toBe(2);
      expect(run.stderr).toMatch(message);
    }
    expect(order(root)).toEqual(["s001", "s002"]);
    expect(slideFiles(root)).toEqual(["s001.json", "s002.json"]);
    expect((await folioNew([deck, "--template", "title"])).stdout).toMatch(/^s003 rev/);
  });
});
