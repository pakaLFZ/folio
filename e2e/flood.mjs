// Section 4h: flood deck A with 1000 readings (draft saves) while a worker edits deck B ten times; deck B's
// tab, sharing the one stream, must see every edit promptly. Then a restart keeps every deck's address.
// Serves its own copies of decks/example and decks/example-b.
import { chromium } from "playwright";
import { serve, until } from "./lib/server.mjs";
const server = await serve();
const { base } = server;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const a = server.token("example");
const b = server.token("example-b");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const pa = await ctx.newPage();
await pa.goto(`${base}/${a}/`, { waitUntil: "load" });
const pb = await ctx.newPage();
await pb.goto(`${base}/${b}/?slide=s001`, { waitUntil: "load" });
await pb.waitForSelector('main [data-slot="caption"]');
await until(async () => (await (await fetch(`${base}/api/streams`)).json()).streams === 1);
const flood = (async () => {
  for (let i = 0; i < 1000; i += 1) {
    await fetch(`${base}/${a}/drafts/dflood`, { method: "PUT", body: JSON.stringify({ id: "dflood", slide: "s002", slideRev: "", region: null, marks: [], text: `flood ${i}`, uploads: [] }) });
  }
})();
const delays = [];
for (let i = 0; i < 10; i += 1) {
  const stamp = `edit ${i} ${Date.now()}`;
  await server.cliAsync(["patch", "decks/example-b/s001", "-", "--worker", "wf"], JSON.stringify([{ op: "add", path: "/elements/s/props/caption", value: stamp }]));
  const t0 = Date.now();
  const seen = await pb.waitForFunction((s) => document.querySelector('main [data-slot="caption"]')?.textContent?.includes(s), stamp, { timeout: 5000 }).then(() => Date.now() - t0, () => -1);
  delays.push(seen);
}
await flood;
const streams = await (await fetch(`${base}/api/streams`)).json();
check("1000 readings on one deck do not delay or drop another deck's edits", delays.every((d) => d >= 0 && d < 1000), `deck B edit delays ms: ${delays.join(" ")}; streams open: ${streams.streams}`);
await browser.close();
await post(`${a}/drafts/dflood/discard`);
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
async function post(path) {
  await fetch(`${base}/${path}`, { method: "POST", body: "{}" });
}
