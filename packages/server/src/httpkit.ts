/**
 * Small HTTP helpers on node:http: JSON replies, body reading, a path router,
 * the Origin check for writes, and static files.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream";

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, url: URL) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  names: string[];
  handler: Handler;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".ttf": "font/ttf", ".woff2": "font/woff2", ".woff": "font/woff", ".pdf": "application/pdf", ".webp": "image/webp", ".gif": "image/gif",
};

export class Router {
  private readonly routes: Route[] = [];

  /**
   * Register a route.
   *
   * @param method - HTTP method.
   * @param path - a path with `:name` segments and an optional trailing `*rest`.
   * @param handler - receives the named segments as `params`.
   */
  on(method: string, path: string, handler: Handler): this {
    const names: string[] = [];
    const source = path.replace(/([:*])(\w+)/g, (_, kind: string, n: string) => (names.push(n), kind === "*" ? "(.+)" : "([^/]+)"));
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), names, handler });
    return this;
  }

  /**
   * Dispatch a request.
   *
   * @returns true when a route handled it.
   */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL, path: string): Promise<boolean> {
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const m = route.pattern.exec(path);
      if (!m) continue;
      const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)]));
      await route.handler(req, res, params, url);
      return true;
    }
    return false;
  }
}

/** Send a JSON reply. */
export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

/** Send an RFC 9457 problem reply. */
export function sendProblem(res: ServerResponse, status: number, title: string, detail: string, extra: Record<string, unknown> = {}): void {
  res.writeHead(status, { "content-type": "application/problem+json", "cache-control": "no-store" });
  res.end(JSON.stringify({ type: "about:blank", title, status, detail, ...extra }));
}

/**
 * Read and parse a JSON request body.
 *
 * @param req - the request.
 * @param limit - the largest body accepted, in bytes.
 * @returns the parsed body; throws on bad JSON or an oversized body.
 */
export async function readBody<T>(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Whether a state-changing request may proceed.
 *
 * @param req - the request.
 * @returns true when there is no Origin (CLI, curl), when the Origin is a
 *   loopback host on any port (an SSH or VS Code forward), or when it matches
 *   the Host header. A forwarded `localhost` is accepted on purpose.
 */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Serve a file from inside a folder.
 *
 * @param res - the response.
 * @param root - the folder the file must stay inside.
 * @param rel - the requested relative path.
 * @param immutable - send a one-year immutable cache header (content-hashed URLs).
 * @returns false when the path escapes `root` or no file exists there.
 */
export function sendFile(res: ServerResponse, root: string, rel: string, immutable = false): boolean {
  const base = resolve(root);
  const full = resolve(base, normalize(rel).replace(/^([/\\])+/, ""));
  if (full !== base && !full.startsWith(base + sep)) return false;
  if (!existsSync(full) || !statSync(full).isFile()) return false;
  res.writeHead(200, {
    "content-type": TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(statSync(full).size),
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  // pipeline, not pipe: a response closed early also closes the file, which on Windows otherwise
  // stays open and blocks moving its folder (a resolved comment's attachments).
  pipeline(createReadStream(full), res, () => {});
  return true;
}
