import { applySlidePatch, loadPack, makeSlideSpec, slideLayout, type Pack, type SlideSpec } from "@folio/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copyElement, nextElementName, pasteOps, removeOps, sameKind } from "../src/editor/elementClip";

const loaded = loadPack(JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8")));
if (!loaded.ok) throw new Error("pack");
const pack: Pack = loaded.pack;
const props = (spec: SlideSpec) => spec.elements[spec.root]!.props;
const patched = (spec: SlideSpec, ops: Parameters<typeof applySlidePatch>[1]) => {
  const next = applySlidePatch(spec, ops);
  if (!next.ok) throw new Error("patch");
  return next.spec;
};
const table = { columns: ["A", "B"], rows: [["1", "2"]] };
const source = makeSlideSpec("plot-table", { title: "Results", "table:b": table, "fig:a": "plot.svg", overrides: { slots: { "shape:a": { role: "shape", box: [10, 10, 50, 50], draft: true } } }, "shape:a": { kind: "rect" } });

describe("copying an element", () => {
  it("a layout slot gives its content and its slot as the slide shows it", () => {
    const clip = copyElement(pack, source, "table:b")!;
    expect(clip).toMatchObject({ name: "table:b", role: "table", content: table, draft: false });
    expect(clip.slot.box).toEqual(slideLayout(pack, "plot-table", props(source))!.slots["table:b"]!.box);
    expect(clip.slot).not.toHaveProperty("below");
  });
  it("an added slot gives its override and prop, the draft flag kept apart", () => {
    expect(copyElement(pack, source, "shape:a")).toEqual({ name: "shape:a", role: "shape", slot: { role: "shape", box: [10, 10, 50, 50] }, content: { kind: "rect" }, draft: true, pack: "lectern" });
  });
});

describe("pasting", () => {
  const target = makeSlideSpec("summary-table", { title: "Other", "table:a": { columns: ["X"], rows: [["9"]] } });
  it("onto a selected slot of the same kind replaces its content", () => {
    const { name, ops } = pasteOps(pack, target, copyElement(pack, source, "table:b")!, "table:a", null);
    expect(name).toBe("table:a");
    expect(props(patched(target, ops))["table:a"]).toEqual(table);
    expect(sameKind("title", "note")).toBe(true);
    expect(sameKind("figure", "table")).toBe(false);
  });
  it("with nothing selected, or onto another kind, adds the next free slot 12 pt along", () => {
    const clip = copyElement(pack, source, "table:b")!;
    const { name, ops } = pasteOps(pack, target, clip, "title", null);
    const after = props(patched(target, ops));
    expect(name).toBe("table:b");
    const box = clip.slot.box as number[];
    expect((after.overrides as { slots: Record<string, { box: number[] }> }).slots["table:b"]!.box).toEqual([box[0]! + 12, box[1]! + 12, box[2], box[3]]);
    expect(after["table:b"]).toEqual(table);
  });
  it("at a right-click point, a text copy becomes a text box, a draft stays a draft", () => {
    const title = pasteOps(pack, target, copyElement(pack, source, "title")!, null, [300, 200]);
    const slot = (props(patched(target, title.ops)).overrides as { slots: Record<string, { box: number[]; role: string }> }).slots[title.name]!;
    expect([title.name, slot.role, slot.box.slice(0, 2)]).toEqual(["text:a", "title", [300, 200]]);
    const shape = pasteOps(pack, target, copyElement(pack, source, "shape:a")!, null, null);
    expect((props(patched(target, shape.ops)).overrides as { slots: Record<string, { draft?: boolean }> }).slots["shape:a"]!.draft).toBe(true);
    expect(nextElementName("fig", ["fig:a", "fig:b"])).toBe("fig:c");
  });
});

describe("blocks", () => {
  it("a pasted block keeps its style, content and draft status", () => {
    const from = makeSlideSpec("summary-table", { overrides: { slots: { "block:a": { role: "block", style: "callout", box: [40, 60, 300, 80], draft: true } } }, "block:a": "Note" });
    const clip = copyElement(pack, from, "block:a")!;
    const to = makeSlideSpec("plot-note", { title: "T" });
    const { name, ops } = pasteOps(pack, to, clip, "title", null);
    const after = props(patched(to, ops));
    expect(name).toBe("block:a");
    expect((after.overrides as { slots: Record<string, unknown> }).slots["block:a"]).toEqual({ role: "block", style: "callout", box: [52, 72, 300, 80], draft: true });
    expect(after["block:a"]).toBe("Note");
  });
});

describe("deleting", () => {
  it("an added slot goes; a layout slot is only cleared", () => {
    const added = removeOps(pack, source, "shape:a");
    expect(added.cleared).toBe(false);
    expect(props(patched(source, added.ops))).not.toHaveProperty("overrides");
    const layout = removeOps(pack, source, "fig:a");
    expect(layout.cleared).toBe(true);
    expect(props(patched(source, layout.ops))).not.toHaveProperty("fig:a");
  });
});
