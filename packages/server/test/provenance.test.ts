import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPython } from "../src/hooks/findpython.js";
import { afterAll, describe, expect, it } from "vitest";
import type { SlideSpec } from "@folio/core";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { toPosix } from "../src/posixpath.js";
import { adoptCached, callOfTrace, directJob, dropFresh, matchesTrace, runDirect, workspaceCache } from "../src/hooks/direct.js";
import { runSpawn } from "../src/hooks/runner.js";
import { HookService } from "../src/hooks/service.js";
import { hookedSlots } from "../src/hooks/slots.js";
import { readTrace } from "../src/hooks/trace.js";
import { slotTrace } from "../src/hooks/slottrace.js";
import { loadPackDir, Workspace } from "../src/workspace.js";
import { fileURLToPath } from "node:url";

const python = process.env.FOLIO_PYTHON ?? findPython()?.exe;

/** A hook that writes a solid PNG of exactly the box size, with no third-party package. */
const DRAW = `import json, struct, sys, zlib
r = json.load(sys.stdin)
w, h = round(r["box"]["w"] * r["dpi"] / 72), round(r["box"]["h"] * r["dpi"] / 72)
row = b"\\x00" + bytes([r["inputs"].get("n", 1) * 40 % 256, 90, 160]) * w
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
open(r["out"], "wb").write(b"\\x89PNG\\r\\n\\x1a\\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * h)) + chunk(b"IEND", b""))
`;

const pack = (figBox: number[]) => ({
  name: "p", version: 1, canvas: { w: 400, h: 300, unit: "pt" }, roles: { body: { size: 10, lineHeight: 1.2 } }, backgrounds: { plain: { fill: "#fff", ink: "#000" } },
  layouts: {
    one: { background: "plain", description: "", slots: { note: { role: "body", box: [0, 0, 400, 40] }, "fig:a": { role: "figure", box: figBox } } },
    two: { background: "plain", description: "", slots: { note: { role: "body", box: [0, 0, 400, 40] }, "fig:a": { role: "figure", box: [0, 50, 300, 120] } } },
  },
});

/** A workspace with one pack, one figure hook and one deck whose slide draws with it from a data file. */
function workspaceDir(): string {
  const root = mkdtempSync(join(tmpdir(), "folio-trace-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  writeFileSync(join(root, "folio.local.toml"), `[runtimes]\npython = "${python}"\n`);
  const hook = join(root, "templates/p/hooks/png");
  mkdirSync(hook, { recursive: true });
  writeFileSync(join(root, "templates/p/pack.json"), JSON.stringify(pack([0, 50, 144, 72])));
  writeFileSync(join(hook, "hook.json"), JSON.stringify({ name: "png", runtime: "python", command: ["draw.py"], dpi: 72, inputs: { type: "object", properties: { file: { type: "string" }, n: { type: "number" } } } }));
  writeFileSync(join(hook, "draw.py"), DRAW);
  const deck = join(root, "decks/d");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "abcdef0123456789", title: "d", template: "p@1", order: ["s001"] }));
  writeFileSync(join(deck, "data.csv"), "x,y\n0,1\n");
  writeSlide(deck, "one", {});
  return root;
}

function writeSlide(deck: string, layout: string, extra: Record<string, unknown>): SlideSpec {
  const spec = { root: "s", elements: { s: { type: layout, props: { note: "n", "fig:a": { hook: "png", inputs: { file: "data.csv", n: 2 } }, ...extra }, children: [] } } };
  writeFileSync(join(deck, "slides/s001.json"), JSON.stringify(spec));
  return spec as unknown as SlideSpec;
}

const open = (root: string) => {
  const workspace = new Workspace(loadConfig(root));
  const store = [...workspace.decks.values()][0]!;
  const found = () => hookedSlots(store, "s001", store.readSlide("s001")!.spec, workspace.packOf(store));
  const job = () => {
    const f = found()[0]!;
    if (f.kind !== "ok") throw new Error(f.kind);
    return { slot: f.slot, hook: f.hook };
  };
  return { workspace, store, job };
};
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (o: ReturnType<typeof open>) => {
  const { slot, hook } = o.job();
  return runSpawn({ store: o.store, job: { ...slot, priority: 1, enqueuedAt: 0, attempt: 0 }, hook, exe: python!, signal: new AbortController().signal, memoryMb: null });
};

describe.skipIf(!python)("traced hook outputs", () => {
  const root = workspaceDir();
  const o = open(root);

  it("store a record of everything that made the figure beside it", async () => {
    const record = await run(o);
    expect(record.status).toBe("ok");
    const { slot } = o.job();
    const trace = readTrace(o.store, slot.key)!;
    const hookDir = join(root, "templates/p/hooks/png");
    expect(trace).toMatchObject({
      trace: 1, key: slot.key, kind: "figure", inputs: { file: "data.csv", n: 2 }, box: { w: 144, h: 72 }, dpi: 72, format: "png",
      slot: { deck: o.store.token, slide: "s001", slot: "fig:a", role: "figure" }, base: o.store.dir,
      hook: { pack: "p", name: "png", version: 1, stamp: slot.stamp, files: { "draw.py": sha(join(hookDir, "draw.py")), "hook.json": sha(join(hookDir, "hook.json")) } },
      data: [{ path: "data.csv", sha256: sha(join(o.store.dir, "data.csv")) }],
      runtime: { name: "python", exe: python, mode: "spawn" },
      output: { file: `${slot.key}.png`, sha256: sha(join(o.store.stateDir, "hooks", `${slot.key}.png`)) },
    });
    expect(trace.runtime.version).toMatch(/^Python 3/);
    expect(trace.seconds).toBeGreaterThan(0);
  });

  it("regenerates the same bytes from the trace alone", async () => {
    const trace = readTrace(o.store, o.job().slot.key)!;
    const result = await runDirect({ workspace: o.workspace, hook: o.job().hook, call: callOfTrace(trace), cache: workspaceCache(root, trace.base), others: [o.store], fresh: true });
    expect(result.cached).toBe(false);
    expect(result.file).toContain("folio-fresh-");
    expect(matchesTrace(result.file!, trace)).toBe(true);
    dropFresh(result);
    expect(existsSync(result.file!)).toBe(false);
  });

  it("shares one key and one cache between hook run and the deck", async () => {
    const hook = o.job().hook;
    const call = { input: { file: "data.csv", n: 2 }, w: 144, h: 72 };
    expect(directJob(hook, call).key).toBe(o.job().slot.key);
    const reused = await runDirect({ workspace: o.workspace, hook, call, cache: workspaceCache(root), others: [o.store] });
    expect(reused).toMatchObject({ cached: true, record: null });
    const direct = await runDirect({ workspace: o.workspace, hook, call: { ...call, w: 200 }, cache: workspaceCache(root), others: [o.store] });
    expect(direct.cached).toBe(false);
    const key = directJob(hook, { ...call, w: 200 }).key;
    expect(adoptCached(key, [workspaceCache(root)], o.store)).toBe("png");
    expect(readTrace(o.store, key)?.box).toEqual({ w: 200, h: 72 });
  });

  it("gives a box override, a layout change, another layout and a flowed height new keys", () => {
    const deck = o.store.dir;
    const base = o.job().slot.key;
    writeSlide(deck, "one", { overrides: { slots: { "fig:a": { box: [0, 50, 200, 100] } } } });
    expect(o.job().slot).toMatchObject({ box: { w: 200, h: 100 } });
    expect(o.job().slot.key).not.toBe(base);
    writeSlide(deck, "two", {});
    expect(o.job().slot.box).toMatchObject({ w: 300, h: 120 });
    writeSlide(deck, "one", {});
    expect(o.job().slot.key).toBe(base);
    const edited = loadPackDir(join(root, "templates/p"));
    writeFileSync(join(root, "templates/p/pack.json"), JSON.stringify(pack([0, 50, 160, 72])));
    const reloaded = open(root);
    expect(edited.ok && reloaded.job().slot.key !== base).toBe(true);
    writeFileSync(join(root, "templates/p/pack.json"), JSON.stringify(pack([0, 50, 144, 72])));
    writeSlide(deck, "one", { overrides: { slots: { "fig:a": { below: { slot: "note", gap: 6 } } } } });
    const spec = o.store.readSlide("s001")!.spec;
    const flowed = hookedSlots(o.store, "s001", spec, o.workspace.packOf(o.store), { "fig:a": 58 })[0]!;
    expect(flowed.kind === "ok" && flowed.slot.box.h).toBe(58);
    writeSlide(deck, "one", {});
  });

  it("queues a redraw when an override changes the box", async () => {
    const app = new FolioApp(loadConfig(root));
    const service = new HookService(app);
    const store = [...app.workspace.decks.values()][0]!;
    writeSlide(store.dir, "one", { overrides: { slots: { "fig:a": { box: [0, 50, 180, 90] } } } });
    app.manifestOf(store).refresh("s001");
    service.reconcile(store, "s001");
    const snap = service.snapshot();
    const jobs = [...snap.running, ...snap.queued].filter((j) => j.slot === "fig:a");
    expect(jobs).toHaveLength(1);
    expect(await service.idle(store.token, 20_000)).toEqual([]);
    const shown = slotTrace(store, "s001", "fig:a");
    expect(shown.trace?.box).toEqual({ w: 180, h: 90 });
    expect(shown).toMatchObject({ state: "traced", phase: "ok", command: `folio hook run p/png --inputs ${toPosix(join(store.stateDir, "hooks", `${shown.trace?.key}.json`))} --fresh --out ${shown.trace?.key}.png` });
    service.close();
    await app.close();
  });

  it("redraws a flowed figure at its measured height when a measurement arrives", async () => {
    const app = new FolioApp(loadConfig(root));
    const service = new HookService(app);
    const store = [...app.workspace.decks.values()][0]!;
    writeSlide(store.dir, "one", { overrides: { slots: { "fig:a": { below: { slot: "note", gap: 6 } } } } });
    app.manifestOf(store).refresh("s001");
    service.start();
    expect(await service.idle(store.token, 20_000)).toEqual([]);
    expect(slotTrace(store, "s001", "fig:a").trace?.box).toEqual({ w: 144, h: 72 });
    const rev = store.readSlide("s001")!.rev;
    app.publishWarnings(store, "s001", { rev, slots: [{ slot: "fig:a", lines: 0, overPt: 0, boxPt: 57.6 }] });
    app.notify(store.token, "measured", { slide: "s001" });
    expect(await service.idle(store.token, 20_000)).toEqual([]);
    expect(slotTrace(store, "s001", "fig:a").trace?.box).toEqual({ w: 144, h: 58 });
    service.close();
    await app.close();
  });

  afterAll(() => writeSlide(o.store.dir, "one", {}));
});

describe.skipIf(!python)("the lectern line-plot at many sizes", () => {
  const matplotlib = python && (() => {
    try {
      execFileSync(python, ["-c", "import matplotlib"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  it.skipIf(!matplotlib)("keeps exact pixels, text at least 7 pt, labels inside and apart", () => {
    const script = fileURLToPath(new URL("../../../python/tests/test_line_plot_sizes.py", import.meta.url));
    const out = execFileSync(python!, [script], { encoding: "utf8", env: { ...process.env, MPLBACKEND: "Agg" } });
    expect(out.split("\n").filter((l) => l.startsWith("FAIL"))).toEqual([]);
  }, 60_000);
});
