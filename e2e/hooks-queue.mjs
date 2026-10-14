// Hook and queue checks, against a fresh copy of e2e/workspace on a free port.
// Each check prints PASS or FAIL with what it saw. Usage: node e2e/hooks-queue.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, python, repo, sleep, start, until, workspace } from "./lib/server.mjs";

const ws = workspace({ decks: [], from: join(repo, "e2e/workspace") });
const deckDir = join(ws, "decks/hooks");
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const cli = (args, input) => execFileSync("node", [bin, ...args], { cwd: ws, input, encoding: "utf8" });

writeFileSync(join(ws, "folio.local.toml"), `[runtimes]\npython = ${JSON.stringify(python)}\n`);
cli(["init-deck", deckDir, "--template", "probe-pack@1", "--title", "Hook checks"]);
cli(["new", deckDir, "--template", "grid", "--worker", "t"]);
let server = null;
let base = "";
const startServer = async () => {
  server = await start(ws);
  base = server.base;
};
const stopServer = async () => {
  await server.stop("SIGKILL");
  server = null;
};
const deckToken = async () => (await (await fetch(`${base}/api/decks`)).json()).decks.find((d) => d.dir === deckDir).token;
const setFig = (slot, value, slide = "s001") => cli(["patch", `${deckDir}/${slide}`, "-", "--worker", "t"], JSON.stringify([{ op: "add", path: `/elements/s/props/${slot}`, value }]));
const patchFig = (t, slot, value) => fetch(`${base}/${t}/slides/s001`, { method: "PATCH", headers: { "x-folio-worker": "t" }, body: JSON.stringify([{ op: "add", path: `/elements/s/props/${slot}`, value }]) });
const states = async (t) => (await (await fetch(`${base}/${t}/hooks`)).json()).slides;
const runs = () => (existsSync(join(deckDir, ".folio/hooks/log")) ? readdirSync(join(deckDir, ".folio/hooks/log")).flatMap((f) => readFileSync(join(deckDir, ".folio/hooks/log", f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) : []);
const waitFor = (fn, ms = 15000) => until(fn, ms);
const warningsOf = async (t, slide = "s001") => (await (await fetch(`${base}/${t}/warnings`)).json()).warnings.filter((w) => w.location.slide === slide && w.state !== "absent");

await startServer();
try {
const t = await deckToken();

setFig("fig:a", { hook: "probe", inputs: { label: "a" } });
const ok = await waitFor(async () => (await states(t)).s001?.["fig:a"]?.phase === "ok");
check("valid inputs draw a figure", !!ok, JSON.stringify((await states(t)).s001?.["fig:a"]));

const before = runs().length;
setFig("title", "Title changed, figure inputs unchanged");
await sleep(1200);
check("same inputs hit the cache", runs().length === before, `runs ${before} -> ${runs().length}`);

const badInputs = { hook: "probe", inputs: { label: 5, colour: "x" } };
let refused = "";
try {
  setFig("fig:a", badInputs);
} catch (error) {
  refused = String(error.stderr);
}
check("folio patch refuses bad hook inputs, listing the allowed keys", /^422 refused, nothing written/.test(refused) && /fig:a\/inputs\/colour: "colour" is not an input of this hook; allowed: label, sleep, fail/.test(refused) && /folio hook show probe-pack\/probe/.test(refused), refused.trim());
const slideFile = join(deckDir, "slides/s001.json");
const handEdited = JSON.parse(readFileSync(slideFile, "utf8"));
handEdited.elements.s.props["fig:a"] = badInputs;
writeFileSync(slideFile, JSON.stringify(handEdited, null, 2));
const bad = await waitFor(async () => (await warningsOf(t)).filter((w) => w.code === "FOLIO-HOOK-001"));
const colour = bad?.find((w) => w.args.jsonPath === "/colour");
check("a hand-edited bad key is named by its path, with the allowed keys", !!bad && bad.some((w) => w.args.jsonPath === "/label") && /allowed: label, sleep/.test(colour?.message ?? ""), JSON.stringify(bad?.map((w) => w.message)));

setFig("fig:a", { hook: "probe", inputs: { label: "a", fail: true } });
const failed = await waitFor(async () => (await states(t)).s001?.["fig:a"]?.phase === "failed" && (await states(t)).s001["fig:a"]);
const checkOut = cli(["check", deckDir]);
check("a failing script keeps the last good figure; check exits 0 and lists it", !!failed && failed.goodKey && /FOLIO-HOOK-002/.test(checkOut), `goodKey ${failed?.goodKey}; check lists HOOK-002: ${/FOLIO-HOOK-002/.test(checkOut)}`);
setFig("fig:a", { hook: "probe", inputs: { label: "a" } });
await waitFor(async () => (await states(t)).s001?.["fig:a"]?.phase === "ok");

const n0 = runs().length;
for (let i = 0; i < 10; i += 1) {
  await fetch(`${base}/${t}/slides/s001`, { method: "PATCH", body: JSON.stringify([{ op: "add", path: "/elements/s/props/fig:d", value: { hook: "probe", inputs: { label: `r${i}` } } }]) });
  await sleep(10);
}
await waitFor(async () => (await states(t)).s001?.["fig:d"]?.phase === "ok");
await sleep(800);
const rapid = runs().slice(n0).filter((r) => r.slot === "fig:d" && r.status !== "cancelled");
check("ten quick edits run only the last", rapid.length === 1 && rapid[0].inputs.label === "r9", rapid.map((r) => `${r.inputs.label}:${r.status}`).join(" "));

const n1 = runs().length;
setFig("fig:b", { hook: "probe", inputs: { label: "hang", sleep: 60 } });
setFig("fig:c", { hook: "probe", inputs: { label: "c" } });
await waitFor(async () => (await states(t)).s001?.["fig:b"]?.phase === "failed", 20000);
const hang = runs().slice(n1);
check("a hung hook is killed at its timeout and others finish", hang.filter((r) => r.slot === "fig:b" && r.status === "timeout").length === 2 && hang.some((r) => r.slot === "fig:c" && r.status === "ok"), hang.map((r) => `${r.slot}:${r.status}:${r.seconds.toFixed(1)}s`).join(" "));

setFig("fig:a", { hook: "probe2", inputs: { label: "proves the version" } });
await waitFor(async () => (await states(t)).s001?.["fig:a"]?.phase === "ok");
for (const slot of ["fig:a", "fig:b", "fig:c"]) setFig(slot, { hook: "probe2", inputs: { label: slot, fail: true } });
const paused = await waitFor(async () => (await (await fetch(`${base}/api/queue`)).json()).paused.find((p) => p.stamp.startsWith("probe2@")));
setFig("fig:e", { hook: "probe", inputs: { label: "still runs" } });
const other = await waitFor(async () => (await states(t)).s001?.["fig:e"]?.phase === "ok");
const pauseWarn = await waitFor(async () => (await warningsOf(t)).some((w) => w.code === "FOLIO-HOOK-007") || (await warningsOf(t)).some((w) => w.code === "FOLIO-HOOK-002" && w.location.slot === "fig:c"));
check("three failures pause the hook; other hooks keep running", !!paused && !!other, `paused ${paused?.stamp} after ${paused?.failures}; probe drew fig:e: ${!!other}; warned: ${!!pauseWarn}`);

const probeDraw = join(ws, "templates/probe-pack/hooks/probe/draw.py");
const original = readFileSync(probeDraw, "utf8");
for (const slot of ["fig:a", "fig:b", "fig:c", "fig:d"]) setFig(slot, { hook: "probe", inputs: { label: `rollout ${slot}`, sleep: 0.4 } });
await waitFor(() => ["fig:a", "fig:b", "fig:c", "fig:d"].every((slot) => runs().some((r) => r.inputs?.label === `rollout ${slot}` && r.status === "ok")), 30000);
const n2 = runs().length;
writeFileSync(probeDraw, `${original}\n# canary edit ${Date.now()}\n`);
await waitFor(async () => runs().slice(n2).filter((r) => r.hook === "probe" && r.status === "ok").length >= 4, 30000);
const roll = runs().slice(n2).filter((r) => r.hook === "probe" && r.status === "ok");
const firstEnd = new Date(roll[0]?.at ?? 0).getTime();
const othersAfter = roll.slice(1).every((r) => new Date(r.at).getTime() - r.seconds * 1000 >= firstEnd - 50);
check("a changed hook re-draws behind one canary, then rolls out", roll.length >= 4 && othersAfter, `${roll.length} re-draws of ${roll[0]?.stamp?.split(":")[1]}; the rest started after the canary ended: ${othersAfter}`);

const n3 = runs().length;
writeFileSync(probeDraw, `${original}\nthis is not python\n`);
const stale = await waitFor(async () => {
  const s = (await states(t)).s001 ?? {};
  return ["fig:a", "fig:b", "fig:c", "fig:d"].filter((k) => s[k]?.phase === "stale" && s[k].goodKey).length >= 3 ? s : null;
}, 20000);
const q = await (await fetch(`${base}/api/queue`)).json();
const brokenRuns = runs().slice(n3).filter((r) => r.hook === "probe" && r.status !== "ok").length;
check("a broken script stops the rollout after one canary; old figures stay, marked stale", !!stale && q.failedRollouts.length >= 1 && brokenRuns === 1, `runs of the broken version: ${brokenRuns}; slots marked stale: ${Object.values(stale ?? {}).filter((v) => v.phase === "stale").length}; stopped rollouts ${q.failedRollouts.length}`);
writeFileSync(probeDraw, original);
await waitFor(async () => Object.values((await states(t)).s001 ?? {}).filter((v) => v.phase === "ok").length >= 4, 20000);

setFig("fig:c", { hook: "probe", inputs: { label: "restart", sleep: 2 } });
await waitFor(async () => (await states(t)).s001?.["fig:c"]?.phase === "drawing", 8000);
await stopServer();
const tmpLeft = existsSync(join(deckDir, ".folio/hooks/tmp")) ? readdirSync(join(deckDir, ".folio/hooks/tmp")).length : 0;
await startServer();
const rebuilt = await waitFor(async () => (await states(t)).s001?.["fig:c"]?.phase === "ok", 20000);
const cachedPngs = readdirSync(join(deckDir, ".folio/hooks")).filter((f) => f.endsWith(".png"));
const allWhole = cachedPngs.every((f) => readFileSync(join(deckDir, ".folio/hooks", f)).subarray(1, 4).toString() === "PNG");
check("a server killed mid-run rebuilds its queue; nothing half-written", !!rebuilt && allWhole, `fig:c redrawn: ${!!rebuilt}; ${cachedPngs.length} cached PNGs all whole: ${allWhole}; temp folders left by the kill: ${tmpLeft}`);

setFig("fig:d", { hook: "no-runtime", inputs: { label: "x" } });
const rt = await waitFor(async () => (await warningsOf(t)).find((w) => w.code === "FOLIO-HOOK-006"));
check("an unconfigured runtime gives FOLIO-HOOK-006", !!rt, rt?.message ?? "none");

setFig("fig:e", { hook: "probe-warm", inputs: { label: "crash", crash: true } });
await waitFor(async () => (await states(t)).s001?.["fig:e"]?.phase === "failed", 15000);
setFig("fig:e", { hook: "probe-warm", inputs: { label: "after crash" } });
const respawned = await waitFor(async () => (await states(t)).s001?.["fig:e"]?.phase === "ok", 15000);
check("a warm worker that crashes is replaced", !!respawned, `fig:e after crash: ${(await states(t)).s001?.["fig:e"]?.phase}`);

const timeMode = async (hook, slot) => {
  const n = runs().length;
  for (let i = 0; i < 20; i += 1) {
    await patchFig(t, slot, { hook, inputs: { label: `${hook} run ${i}` } });
    await waitFor(async () => runs().slice(n).filter((r) => r.hook === hook && r.status === "ok").length > i, 30000);
  }
  return runs().slice(n).filter((r) => r.hook === hook && r.status === "ok").map((r) => r.seconds);
};
const spawnTimes = await timeMode("mpl-spawn", "fig:a");
const warmTimes = await timeMode("mpl-warm", "fig:b");
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : NaN);
check("warm is faster than spawn after its first run (20 runs each)", warmTimes.length === 20 && spawnTimes.length === 20 && avg(warmTimes.slice(1)) < avg(spawnTimes.slice(1)), `spawn mean ${avg(spawnTimes).toFixed(3)} s (total ${sum(spawnTimes).toFixed(1)} s); warm first ${warmTimes[0]?.toFixed(3)} s, then mean ${avg(warmTimes.slice(1)).toFixed(3)} s (total ${sum(warmTimes).toFixed(1)} s)`);

} catch (error) {
  console.log("FAIL  the run stopped:", error?.stack ?? error);
  results.push(false);
} finally {
  if (server) await server.stop();
}
const summary = `${results.filter(Boolean).length}/${results.length} passed`;
console.log(summary);
process.exit(results.every(Boolean) ? 0 : 1);
