// Browser check for `folio viewing`: what an agent learns about the deck and slide the user has open. A page on
// slide 2 is named by `folio viewing --json` (deck path, position, layout); a slide switch ends a
// `--wait-change --since V`; `--wait-change --timeout` exits 4 when nothing moves; `folio status` and `folio prompt` carry
// their lines; a second tab is listed and closing one drops only it; a closed page leaves nothing open; a stopped server means no editor. Serves its own copy of
// decks/example on a free port.
import { chromium } from "playwright";
import { serve, until } from "./lib/server.mjs";
const server = await serve({ decks: ["example"] });
const token = server.token("example");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const viewing = () => JSON.parse(server.cli(["viewing", "--json"]));
const exitOf = (args) => {
  try {
    server.cli(args);
    return 0;
  } catch (error) {
    return error.status;
  }
};

check("nothing is open before a page loads", viewing().tabs.length === 0, JSON.stringify(viewing()));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => check("no page error", false, e.message));
await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
const onSecond = await until(() => viewing().tabs[0]?.slide?.id === "s002", 10000, 100);
const top = viewing().tabs[0];
check("viewing names the deck path and slide 2", onSecond && top.deck === "decks/example" && top.slide.position === 2 && top.slide.of === 2 && top.mode === "edit", JSON.stringify(top));
check("the slide's layout is given", typeof top?.slide?.layout === "string" && top.slide.layout.length > 0, top?.slide?.layout);
check("the plain text starts with the deck path", server.cli(["viewing"]).startsWith("deck      decks/example"), server.cli(["viewing"]).split("\n")[0]);
check("folio status has one viewing line", server.cli(["status"]).split("\n").filter((l) => l.startsWith("viewing: decks/example s002 (2 of 2)")).length === 1, server.cli(["status"]).split("\n").filter((l) => l.startsWith("viewing")).join(" | "));
check("folio prompt tells agents to run folio viewing", server.cli(["prompt", "decks/example"]).includes("To act on what the user is looking at, run `folio viewing`."), "prompt tail");

const started = Date.now();
const waiting = server.cliAsync(["viewing", "--json", "--wait-change", "--since", String(viewing().version), "--timeout", "20"]);
await page.keyboard.press("PageUp");
const changed = JSON.parse(await waiting);
check("--wait-change returns on a slide switch", changed.tabs[0]?.slide?.id === "s001" && changed.tabs[0].slide.position === 1, `${JSON.stringify(changed.tabs[0]?.slide)} after ${Date.now() - started} ms`);
check("--wait-change exits 4 at --timeout when nothing moves", exitOf(["viewing", "--wait-change", "--timeout", "1"]) === 4, "exit code");

const second = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await second.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
const both = await until(() => viewing().tabs.length === 2, 10000, 100);
check("a second tab is listed too", both && server.cli(["viewing"]).includes("other tabs (1):"), viewing().tabs.map((t) => t.slide?.id).join(","));
// A browser closing a tab fires pagehide, which Playwright's page.close() does not; leaving the page first does.
await page.goto("about:blank");
await page.close();
const oneLeft = await until(() => viewing().tabs.length === 1, 10000, 100);
check("closing one of two tabs drops only that tab", oneLeft && viewing().tabs[0].slide.id === "s002", JSON.stringify(viewing().tabs.map((t) => t.slide?.id)));
await second.close();
const gone = await until(() => viewing().tabs.length === 0, 10000, 100);
check("a closed page leaves nothing open", gone, JSON.stringify(viewing().tabs));
check("the text says no tab is open", server.cli(["viewing"]) === "no editor tab is open\n", server.cli(["viewing"]));
await browser.close();

await server.stop();
check("no server means no editor is open, exit 0", server.cli(["viewing"]).startsWith("no editor is open"), server.cli(["viewing"]).trim());

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
