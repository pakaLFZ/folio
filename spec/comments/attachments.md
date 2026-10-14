# Comments: files in messages

## Demand

- "make comments image insertable pls", then "ie, comments are file
  attachable (upload". *(user, 2026-10-12)*

## Behaviour

- Any message, the first or a reply, may carry files of any type, at most
  25 MB each. In the browser: the Attach button, paste, or drop onto the
  composer. From an agent: `folio comment reply <cid> "text" --attach F`
  (repeatable), or `folio_client`'s `reply(..., files=[...])`.
- An upload streams into the deck's staging folder `.folio/uploads/` and gets
  an id; sending the message moves the files into `comments/<cid>/` as
  `att-<n>-<safe name>` and lists them on the message (`file`, `name`, `type`,
  `bytes`). A draft keeps its uploads until it is sent or discarded.
- Images show as thumbnails that open full size; other files as a chip with
  name and size that downloads. A message may be files alone.
- `folio comments` prints every attachment's path, so a multimodal agent can
  open it.

## Never

- Embedding files in the comment JSON.

## Where it lives

`packages/server/src/comments/attachments.ts`, `routes.ts` (`/uploads`),
`packages/web/src/comments/Composer.tsx`, `packages/core/src/comments.ts`
(`Attachment`, `safeFileName`).

## Checks

`e2e/comments.mjs` (a CSV attached in the browser; a text file attached by a
worker's reply shows as a chip live).
