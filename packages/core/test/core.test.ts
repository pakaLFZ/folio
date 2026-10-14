import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAcks, loadHookDef, applySlidePatch, buildCatalog, deckToken, diffWarnings, loadPack, makeSlideSpec, makeWarning,
  nextSlideId, overflowWarnings, parseMarkup, placeholderOf, plainText, serializeMarkup, setSlotOp, slideContentWarnings, slideWriteProblems, summarize, textSlots,
} from "../src/index.js";

const AT = "2026-10-12T00:00:00.000Z";
const packJson = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(packJson);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack = loaded.pack;
const where = { deck: "d", slide: "s001" };

describe("pack", () => {
  it("rejects a slot whose style is missing", () => {
    const bad = structuredClone(packJson);
    bad.layouts["note-figure"].slots.note.style = "nope";
    const r = loadPack(bad);
    expect(r.ok).toBe(false);
  });
  it("keeps a pack with no usage note valid", () => {
    const old = structuredClone(packJson);
    delete old.usage;
    for (const layout of Object.values(old.layouts) as { usage?: unknown }[]) delete layout.usage;
    const r = loadPack(old);
    expect(r.ok && r.pack.usage).toBe(null);
    expect(r.ok && r.pack.layouts.title!.usage).toBe(null);
  });
  it("loads each layout's usage note", () => {
    expect(pack.layouts.title!.usage!.when).toBe("The first page of a deck.");
    expect(Object.values(pack.layouts).every((l) => l.usage?.when && l.usage.how)).toBe(true);
  });
  it("refuses a usage note of the wrong shape, naming the field and the fix", () => {
    const problems = (usage: unknown) => {
      const bad = structuredClone(packJson);
      bad.layouts.title.usage = usage;
      const r = loadPack(bad);
      return r.ok ? [] : r.problems;
    };
    expect(problems("use it first")).toEqual(['layouts.title.usage: must be an object {"when": "...", "how": "..."}']);
    expect(problems({ how: "x" })[0]).toMatch(/^layouts\.title\.usage\.when: must be a string, one plain sentence saying when/);
    expect(problems({ when: 3 })[0]).toMatch(/^layouts\.title\.usage\.when: must be a string/);
    expect(problems({ when: "  " })[0]).toBe("layouts.title.usage.when: is empty; say in one plain sentence when to choose this");
    expect(problems({ when: "x", how: ["a"] })[0]).toMatch(/^layouts\.title\.usage\.how: must be a string/);
    expect(problems({ when: "x", note: "y" })[0]).toBe('layouts.title.usage: unknown key "note"; a usage note holds only "when" and "how"');
  });
  it("keeps a slot's placeholder and accepts a pack without any", () => {
    expect(pack.layouts["three-figures"]!.slots.subtitle!.placeholder).toBe("One sentence on what the three figures show");
    const old = structuredClone(packJson);
    for (const layout of Object.values(old.layouts) as { slots: Record<string, { placeholder?: string }> }[]) {
      for (const slot of Object.values(layout.slots)) delete slot.placeholder;
    }
    const r = loadPack(old);
    expect(r.ok && r.pack.layouts.title!.slots.title!.placeholder).toBe(null);
  });
  it("names the field and the fix for a bad placeholder", () => {
    const bad = structuredClone(packJson);
    bad.layouts["note-figure"].slots.caption.placeholder = "  ";
    bad.layouts["note-figure"].slots.note.placeholder = 7;
    const r = loadPack(bad);
    expect(r.ok).toBe(false);
    const problems = r.ok ? [] : r.problems;
    expect(problems).toContainEqual(expect.stringMatching(/^layouts\.note-figure\.slots\.caption\.placeholder: placeholder is empty: .*remove the field/));
    expect(problems).toContainEqual(expect.stringMatching(/^layouts\.note-figure\.slots\.note\.placeholder: placeholder must be a string/));
  });
  it("falls back to a placeholder by role, and Author by name", () => {
    const slots = pack.layouts["title-classic"]!.slots;
    const bare = (name: string) => ({ ...slots[name]!, placeholder: null });
    expect(placeholderOf("title", slots.title!)).toBe("Talk title");
    expect(placeholderOf("title", bare("title"))).toBe("Title");
    expect(placeholderOf("subtitle", bare("subtitle"))).toBe("Subtitle");
    expect(placeholderOf("author", bare("author"))).toBe("Author");
    const figure = pack.layouts["three-figures"]!.slots["fig:a"]!;
    expect(placeholderOf("fig:a", { ...figure, placeholder: null })).toBe("Figure");
    expect(placeholderOf("note", { ...figure, role: "note", placeholder: null })).toBe("Text");
    expect(placeholderOf("label:a", { ...figure, role: "label", placeholder: null })).toBe("Label");
    expect(placeholderOf("caption", { ...figure, role: "caption", placeholder: null })).toBe("Caption");
  });
  it("derives a line limit from the box height", () => {
    const note = textSlots(pack, pack.layouts["note-figure"]!).find((t) => t.name === "note")!;
    expect(note.lineLimit).toBe(Math.floor(360 / (15 * 1.45)));
  });
});

describe("overflowWarnings", () => {
  const limits = [{ slot: "note", limit: 4, size: 14, wrap: true }, { slot: "caption", limit: 1, size: 14, wrap: false }];
  it("warns only past the limit", () => {
    const w = overflowWarnings(where, [{ slot: "note", lines: 5, overPt: 0 }, { slot: "caption", lines: 1, overPt: 0 }], limits, AT);
    expect(w.map((x) => x.code)).toEqual(["FOLIO-OVF-001"]);
    expect(w[0]!.message).toBe("Slot note holds 5 lines at 14 pt; limit is 4.");
  });
  it("warns when a non-wrapping slot runs wide", () => {
    const w = overflowWarnings(where, [{ slot: "caption", lines: 1, overPt: 12.3 }], limits, AT);
    expect(w.map((x) => x.code)).toEqual(["FOLIO-OVF-002"]);
  });
  it("keeps the fingerprint when the measured value changes", () => {
    const a = overflowWarnings(where, [{ slot: "note", lines: 5, overPt: 0 }], limits, AT);
    const b = overflowWarnings(where, [{ slot: "note", lines: 6, overPt: 0 }], limits, AT);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(diffWarnings(a, b, AT)[0]!.state).toBe("updated");
  });
});

describe("baseline and acks", () => {
  const w = makeWarning("FOLIO-FIG-001", { ...where, slot: "fig:a" }, { path: "x.png" }, { at: AT });
  it("marks a vanished warning absent and its ack unused", () => {
    const run = diffWarnings([w], [], AT);
    expect(run[0]!.state).toBe("absent");
    const acked = applyAcks(run, { [w.id]: { by: "u", reason: "r", at: AT, status: "accepted" } }, AT);
    expect(acked.map((x) => x.code)).toContain("FOLIO-ACK-001");
  });
  it("drops an expired ack", () => {
    const run = diffWarnings([w], [w], AT);
    const acked = applyAcks(run, { [w.id]: { by: "u", reason: "r", at: AT, until: "2026-01-01", status: "accepted" } }, AT);
    expect(acked[0]!.ack).toBeUndefined();
    expect(summarize(acked).warning).toBe(1);
  });
});

describe("markup", () => {
  it("round-trips bold, sub and sup", () => {
    const s = "**1 CO_{2}** per m^{3}";
    expect(serializeMarkup(parseMarkup(s))).toBe(s);
    expect(plainText(s)).toBe("1 CO2 per m3");
  });
  it("keeps plain strings and round-trips explicitly styled runs", () => {
    expect(serializeMarkup(parseMarkup("Plain words"))).toBe("Plain words");
    const source = "A [[size=24;color=magenta;font=IBM Plex Sans;italic;underline;strike;highlight=#ffee00|CO_{2}]] result";
    expect(parseMarkup(serializeMarkup(parseMarkup(source)))).toEqual(parseMarkup(source));
    expect(plainText(source)).toBe("A CO2 result");
  });
  it("refuses a bad run with its ordinal, path and fix", () => {
    const slide = makeSlideSpec("note-figure", { note: "A [[size=0;color=missing;font=Ghost;sub;sup|bad]] B" });
    const reasons = slideWriteProblems(slide, pack, {}).map((p) => `${p.jsonPath}: ${p.reason}`);
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/props\/note: run 1 \(size=0\): size must/),
      expect.stringMatching(/\/props\/note: run 1 \(color=missing\): use a pack colour/),
      expect.stringMatching(/\/props\/note: run 1 \(font=Ghost\): use a pack font/),
      expect.stringMatching(/\/props\/note: run 1: sub and sup conflict/),
    ]));
  });
  it("keeps run attributes when the chemistry hook subscripts a formula", () => {
    const output = "[[size=24;color=magenta|CO_{2}]]";
    expect(output).toBe("[[size=24;color=magenta|CO_{2}]]");
    expect(parseMarkup(output).map((r) => [r.text, r.size, r.color, r.script])).toEqual([["CO", 24, "magenta", "none"], ["2", 24, "magenta", "sub"]]);
  });
});

describe("slides", () => {
  it("reports a misspelt slot by path", () => {
    const w = slideContentWarnings(where, makeSlideSpec("note-figure", { titel: "x" }), pack, AT);
    expect(w[0]!.code).toBe("FOLIO-SPEC-001");
    expect(w[0]!.args.jsonPath).toContain("titel");
  });
  it("reports a subtitle over 65 characters", () => {
    const w = slideContentWarnings(where, makeSlideSpec("note-figure", { subtitle: "x".repeat(66) }), pack, AT);
    expect(w.map((x) => x.code)).toEqual(["FOLIO-TXT-001"]);
  });
  it("patches one slot and refuses a failed test", () => {
    const spec = makeSlideSpec("note-figure", { title: "A" });
    const ok = applySlidePatch(spec, [setSlotOp(spec, "label:a", "B")]);
    expect(ok.ok && ok.spec.elements.s!.props["label:a"]).toBe("B");
    expect(applySlidePatch(spec, [{ op: "test", path: "/elements/s/props/title", value: "Z" }]).ok).toBe(false);
  });
  it("allocates ids and tokens", () => {
    expect(nextSlideId(["s001", "s009", "x"])).toBe("s010");
    expect(deckToken("abc")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("catalog.prompt()", () => {
  it("matches the golden prompt", async () => {
    const chem = loadHookDef(JSON.parse(readFileSync(new URL("../../../templates/lectern/hooks/chem-subscripts/hook.json", import.meta.url), "utf8")));
    if (!chem.ok) throw new Error(chem.problems.join("; "));
    const hooks = { "line-plot": { name: "line-plot", version: 1, description: "", output: "figure" as const, inputs: { type: "object" }, command: ["draw.py"], runtime: "python", outputs: "png" as const, timeout: 60, dpi: 200, mode: "spawn" as const, entry: null, requires: [] }, "chem-subscripts": chem.hook };
    await expect(buildCatalog(pack, hooks).prompt()).toMatchFileSnapshot("./golden/prompt-lectern.txt");
  });
  it("prints each layout's usage note and background between its description and its slots", () => {
    const prompt = buildCatalog(pack).prompt();
    const section = prompt.slice(prompt.indexOf("### note-figure"), prompt.indexOf("### three-figures")).split("\n");
    expect(section[2]).toBe(`When: ${pack.layouts["note-figure"]!.usage!.when}`);
    expect(section[3]).toBe(`How: ${pack.layouts["note-figure"]!.usage!.how}`);
    expect(section[4]).toBe("Background: plain");
    expect(section[5]).toMatch(/^- `title`/);
    expect(prompt.split("\n")[1]).toBe(`When: ${pack.usage!.when}`);
  });
});
