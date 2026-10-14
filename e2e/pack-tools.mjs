// CLI check of the pack tools in an isolated workspace (fixture decks on lectern@1): import the fixture pptx as a
// draft pack and check it; a second import under the same name is refused; merge one of its layouts into lectern
// (refused on clashing styles first, then with the --rename flags the refusal names), keeping lectern's LF;
// rename that layout (version bump, decks re-pinned); remove a layout a deck uses (refused, naming the slide); set a
// value (version kept); export lectern as a zip and as a pptx, install the zip in a second workspace and import the
// pptx back with the same layouts; the server lists every pack. Serves its own workspace.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, repo, start, workspace } from "./lib/server.mjs";

const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const root = workspace({ decks: ["example", "example-b"] });
const folio = (args, cwd = root) => {
  const r = spawnSync("node", [bin, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const packJson = (name, dir = root) => readFileSync(join(dir, "templates", name, "pack.json"), "utf8");
const fixture = join(repo, "packages/cli/test/fixtures/fixture.pptx");

let r = folio(["pack", "import", fixture, "--name", "fx", "--from-slides"]);
check("import writes a draft that loads", r.code === 0 && r.out.includes("fx@1 is a valid pack"), r.out.split("\n").slice(-3).join(" | "));
r = folio(["pack", "check", "templates/fx"]);
check("folio pack check passes on the draft", r.code === 0, r.out.trim());
check("the draft has its report", readFileSync(join(root, "templates/fx/import-report.md"), "utf8").includes("## Layouts proposed from the slides"), "import-report.md");
r = folio(["pack", "import", fixture, "--name", "fx"]);
check("a second import under the same name is refused", r.code === 2 && r.out.includes("already exists") && r.out.includes("folio pack merge"), r.out.trim());

r = folio(["pack", "merge", "fx", "lectern", "--layouts", "title-only-s1"]);
const renames = [...r.out.matchAll(/--rename ([\w.:-]+)=<new>/g)].flatMap((m) => ["--rename", `${m[1]}=fx-${m[1].split(".").pop()}`]);
check("merge refuses clashing styles and names each --rename", r.code === 2 && renames.length > 0, `${renames.length / 2} renames named`);
r = folio(["pack", "merge", "fx", "lectern", "--layouts", "title-only-s1", ...renames]);
const merged = JSON.parse(packJson("lectern"));
check("merge with the renames copies the layout and keeps the version", r.code === 0 && merged.layouts["title-only-s1"] && merged.version === 2, r.out.split("\n").slice(-1)[0]);
check("lectern keeps its LF endings", !packJson("lectern").includes("\r"), "no CR added");

r = folio(["pack", "edit", "lectern", "layout", "rename", "title-only-s1", "results"]);
const pinned = JSON.parse(readFileSync(join(root, "decks/example/deck.json"), "utf8")).template;
check("rename bumps the version and re-pins the decks", r.code === 0 && JSON.parse(packJson("lectern")).version === 3 && pinned === "lectern@3", `${r.out.split("\n").filter((l) => l.startsWith("version") || l.startsWith("re-pinned")).length} lines; deck on ${pinned}`);
r = folio(["pack", "edit", "lectern", "layout", "remove", "note-figure"]);
check("removing a layout a deck uses is refused, naming the slide", r.code === 2 && /decks\/example\/s\d+/.test(r.out), r.out.split("\n")[1] ?? r.out);
r = folio(["pack", "edit", "lectern", "set", "roles.note.size=15"]);
check("set keeps the version", r.code === 0 && r.out.includes("version 3 kept") && JSON.parse(packJson("lectern")).roles.note.size === 15, r.out.trim().split("\n").join(" | "));

const zip = join(root, "lectern.zip");
const pptx = join(root, "lectern.pptx");
r = folio(["pack", "export", "lectern", "--zip", zip, "--pptx", pptx]);
check("export writes a zip and a pptx", r.code === 0, r.out.trim().split("\n").join(" | "));
const other = mkdtempSync(join(repo, "scratch/e2e", "pack-tools-other-"));
mkdirSync(join(other, "templates"), { recursive: true });
writeFileSync(join(other, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
execFileSync("unzip", ["-q", zip, "-d", join(other, "unzipped")]);
r = folio(["pack", "import", join(other, "unzipped/lectern")], other);
check("the zip installs in another workspace", r.code === 0 && JSON.parse(packJson("lectern", other)).version === 3, r.out.trim());
r = folio(["pack", "import", pptx, "--name", "back"]);
const back = JSON.parse(packJson("back"));
check("the pptx imports back with the same layouts", r.code === 0 && Object.keys(back.layouts).join() === Object.keys(JSON.parse(packJson("lectern")).layouts).join(), `${Object.keys(back.layouts).length} layouts`);

const server = await start(root);
const listed = (await (await fetch(`${server.base}/api/packs`)).json()).packs.map((p) => p.name);
check("the server loads every pack", ["back", "fx", "lectern"].every((n) => listed.includes(n)), listed.join(", "));
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
