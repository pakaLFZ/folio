import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { pageTraces, slotTrace } from "../src/hooks/slottrace.js";
import { slotBox } from "../src/slotbox.js";

const PNG = Buffer.from("not really a png, bytes are enough");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A workspace whose one layout has a figure slot fig:a of 300 x 200 pt. */
function workspaceDir(): { root: string; deck: string } {
  const root = mkdtempSync(join(tmpdir(), "folio-figuretrace-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  mkdirSync(join(root, "templates/p"), { recursive: true });
  const slots = { title: { role: "body", box: [0, 0, 400, 40] }, "fig:a": { role: "figure", box: [0, 50, 300, 200] } };
  writeFileSync(join(root, "templates/p/pack.json"), JSON.stringify({ name: "p", version: 1, canvas: { w: 400, h: 300, unit: "pt" }, roles: { body: { size: 10, lineHeight: 1.2 } }, tables: {}, backgrounds: { plain: { fill: "#fff", ink: "#000" } }, layouts: { f: { background: "plain", description: "", slots } } }));
  const deck = join(root, "decks/d");
  mkdirSync(join(deck, "slides"), { recursive: true });
  mkdirSync(join(deck, "fig"));
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "fedcba9876543210", title: "d", template: "p@1", order: ["s001"] }));
  writeFileSync(join(deck, "fig/a.png"), PNG);
  return { root, deck };
}

const writeSlide = (deck: string, props: Record<string, unknown>) => writeFileSync(join(deck, "slides/s001.json"), JSON.stringify({ root: "s", elements: { s: { type: "f", props: { title: "t", "fig:a": "fig/a.png", ...props }, children: [] } } }));

/** What `folio_hook.save_traced` writes for fig/a.png drawn at 300 x 200 pt. */
function writeTrace(deck: string, extra: Record<string, unknown> = {}): void {
  const source = { script: "/work/draw.py", command: "python draw.py", inputs: [{ path: "/work/data.csv", sha256: "c".repeat(64) }], at: "2026-10-13T10:00:00Z" };
  const record = { trace: 1, kind: "figure-file", file: "a.png", box: { w: 300, h: 200 }, dpi: 200, format: "png", cwd: "/work", source, output: { sha256: sha(PNG), bytes: PNG.length }, ...extra };
  writeFileSync(join(deck, "fig/a.png.trace.json"), JSON.stringify(record));
}

describe("figures drawn by a script", () => {
  it("note a plain image with the fix, and trace one saved with its trace file", async () => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, {});
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    const codes = () => app.warnings.slideWarnings(store, "s001", null).filter((w) => w.code.startsWith("FOLIO-FIG") && w.state !== "absent");
    expect(codes().map((w) => [w.code, w.severity])).toEqual([["FOLIO-FIG-002", "note"]]);
    expect(codes()[0]!.message).toContain("folio_hook.save_traced(fig, path, script=__file__, inputs=[...])");
    writeTrace(deck);
    expect(codes()).toEqual([]);
    const t = slotTrace(store, "s001", "fig:a", { w: 300, h: 200 });
    expect(t).toMatchObject({ state: "file", command: "cd /work && python draw.py", file: { kind: "figure-file", path: "fig/a.png", matches: true, box: { w: 300, h: 200 }, problem: null, source: { script: "/work/draw.py" } } });
    expect(pageTraces(store, ["s001"])[0]!.slots["fig:a"]).toEqual({ file: "fig/a.png", sha256: sha(PNG) });
    await app.close();
  });

  it("warn when the slot's box changes, naming the command that draws it again", async () => {
    const { root, deck } = workspaceDir();
    writeTrace(deck);
    writeSlide(deck, { overrides: { slots: { "fig:a": { box: [0, 50, 360, 200] } } } });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    expect(slotBox(app.workspace, store, "s001", "fig:a", null)).toEqual({ ok: true, w: 360, h: 200, flowed: false });
    expect(slotBox(app.workspace, store, "s001", "fig:z", null)).toMatchObject({ ok: false, reason: expect.stringContaining("slots: title, fig:a") });
    const [w] = app.warnings.slideWarnings(store, "s001", null).filter((x) => x.code.startsWith("FOLIO-FIG"));
    expect(w).toMatchObject({ code: "FOLIO-FIG-003", severity: "warning" });
    expect(w!.message).toContain("drawn at 300 x 200 pt; its box is now 360 x 200 pt");
    expect(w!.message).toContain("cd /work && python draw.py");
    await app.close();
  });

  it("note a trace that no longer describes its image", async () => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, {});
    writeTrace(deck, { output: { sha256: "a".repeat(64), bytes: 1 } });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    const fig = () => app.warnings.slideWarnings(store, "s001", null).filter((x) => x.code.startsWith("FOLIO-FIG") && x.state !== "absent");
    expect(fig().map((w) => [w.code, w.args.reason])).toEqual([["FOLIO-FIG-004", "the image changed after save_traced wrote it"]]);
    writeTrace(deck, { dpi: "high" });
    expect(fig().map((w) => w.args.reason)).toEqual([expect.stringContaining("a.png.trace.json dpi:")]);
    await app.close();
  });

  it.each([
    ["/home/x/outside.png", "/home/x/outside.png"],
    ["C:/Data/a.png", "C:/Data/a.png"],
    ["C:\\Data\\a.png", "C:\\Data\\a.png"],
    ["\\\\share\\a.png", "\\\\share\\a.png"],
    ["../other/a.png", "../other/a.png"],
    ["a/../../b.png", "a/../../b.png"],
  ])("warns FOLIO-FIG-005 for a path outside the deck (%s), never FOLIO-FIG-001", async (path) => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, { "fig:a": path });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    const fig = app.warnings.slideWarnings(store, "s001", null).filter((w) => w.code.startsWith("FOLIO-FIG") && w.state !== "absent");
    expect(fig.map((w) => w.code)).toEqual(["FOLIO-FIG-005"]);
    expect(fig[0]!.message).toContain("<deck>/fig/");
    expect(fig[0]!.message).toContain('fig/<name>');
    await app.close();
  });

  it("keeps FOLIO-FIG-001 for a deck-relative path that is truly missing", async () => {
    const { root, deck } = workspaceDir();
    writeSlide(deck, { "fig:a": "fig/missing.png" });
    const app = new FolioApp(loadConfig(root));
    const store = [...app.workspace.decks.values()][0]!;
    const fig = app.warnings.slideWarnings(store, "s001", null).filter((w) => w.code.startsWith("FOLIO-FIG") && w.state !== "absent");
    expect(fig.map((w) => w.code)).toEqual(["FOLIO-FIG-001"]);
    expect(fig[0]!.message).toBe("Figure file fig/missing.png does not exist.");
    await app.close();
  });
});
