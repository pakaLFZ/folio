# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One researcher who reviews and lightly edits slide decks that AI agents build in parallel. The decks and the server live on a remote machine; the researcher views them in a desktop browser through an SSH port forward or VS Code Remote-SSH. Agents are the main writers and use the CLI; the browser is where the researcher sees their work arrive, steers it and judges it.

## Product Purpose

folio is an agent-first alternative to PowerPoint. Slides are JSON files filled into portable template packs; the browser shows every edit live, reports text that overflows its slot and figures whose plot hooks failed, lets the researcher fix wording in place, and lets them leave region comments (with sketches) that agents read and answer. Success: the researcher can watch several agents build different slides at once, spot every problem without hunting, and steer with a comment instead of a chat message.

## Positioning

Per-slot line limits declared once in the template and checked by the same renderer in the preview, the headless check and the PDF; text never shrinks to fit. One file per slide and per comment, so parallel writers never collide. Warnings never block a build.

## Operating Context

- Review sessions over an SSH-forwarded HTTP/1.1 connection; several decks open in several tabs at once.
- Agents run `folio new / patch / check / pdf / comments` from shells on the cluster while the researcher watches.
- The researcher is on Windows; no emoji or exotic glyphs anywhere in the UI.
- Desktop first in practice, but the chrome works down to 200 px wide.

## Capabilities and Constraints

- Edit text slots in place (bold, sub/superscript only); geometry, fonts and sizes belong to the template. Agents may override them per slide (validated by the template's own types); the Slide tab lists every override and resets it, with no drag or font controls.
- Reorder, duplicate and archive slides; swap a figure for a file in the deck; switch background variant.
- Region comments with threads, a sketch layer (pen, rectangle, arrow), server screenshots, and an inbox across decks. Only the researcher resolves a comment.
- Warning model follows LSP/SARIF: error, warning, note; red is spent only on warnings about the slide.
- Interface chrome is built with Shadcn-style components restyled by the cavitas tokens.

## Brand Commitments

- The editor chrome is an achromatic laboratory instrument, hairlines not shadows, 6 px controls (no pills, user 2026-10-12), monospace tabular numbers, one frosted pane over the scene. In folio the slide is the scene.
- Slide content never takes chrome tokens; it takes the deck's template pack.

## Evidence on Hand

- `templates/lectern/`: the first pack, geometry copied by hand from a real 51-slide research deck.
- `decks/example/`: one demo deck.
- No user testimonials, metrics or external users exist; do not invent any.

## Product Principles

1. The slide is the subject; the chrome recedes until something needs attention.
2. Every problem is visible where it happens and listed in one place, never as a modal.
3. Nothing the researcher writes is lost: drafts persist, conflicts show both versions.
4. Agents and the researcher see the same facts: the browser shows what `folio check` prints.
