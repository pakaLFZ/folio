import { describe, expect, it } from "vitest";
import { addPdfInfo, dataCandidates, exampleOf, folioTraceValue, isTrace, parseSize, readPdfInfo, regenerateLine, slotHookKey, type TraceRecord } from "../src/index.js";

/** A two-object PDF with a classic xref table, as Chromium writes. */
function tinyPdf(): Uint8Array {
  const objects = ["1 0 obj\n<</Producer (Skia/PDF m151)>>\nendobj\n", "2 0 obj\n<</Type /Catalog>>\nendobj\n"];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objects) offsets.push(body.length), (body += o);
  const xref = body.length;
  body += `xref\n0 3\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<</Size 3\n/Root 2 0 R\n/Info 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

const trace = { trace: 1, key: "0123456789abcdef", kind: "figure", hook: { pack: "lectern", name: "line-plot", version: 1, scriptHash: "x", stamp: "line-plot@1:x", files: {} }, inputs: {}, box: { w: 10, h: 10 }, dpi: 200, format: "png" } as unknown as TraceRecord;

describe("provenance", () => {
  it("converts a size to pt", () => {
    expect(parseSize("120,80", "mm")).toEqual({ ok: true, box: { w: 340.16, h: 226.77 } });
    expect(parseSize("2x1", "in")).toEqual({ ok: true, box: { w: 144, h: 72 } });
    expect(parseSize("0,1", "pt").ok).toBe(false);
    expect(parseSize("1,1", "cm")).toEqual({ ok: false, reason: 'unit "cm" is not one of pt, mm, in' });
  });
  it("lists every one-line string of the inputs as a data candidate", () => {
    expect(dataCandidates({ src: "data/a.csv", series: [{ name: "a", y: [1] }], note: "two\nlines" })).toEqual(["data/a.csv", "a"]);
  });
  it("writes the line that draws a traced output again", () => {
    expect(regenerateLine(trace, "/w/decks/a b/.folio/hooks/0123456789abcdef.json")).toBe("folio hook run lectern/line-plot --inputs '/w/decks/a b/.folio/hooks/0123456789abcdef.json' --fresh --out 0123456789abcdef.png");
    expect(isTrace(trace)).toBe(true);
    expect(isTrace({ series: [] })).toBe(false);
  });
  it("makes an example from the required fields of a schema", () => {
    const schema = { type: "object", required: ["series"], properties: { title: { type: "string" }, series: { type: "array", items: { type: "object", required: ["x"], properties: { x: { type: "array", minItems: 2, items: { type: "number" } } } } } } };
    expect(exampleOf(schema)).toEqual({ series: [{ x: [0, 1] }] });
  });
  it("adds a format to a figure key only when asked", () => {
    const stamp = { name: "h", version: 1, scriptHash: "x" };
    const slot = { name: "fig:a", role: "figure", w: 100, h: 50 };
    expect(slotHookKey("figure", {}, slot, 200, stamp)).not.toBe(slotHookKey("figure", {}, slot, 200, stamp, "svg"));
    expect(slotHookKey("figure", {}, slot, 200, stamp)).not.toBe(slotHookKey("figure", {}, { ...slot, h: 51 }, 200, stamp));
  });
  it("appends /FolioTrace to a PDF without touching its bytes", () => {
    const pdf = tinyPdf();
    const value = folioTraceValue([{ slide: "s002", slots: { "fig:a": { hook: "lectern/line-plot@1", key: "k", inputs: "i" }, "fig:b": { untraced: "a (1).png" } } }]);
    const out = addPdfInfo(pdf, { FolioTrace: value });
    expect(Buffer.from(out.subarray(0, pdf.length)).equals(Buffer.from(pdf))).toBe(true);
    expect(JSON.parse(readPdfInfo(out, "FolioTrace")!)).toEqual({ v: 1, pages: [{ slide: "s002", slots: { "fig:a": { hook: "lectern/line-plot@1", key: "k", inputs: "i" }, "fig:b": { untraced: "a (1).png" } } }] });
    const text = new TextDecoder().decode(out);
    expect(text).toContain("/Producer (Skia/PDF m151)");
    expect(text).toMatch(/\/Prev \d+>>\nstartxref\n(\d+)\n%%EOF\n$/);
    const at = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
    expect(text.slice(at, at + 4)).toBe("xref");
    const objAt = Number(/xref\n3 1\n(\d{10})/.exec(text)![1]);
    expect(text.slice(objAt, objAt + 7)).toBe("3 0 obj");
  });
});
