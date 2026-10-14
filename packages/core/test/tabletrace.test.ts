import { describe, expect, it } from "vitest";
import { hasNumbers, isNumericCell, readTableFile } from "../src/index.js";

const sha = "a".repeat(64);

describe("table files", () => {
  it("read a table with and without a source block", () => {
    expect(readTableFile({ columns: ["a"], rows: [["1"]] })).toEqual({ ok: true, table: { columns: ["a"], rows: [["1"]] }, source: null });
    const source = { script: "make.py", command: "python make.py", inputs: [{ path: "s.csv", sha256: sha }], at: "2026-10-13T00:00:00Z" };
    expect(readTableFile({ columns: ["a"], rows: [], source })).toEqual({ ok: true, table: { columns: ["a"], rows: [] }, source });
  });
  it("refuse a bad source block or an unknown key by path", () => {
    expect(readTableFile({ columns: ["a"], rows: [], source: { script: "m.py", inputs: [{ path: "s", sha256: "xyz" }] } })).toEqual({ ok: false, reason: "source.inputs.0.sha256: sha256 must be 64 lowercase hex digits" });
    expect(readTableFile({ columns: ["a"], rows: [], source: { script: "m.py", guess: 1 } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^source\./) });
    expect(readTableFile({ columns: ["a"], rows: [], note: "x" })).toEqual({ ok: false, reason: "note: unknown key; a table file holds columns, rows and an optional source" });
    expect(readTableFile({ columns: ["a"], rows: [["1", "2"]] })).toMatchObject({ ok: false });
  });
});

describe("numeric cells", () => {
  it.each(["0.52", "-1.2e-3", "−0.5", "+3", ".5", "1,234.5", "12 %", "12%", "0.68 eV", "300 K", "1.5 kJ mol^{-1}", "**0.52**", "25 °C", "3.2 Å"])("%s is a number", (cell) => expect(isNumericCell(cell)).toBe(true));
  it.each(["Path B", "CO_{2}", "end-on", "0.52 to 0.55 eV", "2026-10-13", "", "N/A", "LC"])("%s is not", (cell) => expect(isNumericCell(cell)).toBe(false));
  it("finds numbers in body rows only", () => {
    expect(hasNumbers({ rows: [["SC", "end-on"]] })).toBe(false);
    expect(hasNumbers({ rows: [["SC", "0.52 eV"]] })).toBe(true);
  });
});
