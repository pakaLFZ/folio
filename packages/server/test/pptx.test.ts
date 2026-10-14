import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { makeSlideSpec } from "@folio/core";
import { loadPackDir } from "../src/workspace.js";
import { emu } from "../src/pptx/parts.js";
import { isBlockPictureSlot, pictureDescription, textRuns, writeDeckPptx } from "../src/pptx/deck.js";
import { htmlToMarkup } from "../src/pptx.js";

const root = join(import.meta.dirname, "../../..");
const packDir = join(root, "templates/lectern");
const loaded = loadPackDir(packDir);
if (!loaded.ok) throw new Error(loaded.problems.join("; "));
const pack = loaded.loaded.pack;
const xml = (files: Record<string, Uint8Array>, path: string) => strFromU8(files[path]!);

describe("deck PowerPoint writer", () => {
  it("writes editable list paragraphs with level, indent and restart", () => {
    const slide = makeSlideSpec('plot-table', { caption: '- first\n  - child\n4. one\n7. two\nplain\n9. again' });
    const part = xml(unzipSync(writeDeckPptx(pack, packDir, root, [{ id: 's001', spec: slide }]).bytes), 'ppt/slides/slide1.xml');
    expect(part).toContain('<a:buChar char="•"/>');
    expect(part).toContain('<a:buChar char="–"/>');
    expect(part).toContain('lvl="1"');
    expect(part).toContain('indent="-');
    expect(part.match(/<a:buAutoNum type="arabicPeriod" startAt="1"\/>/g)).toHaveLength(2);
    expect(part).toContain('<a:buAutoNum type="arabicPeriod" startAt="2"/>');
    expect(part).not.toContain('xml:space="preserve">- first');
  });
  it("converts pt to EMU exactly", () => {
    expect(emu(1)).toBe(12700);
    expect(emu(960)).toBe(12192000);
  });
  it("builds native bold and script runs without autofit", () => {
    const runs = textRuns("A **bold** X_{2} Y^{3}", pack, pack.roles.body!, "#000000");
    expect(runs).toContain(' b="1"');
    expect(runs).toContain('baseline="-25000"');
    expect(runs).toContain('baseline="30000"');
    expect(runs).toContain("<a:t xml:space=\"preserve\">bold</a:t>");
  });
  it("writes every mixed character run with editable properties", () => {
    const runs = textRuns("A [[size=24;color=magenta;font=Liberation Sans;bold;italic;underline;strike;sup;highlight=#ffee00|B]] C", pack, pack.roles.body!, "#000000");
    expect(runs.match(/<a:r>/g)).toHaveLength(3);
    expect(runs).toContain('sz="2400"');
    expect(runs).toContain('b="1" i="1" u="sng" strike="sngStrike" baseline="30000"');
    expect(runs).toContain('<a:highlight>');
    expect(runs).toContain('typeface="Liberation Sans"');
  });
  it("links slides to layouts and writes an editable table", () => {
    const layout = Object.entries(pack.layouts).find(([, l]) => Object.values(l.slots).some((s) => s.role === "table"));
    if (!layout) throw new Error("fixture pack has no table layout");
    const [name, definition] = layout;
    const table = Object.entries(definition.slots).find(([, s]) => s.role === "table")![0];
    const slide = makeSlideSpec(name, { [table]: { columns: ["A", "B"], rows: [["one", "two"]] } });
    const result = writeDeckPptx(pack, packDir, root, [{ id: "s001", spec: slide }]);
    const files = unzipSync(result.bytes);
    const part = xml(files, "ppt/slides/slide1.xml");
    expect(part).toContain("<a:tbl>");
    expect(part).toContain("<p:xfrm>");
    expect(part).toContain("one");
    expect(xml(files, "ppt/presentation.xml")).toContain("<p:sldId ");
    expect(xml(files, "ppt/slides/_rels/slide1.xml.rels")).toContain("slideLayout");
    expect(xml(files, "[Content_Types].xml")).toContain("presentationml.slide+xml");
    expect(result.approximations).toEqual([]);
  });
  it("leaves a draft shape out of the slide and reports it, keeping a final one", () => {
    const slide = makeSlideSpec("blank", {
      overrides: { slots: { "shape:a": { role: "shape", box: [100, 120, 200, 80], draft: true }, "shape:b": { role: "shape", box: [100, 220, 200, 80] } } },
      "shape:a": { kind: "rect", text: "DRAFTBOX" },
      "shape:b": { kind: "rect", text: "FINALBOX" },
    });
    const result = writeDeckPptx(pack, packDir, root, [{ id: "s001", spec: slide }]);
    const part = xml(unzipSync(result.bytes), "ppt/slides/slide1.xml");
    expect(part).not.toContain("DRAFTBOX");
    expect(part).toContain("FINALBOX");
    expect(result.drafts).toEqual([{ slide: "s001", slot: "shape:a" }]);
  });
  it("embeds a rendered figure as a picture and lists the approximation", () => {
    const layout = Object.entries(pack.layouts).find(([, l]) => Object.values(l.slots).some((s) => s.role === "figure"))!;
    const figure = Object.entries(layout[1].slots).find(([, s]) => s.role === "figure")![0];
    const slide = makeSlideSpec(layout[0], { [figure]: { hook: "plot", inputs: {} } });
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=", "base64"));
    const result = writeDeckPptx(pack, packDir, root, [{ id: "s002", spec: slide }], { [`s002/${figure}`]: { png } });
    const files = unzipSync(result.bytes);
    expect(xml(files, "ppt/slides/slide1.xml")).toContain("<p:pic>");
    expect(Object.keys(files).some((p) => p.startsWith("ppt/media/deck-s002-"))).toBe(true);
    expect(xml(files, "ppt/slides/_rels/slide1.xml.rels")).toContain("/image");
    expect(result.approximations).toEqual([{ slide: "s002", slot: figure, reason: "rendered figure" }]);
  });
  it("selects code and text blocks for pictures while keeping ordinary slots native", () => {
    expect(["block", "title", "body", "table", "shape", "figure"].filter((role) => isBlockPictureSlot({ role }))).toEqual(["block"]);
  });
  it("escapes picture descriptions without losing code line breaks or indentation", () => {
    expect(pictureDescription('a & <b> "x"\n\treturn 1')).toBe('a &amp; &lt;b&gt; &quot;x&quot;&#10;&#9;return 1');
  });
  it.each(["code", "card"])("writes a %s block in its appropriate editable form", (style) => {
    const content = 'print("A&B < C")\n  return 1';
    const slide = makeSlideSpec("blank", { overrides: { slots: { "block:a": { role: "block", box: [60, 100, 400, 200], style } } }, "block:a": style === "code" ? { code: content, language: "python" } : content });
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=", "base64"));
    const result = writeDeckPptx(pack, packDir, root, [{ id: "s003", spec: slide }], { "s003/block:a": { png, text: content, box: [60, 100, 400, 80] } });
    const part = xml(unzipSync(result.bytes), "ppt/slides/slide1.xml");
    if (style === "code") expect(part).toContain(`<p:pic><p:nvPicPr><p:cNvPr id="2" name="block:a" descr="${pictureDescription(content)}"/>`);
    else expect(part).toContain('name="block:a"');
    expect(part).toContain(`<a:ext cx="${emu(400)}" cy="${emu(80)}"/>`);
    if (style === "code") expect(result.approximations).toEqual([{ slide: "s003", slot: "block:a", reason: "rendered block" }]);
    else { expect(part).toContain('<a:r>'); expect(result.approximations).toEqual([]); }
  });
});

describe("htmlToMarkup", () => {
  it("retains an inline size and italic style around a chemical subscript", () => {
    expect(htmlToMarkup('<span data-run-size="24" data-run-color="magenta"><i>CO<sub>2</sub></i></span>')).toBe('[[size=24;color=magenta;italic|CO_{2}]]');
  });
  it("restores bold, sub- and superscript markup from rendered HTML", () => {
    expect(htmlToMarkup("A <strong>bold</strong> X<sub>2</sub> Y<sup>3</sup>")).toBe("A **bold** X_{2} Y^{3}");
  });
  it("turns a line break into a newline and decodes entities", () => {
    expect(htmlToMarkup("CO<sub>2</sub> &amp; H<br>N<sub>2</sub>")).toBe("CO_{2} & H\nN_{2}");
  });
  it("leaves plain text alone", () => {
    expect(htmlToMarkup("plain text")).toBe("plain text");
  });
});
