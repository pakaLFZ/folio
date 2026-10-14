/**
 * Live-stream hygiene, after cavitas's link hub: events are never dropped or
 * merged; readings (presence, queue progress, "drawing...") are last-wins.
 * One browser holds one stream for many decks, so its resume cursor carries a
 * sequence number per deck.
 */

export interface StreamMessage {
  deck: string;
  seq: number;
  type: string;
  kind: "event" | "reading";
  key?: string;
  data: unknown;
}

/**
 * Drop readings that a later reading of the same key replaces.
 *
 * @param messages - messages in arrival order.
 * @returns every event in order, and for each `(deck, type, key)` reading only
 *   the last one, at the position of that last one.
 */
export function coalesce(messages: StreamMessage[]): StreamMessage[] {
  const seen = new Set<string>();
  const kept: StreamMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.kind === "reading") {
      const id = `${m.deck}\u001f${m.type}\u001f${m.key ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
    }
    kept.push(m);
  }
  return kept.reverse();
}

/**
 * What a reconnecting client missed, from a deck's ring buffer.
 *
 * @param ring - the deck's recent events, oldest first, with increasing `seq`.
 * @param lastSeq - the last sequence number the client saw for this deck.
 * @param headSeq - the deck's latest sequence number, which can be ahead of the
 *   ring when the ring is empty.
 * @returns `{resync: false, messages}` with every event after `lastSeq`, or
 *   `{resync: true}` when some of them have already left the ring.
 */
export function replayFrom(ring: StreamMessage[], lastSeq: number, headSeq: number): { resync: true } | { resync: false; messages: StreamMessage[] } {
  if (lastSeq >= headSeq) return { resync: false, messages: [] };
  const oldest = ring[0]?.seq ?? headSeq + 1;
  if (lastSeq + 1 < oldest) return { resync: true };
  return { resync: false, messages: ring.filter((m) => m.seq > lastSeq) };
}

/**
 * Encode per-deck sequence numbers as one SSE event id.
 *
 * @param cursor - last sequence number per deck token.
 * @param epoch - the server run that numbered them; a restart starts a new one.
 * @returns `epoch!token:seq,token:seq`, sorted by token.
 */
export function encodeCursor(cursor: Record<string, number>, epoch: string): string {
  const pairs = Object.keys(cursor)
    .sort()
    .map((token) => `${token}:${cursor[token]}`)
    .join(",");
  return `${epoch}!${pairs}`;
}

/**
 * Decode a `Last-Event-ID` written by `encodeCursor`.
 *
 * @param id - the header value, possibly empty or malformed.
 * @returns the epoch (empty when absent) and the per-deck sequence numbers;
 *   malformed pairs are skipped.
 */
export function parseCursor(id: string | null | undefined): { epoch: string; seqs: Record<string, number> } {
  const text = id ?? "";
  const bang = text.indexOf("!");
  const epoch = bang >= 0 ? text.slice(0, bang) : "";
  const seqs: Record<string, number> = {};
  for (const pair of text.slice(bang + 1).split(",")) {
    const [token, seq] = pair.split(":");
    if (token && seq && /^\d+$/.test(seq)) seqs[token] = Number(seq);
  }
  return { epoch, seqs };
}

/** A deck as `affectedSlides` sees it: its token, pack and each slide's layout. */
export interface DeckLayouts {
  token: string;
  pack: string;
  slides: { id: string; layout: string }[];
}

/**
 * Which slides must re-render after a pack changes.
 *
 * @param change - the pack name and the layouts that changed, or null when the
 *   theme itself changed and every layout is affected.
 * @param decks - every mounted deck.
 * @returns slide ids per deck token, only for decks using that pack.
 */
export function affectedSlides(change: { pack: string; layouts: string[] | null }, decks: DeckLayouts[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const deck of decks) {
    if (deck.pack !== change.pack) continue;
    const ids = deck.slides.filter((s) => change.layouts === null || change.layouts.includes(s.layout)).map((s) => s.id);
    if (ids.length) out[deck.token] = ids;
  }
  return out;
}
