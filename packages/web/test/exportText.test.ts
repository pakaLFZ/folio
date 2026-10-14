import { describe, expect, it } from "vitest";
import { savedText } from "../src/editor/exportText";

describe("savedText", () => {
  it("names the file alone when nothing is wrong", () => {
    expect(savedText({ file: "example-1.pdf", warnings: 0, stale: [] })).toBe("Saved example-1.pdf");
  });
  it("counts warnings and figures still drawing", () => {
    expect(savedText({ file: "talk.pdf", warnings: 1, stale: ["s001/a", "s002/b"] })).toBe("Saved talk.pdf, 1 warning, 2 figures still drawing");
  });
  it("counts objects drawn as pictures", () => {
    expect(savedText({ file: "talk.pptx", warnings: 0, stale: [], approximations: 2 })).toBe("Saved talk.pptx, 2 objects drawn as pictures");
  });
});
