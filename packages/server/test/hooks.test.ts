import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPython } from "../src/hooks/findpython.js";
import { describe, expect, it } from "vitest";
import { loadHookDef, type Job } from "@folio/core";
import type { DeckStore } from "../src/deckstore.js";
import { acceptOutput, hookRequest, runSpawn, type LoadedHook } from "../src/hooks/runner.js";
import { cachedExt, readOutput } from "../src/hooks/state.js";
import { loadPackDir } from "../src/workspace.js";
import { fileURLToPath } from "node:url";

const chemDir = fileURLToPath(new URL("../../../templates/lectern/hooks/chem-subscripts", import.meta.url));
const python = process.env.FOLIO_PYTHON ?? findPython()?.exe;

const fakeStore = (): DeckStore => ({ stateDir: mkdtempSync(join(tmpdir(), "folio-hooks-")), dir: "/deck", token: "d0000001" }) as unknown as DeckStore;
const hookOf = (json: object, dir = "/hook"): LoadedHook => {
  const r = loadHookDef({ name: "h", command: ["t.py"], ...json });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return { ...r.hook, dir };
};
const job = (kind: Job["kind"], inputs: unknown, key = "0123456789abcdef"): Job => ({ deck: "d0000001", slide: "s001", slot: kind === "figure" ? "fig:a" : "note", kind, role: kind === "figure" ? "figure" : "body", hook: "h", stamp: "h@1:x", key, inputs, box: { w: 300, h: 100, dpi: kind === "figure" ? 200 : 0 }, priority: 1, enqueuedAt: 0, attempt: 0 });

describe("the hook request", () => {
  it("has one envelope for every kind", () => {
    expect(hookRequest(job("text", "CO2"), hookOf({ output: "text" }), "/tmp/x", "/deck")).toEqual({ kind: "text", slot: "note", role: "body", box: { w: 300, h: 100 }, deck: "d0000001", slide: "s001", input: "CO2", deck_dir: "/deck" });
    const table = { columns: ["a"], rows: [["1"]] };
    expect(hookRequest(job("table", table), hookOf({ output: "table" }), "/tmp/x", "/deck")).toMatchObject({ kind: "table", input: table });
  });
  it("keeps a figure's inputs, dpi, out and format", () => {
    const inputs = { label: "a" };
    expect(hookRequest(job("figure", inputs), hookOf({ inputs: {}, dpi: 72 }), "/tmp/f.png", "/deck")).toEqual({ kind: "figure", slot: "fig:a", role: "figure", box: { w: 300, h: 100 }, deck: "d0000001", slide: "s001", input: inputs, inputs, dpi: 72, out: "/tmp/f.png", format: "png", deck_dir: "/deck" });
  });
});

describe("accepting a text or table output", () => {
  it("caches a text output with the raw text it was made from", () => {
    const store = fakeStore();
    expect(acceptOutput(store, job("text", "CO2"), hookOf({ output: "text" }), "", { text: "CO_{2}" })).toBeNull();
    expect(cachedExt(store, "0123456789abcdef")).toBe("out.json");
    expect(readOutput(store, "0123456789abcdef")).toEqual({ input: "CO2", output: { text: "CO_{2}" } });
  });
  it("caches a plain {columns, rows} table", () => {
    const store = fakeStore();
    const table = { columns: ["gas"], rows: [["CO_{2}"]] };
    expect(acceptOutput(store, job("table", { columns: ["gas"], rows: [["CO2"]] }), hookOf({ output: "table" }), "", { columns: ["gas"], rows: [[2]] })?.status).toBe("output");
    expect(acceptOutput(store, job("table", { columns: ["gas"], rows: [["CO2"]] }), hookOf({ output: "table" }), "", table)).toBeNull();
    expect(readOutput(store, "0123456789abcdef")?.output).toEqual(table);
  });
  it("caches nothing for a missing response, so the slot keeps its raw text", () => {
    const store = fakeStore();
    expect(acceptOutput(store, job("text", "CO2"), hookOf({ output: "text" }), "", undefined)).toEqual({ status: "output", detail: 'it printed no {"text": "..."} line' });
    expect(cachedExt(store, "0123456789abcdef")).toBeNull();
  });
});

describe("a pack folder", () => {
  it("is refused when a text slot names a figure hook", () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-pack-"));
    const pack = { name: "p", version: 1, canvas: { w: 100, h: 100, unit: "pt" }, roles: { body: { size: 10, lineHeight: 1.2 } }, backgrounds: { plain: { fill: "#fff", ink: "#000" } }, layouts: { l: { background: "plain", description: "", slots: { note: { role: "body", box: [0, 0, 100, 100], hook: "plot" } } } } };
    writeFileSync(join(dir, "pack.json"), JSON.stringify(pack));
    mkdirSync(join(dir, "hooks/plot"), { recursive: true });
    writeFileSync(join(dir, "hooks/plot/hook.json"), JSON.stringify({ name: "plot", command: ["d.py"], inputs: {} }));
    const r = loadPackDir(dir);
    expect(r.ok ? [] : r.problems).toEqual(['layouts.l.slots.note.hook: hook "plot" makes a figure, but note is a text slot (role body); name a hook with "output": "text"']);
  });
});

describe.skipIf(!python)("chem-subscripts, run as a spawned hook", () => {
  const run = async (dir: string, text: string) => {
    const store = fakeStore();
    const raw = JSON.parse(readFileSync(join(dir, "hook.json"), "utf8"));
    const record = await runSpawn({ store, job: job("text", text), hook: hookOf(raw, dir), exe: python!, signal: new AbortController().signal, memoryMb: null });
    return { record, cached: readOutput(store, "0123456789abcdef") };
  };
  it("rewrites formulas and leaves other numbers", async () => {
    const { record, cached } = await run(chemDir, "CO2 and H2O at 300 K");
    expect(record.status).toBe("ok");
    expect(cached).toEqual({ input: "CO2 and H2O at 300 K", output: { text: "CO_{2} and H_{2}O at 300 K" } });
  });
  it("records a failure and caches nothing", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "folio-hook-")), "broken");
    cpSync(chemDir, dir, { recursive: true });
    writeFileSync(join(dir, "transform.py"), "from folio_hook import fail, run\nrun(lambda request: fail('asked to fail'))\n");
    const { record, cached } = await run(dir, "CO2");
    expect([record.status, record.exit, record.stderrTail.trim()]).toEqual(["exit", 1, "asked to fail"]);
    expect(cached).toBeNull();
  });
});
