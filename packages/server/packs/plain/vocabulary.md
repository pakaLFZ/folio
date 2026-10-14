# Vocabulary bank

The user's words and phrasing for slide text, learned from the user's own edits. Read it before writing any slide text (title, subtitle, label, caption, note); after the user edits a slide's text, compare it with what was written and add what changed here, with the date and the slide. A deck keeps its own bank in `decks/<deck>/vocabulary.md`, which inherits this one (`folio vocab init <deck>`).

## Words to use, and their replacements

One row per word: the word the user wants, the words they never want on a slide (comma-separated; a word in brackets or starting with "any" is a description, not checked), and when and why it was learned. `folio check` warns (FOLIO-VOC-001) when a slide uses a Never word; it never refuses or rewrites text.

| Use | Never | Since |
|---|---|---|

## Phrasing

- One rule per line, with its date and slide, e.g. "Passive voice on every slide (2026-10-08, slide 335)."

## Status (log of the user's edits)
