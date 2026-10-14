// CLI check for `folio slide rm|move|dup|list`: an agent's only way to delete, reorder or duplicate a slide
// without the editor. Runs against its own copy of decks/example (s001, s002) on a free port, through the
// same DeckStore functions the editor rail uses, and confirms the running server's manifest and warnings
// endpoints see every change without a restart.
import { readFileSync } from "node:fs";
import { serve, until } from "./lib/server.mjs";
const server = await serve({ decks: ["example"] });
const deck = "decks/example";
const token = server.token("example");
const order = () => JSON.parse(readFileSync(`${server.deckDir("example")}/deck.json`, "utf8")).order;
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const manifest = async () => (await (await fetch(`${server.base}/${token}/manifest`)).json()).slides;
const warningsOf = async () => (await (await fetch(`${server.base}/${token}/warnings`)).json()).warnings;

check("list starts with the two fixture slides", JSON.stringify(JSON.parse(server.cli(["slide", "list", deck, "--json"])).map((r) => r.id)) === JSON.stringify(["s001", "s002"]), server.cli(["slide", "list", deck, "--json"]));

const dup = JSON.parse(server.cli(["slide", "dup", deck, "s001", "--json"]));
check("dup lands right after its source", order().join(",") === `s001,${dup.id},s002`, order().join(","));
check("the server's manifest sees the duplicate without a restart", (await manifest()).some((m) => m.id === dup.id), (await manifest()).map((m) => m.id).join(","));

server.cli(["slide", "move", deck, dup.id, "--to", "0"]);
check("move --to places it at the index", order()[0] === dup.id, order().join(","));

server.cli(["slide", "move", deck, dup.id, "--after", "s002"]);
check("move --after lands right after that slide", order().join(",") === `s001,s002,${dup.id}`, order().join(","));

server.cli(["slide", "move", deck, dup.id, "--before", "s001"]);
check("move --before lands right before that slide", order().join(",") === `${dup.id},s001,s002`, order().join(","));

let code409 = 0;
try {
  server.cli(["slide", "move", deck, dup.id, "--before", "s999"]);
} catch (error) {
  code409 = error.status;
}
check("moving in front of a slide that does not exist is refused, nothing written", code409 === 3 && order().join(",") === `${dup.id},s001,s002`, `exit ${code409}, order ${order()}`);

const rm = JSON.parse(server.cli(["slide", "rm", deck, dup.id, "--json"]));
const day = new Date().toISOString().slice(0, 10);
check("rm archives, never deletes", rm.archived[0] === dup.id && !order().includes(dup.id), order().join(","));
check("the archived file moved under slides/.archive/<date>/", JSON.parse(readFileSync(`${server.deckDir("example")}/slides/.archive/${day}/${dup.id}.json`, "utf8")).elements.s.type === "title", "archive file readable");

let rmMissingCode = 0;
try {
  server.cli(["slide", "rm", deck, "s999"]);
} catch (error) {
  rmMissingCode = error.status;
}
check("rm of an unknown id reports it as missing, not silently", rmMissingCode === 2, `exit ${rmMissingCode}`);

const dup2 = JSON.parse(server.cli(["slide", "dup", deck, "s001", "--json"]));
await until(async () => (await warningsOf()).length >= 0);
const beforeRowCount = JSON.parse(server.cli(["slide", "list", deck, "--json"])).length;
server.cli(["slide", "rm", deck, dup2.id]);
check("list reflects an rm without a server restart", JSON.parse(server.cli(["slide", "list", deck, "--json"])).length === beforeRowCount - 1, "ok");

const unlisted = "s900";
const fs = await import("node:fs");
fs.writeFileSync(`${server.deckDir("example")}/slides/${unlisted}.json`, readFileSync(`${server.deckDir("example")}/slides/s001.json`, "utf8"));
check("an unlisted file still renders, appended after the listed slides", order().includes(unlisted) === false && JSON.parse(server.cli(["slide", "list", deck, "--json"])).at(-1).id === unlisted, server.cli(["slide", "list", deck, "--json"]));
const orderWarning = await until(async () => (await warningsOf()).find((w) => w.code === "FOLIO-ORD-001" && w.location.slide === unlisted));
check("folio check / the warnings API reports it by name, with the fix", !!orderWarning && /folio slide move/.test(orderWarning.message) && /folio slide rm/.test(orderWarning.message), JSON.stringify(orderWarning));
fs.rmSync(`${server.deckDir("example")}/slides/${unlisted}.json`);

await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
