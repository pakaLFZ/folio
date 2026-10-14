import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySlidePatch, blockAdd, codeColumnSizes, blockLines, blockRemove, blockValueProblems, CODE_LANGUAGES, isLight, loadPack, makeSlideSpec, resolveBlock, slideLayout,
  slideOverflowWarnings, slideRoot, slideWriteRefusal, SYNTAX_DEFAULTS, type Pack, type RefinedSlot, type SlideSpec,
} from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const raw = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(raw);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const patched = (spec: SlideSpec, edit: { ok: boolean; ops?: unknown[] }) => {
  const result = applySlidePatch(spec, (edit.ok ? edit.ops : []) as Parameters<typeof applySlidePatch>[1]);
  if (!result.ok) throw new Error(result.reason);
  return result.spec;
};
const plainRaw = JSON.parse(readFileSync(new URL("../../server/packs/plain/pack.json", import.meta.url), "utf8"));

const slide = (value: unknown, slot: Record<string, unknown> = {}): SlideSpec =>
  makeSlideSpec("blank", { overrides: { slots: { "block:a": { role: "block", box: [60, 100, 400, 200], style: "card", ...slot } } }, ...(value === undefined ? {} : { "block:a": value }) });
const refusal = (value: unknown, slot: Record<string, unknown> = {}) => slideWriteRefusal(pack, {}, null, slide(value, slot));
const slotOf = (spec: SlideSpec) => slideLayout(pack, "blank", slideRoot(spec)!.props)!.slots["block:a"] as RefinedSlot;
const drawn = (value: unknown, slot: Record<string, unknown> = {}, ink = "#000000", on: Pack = pack) => resolveBlock(on, slotOf(slide(value, slot)), value, ink);
const withoutSyntax = structuredClone(raw);
delete withoutSyntax.blocks.code.syntax;
const loadedWithoutSyntax = loadPack(withoutSyntax);
if (!loadedWithoutSyntax.ok) throw new Error(loadedWithoutSyntax.problems.join("\n"));
const packWithoutSyntax: Pack = loadedWithoutSyntax.pack;
const problemsOf = (edit: (p: typeof raw) => void) => {
  const bad = structuredClone(raw);
  edit(bad);
  const result = loadPack(bad);
  return result.ok ? [] : result.problems;
};

describe("block styles in the packs", () => {
  it("both packs ship card, callout and code, and load with them", () => {
    expect(Object.keys(pack.blocks)).toEqual(["card", "callout", "code"]);
    const plain = loadPack(plainRaw);
    expect(plain.ok && Object.keys(plain.pack.blocks)).toEqual(["card", "callout", "code"]);
  });
  it("fills every field from the style and its defaults", () => {
    expect(drawn("Hello")).toMatchObject({ kind: "text", fill: "#FFFFFF", padding: 14, columns: 2, grow: true, content: "Hello", border: { color: "#CFCBC2", width: 0.75, side: "all", dash: "solid" } });
    expect(drawn("x", { style: "callout" })).toMatchObject({ fill: "#FBECE6", border: { color: "#C23A1E", width: 2, side: "top" }, columns: 1 });
  });
  it("lets the slide's block fields win over the named style, and takes default without a style", () => {
    expect(drawn("x", { block: { columns: 3, fill: "smoke" } })).toMatchObject({ columns: 3, fill: "#F2F1ED", styleName: "card" });
    expect(drawn("x", { style: null })).toMatchObject({ styleName: "default", fill: "none", border: null, columns: 1 });
  });
});

describe("block style refusals", () => {
  it("refuses a bad colour, columns out of range and an unknown key, by path", () => {
    const problems = problemsOf((p) => {
      p.blocks.card.border.color = "navy";
      p.blocks.card.columns = 5;
      p.blocks.callout.shadow = true;
    });
    expect(problems).toEqual(expect.arrayContaining([expect.stringMatching(/^blocks\.card\.columns: columns is a whole number from 1 to 4/), expect.stringMatching(/^blocks\.callout: unknown key "shadow"; a block style is \{/)]));
    expect(problemsOf((p) => void (p.blocks.card.border.color = "navy"))).toEqual([expect.stringMatching(/^blocks\.card\.border\.color: "navy" is not a colour/)]);
  });
  it("takes a code style with columns, and refuses one without a shipped font or with an unknown language", () => {
    expect(problemsOf((p) => void (p.blocks.code.columns = 2))).toEqual([]);
    expect(problemsOf((p) => void (p.blocks.code.text.font = "Fira Code"))).toEqual([expect.stringMatching(/^blocks\.code\.text\.font: a code style names a monospace font the pack ships in "fonts" \(fonts: IBM Plex Sans, IBM Plex Serif, IBM Plex Mono\)/)]);
    expect(problemsOf((p) => void (p.blocks.code.language = "kotlin"))).toEqual([expect.stringMatching(/^blocks\.code\.language: "kotlin" is not a code language; languages: python, bash, shell/)]);
  });
  it("refuses a misnamed block slot, an unknown style and a hook on a code block", () => {
    const problems = problemsOf((p) => {
      p.layouts.blank.slots = { card: { role: "block", box: [0, 0, 10, 10] }, "block:b": { role: "block", box: [0, 0, 10, 10], style: "nope" }, "block:c": { role: "block", box: [0, 0, 10, 10], style: "code", hook: "x" } };
    });
    expect(problems).toEqual(expect.arrayContaining([
      'layouts.blank.slots.card: a block slot is named "block:<letter>", like "block:a"; rename the slot',
      'layouts.blank.slots.block:b.style: "nope" is not one of the pack\'s block styles (known: default, card, callout, code)',
      "layouts.blank.slots.block:c.hook: a code block takes no hook (code is shown exactly as written); remove the field",
    ]));
  });
  it("refuses a slide's block fields the style schema refuses, by path under the override", () => {
    expect(slideWriteRefusal(pack, {}, null, slide("x", { block: { columns: 9 } }))).toMatch(/overrides\/slots\/block:a\/block\/columns: columns is a whole number from 1 to 4/);
    expect(slideWriteRefusal(pack, {}, null, slide("x", { block: { fill: "navy" } }))).toMatch(/overrides\/slots\/block:a\/block\/fill: "navy" is not a colour/);
  });
});

describe("block values", () => {
  it("takes text on a text block and code on a code block", () => {
    expect(refusal("**Point**: two columns")).toBeNull();
    expect(refusal("print(1)", { style: "code" })).toBeNull();
    expect(refusal({ code: "fn main() {}", language: "rust" }, { style: "code" })).toBeNull();
  });
  it("refuses code on a text block naming the code styles, and an unknown language naming the list", () => {
    expect(refusal({ code: "x" })).toMatch(/props\/block:a: a text block \(style card\) holds text with markup, .* code goes in a block of a style of kind code \(code\)/);
    expect(refusal({ code: "x", language: "kotlin" }, { style: "code" })).toMatch(/props\/block:a\/language: "kotlin" is not a code language; languages: python, bash, shell, javascript/);
    expect(refusal({ source: "x" }, { style: "code" })).toMatch(/block:a\/source: unknown key "source"/);
  });
  it("covers the popular languages", () => {
    for (const l of ["python", "bash", "javascript", "typescript", "json", "toml", "yaml", "c", "cpp", "rust", "go", "java", "sql", "r", "julia", "fortran", "latex", "markdown", "text"]) expect(CODE_LANGUAGES).toContain(l);
    expect(blockValueProblems("code", "code", { code: "x", language: "python" })).toEqual([]);
  });
  it("defaults code to python, keeps a named language, and colours syntax readable on the fill", () => {
    expect(drawn("x = 1", { style: "code" })).toMatchObject({ kind: "code", language: "python", columns: 1, syntax: raw.blocks.code.syntax, lineNumbers: false });
    expect(drawn("x = 1", { style: "code" }, "#000000", packWithoutSyntax).syntax).toEqual(SYNTAX_DEFAULTS.light);
    expect(drawn("x = 1", { style: "code", block: { columns: 2 } }).columns).toBe(2);
    expect(drawn({ code: "let x = 1;", language: "rust" }, { style: "code" }).language).toBe("rust");
    expect(drawn("x", { style: "code", block: { fill: "#1e1e1e" } }, "#000000", packWithoutSyntax).syntax).toEqual(SYNTAX_DEFAULTS.dark);
    expect(drawn("x", { style: "code", block: { syntax: { keyword: "red" } } }).syntax.keyword).toBe("#C23A1E");
  });
  it("reads text near-black on a light fill, white on a dark fill, and the ink with no fill", () => {
    expect(drawn("x").textStyle.color).toBe("#111111");
    expect(drawn("x", { block: { fill: "#000000" } }, "#000000").textStyle.color).toBe("#FFFFFF");
    expect(drawn("x", { style: null }, "#FFFFFF").textStyle.color).toBe("#FFFFFF");
    expect(isLight("#F5F5F5") && !isLight("#16181D")).toBe(true);
  });
});

describe("code columns", () => {
  it("balances a growing block's lines, ceil(lines / columns) to a column, in order", () => {
    expect(codeColumnSizes(21, 2, null)).toEqual([11, 10]);
    expect(codeColumnSizes(22, 3, null)).toEqual([8, 8, 6]);
    expect(codeColumnSizes(2, 3, null)).toEqual([1, 1, 0]);
  });
  it("fills a fixed block's first column first and lets the last take the rest", () => {
    expect(codeColumnSizes(10, 2, 8)).toEqual([8, 2]);
    expect(codeColumnSizes(22, 2, 8)).toEqual([8, 14]);
  });
});

describe("block overflow", () => {
  const layout = slideLayout(pack, "blank", slideRoot(slide("x"))!.props)!;
  const warn = (block: { heightPt: number; wide: { line: number; overPt: number }[] }, boxPt?: number) => slideOverflowWarnings({ deck: "d", slide: "s1" }, pack, layout, [{ slot: "block:a", lines: 0, overPt: 0, ...(boxPt === undefined ? {} : { boxPt }), block }], AT);
  it("is quiet while the content fits its maximum height", () => {
    expect(warn({ heightPt: 200, wide: [] })).toEqual([]);
  });
  it("warns OVF-006 past the maximum, against the flowed height when there is one", () => {
    expect(warn({ heightPt: 212, wide: [] }).map((w) => w.message)).toEqual(["Block block:a needs 212 pt; its box holds 200 pt."]);
    expect(warn({ heightPt: 150, wide: [] }, 120).map((w) => w.code)).toEqual(["FOLIO-OVF-006"]);
  });
  it("warns OVF-007 once per block naming every code line wider than the box", () => {
    expect(warn({ heightPt: 50, wide: [{ line: 4, overPt: 38 }] })[0]!.message).toBe("Code block block:a: line 4 runs 38 pt past the box; code never wraps.");
    expect(warn({ heightPt: 50, wide: [{ line: 2, overPt: 10 }, { line: 7, overPt: 21.04 }] })[0]!.message).toBe("Code block block:a: lines 2, 7 run up to 21 pt past the box; code never wraps.");
  });
});

describe("folio block add and rm", () => {
  const base = makeSlideSpec("blank", {});
  it("adds the next free block slot and its content in one patch", () => {
    const first = blockAdd(base, pack, { style: "card", box: [60, 100, 400, 200], text: "Hello", columns: 3 });
    expect(first.ok && first.name).toBe("block:a");
    const after = patched(base, first);
    expect(slideWriteRefusal(pack, {}, base, after)).toBeNull();
    const props = slideRoot(after)!.props;
    expect(props["block:a"]).toBe("Hello");
    expect((props.overrides as { slots: Record<string, unknown> }).slots["block:a"]).toEqual({ role: "block", box: [60, 100, 400, 200], style: "card", block: { columns: 3 } });
    const second = blockAdd(after, pack, { style: "code", box: [60, 320, 400, 100], code: "fn main() {}", language: "rust" });
    expect(second.ok && second.name).toBe("block:b");
    expect(second.ok && second.ops.at(-1)).toMatchObject({ value: { code: "fn main() {}", language: "rust" } });
  });
  it("stores code in the style's language as a plain string", () => {
    const edit = blockAdd(base, pack, { style: "code", box: [0, 0, 100, 100], code: "print(1)", language: "python" });
    expect(edit.ok && edit.ops.at(-1)).toMatchObject({ value: "print(1)" });
  });
  it("refuses a bad box, and lets the write check refuse an unknown style by path", () => {
    expect(blockAdd(base, pack, { style: "card", box: [0, 0, 10] })).toMatchObject({ ok: false, reason: expect.stringMatching(/--box is x,y,w,h/) });
    const edit = blockAdd(base, pack, { style: "loud", box: [0, 0, 100, 100] });
    expect(slideWriteRefusal(pack, {}, base, patched(base, edit))).toMatch(/overrides\/slots\/block:a\/style: "loud" is not one of the pack's block styles/);
  });
  it("removes an added block and its content", () => {
    const add = blockAdd(base, pack, { style: "card", box: [0, 0, 100, 100], text: "x" });
    const after = patched(base, add);
    const rm = blockRemove(after, pack, "block:a");
    const gone = patched(after, rm);
    expect(slideRoot(gone)!.props["block:a"]).toBeUndefined();
    expect(blockRemove(gone, pack, "block:a")).toMatchObject({ ok: false });
  });
});

describe("prompt", () => {
  it("lists the pack's block styles, one example command and the languages", () => {
    const lines = blockLines(pack).join("\n");
    expect(lines).toMatch(/folio block add <deck>\/s010 --style card --box/);
    expect(lines).toMatch(/- `card` \(text, 2 columns, grows\): A white card/);
    expect(lines).toMatch(/- `code` \(code, python, grows\)/);
    expect(lines).toMatch(/Languages: python, bash, shell/);
  });
});
