# Vocabulary bank

The user's words and phrasing for slide text, learned from the user's own edits. Read it before writing any slide text (title, subtitle, label, caption, note); after the user edits a slide's text, compare it with what was written and add what changed here, with the date and the slide. A deck keeps its own bank in `decks/<deck>/vocabulary.md`, which inherits this one (`folio vocab init <deck>`).

## Words to use, and their replacements

One row per word: the word the user wants, the words they never want on a slide (comma-separated; a word in brackets or starting with "any" is a description, not checked), and when and why it was learned. `folio check` warns (FOLIO-VOC-001) when a slide uses a Never word; it never refuses or rewrites text.

| Use | Never | Since |
|---|---|---|

## Phrasing

The pack's starting conventions; replace any of them with the user's own as they are learned.

- A title names the page's subject in a few words; the subtitle states what the page found, as one sentence-case sentence with no full stop.
- A panel label opens with its letter in brackets and names what is plotted: "(a) Yield against temperature".
- An axis label is the quantity, a slash and the unit: "Temperature / K".
- A caption is one line: what is shown, the marks and the conditions. A term used there is defined there.
- Values go in a table; a note explains a cause, in words.
- Numbers that support a sentence go in brackets at its end: "the yield rises with temperature (12 % per 100 K)".

## Content

- A page holding one item that does not fill it (a code block, a single table) centres the item vertically between the rule and the caption.

## Status (log of the user's edits)
