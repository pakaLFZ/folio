/**
 * Region comments: create, reply, resolve, assign. A comment records the slots
 * its region covers as they are at that moment, and screenshots of the region
 * and the slide; a reply on a changed slide adds a new pair, so the thread
 * shows before and after. Only the user resolves; a worker may mark answered.
 */
import { readFileSync } from "node:fs";
import {
  clearable, commentTurn, intersectingSlots, rankOf, withFollower, makeWarning, marksBounds, slideLayout, slideRoot, textSlots,
  type Box, type ComponentSnapshot, type FolioComment, type FolioWarning, type InboxView, type Mark, type QuestionRef,
} from "@folio/core";
import type { FolioApp } from "../app.js";
import type { DeckStore } from "../deckstore.js";
import { readSlideState } from "../hooks/state.js";
import { refreshDerivedComment } from "../undo.js";
import { claimUploads } from "./attachments.js";
import { archiveComment, commentPath, freshCommentId, listComments, readComment, unarchiveComment, writeComment } from "./store.js";

export interface ShotTaker {
  capture: (store: DeckStore, comment: FolioComment, tag: string) => Promise<{ region: string; slide: string } | null>;
}

export class CommentService {
  shots: ShotTaker | null = null;

  constructor(private readonly app: FolioApp, readonly user = app.config.user) {
    app.warnings.addProvider((store, slide, _spec, at) => this.warningsOf(store, slide, at));
    app.listen((token, type, data) => {
      const m = type === "file" ? /^comments\/([^/]+)\.json$/.exec((data as { path: string }).path) : null;
      const store = m ? app.workspace.decks.get(token) : undefined;
      const comment = store && m ? readComment(store, m[1]!) : null;
      if (store && comment) this.changed(store, comment);
    });
  }

  /**
   * The slots a region covers, as they are now.
   *
   * @returns one snapshot per covered slot: text, figure or hook, and overflow.
   */
  snapshot(store: DeckStore, slide: string, region: Box): ComponentSnapshot[] {
    const record = store.readSlide(slide);
    const root = record?.spec ? slideRoot(record.spec) : null;
    const pack = this.app.workspace.packOf(store)?.pack;
    const layout = root && pack ? slideLayout(pack, root.layout, root.props) : undefined;
    if (!root || !layout || !pack) return [];
    const measured = new Map((this.app.warnings.measuredOf(store, slide) ?? []).map((m) => [m.slot, m]));
    const limits = new Map(textSlots(pack, layout).map((t) => [t.name, t.lineLimit]));
    const hooks = readSlideState(store, slide);
    return intersectingSlots(region, layout).map((slot) => {
      const value = root.props[slot];
      const base: ComponentSnapshot = { slot, role: layout.slots[slot]!.role };
      if (limits.has(slot)) return { ...base, text: typeof value === "string" ? value : null, overflow: measured.has(slot) ? { lines: measured.get(slot)!.lines, limit: limits.get(slot)! } : null };
      if (base.role === "shape") return { ...base, shape: value ?? null };
      if (base.role === "block") return { ...base, block: value ?? null };
      if (value && typeof value === "object") {
        const v = value as { hook: string; inputs: unknown };
        const state = hooks[slot];
        return { ...base, hook: { hook: v.hook, inputs: v.inputs, phase: state?.phase, lastRun: state?.record ? { status: state.record.status, seconds: state.record.seconds, warnings: state.record.warnings, stderrTail: state.record.stderrTail.slice(-400), at: state.record.at } : null } };
      }
      return { ...base, figure: typeof value === "string" ? value : null };
    });
  }

  /**
   * Create a comment.
   *
   * @param input - slide, region (or null to use the sketch's bounds), marks,
   *   text, staged upload ids to attach, and the questionnaire its first
   *   message asks (the asker then holds it and the user follows it).
   * @param author - `user` or a worker name.
   * @returns the comment; its screenshots arrive in a later `comment` event.
   */
  create(store: DeckStore, input: { slide: string; region: Box | null; marks: Mark[]; text: string; uploads?: string[]; question?: QuestionRef }, author: string): FolioComment {
    const record = store.readSlide(input.slide);
    if (!record) throw new Error(`slide ${input.slide} does not exist`);
    const canvas = this.app.workspace.packOf(store)?.pack.canvas ?? { w: 960, h: 540 };
    const region = input.region ?? marksBounds(input.marks) ?? [0, 0, canvas.w, canvas.h];
    const now = new Date().toISOString();
    const id = freshCommentId();
    const attachments = claimUploads(store, id, input.uploads ?? []);
    const comment: FolioComment = {
      id, deck: store.token, slide: input.slide, slideRev: record.rev, region, marks: input.marks,
      components: this.snapshot(store, input.slide, region), shots: null,
      thread: [{ author, at: now, text: input.text, slideRev: record.rev, ...(attachments.length ? { attachments } : {}), ...(input.question ? { question: input.question } : {}) }],
      status: "open", assignee: input.question ? author : null, followers: input.question ? withFollower([author], this.user) : [author], createdAt: now, updatedAt: now,
    };
    writeComment(store, comment);
    this.changed(store, comment);
    void this.attachShots(store, comment.id, 0);
    return comment;
  }

  /**
   * Take screenshots for a message and store their names on it.
   *
   * @param index - the message index; 0 also sets the comment's own shots.
   */
  async attachShots(store: DeckStore, cid: string, index: number): Promise<boolean> {
    const comment = readComment(store, cid);
    if (!comment || !this.shots) return false;
    const shots = await this.shots.capture(store, comment, index === 0 ? "" : `-${index}`).catch(() => null);
    const fresh = readComment(store, cid);
    if (!shots || !fresh || !fresh.thread[index]) return false;
    fresh.thread[index] = { ...fresh.thread[index]!, shots };
    if (index === 0) fresh.shots = shots;
    const path = commentPath(store, cid);
    const before = path ? readFileSync(path) : null;
    writeComment(store, fresh);
    if (path && before) refreshDerivedComment(store, path, before);
    this.changed(store, fresh);
    return true;
  }

  /**
   * Re-take a comment's screenshot pairs in the current style. A pair is
   * re-taken only while the slide is still at the revision it showed, so an
   * old pair never silently shows today's slide; `force` re-takes it anyway.
   *
   * @returns the message indices re-taken, and those kept with the reason.
   */
  async reshoot(store: DeckStore, cid: string, force = false): Promise<{ id: string; retaken: number[]; kept: { index: number; reason: string }[] }> {
    const comment = readComment(store, cid);
    if (!comment) throw new Error(`no comment ${cid}`);
    const now = store.readSlide(comment.slide)?.rev ?? null;
    const result = { id: cid, retaken: [] as number[], kept: [] as { index: number; reason: string }[] };
    for (const [index, m] of comment.thread.entries()) {
      if (index > 0 && !m.shots) continue;
      const rev = index === 0 ? comment.slideRev : m.slideRev;
      if (!force && rev !== now) result.kept.push({ index, reason: now ? `slide ${comment.slide} changed since (${rev} -> ${now})` : `slide ${comment.slide} is gone` });
      else if (await this.attachShots(store, cid, index)) result.retaken.push(index);
      else result.kept.push({ index, reason: this.shots ? "the screenshot failed" : "no screenshot browser" });
    }
    return result;
  }

  /**
   * Add a message to a thread.
   *
   * @param answered - a worker says the work is done: status becomes `answered`.
   * @param uploads - staged upload ids to attach to the message.
   * @param question - the questionnaire the message asks; the user then follows the thread.
   * @returns the updated comment.
   */
  reply(store: DeckStore, cid: string, author: string, text: string, answered = false, uploads: string[] = [], question?: QuestionRef): FolioComment {
    const comment = readComment(store, cid);
    if (!comment) throw new Error(`no comment ${cid}`);
    const rev = store.readSlide(comment.slide)?.rev ?? "";
    const lastRev = [...comment.thread].reverse().find((m) => m.slideRev)?.slideRev ?? comment.slideRev;
    const attachments = claimUploads(store, cid, uploads);
    comment.thread.push({ author, at: new Date().toISOString(), text, slideRev: rev, ...(attachments.length ? { attachments } : {}), ...(question ? { question } : {}) });
    comment.followers = withFollower(comment.followers ?? [comment.thread[0]!.author], author);
    if (question) comment.followers = withFollower(comment.followers, this.user);
    if (author !== this.user) comment.status = answered ? "answered" : comment.status === "resolved" || comment.status === "held" ? comment.status : "open";
    else if (comment.status === "answered") comment.status = "open";
    comment.updatedAt = new Date().toISOString();
    writeComment(store, comment);
    this.changed(store, comment);
    if (rev && rev !== lastRev) void this.attachShots(store, cid, comment.thread.length - 1);
    return comment;
  }

  /**
   * Resolve, reopen or mark answered.
   *
   * @param by - who asks; only the user may resolve.
   * @returns the updated comment; resolving moves it to the archive.
   */
  setStatus(store: DeckStore, cid: string, status: FolioComment["status"], by: string): FolioComment {
    if (status === "resolved" && by !== this.user) throw new Error("only the user resolves a comment; a worker may mark it answered");
    if (status === "open") unarchiveComment(store, cid);
    const comment = readComment(store, cid);
    if (!comment) throw new Error(`no comment ${cid}`);
    comment.status = status;
    delete comment.clearedAt;
    comment.updatedAt = new Date().toISOString();
    writeComment(store, comment);
    if (status === "resolved") archiveComment(store, cid);
    this.changed(store, comment);
    return comment;
  }

  /**
   * Mirror a questionnaire's status onto the thread message that asks it; no
   * message is added, so answering hands the turn back without a reply.
   *
   * @returns the updated comment, or null when no message of it asks that questionnaire.
   */
  markQuestion(store: DeckStore, cid: string, question: QuestionRef): FolioComment | null {
    const comment = readComment(store, cid);
    const message = comment?.thread.find((m) => m.question?.id === question.id);
    if (!comment || !message) return null;
    message.question = question;
    comment.updatedAt = new Date().toISOString();
    writeComment(store, comment);
    this.changed(store, comment);
    return comment;
  }

  /** Give a comment to a worker, so parallel workers do not both answer it. */
  assign(store: DeckStore, cid: string, assignee: string | null): FolioComment {
    const comment = readComment(store, cid);
    if (!comment) throw new Error(`no comment ${cid}`);
    comment.assignee = assignee;
    if (assignee) comment.followers = withFollower(comment.followers ?? [comment.thread[0]!.author], assignee);
    comment.updatedAt = new Date().toISOString();
    writeComment(store, comment);
    this.changed(store, comment);
    return comment;
  }

  /**
   * Move a card on the board: to a column, at a rank.
   *
   * @param column - `queue`, `held`, `review`, `done`; `progress` is entered by claiming.
   * @param rank - the new queue rank, or undefined to keep it.
   * @param by - who moves it; only the user may move a card to done.
   * @returns the updated comment.
   */
  move(store: DeckStore, cid: string, column: "queue" | "held" | "review" | "done" | "progress", rank: number | undefined, by: string): FolioComment {
    const before = readComment(store, cid);
    if (!before) throw new Error(`no comment ${cid}`);
    if (column === "done") return this.setStatus(store, cid, "resolved", by);
    if (before.status === "resolved") this.setStatus(store, cid, "open", by);
    const comment = readComment(store, cid)!;
    if (column === "held") comment.status = "held";
    if (column === "review") comment.status = "answered";
    if (column === "queue") {
      comment.status = "open";
      comment.assignee = null;
    }
    if (column === "progress" && !comment.assignee) throw new Error("a card enters In progress when a worker claims it: folio comment next");
    if (rank !== undefined) comment.rank = rank;
    comment.updatedAt = new Date().toISOString();
    writeComment(store, comment);
    this.changed(store, comment);
    return comment;
  }

  /**
   * "Clear all" on a board column, for the cards the user saw there. Done cards
   * gain `clearedAt` and leave the board while staying archived; cards in any
   * other column are resolved into Done. It runs synchronously, so no other
   * comment write lands between its cards.
   *
   * @param column - the column the cards were shown in.
   * @param ids - the cards shown; one that has left the column since is skipped.
   * @param by - who asks; only the user clears.
   * @returns the ids cleared and the ids skipped.
   */
  clear(store: DeckStore, column: Exclude<InboxView, "drafts">, ids: string[], by: string): { cleared: string[]; skipped: string[] } {
    if (by !== this.user) throw new Error("only the user clears a column");
    const out = { cleared: [] as string[], skipped: [] as string[] };
    for (const id of ids) {
      const comment = readComment(store, id);
      if (!comment || !clearable(comment, column, this.user)) {
        out.skipped.push(id);
        continue;
      }
      if (column === "done") {
        comment.clearedAt = new Date().toISOString();
        writeComment(store, comment);
        this.changed(store, comment);
      } else this.setStatus(store, id, "resolved", by);
      out.cleared.push(id);
    }
    return out;
  }

  /**
   * Follow or unfollow a comment.
   *
   * @param who - the user or a worker name.
   * @param follow - true to follow, false to stop.
   * @returns the updated comment.
   */
  follow(store: DeckStore, cid: string, who: string, follow: boolean): FolioComment {
    const comment = readComment(store, cid);
    if (!comment) throw new Error(`no comment ${cid}`);
    comment.followers = withFollower(comment.followers ?? [comment.thread[0]?.author ?? this.user], who, follow);
    writeComment(store, comment);
    this.changed(store, comment);
    return comment;
  }

  /**
   * Claim the top card of the queue for a worker.
   *
   * @param stores - the decks to look in.
   * @param worker - who claims it.
   * @returns the claimed comment and its deck, or null when the queue is empty.
   */
  claimNext(stores: DeckStore[], worker: string): { store: DeckStore; comment: FolioComment } | null {
    const queue = stores
      .flatMap((store) => listComments(store).map((comment) => ({ store, comment })))
      .filter(({ comment }) => comment.status === "open" && !comment.assignee && commentTurn(comment.thread, this.user) === "agent")
      .sort((a, b) => rankOf(a.comment) - rankOf(b.comment));
    const top = queue[0];
    if (!top) return null;
    return { store: top.store, comment: this.assign(top.store, top.comment.id, worker) };
  }

  /**
   * Why a comment no longer points at anything, if it does not.
   *
   * @returns `slide s003 was archived`, `slot fig:b no longer exists`, or null.
   */
  orphanReason(store: DeckStore, comment: FolioComment): string | null {
    const record = store.readSlide(comment.slide);
    if (!record) return `slide ${comment.slide} was archived`;
    const root = record.spec ? slideRoot(record.spec) : null;
    const pack = root ? this.app.workspace.packOf(store)?.pack : undefined;
    const layout = root && pack ? slideLayout(pack, root.layout, root.props) : undefined;
    const gone = layout ? comment.components.map((c) => c.slot).filter((s) => !layout.slots[s]) : [];
    return gone.length ? `slot ${gone.join(", ")} no longer exists` : null;
  }

  private warningsOf(store: DeckStore, slide: string, at: string): FolioWarning[] {
    return listComments(store).filter((c) => c.slide === slide && c.status !== "resolved" && c.status !== "held").flatMap((c) => {
      const out: FolioWarning[] = [];
      const location = { deck: store.token, slide, ...(c.components[0] ? { slot: c.components[0].slot } : {}) };
      if (c.status === "open" && commentTurn(c.thread, this.user) === "agent") out.push(makeWarning("FOLIO-CMT-001", location, { thread: c.id, author: c.thread[c.thread.length - 1]?.author ?? this.user }, { at, subject: c.id }));
      const orphan = this.orphanReason(store, c);
      if (orphan) out.push(makeWarning("FOLIO-CMT-002", location, { thread: c.id, reason: orphan }, { at, subject: `${c.id}:orphan` }));
      return out;
    });
  }

  private changed(store: DeckStore, comment: FolioComment): void {
    this.app.emit(store.token, "comment", { comment });
    this.app.publishWarnings(store, comment.slide, null);
  }
}
