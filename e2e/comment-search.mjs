// Comment search on its own copies of decks/example and decks/example-b: comments in two decks, one resolved
// and one moved to Done, a reply and an attachment; `folio comment search --json` finds all of them, and the
// deck, slot and status filters narrow it.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "./lib/server.mjs";
const server = await serve();
const { base, root, cli } = server;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const post = (path, body, worker) => fetch(`${base}/${path}`, { method: "POST", headers: worker ? { "x-folio-worker": worker } : {}, body: JSON.stringify(body) }).then((r) => r.json());
const a = server.token("example");
const b = server.token("example-b");
const tag = `wombat${Date.now().toString(36)}`;
const open = await post(`${a}/comments`, { slide: "s002", region: [494, 110, 440, 100], marks: [], text: `${tag} the isotherm axis is unlabelled` });
const resolved = await post(`${a}/comments`, { slide: "s002", region: [25, 110, 440, 100], marks: [], text: `${tag} shorten the note` });
const archived = await post(`${b}/comments`, { slide: "s001", region: [25, 110, 440, 100], marks: [], text: `${tag} wrong barrier height` });
await post(`${a}/comments/${resolved.id}/reply`, { text: `Cut it to two lines; the quench${tag} sentence went.` }, "w9");
writeFileSync(join(root, `${tag}-spectrum.csv`), "x,y\n1,2\n");
cli(["comment", "reply", open.id, "Axis labelled; data attached.", "--attach", join(root, `${tag}-spectrum.csv`), "--worker", "w9"]);
await post(`${a}/comments/${resolved.id}/status`, { status: "resolved" });
await post("api/inbox/move", { deck: b, id: archived.id, column: "done" });
const ids = (r) => r.hits.map((h) => h.id).sort().join(",");
const want = [open.id, resolved.id, archived.id].sort().join(",");
const queries = {
  all: [tag], inReply: [`quench${tag}`], inFile: [`${tag}-spectrum`], barrier: [tag, "barrier"], nosuchword: [tag, "nosuchword"],
  byDeck: [tag, "--deck", "example-b"], bySlot: [tag, "--slot", "fig:a"], byStatus: [tag, "--status", "resolved"],
  byArchived: [tag, "--status", "archived,held"], byOpen: [tag, "--status", "open"], empty: ["--deck", "example-b", "--status", "done"],
};
const [found, human, none, shown] = await Promise.all([
  Promise.all(Object.values(queries).map(async (q) => JSON.parse(await server.cliAsync(["comment", "search", ...q, "--json"])))).then((r) => Object.fromEntries(Object.keys(queries).map((k, i) => [k, r[i]]))),
  server.cliAsync(["comment", "search", tag, "barrier"]),
  server.cliAsync(["comment", "search", `${tag}-absent`]),
  server.cliAsync(["comment", "show", archived.id]),
]);
const { all, inReply, inFile, byDeck, bySlot, byStatus, byArchived, byOpen, empty } = found;
check("every comment is found, resolved and archived included", ids(all) === want && all.hits.filter((h) => h.status === "resolved").length === 2, all.hits.map((h) => `${h.id} ${h.deck} ${h.status}`).join("; "));
const row = all.hits.find((h) => h.id === archived.id);
check("a hit carries deck, token, slots, followers and its address", row?.deck === "example-b" && row.token === b && row.slots.length > 0 && row.followers.includes("user") && row.url === `/${b}/?slide=s001&comment=${archived.id}`, JSON.stringify(row && { deck: row.deck, token: row.token, slots: row.slots, followers: row.followers, url: row.url }));
check("a word only in a reply is found, with its snippet", inReply.hits.length === 1 && inReply.hits[0].id === resolved.id && inReply.hits[0].messages[0].author === "w9" && inReply.hits[0].messages[0].snippet.includes(`[quench${tag}]`), JSON.stringify(inReply.hits[0]?.messages));
check("an attachment name is searched", ids(inFile) === open.id && /attached \[/.test(inFile.hits[0].messages.at(-1).snippet), JSON.stringify(inFile.hits[0]?.messages));
check("every term must match", found.barrier.hits.length === 1 && found.nosuchword.hits.length === 0, `tag+barrier ${found.barrier.hits.length}, tag+nosuchword ${found.nosuchword.hits.length}`);
check("--deck narrows to one deck", ids(byDeck) === archived.id, ids(byDeck));
check("--slot narrows to comments on that slot", ids(bySlot) === open.id, ids(bySlot));
check("--status narrows: resolved, archived, open", ids(byStatus) === [resolved.id, archived.id].sort().join(",") && ids(byArchived) === ids(byStatus) && ids(byOpen) === open.id, `resolved ${ids(byStatus)}; archived ${ids(byArchived)}; open ${ids(byOpen)}`);
check("an empty query with filters lists what passes them", empty.hits.some((h) => h.id === archived.id) && empty.hits.every((h) => h.token === b && h.status === "resolved"), `${empty.hits.length} hits`);
check("human output marks the match and names the command that reads it", human.includes(`[${tag}]`) && human.includes(`folio comment show ${archived.id}`) && none.trim() === "no comments match", human.split("\n")[0]);
check("comment show prints the whole chat of an archived comment", shown.includes("wrong barrier height") && shown.startsWith(archived.id), shown.split("\n")[0]);
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
