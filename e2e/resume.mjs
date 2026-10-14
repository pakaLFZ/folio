// Browser check: cut the forward for 5 s while a worker edits; the tab resumes from Last-Event-ID without reloading.
// Serves its own copy of decks/example-b behind a forward on a free port.
import { chromium } from "playwright";
import { createServer, connect } from "node:net";
import { serve, sleep, until } from "./lib/server.mjs";
const server = await serve({ decks: ["example-b"] });
const target = Number(new URL(server.base).port);
let sockets = new Set();
let proxy;
let port = 0;
const startProxy = () => new Promise((r) => {
  proxy = createServer((c) => {
    const s = connect(target, "127.0.0.1");
    c.pipe(s).pipe(c);
    sockets.add(c); sockets.add(s);
    const drop = () => { c.destroy(); s.destroy(); };
    c.on("error", drop); s.on("error", drop);
  });
  proxy.listen(port, "127.0.0.1", () => ((port = proxy.address().port), r()));
});
const stopProxy = () => new Promise((r) => { for (const s of sockets) s.destroy(); sockets = new Set(); proxy.close(r); });
const streams = async () => (await (await fetch(`${server.base}/api/streams`)).json()).streams;
await startProxy();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/${server.token("example-b")}/`, { waitUntil: "load" });
await page.evaluate(() => (window.__marker = "same page"));
const connected = await until(async () => (await streams()) === 1);
await stopProxy();
const dropped = await until(async () => (await streams()) === 0);
console.log("forward cut; stream was open:", !!connected, "| server saw it close:", !!dropped);
const stamp = `While cut ${Date.now()}`;
server.cli(["patch", "decks/example-b/s001", "-", "--worker", "w3"], JSON.stringify([{ op: "add", path: "/elements/s/props/caption", value: stamp }]));
await sleep(5000);
await startProxy();
console.log("forward restored");
const ok = await page.waitForFunction((s) => document.body.innerText.includes(s), stamp, { timeout: 15000 }).then(() => true, () => false);
const same = await page.evaluate(() => window.__marker === "same page");
console.log("edit made during the cut arrived:", ok, "| page not reloaded:", same);
await browser.close();
await stopProxy();
await server.stop();
const pass = !!connected && !!dropped && ok && same;
console.log(pass ? "PASS  the tab resumed after the cut without reloading" : "FAIL  resume");
process.exit(pass ? 0 : 1);
