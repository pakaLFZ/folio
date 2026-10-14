import { describe, expect, it } from "vitest";
import { loadPack } from "../src/pack.js";

const base = {
  name: "dark",
  version: 1,
  canvas: { w: 960, h: 540, unit: "pt" },
  roles: { body: { size: 24, lineHeight: 1.3 } },
  backgrounds: { plain: { fill: "#ffffff", ink: "#111111" } },
  layouts: { title: { description: "x", background: "plain", slots: { body: { role: "body", box: [40, 40, 880, 460] } } } },
};

const withLayouts = (slots: unknown) => ({ ...base, layouts: { title: { description: "x", background: "plain", slots } } });

describe("loadPack refusals name the expected shape", () => {
  it("passes a minimal pack", () => {
    const result = loadPack(base);
    expect(result.ok).toBe(true);
  });

  it("names canvas's shape when missing", () => {
    const { name, version, layouts, roles, backgrounds } = base;
    const result = loadPack({ name, version, layouts, roles, backgrounds });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('canvas: is missing; write "canvas": {"w": 960, "h": 540, "unit": "pt"}');
  });

  it("names roles's shape when missing", () => {
    const { name, version, layouts, canvas, backgrounds } = base;
    const result = loadPack({ name, version, layouts, canvas, backgrounds });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('roles: is missing; write "roles": {"title": {"size": 26, "lineHeight": 1.2, "weight": 700}}');
  });

  it("names backgrounds's shape when missing", () => {
    const { name, version, layouts, canvas, roles } = base;
    const result = loadPack({ name, version, layouts, canvas, roles });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('backgrounds: is missing; write "backgrounds": {"plain": {"fill": "#ffffff", "ink": "#111111"}}');
  });

  it("names layouts's shape when missing", () => {
    const { name, version, canvas, roles, backgrounds } = base;
    const result = loadPack({ name, version, canvas, roles, backgrounds });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.startsWith('layouts: is missing; write "layouts": {"title": {'))).toBe(true);
  });

  it("names a slot's shape when it is the wrong type", () => {
    const result = loadPack(withLayouts({ body: "oops" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('layouts.title.slots.body: must be an object; a slot is {"role": "body", "box": [40, 40, 880, 460]}');
  });

  it("names the box shape when a slot's box is missing", () => {
    const result = loadPack(withLayouts({ body: { role: "body" } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('layouts.title.slots.body.box: is missing; a box is [x, y, w, h] in pt, e.g. [40, 40, 880, 460]');
  });

  it("lists valid roles for an unknown slot role", () => {
    const result = loadPack(withLayouts({ body: { role: "heading", box: [1, 1, 2, 2] } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('layouts.title.slots.body.role: "heading" is not a role; roles are: title, subtitle, body, label, caption, note, figure, table, shape, block');
  });

  it("lists the pack's backgrounds for a layout's unknown background", () => {
    const result = loadPack({ ...base, layouts: { title: { description: "x", background: "nope", slots: { body: { role: "body", box: [1, 1, 2, 2] } } } } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain(`layouts.title.background: "nope" is not one of the theme's backgrounds (known: plain)`);
  });

  it("names a role style's shape when it is the wrong type", () => {
    const result = loadPack({ ...base, roles: { body: "oops" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('roles.body: must be an object; a role style is {"size": 26, "lineHeight": 1.2, "weight": 700}');
  });

  it("names a background's shape when it is the wrong type", () => {
    const result = loadPack({ ...base, backgrounds: { plain: "white" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContain('backgrounds.plain: must be an object; a background is {"fill": "#ffffff", "ink": "#111111"}');
  });
});
