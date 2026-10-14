import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack, makeSlideSpec, renderFailure, renderWarnings, slideLayout, textSlots, type MeasuredSlot, type Pack } from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const where = { deck: "d", slide: "s003" };
const loaded = loadPack(JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8")));
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const spec = makeSlideSpec("title-only", { title: "A title" });
const measuredText = (...slots: string[]): MeasuredSlot[] => slots.map((slot) => ({ slot, lines: 1, overPt: 0 }));

describe("render failures", () => {
  it("reports the error a slide threw as FOLIO-RND-001, an error", () => {
    const [w, ...rest] = renderWarnings(where, spec, pack, { rev: "r", slots: [], renderError: "injected crash." }, AT);
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ code: "FOLIO-RND-001", severity: "error", source: "render", location: where });
    expect(w!.message).toMatch(/^Slide s003 did not render: injected crash\. .*pnpm build:web/);
  });
  it("calls a complete measurement that lacks a text slot a failure, naming the slot", () => {
    const names = textSlots(pack, slideLayout(pack, "title-only", {})!).map((t) => t.name);
    expect(renderFailure(spec, pack, { rev: "r", slots: measuredText(...names.slice(1)), complete: true })).toBe(`text slots ${names[0]} were never drawn`);
    expect(renderFailure(spec, pack, { rev: "r", slots: measuredText(...names), complete: true })).toBeNull();
  });
  it("trusts a partial measurement (the live view's) unless it carries an error", () => {
    expect(renderFailure(spec, pack, { rev: "r", slots: [] })).toBeNull();
  });
  it("leaves an unknown layout to FOLIO-SPEC-002", () => {
    expect(renderFailure(makeSlideSpec("no-such-layout", {}), pack, { rev: "r", slots: [], complete: true })).toBeNull();
  });
});
