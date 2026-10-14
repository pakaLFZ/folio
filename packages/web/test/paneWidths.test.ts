import { describe, expect, it } from "vitest";
import { fitWidths, PANE_INSET, paneMax, SCENE_MIN, thumbWidth } from "../src/editor/paneWidths";

const both = { rail: true, panel: true };
const scene = (w: { rail: number; panel: number }, viewport: number) => viewport - 2 * PANE_INSET - w.rail - w.panel;

describe("pane widths", () => {
  it("keeps stored widths inside each pane's limits", () => {
    expect(fitWidths({ rail: 20, panel: 9000 }, both, 3000)).toEqual({ rail: 140, panel: 560 });
  });

  it("narrows the rail, then the panel, to leave the scene its minimum", () => {
    const fitted = fitWidths({ rail: 400, panel: 560 }, both, 1200);
    expect(scene(fitted, 1200)).toBe(SCENE_MIN);
    expect(fitted.panel).toBe(560);
    const tight = fitWidths({ rail: 400, panel: 560 }, both, 1000);
    expect(tight).toEqual({ rail: 140, panel: 1000 - SCENE_MIN - 2 * PANE_INSET - 140 });
  });

  it("gives a shut pane's room to the other", () => {
    expect(fitWidths({ rail: 400, panel: 560 }, { rail: false, panel: true }, 1000).panel).toBe(560);
    expect(paneMax("panel", { rail: 400, panel: 328 }, { rail: false, panel: true }, 1000)).toBe(560);
    expect(paneMax("panel", { rail: 400, panel: 328 }, both, 1200)).toBe(1200 - SCENE_MIN - 2 * PANE_INSET - 400);
  });

  it("never offers less than the minimum", () => {
    expect(paneMax("rail", { rail: 196, panel: 560 }, both, 900)).toBe(140);
  });

  it("scales the thumbnails with the rail", () => {
    expect(thumbWidth(196, 20)).toBe(156);
    expect(thumbWidth(400, 20) - thumbWidth(140, 20)).toBe(260);
  });
});
