/** The template bank: every pack the workspace loaded, read-only. */
import type { FolioApp } from "./app.js";
import { sendJson, type Router } from "./httpkit.js";

/**
 * `GET /api/packs`: every loaded pack in full, sorted by name.
 *
 * @param router - the router.
 * @param app - the server state.
 */
export function packRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/api/packs", (_req, res) => {
    const packs = [...app.workspace.packs.values()].map((l) => l.pack).sort((a, b) => a.name.localeCompare(b.name));
    sendJson(res, 200, { packs });
  });
}
