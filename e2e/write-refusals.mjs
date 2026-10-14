// Slide writes that break the slide's schema are refused at once, on a fresh copy of decks/example on a free port:
// `folio patch` with an unknown prop, `folio new --props` with a table row too long, `PATCH /<deck8>/slides/<id>`
// with an unknown hook input and `POST /<deck8>/slides` with an unknown prop each answer 422, write nothing, keep
// the revision and say what is allowed. A slide broken by a hand edit still takes an unrelated patch, and
// `folio check` words its problem the same way; an overflowing slot's warning quotes where its text wrapped.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { start, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"] });
const server = await start(root);
const token = server.token("example");
const deck = server.deckDir("example");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const slideText = (id) => readFileSync(join(deck, `slides/${id}.json`), "utf8");
const order = () => JSON.parse(readFileSync(join(deck, "deck.json"), "utf8")).order;
const refusedCli = (args, input) => {
  try {
    server.cli(args, input);
    return { status: 0, stderr: "" };
  } catch (error) {
    return { status: error.status, stderr: String(error.stderr) };
  }
};
const http = async (method, path, body) => {
  const res = await fetch(`${server.base}/${token}/${path}`, { method, headers: { "content-type": "application/json", "x-folio-worker": "w" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

try {
  const title = slideText("s001");
  const unknown = refusedCli(["patch", "decks/example/s001", "-"], JSON.stringify([{ op: "add", path: "/elements/s/props/foo", value: "bar" }]));
  check(
    "folio patch refuses an unknown prop, listing the layout's slots",
    unknown.status === 2 && /^422 refused, nothing written; s001 stays at rev \w+:\n {2}\/elements\/s\/props\/foo: "foo" is not a slot of layout title; its slots: title, author; also background, overrides/.test(unknown.stderr) && slideText("s001") === title,
    unknown.stderr.trim(),
  );

  const before = order();
  const table = { columns: ["gas"], rows: [["co2", "n2"]] };
  const row = refusedCli(["new", "decks/example", "--template", "summary-table", "--props", JSON.stringify({ "table:a": table })]);
  check("folio new refuses a table row with too many cells", row.status === 2 && /table:a\/rows\/0: row 1 has 2 cells; the table has 1 columns \("gas"\), so every row has 1 cells/.test(row.stderr) && order().join() === before.join(), row.stderr.trim());

  const figure = slideText("s002");
  const rev = JSON.parse(server.cli(["show", "decks/example/s002"])).rev;
  const inputs = { hook: "line-plot", inputs: { series: [{ name: "x", x: [1, 2], y: [1, 2] }], colour: "red" } };
  const hook = await http("PATCH", "slides/s002", [{ op: "add", path: "/elements/s/props/fig:a", value: inputs }]);
  check(
    "the HTTP route refuses an unknown hook input with the allowed keys and the current revision",
    hook.status === 422 && /fig:a\/inputs\/colour: "colour" is not an input of this hook; allowed: title, x_label, y_label, series, y_zero, style; folio hook show lectern\/line-plot/.test(hook.body.detail) && hook.body.current?.rev === rev && slideText("s002") === figure,
    `${hook.status} ${hook.body.detail}`,
  );

  const made = await http("POST", "slides", { layout: "title", props: { titel: "x" } });
  check("POST /slides refuses an unknown prop", made.status === 422 && /props\/titel: "titel" is not a slot of layout title/.test(made.body.detail) && order().join() === before.join(), `${made.status} ${made.body.detail}`);

  const broken = JSON.parse(title);
  broken.elements.s.props.foo = "hand edit";
  writeFileSync(join(deck, "slides/s001.json"), JSON.stringify(broken, null, 2));
  const fixOne = refusedCli(["patch", "decks/example/s001", "-"], JSON.stringify([{ op: "replace", path: "/elements/s/props/author", value: "Someone else" }]));
  check("a slide broken by hand still takes an unrelated patch", fixOne.status === 0 && JSON.parse(slideText("s001")).elements.s.props.author === "Someone else", fixOne.stderr.trim() || "written");

  const report = server.cli(["check", "decks/example"]);
  check("folio check words a hand-edited prop by the layout's slots", /FOLIO-SPEC-001.*"foo" is not a slot of layout title; its slots: title, author/.test(report), report.split("\n").find((l) => l.includes("SPEC-001")) ?? report);
  const wrapped = report.split("\n").find((l) => l.includes("FOLIO-OVF-001")) ?? "";
  check("an overflow warning quotes where the text wrapped", / (It wraps as|It ends): "[^"]+" \/ "/.test(wrapped), wrapped || report);
} finally {
  await server.stop();
}

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
