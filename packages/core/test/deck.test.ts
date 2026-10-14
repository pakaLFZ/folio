import { describe, expect, it } from "vitest";
import { insertSlides, moveSlides } from "../src/index.js";

const order = ["s1", "s2", "s3", "s4", "s5"];

describe("moveSlides", () => {
  it("moves a group in front of a slide, keeping deck order whatever order the ids came in", () => {
    expect(moveSlides(order, ["s4", "s2"], "s1")).toEqual(["s2", "s4", "s1", "s3", "s5"]);
  });
  it("moves a group to the end", () => {
    expect(moveSlides(order, ["s1", "s3"], null)).toEqual(["s2", "s4", "s5", "s1", "s3"]);
  });
  it("lands by id, so a slide inserted meanwhile does not shift the target", () => {
    const meanwhile = ["s1", "s9", "s2", "s3", "s4", "s5"];
    expect(moveSlides(meanwhile, ["s5"], "s2")).toEqual(["s1", "s9", "s5", "s2", "s3", "s4"]);
  });
  it("ignores ids gone from the deck", () => {
    expect(moveSlides(order, ["s7", "s5"], "s1")).toEqual(["s5", "s1", "s2", "s3", "s4"]);
  });
  it("refuses an anchor that is gone or is itself moving", () => {
    expect(moveSlides(order, ["s1"], "s8")).toBeNull();
    expect(moveSlides(order, ["s1", "s2"], "s2")).toBeNull();
  });
});

describe("insertSlides", () => {
  it("inserts after a slide, in the given order", () => {
    expect(insertSlides(order, ["s7", "s6"], "s2")).toEqual(["s1", "s2", "s7", "s6", "s3", "s4", "s5"]);
  });
  it("appends when the anchor is null or gone", () => {
    expect(insertSlides(order, ["s6"], null)).toEqual([...order, "s6"]);
    expect(insertSlides(order, ["s6"], "s9")).toEqual([...order, "s6"]);
  });
});
