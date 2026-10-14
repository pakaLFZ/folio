/**
 * Making and archiving decks: the one function `folio init-deck` and the
 * landing page's New deck button share, and the routes the page calls. A deck
 * asking for a built-in pack the workspace lacks gets it copied into
 * `templates/` first. Archiving is `DeckStore.setArchived`, shared with
 * `folio deck archive | unarchive`.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { relative } from "./posixpath.js";
import { parsePackRef } from "@folio/core";
import type { FolioApp } from "./app.js";
import { BUILTIN_PACKS_DIR, builtinPackNames, DEFAULT_PACK, installBuiltinPack } from "./builtin.js";
import type { WorkspaceConfig } from "./config.js";
import { DeckStore } from "./deckstore.js";
import { readJson } from "./fsutil.js";
import { readBody, sendJson, sendProblem, type Router } from "./httpkit.js";
import { deckOr404, workerOf } from "./routes-deck.js";
import type { Workspace } from "./workspace.js";

/**
 * Create a deck folder holding a `deck.json`.
 *
 * @param config - the workspace the deck belongs to.
 * @param dir - the new deck's folder.
 * @param title - the deck's title.
 * @param template - a pack reference; the built-in `plain@1` by default.
 * @returns the deck and the folder a built-in pack was installed into, if one
 *   was. Throws when the folder already holds a deck, or when the pack is
 *   neither installed nor built in, naming the packs there are.
 */
export function createDeck(config: WorkspaceConfig, dir: string, title: string, template = DEFAULT_PACK): { store: DeckStore; installed: string | null } {
  const installed = installBuiltinPack(config.templatesDir, template);
  const { name } = parsePackRef(template);
  if (!existsSync(join(config.templatesDir, name, "pack.json"))) {
    const here = existsSync(config.templatesDir) ? readdirSync(config.templatesDir).filter((n) => existsSync(join(config.templatesDir, n, "pack.json"))) : [];
    throw new Error(`pack ${template} is not installed in ${config.templatesDir} and is not built in; installed: ${here.join(", ") || "none"}; built in: ${builtinPackNames().join(", ")}`);
  }
  return { store: DeckStore.create(dir, title, template), installed };
}

/**
 * The folder name a title gives: lower case, runs of anything but letters and
 * digits made one hyphen.
 */
export function deckSlug(title: string): string {
  return title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * The packs a new deck may use: every pack the workspace loaded, then every
 * built-in pack it has not installed, each as `name@version`.
 */
export function deckTemplates(workspace: Workspace): string[] {
  const loaded = [...workspace.packs.values()].map((l) => `${l.pack.name}@${l.pack.version}`);
  const builtin = builtinPackNames()
    .filter((n) => !workspace.packs.has(n) && !workspace.packProblems.has(n))
    .map((n) => `${n}@${(readJson(join(BUILTIN_PACKS_DIR, n, "pack.json"), {}) as { version?: number }).version ?? 1}`);
  return [...loaded, ...builtin].sort();
}

/**
 * `GET /api/deck-templates` and `POST /api/decks` (`{ title, template? }`):
 * the deck is made under `decks/<slug of title>/` and mounted at once.
 */
export function newDeckRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/api/deck-templates", (_req, res) => sendJson(res, 200, { templates: deckTemplates(app.workspace), default: DEFAULT_PACK }));
  router.on("POST", "/api/decks", async (req, res) => {
    const body = (await readBody<{ title?: unknown; template?: unknown }>(req)) ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const template = typeof body.template === "string" && body.template ? body.template : DEFAULT_PACK;
    const slug = deckSlug(title);
    if (!slug) return sendProblem(res, 400, "No title", "A new deck needs a title with at least one letter or digit; its folder is named after it.");
    const dir = join(app.config.decksDir, slug);
    const rel = relative(app.config.root, dir);
    if (existsSync(dir)) return sendProblem(res, 409, "Deck exists", `${rel} already exists; choose another title.`);
    let made: ReturnType<typeof createDeck>;
    try {
      made = createDeck(app.config, dir, title, template);
    } catch (error) {
      return sendProblem(res, 422, "Pack not available", (error as Error).message);
    }
    if (made.installed) app.workspace.reloadPacks();
    app.workspace.mount(made.store);
    sendJson(res, 201, { token: made.store.token, dir: rel, title, template });
  });
  for (const [verb, archived] of [["archive", true], ["unarchive", false]] as const) {
    router.on("POST", `/api/decks/:deck/${verb}`, async (req, res, p) => {
      const store = deckOr404(app, res, p.deck!);
      if (!store) return;
      const deck = await store.setArchived(archived, workerOf(req));
      sendJson(res, 200, { token: store.token, title: deck.title, archived: deck.archived === true, archivedAt: deck.archivedAt ?? null });
    });
  }
}
