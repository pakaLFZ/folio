import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPython } from "../src/hooks/findpython.js";
import { describe, expect, it } from "vitest";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { callOfTrace, dropFresh, runDirect, workspaceCache, writeOutput } from "../src/hooks/direct.js";
import { HookService } from "../src/hooks/service.js";
import { pageTraces, slotTrace } from "../src/hooks/slottrace.js";
import { recordTableDrawn } from "../src/hooks/tablefiles.js";
import { readTrace } from "../src/hooks/trace.js";

const python = process.env.FOLIO_PYTHON ?? findPython()?.exe;
const UPPER = `import json, sys
r = json.load(sys.stdin)
t = r["input"]
print(json.dumps({"columns": t["columns"], "rows": [[c.upper() for c in row] for row in t["rows"]]}))
`;
const SHA = "b".repeat(64);
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A workspace whose layout has a hooked table slot (table:a) and a plain one (table:b). */
function workspaceDir(): { root: string; deck: string } {
  const root = mkdtempSync(join(tmpdir(), "folio-tabletrace-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  writeFileSync(join(root, "folio.local.toml"), `[runtimes]\npython = "${python}"\n`);
  const hook = join(root, "templates/p/hooks/upper");
  mkdirSync(hook, { recursive: true });
  const slots = { note: { role: "body", box: [0, 0, 400, 40] }, "table:a": { role: "table", box: [0, 50, 400, 100], tableStyle: "plain", hook: "upper" }, "table:b": { role: "table", box: [0, 160, 400, 100], tableStyle: "plain" } };
  writeFileSync(join(root, "templates/p/pack.json"), JSON.stringify({ name: "p", version: 1, canvas: { w: 400, h: 300, unit: "pt" }, roles: { body: { size: 10, lineHeight: 1.2 } }, tables: { plain: { size: 12, lineHeight: 1.2, cellPad: [2, 4, 2, 4], rule: { color: "#000000", width: 0.5 } } }, backgrounds: { plain: { fill: "#fff", ink: "#000" } }, layouts: { t: { background: "plain", description: "", slots } } }));
  writeFileSync(join(hook, "hook.json"), JSON.stringify({ name: "upper", output: "table", runtime: "python", command: ["upper.py"] }));
  writeFileSync(join(hook, "upper.py"), UPPER);
  const deck = join(root, "decks/d");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "fedcba9876543210", title: "d", template: "p@1", order: ["s001"] }));
  return { root, deck };
}

const writeSlide = (deck: string, props: Record<string, unknown>) => writeFileSync(join(deck, "slides/s001.json"), JSON.stringify({ root: "s", elements: { s: { type: "t", props: { note: "n", ...props }, children: [] } } }));
const writeFile = (deck: string, name: string, json: unknown) => writeFileSync(join(deck, name), JSON.stringify(json));

describe.skipIf(!python)("traced tables", () => {
  it("trace a table hook's rows and regenerate them to the same sha256", async () => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, { "table:a": { columns: ["gas"], rows: [["co2"]] } });
    const app = new FolioApp(loadConfig(root));
    const service = new HookService(app);
    const store = [...app.workspace.decks.values()][0]!;
    service.reconcile(store, "s001");
    expect(await service.idle(store.token, 20_000)).toEqual([]);
    const t = slotTrace(store, "s001", "table:a");
    expect(t).toMatchObject({ state: "traced", trace: { kind: "table", hook: { name: "upper" }, inputs: { columns: ["gas"], rows: [["co2"]] } } });
    expect(t.command).toMatch(/^folio hook run p\/upper --inputs .* --fresh --out [0-9a-f]{16}\.json$/);
    const trace = readTrace(store, t.trace!.key)!;
    const result = await runDirect({ workspace: app.workspace, hook: app.workspace.packOf(store)!.hooks.upper!, call: callOfTrace(trace), cache: workspaceCache(root, trace.base), others: [], fresh: true });
    const out = join(root, "regen.json");
    writeOutput(result, out);
    dropFresh(result);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ columns: ["gas"], rows: [["CO2"]] });
    expect(sha(readFileSync(out))).toBe(trace.output.sha256);
    expect(pageTraces(store, ["s001"])[0]!.slots["table:a"]).toMatchObject({ hook: "p/upper@1", key: trace.key });
    service.close();
    await app.close();
  });

  it("record a table file's hash when drawn, its source block, and whether it changed", async () => {
    const { root, deck } = workspaceDir();
    const source = { script: "make.py", inputs: [{ path: "s.csv", sha256: SHA }], at: "2026-10-13T00:00:00Z" };
    writeFile(deck, "b.table.json", { columns: ["x"], rows: [["1"]], source });
    writeSlide(deck, { "table:b": { src: "b.table.json" } });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    expect(slotTrace(store, "s001", "table:b")).toMatchObject({ state: "file", file: { path: "b.table.json", drawn: null, matches: null, source } });
    recordTableDrawn(store, "b.table.json");
    const drawnSha = sha(readFileSync(join(deck, "b.table.json")));
    expect(slotTrace(store, "s001", "table:b").file).toMatchObject({ sha256: drawnSha, drawn: { sha256: drawnSha }, matches: true });
    expect(pageTraces(store, ["s001"])[0]!.slots["table:b"]).toEqual({ file: "b.table.json", sha256: drawnSha });
    writeFile(deck, "b.table.json", { columns: ["x"], rows: [["2"]] });
    expect(slotTrace(store, "s001", "table:b").file).toMatchObject({ matches: false, source: null, drawn: { sha256: drawnSha } });
    writeFile(deck, "b.table.json", { columns: ["x"], rows: [["2"]], source: { script: "make.py", guessed: true } });
    const warnings = app.warnings.slideWarnings(store, "s001", null);
    expect(warnings.find((w) => w.code === "FOLIO-TAB-001")?.message).toMatch(/source\./);
    await app.close();
  });

  it("note inline tables of numbers that nothing traces, and leave tables of words alone", async () => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, { "table:b": { columns: ["hop", "barrier"], rows: [["Path A", "0.52 eV"]] } });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    const notes = () => app.warnings.slideWarnings(store, "s001", null).filter((w) => w.code === "FOLIO-TAB-002" && w.state !== "absent");
    expect(notes().map((w) => [w.severity, w.location.slot])).toEqual([["note", "table:b"]]);
    expect(slotTrace(store, "s001", "table:b")).toMatchObject({ state: "untraced", path: "inline table" });
    writeSlide(deck, { "table:b": { columns: ["hop", "crossing"], rows: [["Path A", "end-on"]] } });
    app.manifestOf(store).refresh("s001");
    expect(notes()).toEqual([]);
    writeSlide(deck, { "table:a": { columns: ["hop", "barrier"], rows: [["Path A", "0.52 eV"]] } });
    expect(notes()).toEqual([]);
    await app.close();
  });

  it("run a file table's hook again when only the file changes", async () => {
    const { root, deck } = workspaceDir();
    writeFile(deck, "a.table.json", { columns: ["gas"], rows: [["co2"]] });
    writeSlide(deck, { "table:a": { src: "a.table.json" } });
    const app = new FolioApp(loadConfig(root));
    const service = new HookService(app);
    const store = [...app.workspace.decks.values()][0]!;
    service.start();
    const output = () => slotTrace(store, "s001", "table:a").trace?.inputs;
    const until = async (want: unknown) => {
      for (let i = 0; i < 100 && JSON.stringify(output()) !== JSON.stringify(want); i += 1) await new Promise((r) => setTimeout(r, 100));
      return output();
    };
    expect(await until({ columns: ["gas"], rows: [["co2"]] })).toEqual({ columns: ["gas"], rows: [["co2"]] });
    await new Promise((r) => setTimeout(r, 300));
    writeFile(deck, "a.table.json", { columns: ["gas"], rows: [["h2o"]] });
    expect(await until({ columns: ["gas"], rows: [["h2o"]] })).toEqual({ columns: ["gas"], rows: [["h2o"]] });
    service.close();
    await app.close();
  }, 20_000);
});
