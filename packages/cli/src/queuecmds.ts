/**
 * `folio queue` and `folio run-hook`. The queue lives in the serving process,
 * so `queue` asks the server on the port band; without a server it lists the
 * figures that would be drawn and says no server is running.
 */
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { slideRoot } from "@folio/core";
import { describeRuntime, findWorkspace, FolioApp, hookedSlots, readJson, loadConfig, PORT_BAND, resolveRuntime, runSpawn, unmetRequirement, cachedExt } from "@folio/server";
import { openDeck, splitSlideRef } from "./deckcmds.js";

/**
 * Find the running server of a workspace on its port band.
 *
 * @returns the base URL, or null when none answers.
 */
export async function findServer(app: { config: { root: string; port: number } }): Promise<string | null> {
  const recorded = readJson<{ port: number; prefix: string; pid: number } | null>(join(app.config.root, ".folio", "server.json"), null);
  const candidates = recorded && isAlive(recorded.pid) ? [`http://127.0.0.1:${recorded.port}${recorded.prefix}`] : [];
  for (let port = app.config.port; port < app.config.port + PORT_BAND; port += 1) candidates.push(`http://127.0.0.1:${port}`);
  for (const base of candidates) {
    const ok = await fetch(`${base}/api/whoami`, { signal: AbortSignal.timeout(1500) })
      .then(async (r) => r.ok && samePath(((await r.json()) as { root: string }).root, app.config.root))
      .catch(() => false);
    if (ok) return base;
  }
  return null;
}

/**
 * Whether two paths name one folder, through symlinks (`/tmp` is
 * `/private/tmp` on macOS).
 */
function samePath(a: string, b: string): boolean {
  const real = (p: string) => (existsSync(p) ? realpathSync.native(p) : p);
  return a === b || real(a) === real(b);
}

/**
 * Whether a process exists.
 *
 * @returns true when a signal 0 reaches it.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** `folio queue [path] [--json]` and `folio queue resume <hook>`. */
export async function queueCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  const resume = positionals[0] === "resume";
  const app = new FolioApp(loadConfig(findWorkspace(resume ? "." : (positionals[0] ?? "."))));
  const base = await findServer(app);
  await app.close();
  if (resume) {
    if (!positionals[1]) throw new Error("usage: folio queue resume <hook>");
    if (!base) throw new Error("no folio server is running for this workspace; the queue resumes when it starts");
    const r = (await (await fetch(`${base}/api/queue/resume`, { method: "POST", body: JSON.stringify({ hook: positionals[1] }) })).json()) as { resumed: string[] };
    process.stdout.write(`resumed ${r.resumed.length ? r.resumed.join(", ") : `${positionals[1]} (nothing was paused)`}\n`);
    return 0;
  }
  const python = describeRuntime("python", app.config.runtimes);
  if (!base) {
    process.stdout.write(values.json ? `${JSON.stringify({ server: null, python })}\n` : `${python}\nno folio server is running for this workspace; hooks draw while folio serve runs\n`);
    return 0;
  }
  const snap = (await (await fetch(`${base}/api/queue`)).json()) as Record<string, any[]>;
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ ...snap, python })}\n`);
    return 0;
  }
  process.stdout.write(`${python}\n`);
  const row = (j: any) => `  ${j.state.padEnd(8)} ${`${j.slide}/${j.slot}`.padEnd(16)} ${j.hook.padEnd(16)} p${j.priority}  ${j.ageSeconds}s${j.attempt ? "  retry" : ""}`;
  const lines = [...snap.running!.map(row), ...snap.queued!.map(row)];
  lines.push(...snap.paused!.map((p) => `  paused   ${p.stamp} after ${p.failures} failures: folio queue resume ${p.stamp.split("@")[0]}`));
  lines.push(...snap.failedRollouts!.map((f) => `  stopped  ${f.stamp}: canary ${f.reason}; old figures stay`));
  lines.push(...snap.failed!.slice(-10).map((f) => `  failed   ${`${f.slide}/${f.slot}`.padEnd(16)} ${f.hook.padEnd(16)} ${f.status}  ${String(f.error).split("\n").filter(Boolean).pop() ?? ""}`));
  process.stdout.write(lines.length ? `${lines.join("\n")}\n` : "queue empty: every hooked figure is drawn\n");
  return 0;
}

/** `folio run-hook <deck>/<slide>/<slot>`: run one hook in the foreground with its full output. */
export async function runHookCommand(args: string[]): Promise<number> {
  const ref = args[0] ?? "";
  const cut = ref.lastIndexOf("/");
  const { deck, slide } = splitSlideRef(ref.slice(0, cut));
  const slotName = ref.slice(cut + 1);
  const { workspace, store } = openDeck(deck);
  const record = store.readSlide(slide);
  const found = hookedSlots(store, slide, record?.spec ?? null, workspace.packOf(store)).find((f) => (f.kind === "ok" ? f.slot.slot : f.slot) === slotName);
  if (!found) throw new Error(`${slotName} on ${slide} is not a hooked slot (${record?.spec ? JSON.stringify(slideRoot(record.spec)?.props[slotName] ?? null) : "slide unreadable"})`);
  if (found.kind === "unknown") throw new Error(`hook ${found.hook} is not in the deck's pack`);
  if (found.kind === "invalid") throw new Error(`inputs fail the schema: ${found.issues.map((i) => `${i.jsonPath} ${i.reason}`).join("; ")}`);
  if (found.kind === "mismatch") throw new Error(`hook ${found.hook} cannot fill ${slotName}: ${found.reason}`);
  const runtime = resolveRuntime(found.hook, workspace.config.runtimes);
  if (!runtime.ok) throw new Error(`runtime ${runtime.runtime} is not configured: until it is, each hooked slot falls back to what it was given as written (a text slot shows its raw text). Add it to folio.local.toml beside folio.toml: [runtimes] ${runtime.runtime} = "<path to a Python 3 with matplotlib>"; folio doctor says which Python it finds`);
  if (runtime.exe) {
    const unmet = await unmetRequirement(runtime.exe, found.hook.requires);
    if (unmet) process.stderr.write(`warning: ${runtime.exe} cannot import ${unmet}\n`);
  }
  const job = { ...found.slot, priority: 1, enqueuedAt: Date.now(), attempt: 0 };
  const result = await runSpawn({ store, job, hook: found.hook, exe: runtime.exe, signal: new AbortController().signal, memoryMb: workspace.config.memoryMb });
  process.stdout.write(`${JSON.stringify({ ...result, cached: cachedExt(store, job.key) }, null, 2)}\n`);
  return result.status === "ok" ? 0 : 1;
}
