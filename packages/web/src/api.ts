/**
 * Calls to the folio server. Each returns parsed JSON or throws an `ApiError`
 * carrying the RFC 9457 problem the server sent.
 */
import type { Pack, PatchOp } from "@folio/core";
import { at, type ManifestEntry, type SlideRecord } from "./boot";

export class ApiError extends Error {
  constructor(readonly status: number, readonly problem: Record<string, unknown>) {
    super(String(problem.detail ?? problem.title ?? status));
  }
}

/**
 * Send a request and parse the reply.
 *
 * @param path - path under the root.
 * @param init - fetch options; a JSON body is passed as `json`.
 * @returns the parsed body.
 */
export async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(at(path), {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, typeof body === "object" ? body : { detail: body });
  return body as T;
}

/**
 * POST a PDF export and hand the browser the bytes as a download: the
 * server never writes the file, so a `fetch` + blob link is the only way to
 * save it, and it keeps the caller able to show busy state and report
 * failures while a multi-second render runs.
 *
 * @returns the saved file's name, its active warnings and its stale figures.
 */
async function downloadFile(path: string, fallback: string): Promise<{ file: string; warnings: number; stale: string[]; approximations: number }> {
  const res = await fetch(at(path), { method: "POST" });
  if (!res.ok) {
    const problem = res.headers.get("content-type")?.includes("json") ? await res.json() : { detail: await res.text() };
    throw new ApiError(res.status, problem);
  }
  const file = res.headers.get("x-folio-file") ?? fallback;
  const warnings = Number(res.headers.get("x-folio-warnings") ?? "0");
  const stale = (res.headers.get("x-folio-stale") ?? "").split(",").filter(Boolean);
  const approximations = Number(res.headers.get("x-folio-approximations") ?? "0");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  URL.revokeObjectURL(url);
  return { file, warnings, stale, approximations };
}

export const api = {
  manifest: (deck: string) => call<{ token: string; title: string; slides: ManifestEntry[] }>(`${deck}/manifest`),
  slide: (deck: string, id: string) => call<SlideRecord>(`${deck}/slides/${id}`),
  patch: (deck: string, id: string, ops: PatchOp[], rev: string) =>
    call<{ id: string; rev: string; spec: SlideRecord["spec"] }>(`${deck}/slides/${id}`, { method: "PATCH", json: ops, headers: { "if-match": `"${rev}"` } }),
  newSlide: (deck: string, layout: string, after: string | null) => call<{ id: string; rev: string }>(`${deck}/slides`, { method: "POST", json: { layout, props: {}, after } }),
  duplicate: (deck: string, id: string) => call<{ id: string; rev: string }>(`${deck}/slides/${id}/duplicate`, { method: "POST", json: {} }),
  archive: (deck: string, id: string) => call<{ archived: string }>(`${deck}/slides/${id}/archive`, { method: "POST", json: {} }),
  reorder: (deck: string, id: string, index: number) => call<{ order: string[] }>(`${deck}/order`, { method: "POST", json: { id, index } }),
  move: (deck: string, ids: string[], before: string | null) => call<{ order: string[] }>(`${deck}/order`, { method: "POST", json: { ids, before } }),
  paste: (deck: string, slides: unknown[], after: string | null) => call<{ ids: string[] }>(`${deck}/slides/paste`, { method: "POST", json: { slides, after } }),
  exportPdf: (deck: string) => downloadFile(`${deck}/export-pdf`, "deck.pdf"),
  exportPptx: (deck: string) => downloadFile(`${deck}/export-pptx`, "deck.pptx"),
  exportFolio: (deck: string) => downloadFile(`${deck}/export-folio`, "deck.folio.zip"),
  packs: () => call<{ packs: Pack[] }>("api/packs"),
  deckPack: (deck: string) => call<{ pack: Pack }>(`${deck}/pack`),
  archiveMany: (deck: string, ids: string[]) => call<{ archived: string[] }>(`${deck}/slides/archive`, { method: "POST", json: { ids } }),
  history: (deck: string, direction: "undo" | "redo") => call<{ ops: string[]; files: string[] }>(`${deck}/${direction}`, { method: "POST" }),
};
