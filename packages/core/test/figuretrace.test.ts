import { describe, expect, it } from "vitest";
import { boxFits, figureTraceName, readFigureTrace, redrawLine } from "../src/figuretrace.js";

const RECORD = {
  trace: 1, kind: "figure-file", file: "loop.png", box: { w: 300, h: 200 }, dpi: 200, format: "png", cwd: "/my work",
  source: { script: "/my work/draw.py", command: "python draw.py", inputs: [{ path: "/d.csv", sha256: "c".repeat(64) }], at: "2026-10-13T10:00:00Z" },
  output: { sha256: "a".repeat(64), bytes: 10 },
};

describe("figure trace files", () => {
  it("sit beside the image and read back whole", () => {
    expect(figureTraceName("fig/loop.png")).toBe("fig/loop.png.trace.json");
    expect(readFigureTrace(RECORD)).toEqual({ ok: true, record: RECORD });
  });

  it("are refused by path", () => {
    expect(readFigureTrace({ ...RECORD, extra: 1 })).toMatchObject({ ok: false, reason: expect.stringContaining("extra") });
    expect(readFigureTrace({ ...RECORD, source: { ...RECORD.source, inputs: [{ path: "/d.csv", sha256: "x" }] } })).toMatchObject({ ok: false, reason: "source.inputs.0.sha256: sha256 must be 64 lowercase hex digits" });
    expect(readFigureTrace({ ...RECORD, format: "jpg" })).toMatchObject({ ok: false, reason: expect.stringMatching(/^format:/) });
  });

  it("redraw where the script ran, and need it when the box moves past half a point", () => {
    expect(redrawLine(RECORD as never)).toBe("cd '/my work' && python draw.py");
    expect(boxFits({ w: 300, h: 200 }, { w: 300.4, h: 199.6 })).toBe(true);
    expect(boxFits({ w: 300, h: 200 }, { w: 300, h: 201 })).toBe(false);
  });
});
