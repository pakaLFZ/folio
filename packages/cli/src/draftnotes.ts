/**
 * The drafts on a slide, as one line each for `folio comments` and `folio
 * viewing`: what the user drew and that `folio check` says how to draw it for
 * real (spec/slides/drafts.md).
 */
import { draftsOf } from "@folio/core";
import { toPosix, type DeckStore, type Workspace } from "@folio/server";

/** One line per draft on a slide; none when it has none or cannot be read. */
export function draftNotes(workspace: Workspace, store: DeckStore, slide: string): string[] {
  const pack = workspace.packOf(store)?.pack;
  const record = store.readSlide(slide);
  if (!pack || !record?.spec) return [];
  return draftsOf(pack, record.spec, `<deck>/${slide}`).map((d) => `${slide} has ${d.what} (${d.slot}), drawn by the user as a draft: draw the real element and remove the draft; folio check ${toPosix(store.dir).split("/").slice(-2).join("/")} says how`);
}
