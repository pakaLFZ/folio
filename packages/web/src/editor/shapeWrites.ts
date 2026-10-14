/**
 * Shape writes: one PATCH per edit, sent one at a time, each built from the
 * slide as the last write left it. On a revision conflict the edit is rebuilt
 * on the newer slide when the shape there is still as the user saw it; when
 * the shape itself moved, the newer version is kept and the user is told.
 */
import type { PatchOp, SlideSpec } from "@folio/core";
import { api, ApiError } from "../api";
import type { SlideRecord } from "../boot";
import type { DeckStore } from "./deckState";
import { shapeStamp } from "./shapeModel";

const queues = new WeakMap<DeckStore, Promise<void>>();

/** Send one patch and keep the saved slide. */
async function send(store: DeckStore, id: string, ops: PatchOp[], rev: string): Promise<void> {
  const saved = await api.patch(store.get().token, id, ops, rev);
  store.set((s) => ({ ...s, slides: { ...s.slides, [id]: { id, rev: saved.rev, spec: saved.spec, error: null } } }));
}

/** Keep the slide as the server has it. */
function keep(store: DeckStore, record: SlideRecord): void {
  store.set((s) => ({ ...s, slides: { ...s.slides, [record.id]: record } }));
}

/** Send a shape edit, rebuilding it once on a newer revision when the shape is unchanged there. */
async function run(store: DeckStore, id: string, name: string, build: (spec: SlideSpec) => PatchOp[]): Promise<void> {
  const record = store.get().slides[id];
  if (!record?.spec) return;
  const ops = build(record.spec);
  if (!ops.length) return;
  try {
    await send(store, id, ops, record.rev);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) return store.notify(`Shape not saved: ${(error as Error).message}`, "error");
    const theirs = error.problem.current as SlideRecord;
    if (!theirs?.spec) return void store.resync();
    if (shapeStamp(theirs.spec, name) !== shapeStamp(record.spec, name)) {
      keep(store, theirs);
      return store.notify(`${name} was changed elsewhere; your edit was not saved.`, "error");
    }
    await send(store, id, build(theirs.spec), theirs.rev).catch((again: Error) => store.notify(`Shape not saved: ${again.message}`, "error"));
  }
}

/**
 * Queue a shape edit on a slide.
 *
 * @param name - the shape's slot, whose state decides a conflict.
 * @param build - the patch, from the slide as it then stands.
 * @returns once this edit (and every one before it) is settled.
 */
export function writeShape(store: DeckStore, id: string, name: string, build: (spec: SlideSpec) => PatchOp[]): Promise<void> {
  const step = () => run(store, id, name, build);
  const next = (queues.get(store) ?? Promise.resolve()).then(step, step);
  queues.set(store, next);
  return next;
}

export const writeBox = writeShape;
