import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve, until } from "./lib/server.mjs";

const server = await serve({ decks: ["example-b"] });
const token = server.token("example-b");
const deck = server.deckDir("example-b");
const base = `${server.base}/${token}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const second = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
const check = (name, ok) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}`));
const order = () => JSON.parse(readFileSync(join(deck, "deck.json"), "utf8")).order;
const slide = () => JSON.parse(readFileSync(join(deck, "slides", "s001.json"), "utf8"));
const prop = (name) => slide().elements.s.props[name];
const request = async (method, path, body, worker) => {
  const res = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(worker ? { "x-folio-worker": worker } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const key = async (target, name) => {
  await target.locator("body").click({ position: { x: 10, y: 10 } });
  await target.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+${name}`);
};
const patch = async (path, value, worker) => request("PATCH", "/slides/s001", [{ op: "add", path: `/elements/s/props/${path}`, value }], worker);

try {
  await page.goto(`${base}/?slide=s001&mode=edit`);
  await second.goto(`${base}/?slide=s001&mode=edit`);
  await page.getByRole("button", { name: "Toggle slides" }).click();
  await page.locator("nav button[draggable]").first().click();
  await page.keyboard.press("Delete");
  await until(() => !order().includes("s001"));
  check("editor archive removes the slide", !order().includes("s001"));
  await key(second, "z");
  await until(() => order()[0] === "s001");
  check("second tab undoes archive in place", order()[0] === "s001");
  await second.reload();
  await key(second, "y");
  await until(() => !order().includes("s001"));
  check("reload keeps history and Ctrl+Y redoes archive", !order().includes("s001"));
  await key(second, "z");
  await until(() => order()[0] === "s001");

  await request("POST", "/order", { id: "s001", index: 1 });
  check("reorder writes", order()[1] === "s001");
  await key(second, "z");
  await until(() => order()[0] === "s001");
  check("reorder undo", order()[0] === "s001");
  await key(second, "y");
  await until(() => order()[1] === "s001");
  check("reorder redo", order()[1] === "s001");

  const text = prop("title");
  await patch("title", "UNDO TEXT");
  await key(second, "z");
  await until(() => prop("title") === text);
  check("text undo", prop("title") === text);
  await key(second, "y");
  await until(() => prop("title") === "UNDO TEXT");
  check("text redo", prop("title") === "UNDO TEXT");

  await patch("overrides", { slots: { title: { box: [40, 40, 600, 70] } } });
  await key(second, "z");
  await until(() => !prop("overrides"));
  check("box move and override undo", !prop("overrides"));
  await key(second, "y");
  await until(() => !!prop("overrides"));
  check("box move and override redo", !!prop("overrides"));

  const created = await request("POST", "/comments", { slide: "s001", region: [0, 0, 50, 50], text: "undo comment" });
  check("comment sent", created.status === 201);
  const cid = created.body.id;
  await until(async () => (await request("GET", `/comments/${cid}`)).body.shots, 20000);
  await request("POST", `/comments/${cid}/status`, { status: "resolved" });
  await key(second, "z");
  await until(async () => (await request("GET", `/comments/${cid}`)).body.status === "open");
  check("comment resolve undo", (await request("GET", `/comments/${cid}`)).body.status === "open");
  await key(second, "y");
  await until(async () => (await request("GET", `/comments/${cid}`)).body.status === "resolved");
  check("comment resolve redo", (await request("GET", `/comments/${cid}`)).body.status === "resolved");
  await key(second, "z");
  await until(async () => (await request("GET", `/comments/${cid}`)).body.status === "open");
  await key(second, "z");
  const commentFile = join(deck, "comments", `${cid}.json`);
  const archivedComment = join(deck, "comments", ".archive", new Date().toISOString().slice(0, 10), `${cid}.json`);
  await until(() => !existsSync(commentFile) && existsSync(archivedComment));
  check("comment send undo archives it after screenshot enrichment", !existsSync(commentFile) && existsSync(archivedComment));
  await key(second, "y");
  await until(() => existsSync(commentFile));
  check("comment send redo", existsSync(commentFile));
  const moved = await fetch(`${server.base}/api/inbox/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deck: token, id: cid, column: "held" }) });
  check("inbox route re-ranks the comment", moved.status === 200);
  await key(second, "z");
  await until(async () => (await request("GET", `/comments/${cid}`)).body.status === "open");
  check("inbox action undo", (await request("GET", `/comments/${cid}`)).body.status === "open");
  await key(second, "y");
  await until(async () => (await request("GET", `/comments/${cid}`)).body.status === "held");
  check("inbox action redo", (await request("GET", `/comments/${cid}`)).body.status === "held");

  await patch("title", "USER WRITE");
  await patch("title", "AGENT WRITE", "agent");
  const refused = await request("POST", "/undo");
  check("agent change refuses undo without overwriting it", refused.status === 409 && prop("title") === "AGENT WRITE");

  const archived = await request("POST", "/slides/s001/archive", {});
  check("slide archived for CLI restore", archived.status === 200 && !existsSync(join(deck, "slides", "s001.json")));
  const output = server.cli(["slide", "restore", "decks/example-b", "s001"]);
  check("CLI restore puts the slide back at its prior place", output.includes("restored s001") && order()[1] === "s001");
  let refusedRestore = false;
  try { server.cli(["slide", "restore", "decks/example-b", "s001"]); } catch (e) { refusedRestore = String(e.stderr).includes("already exists"); }
  check("CLI restore refuses an existing slide by name", refusedRestore);
  await patch("title", "CLI HISTORY");
  const undoOutput = server.cli(["undo", "decks/example-b"]);
  check("CLI undo prints the write and restores its bytes", undoOutput.includes("undid PATCH") && prop("title") === "AGENT WRITE");
  const redoOutput = server.cli(["redo", "decks/example-b"]);
  check("CLI redo prints the write and reapplies it", redoOutput.includes("redid PATCH") && prop("title") === "CLI HISTORY");
  server.cli(["slide", "rm", "decks/example-b", "s001"]);
  server.cli(["slide", "restore", "decks/example-b", "s001"]);
  check("CLI restore keeps position after a CLI archive", order()[1] === "s001");
} finally {
  await browser.close();
  await server.stop();
}
process.exit(results.every(Boolean) ? 0 : 1);
