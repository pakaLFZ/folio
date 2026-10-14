# Comments: searching every comment

## Demand

- "allow agents to search any comments." *(user, 2026-10-12)*

## Behaviour

- One search covers **every** comment of every deck the workspace knows, in any
  state: open (Queue), in progress, review (answered), held, and resolved,
  which are the archived ones in `comments/.archive/`.
- It reads the whole chat of each comment: the first message, every reply from
  the user or an agent, and the names of the files attached to any message.
- The query is split into terms (a `"quoted phrase"` is one term). Matching is
  case-insensitive substring matching, and every term must occur somewhere in
  the comment, not necessarily in one message.
- Hits are ranked by the number of term occurrences, then by the most recent
  activity (`updatedAt`). An empty query with filters lists every comment that
  passes the filters, newest activity first.
- Filters: deck (token, folder name or title), slide, slot, status (one or
  more of `open`, `answered`, `held`, `resolved`, or the board's column names
  `queue`, `progress`, `review`, `done`; `archived` means resolved), author (of
  any message), since (a date: activity on or after it), limit (default 50).
  An unknown status is refused with the list of known ones.
- Each hit carries the deck's folder name, title and token, slide, slots,
  comment id, status and board column, the first author, followers, assignee,
  created and updated times, the number of hits, and every matching message
  (index, author, time, and a short snippet with each match in plain
  `[brackets]`), plus the comment's address `/<deck8>/?slide=…&comment=…`.
- **HTTP**: `GET /api/comments/search?q=…&deck=…&slide=…&slot=…&status=…&author=…&since=…&limit=…`
  returns `{ hits, total }`.
- **CLI**: `folio comment search "QUERY" [--deck D] [--slide S] [--slot X]
  [--status S[,S]] [--author A] [--since DATE] [--limit N] [--json]` prints one
  block per hit (id, deck/slide/slots, status, snippets) and the command that
  reads the whole chat, `folio comment show ID`. It asks the running server
  through `.folio/server.json`, and reads `decks/*/comments` itself when no
  server runs. No hits exits 0 and prints "no comments match".
- `folio comment show ID` prints a comment's whole chat, archived or not, with
  every attachment's path (`--json` for the record).
- **Python**: `Deck.search_comments(query, **filters)` calls the same endpoint
  for that deck, or for every deck with `every_deck=True`.

## Never

- Search limited to open comments: resolved, archived and held comments are
  searched like any other.
- Search limited to the first message or the last one.

## Where it lives

`packages/core/src/search.ts` (`searchComments`, `searchTerms`,
`statusMatches`), `packages/server/src/comments/search.ts` (`searchWorkspace`),
`routes.ts` (`/api/comments/search`), `packages/cli/src/searchcmd.ts`,
`python/folio_client/client.py` (`search_comments`).

## Checks

`packages/core/test/search.test.ts`: every term must match; a match in a reply;
a match in an attachment name; ranking; the status filter with resolved and
archived. `e2e/comment-search.mjs`: three comments with distinctive words, one
resolved and one moved to Done, all found by `folio comment search --json`; the
deck, slot and status filters narrow the hits.
