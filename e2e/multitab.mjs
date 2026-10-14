// Browser check: 10 tabs over two decks share one event stream, and a CLI edit reaches every tab of its deck.
// Serves its own copies of decks/example and decks/example-b.
import { chromium } from "playwright";
import { serve, until } from "./lib/server.mjs";
const server = await serve();
const { base } = server;
const decks = [server.token("example"), server.token("example-b")];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const pages = [];
for (let i = 0; i < 10; i += 1) {
  const page = await context.newPage();
  await page.goto(`${base}/${decks[i % 2]}/`, { waitUntil: "load" });
  pages.push(page);
}
const stats = () => fetch(`${base}/api/streams`).then((r) => r.json());
const shared = (s) => s.streams === 1 && (s.decks[0] === "all" || decks.every((d) => s.decks[0]?.includes(d)));
const streams = (await until(async () => ((s) => shared(s) && s)(await stats()))) ?? (await stats());
console.log("streams on server:", JSON.stringify(streams));
const stamp = `Edited by CLI ${Date.now()}`;
server.cli(["patch", "decks/example-b/s001", "-", "--worker", "w2"], JSON.stringify([{ op: "add", path: "/elements/s/props/caption", value: stamp }]));
const t0 = Date.now();
const seen = await Promise.all(pages.filter((_, i) => i % 2 === 1).map((p) => p.waitForFunction((s) => document.body.innerText.includes(s), stamp, { timeout: 5000 }).then(() => Date.now() - t0, () => -1)));
console.log("deck-b tabs saw the CLI edit after ms:", seen.join(" "));
await browser.close();
await server.stop();
const ok = shared(streams) && seen.every((ms) => ms >= 0);
console.log(ok ? "PASS  10 tabs share one stream and every deck-b tab saw the edit" : "FAIL  multitab");
process.exit(ok ? 0 : 1);
