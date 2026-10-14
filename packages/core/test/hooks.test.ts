import { describe, expect, it } from "vitest";
import {
  buildCatalog, checkHookOutput, hookCacheKey, hookedTableOf, hookedTextOf, hookSlotProblems, hookWarnings, loadHookDef, loadPack,
  makeSlideSpec, parseHookStdout, slideContentWarnings, slotHookKey, slotKind, type HookDef, type RunRecord,
} from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const where = { deck: "d", slide: "s001" };

const packJson = {
  name: "text-hooks",
  version: 1,
  canvas: { w: 960, h: 540, unit: "pt" },
  roles: { title: { size: 20, lineHeight: 1.2 }, body: { size: 14, lineHeight: 1.2 } },
  tables: { plain: { size: 12, lineHeight: 1.2, cellPad: [2, 4, 2, 4], rule: { color: "#000", width: 0.5 } } },
  backgrounds: { plain: { fill: "#fff", ink: "#000" } },
  layouts: {
    notes: {
      background: "plain",
      description: "A note whose text a hook rewrites.",
      slots: {
        title: { role: "title", box: [20, 10, 920, 30], lines: 1 },
        note: { role: "body", box: [20, 60, 920, 100], lines: 3, hook: "chem" },
        "fig:a": { role: "figure", box: [20, 200, 300, 200], hook: "plot" },
        "table:a": { role: "table", box: [400, 200, 300, 200], tableStyle: "plain", hook: "gases" },
      },
    },
  },
  rules: { maxChars: { body: 10 } },
};
const loaded = loadPack(packJson);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack = loaded.pack;

const def = (json: object): HookDef => {
  const r = loadHookDef({ name: "x", command: ["t.py"], ...json });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.hook;
};
const hooks = { chem: def({ name: "chem", output: "text", description: "subscripts" }), plot: def({ name: "plot", inputs: { type: "object" } }), gases: def({ name: "gases", output: "table" }) };
const stamp = { name: "chem", version: 1, scriptHash: "abc" };
const slot = { name: "note", role: "body", w: 920, h: 100 };

describe("hook.json output", () => {
  it("defaults to figure and needs inputs only for a figure", () => {
    expect(def({ inputs: {} }).output).toBe("figure");
    expect(loadHookDef({ name: "x", command: ["t.py"] })).toEqual({ ok: false, problems: ["inputs: a figure hook needs an inputs JSON Schema"] });
    expect(def({ output: "text" }).inputs).toEqual({});
    expect(def({ output: "table" }).output).toBe("table");
    expect(loadHookDef({ name: "x", command: ["t.py"], output: "html" }).ok).toBe(false);
  });
  it("maps roles to slot kinds", () => {
    expect([slotKind("figure"), slotKind("table"), slotKind("body"), slotKind("title")]).toEqual(["figure", "table", "text", "text"]);
  });
});

describe("pack load refuses a hook of the wrong kind", () => {
  it("names slot, hook and both kinds", () => {
    expect(hookSlotProblems(pack, hooks)).toEqual([]);
    const swapped = { chem: hooks.plot, plot: hooks.gases, gases: hooks.chem };
    expect(hookSlotProblems(pack, swapped)).toEqual([
      'layouts.notes.slots.note.hook: hook "chem" makes a figure, but note is a text slot (role body); name a hook with "output": "text"',
      'layouts.notes.slots.fig:a.hook: hook "plot" makes a table, but fig:a is a figure slot (role figure); name a hook with "output": "figure"',
      'layouts.notes.slots.table:a.hook: hook "gases" makes a text, but table:a is a table slot (role table); name a hook with "output": "table"',
    ]);
  });
  it("names a hook the pack lacks", () => {
    expect(hookSlotProblems(pack, { plot: hooks.plot, gases: hooks.gases })[0]).toMatch(/^layouts\.notes\.slots\.note\.hook: hook "chem" is not in hooks\//);
  });
});

describe("the cache key", () => {
  it("keeps a figure's key as it was", () => {
    const inputs = { series: [1, 2] };
    expect(slotHookKey("figure", inputs, { name: "fig:a", role: "figure", w: 300, h: 200 }, 200, stamp)).toBe(hookCacheKey(inputs, { w: 300, h: 200, dpi: 200 }, stamp));
  });
  it("changes with the text, the hook's code and the box, and with nothing else", () => {
    const key = slotHookKey("text", "CO2", slot, 200, stamp);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(slotHookKey("text", "CO2", slot, 72, stamp)).toBe(key);
    expect(slotHookKey("text", "CO2 ", slot, 200, stamp)).not.toBe(key);
    expect(slotHookKey("text", "CO2", slot, 200, { ...stamp, scriptHash: "abd" })).not.toBe(key);
    expect(slotHookKey("text", "CO2", { ...slot, h: 120 }, 200, stamp)).not.toBe(key);
    expect(slotHookKey("table", "CO2", slot, 200, stamp)).not.toBe(key);
  });
});

describe("the hook response", () => {
  it("reads warning lines and the last response line, skipping other output", () => {
    const out = parseHookStdout('debug print\n{"warning": "odd formula", "field": "text"}\n{"text": "CO_{2}"}\n');
    expect(out).toEqual({ warnings: [{ warning: "odd formula", field: "text" }], response: { text: "CO_{2}" } });
    expect(parseHookStdout("nothing\n").response).toBeUndefined();
  });
  it("accepts a text and refuses a missing one", () => {
    expect(checkHookOutput("text", { text: "CO_{2}", extra: 1 })).toEqual({ ok: true, output: { text: "CO_{2}" } });
    expect(checkHookOutput("text", undefined)).toEqual({ ok: false, reason: 'it printed no {"text": "..."} line' });
    expect(checkHookOutput("text", { text: 3 }).ok).toBe(false);
  });
  it("accepts a plain {columns, rows} table and refuses ragged rows", () => {
    const table = { columns: ["gas", "uptake"], rows: [["CO_{2}", "2.1"], ["N_{2}", "0.3"]] };
    expect(checkHookOutput("table", table)).toEqual({ ok: true, output: table });
    expect(checkHookOutput("table", { columns: ["a", "b"], rows: [["x"]] })).toEqual({ ok: false, reason: 'its table is not {"columns": [...], "rows": [[...]]}: rows.0: row 1 has 1 cells; the table has 2 columns ("a", "b"), so every row has 2 cells' });
    expect(checkHookOutput("table", { columns: ["a"], rows: [[1]] }).ok).toBe(false);
    expect(checkHookOutput("table", { rows: [] }).ok).toBe(false);
  });
  it("turns an unusable output into FOLIO-HOOK-012", () => {
    const record: RunRecord = { key: "k", kind: "text", hook: "chem", stamp: "chem@1:abc", deck: "d", slide: "s001", slot: "note", inputs: "CO2", status: "output", exit: 0, seconds: 0.1, stderrTail: "", warnings: [], detail: 'it printed no {"text": "..."} line', at: AT };
    const [w] = hookWarnings(record, { ...where, slot: "note" }, AT);
    expect(w?.code).toBe("FOLIO-HOOK-012");
    expect(w?.message).toContain('it printed no {"text": "..."} line');
  });
  it("names the cost and the fix for an unconfigured runtime (FOLIO-HOOK-006)", () => {
    const record: RunRecord = { key: "k", kind: "text", hook: "chem", stamp: "chem@1:abc", deck: "d", slide: "s001", slot: "note", inputs: "CO2", status: "runtime", exit: null, seconds: 0, stderrTail: "", warnings: [], detail: "python", at: AT };
    const [w] = hookWarnings(record, { ...where, slot: "note" }, AT);
    expect(w?.code).toBe("FOLIO-HOOK-006");
    expect(w?.message).toContain("until it is, each hooked slot falls back to what it was given as written (a text slot shows its raw text)");
    expect(w?.message).toContain('Add it to folio.local.toml beside folio.toml: [runtimes] python = "<path to a Python 3 with matplotlib>"');
  });
});

describe("what a hooked text slot shows", () => {
  const cached = { input: "CO2", output: { text: "CO_{2}" } };
  it("shows the output made from this raw text", () => {
    expect(hookedTextOf("CO2", cached)).toBe("CO_{2}");
  });
  it("falls back to the raw text before the first run, while running on a new text, and after a failure", () => {
    expect(hookedTextOf("CO2", null)).toBe("CO2");
    expect(hookedTextOf("H2O", cached)).toBe("H2O");
    expect(hookedTextOf("CO2", { input: "CO2", output: { columns: [] } })).toBe("CO2");
  });
  it("measures the output, not the raw text, against maxChars", () => {
    const spec = makeSlideSpec("notes", { note: "short" });
    expect(slideContentWarnings(where, spec, pack, AT).map((w) => w.code)).toEqual([]);
    const long = { note: { input: "short", output: { text: "a much longer text" } } };
    expect(slideContentWarnings(where, spec, pack, AT, long).map((w) => w.code)).toEqual(["FOLIO-TXT-001"]);
  });
});

describe("what a hooked table slot shows", () => {
  const raw = { columns: ["gas"], rows: [["CO2"]] };
  const cached = { input: raw, output: { columns: ["gas"], rows: [["CO_{2}"]] } };
  it("shows the hook's table made from these rows, whatever the key order or tableStyle", () => {
    expect(hookedTableOf({ rows: [["CO2"]], columns: ["gas"], tableStyle: "plain" }, cached, false)).toEqual(cached.output);
  });
  it("falls back to the raw rows when they changed, before the first run, or when the output is no table", () => {
    expect(hookedTableOf({ columns: ["gas"], rows: [["N2"]] }, cached, true)).toBeNull();
    expect(hookedTableOf(raw, null, true)).toBeNull();
    expect(hookedTableOf(raw, { input: raw, output: { text: "x" } }, true)).toBeNull();
  });
  it("trusts the server for a {src} table", () => {
    const fromFile = { input: raw, output: cached.output };
    expect(hookedTableOf({ src: "gases.table.json" }, fromFile, true)).toEqual(cached.output);
    expect(hookedTableOf({ src: "gases.table.json" }, fromFile, false)).toBeNull();
  });
});

describe("catalog.prompt()", () => {
  it("tells agents which text slots a hook rewrites", () => {
    const prompt = buildCatalog(pack, hooks).prompt();
    expect(prompt).toContain('- `note` (body, 14 pt, at most 3 lines, at most 10 characters). Hook "chem" rewrites this text before it is shown; write the plain text, the slide keeps it as written (subscripts)');
    expect(prompt).not.toMatch(/`title`[^\n]*Hook/);
  });
});
