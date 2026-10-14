import { describe, expect, it } from "vitest";
import { clampAxis, clampZoom, columnIndexAt, keyZoom, MAX_ZOOM, MIN_ZOOM, panBound, STEP, wheelPixels, wheelZoomSteps } from "../src/editor/zoom";

const wheel = (deltaY: number, more: Partial<{ deltaMode: number }> = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: true, shiftKey: false, ...more });

describe("zoom rules", () => {
  it("never goes below a quarter of fit or above the maximum", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(0.4)).toBe(0.4);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
  });

  it("steps by a fixed factor regardless of a mouse notch's size", () => {
    const small = wheelZoomSteps(wheel(-10), 0);
    const large = wheelZoomSteps(wheel(-100), 0);
    expect(small.steps).toBe(0);
    expect(large.steps).toBe(2);
    expect(wheelZoomSteps(wheel(100), 0).steps).toBeLessThan(0);
  });

  it("a discrete (non-pixel) wheel notch is always exactly one step", () => {
    expect(wheelZoomSteps(wheel(-3, { deltaMode: 1 }), 0).steps).toBe(1);
    expect(wheelZoomSteps(wheel(-10, { deltaMode: 1 }), 0).steps).toBe(1);
  });

  it("accumulates small deltas and spends a step every fixed amount, never more at once", () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 9; i++) {
      const next = wheelZoomSteps(wheel(-10), acc);
      expect(Math.abs(next.steps)).toBeLessThanOrEqual(1);
      steps += next.steps;
      acc = next.acc;
    }
    expect(steps).toBe(1);
  });

  it("a fast flick (many deltas in a burst) steps no further than the same total distance spread out", () => {
    const total = -300;
    const burst = wheelZoomSteps(wheel(total), 0);
    let acc = 0;
    let spread = 0;
    for (let i = 0; i < 30; i++) {
      const next = wheelZoomSteps(wheel(total / 30), acc);
      spread += next.steps;
      acc = next.acc;
    }
    expect(burst.steps).toBe(spread);
  });

  it("reads line and page deltas as px", () => {
    expect(wheelPixels({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false, shiftKey: false }, 800)).toEqual([0, 48]);
    expect(wheelPixels({ deltaX: 0, deltaY: 1, deltaMode: 2, ctrlKey: false, shiftKey: false }, 800)).toEqual([0, 800]);
  });

  it("maps the zoom keys to the same fixed step", () => {
    expect(keyZoom("+")).toBe(STEP);
    expect(keyZoom("=")).toBe(STEP);
    expect(keyZoom("-")).toBe(1 / STEP);
    expect(keyZoom("0")).toBe(0);
    expect(keyZoom("a")).toBeNull();
  });

  it("bounds the pan so 48px (or 10% of the slide) stays visible", () => {
    expect(panBound(500, 2000)).toBe((500 + 2000) / 2 - 200); // 10% of 2000 (200px) is the larger floor
    expect(panBound(500, 100)).toBe((500 + 100) / 2 - 48); // 48px floor wins over 10% of 100 (10px)
    expect(panBound(10, 20)).toBe(0); // a bound never goes negative, even for a tiny slide
  });

  it("clamps a value to within the bound on either side", () => {
    expect(clampAxis(500, 200)).toBe(200);
    expect(clampAxis(-500, 200)).toBe(-200);
    expect(clampAxis(50, 200)).toBe(50);
    expect(clampAxis(5, 0)).toBe(0);
  });

  it("picks the slide a px offset falls in, from how far the column is scrolled", () => {
    expect(columnIndexAt(0, 0, 100, 5)).toBe(0);
    expect(columnIndexAt(0, 150, 100, 5)).toBe(1);
    expect(columnIndexAt(250, 0, 100, 5)).toBe(2);
    expect(columnIndexAt(0, -50, 100, 5)).toBe(0); // never below the first slide
    expect(columnIndexAt(10000, 0, 100, 5)).toBe(4); // never past the last slide
    expect(columnIndexAt(0, 0, 100, 0)).toBe(0); // an empty deck never divides by its own count
  });
});
