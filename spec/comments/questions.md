# Comments: questionnaires an agent asks the user, inside a comment conversation

## Demand

- "Design a questionnaire like layout with single or multiple choices and
  input box thing so that agent can ask user to fill them up for user to
  answer questions" *(user, 2026-10-13)*
- Read as a channel for agents to ask the user, not slide content: an agent
  working on a deck posts a questionnaire, the user fills it in the editor,
  and the agent reads the answers. It is built on the comment and inbox
  machinery: one file per record, the event stream, the CLI. *(brief,
  2026-10-13)*
- "I see we have a question tab. no, the design is that the question
  component lives within the tiny conversation within the comment
  conversation list instead of having its own tab. so its part of the
  comment converastion." *(user, 2026-10-13)*. This supersedes the
  Questions tab, the board's Questions column and its board setting, the
  inbox badge's separate question count, and the old rule that a
  questionnaire never sits in a comment's thread.

## Behaviour

### The record

- One questionnaire is one file, `decks/<deck>/questions/<id>.json`, so
  parallel agents and the user never share a file. The id is `q` followed by
  base-36 time and a random part (it sorts by time).
- Fields: `id`, `deck`, `comment` (the id of the comment conversation it
  belongs to; every questionnaire belongs to one), `title`, optional
  `intro`, optional `slide` and `region` (`[x, y, w, h]` in pt, only with
  `slide`), `asker` (the agent's name), `status` (`open`, `answered`,
  `withdrawn`), `questions`, `answers` (null until answered), `history`
  (earlier rounds of answers), `createdAt`, `updatedAt`.
- Each question has an `id` (letters, digits, `-` and `_`, unique in the
  questionnaire), a `prompt`, a `kind` and these optional fields:
  - `single`: radio buttons over `options` (at least two distinct strings);
  - `multi`: checkboxes over `options`, with optional `min` and `max`
    (0 <= min <= max <= the number of choices);
  - `text`: a one-line input, with optional `placeholder`;
  - `long`: a textarea, with optional `placeholder`;
  - `other: true` on `single` or `multi` adds a free-text "Other" choice;
  - `required` (default false);
  - `default`: an option for `single`, a list of options for `multi`, a
    string for `text` and `long`.
- An answer is the value per question id: `single` gives the option string,
  `multi` a list of option strings, `text` and `long` a string. The Other
  choice is `{"other": "the text"}`, in place of the option (single) or as an
  item of the list (multi). An unanswered optional question is left out.
- `answers` is `{by, at, round, values}`: who answered, when, the round
  (1 for the first submission, 2 after one edit, ...) and the values. An
  edit moves the previous answers to `history`; nothing is deleted.
- A schema validates what an agent posts. Every refusal names the field and
  the fix, one line each, e.g. `questions[1].options: a single question
  needs at least two options; give "options": ["...", "..."]`. Unknown keys
  are refused by name, so a misspelt field is caught. The server refuses an
  answer the same way: a missing required question, a value that is not an
  option, Other on a question without `other`, a count outside `min`/`max`.

### It lives in a comment conversation

- A questionnaire is a message of a comment's thread. Asking appends one
  message to the conversation, from the asker, with the text `title` (and
  the intro after a blank line, so `folio comment show`, search and
  notifications read it) and `question: {id, status}`: the questionnaire's
  id and its status, mirrored from the record.
- `comment` given: the message is appended to that comment. A comment that
  does not exist, or one that is resolved, is refused by name (`comment:
  ...; leave it out to start a new conversation`).
- `comment` left out: a new comment conversation is started, authored by
  the asker, on the questionnaire's `slide` and `region` when given, else on
  the deck's first slide as a whole-slide comment; its first message is the
  questionnaire message. The asker is its assignee, so no other worker
  claims it from the queue.
- The user is added to the conversation's followers, so the message counts
  as unread exactly like a new agent reply: the inbox header, the editor's
  inbox badge, the board's dot and the closed card's bell all pick it up, and
  opening the conversation marks it read.
- Whose turn: an open questionnaire is the asker's last message, so the
  conversation is the user's turn (the board's Review column). Once the user
  answers, the message's mirrored status becomes `answered` and the turn
  passes back to the agent (`commentTurn`), with no new message in the
  thread. Withdrawing sets the mirrored status to `withdrawn`.
- **Older questionnaire files without `comment`** (asked before this
  change) are never deleted, and not rewritten just to link them. The server
  links each one to a conversation the first time it reads it, and
  `folio serve` does so for every deck when it starts: it looks for a
  comment whose thread already carries a message with that questionnaire's
  id, and if there is none it starts a conversation the same way as an ask
  without `comment` (the message carries the record's status). The link is
  recorded on the comment's message, so the question file stays as it was
  until the user answers or the asker withdraws it (that write adds
  `comment`). Reads over HTTP return the record with `comment` filled in.
  There is no migration command.

### Agents

- `folio ask <deck> [--comment <cid>] [--file q.json] [--worker W] [--json]`
  posts a questionnaire, read from the file or from stdin, and prints its id
  (or the record with `--json`). `--comment` attaches it to that comment
  (it may also be given as `"comment"` in the JSON); without it a new
  conversation is started. It refuses with the schema's lines and exit 2.
  It goes through the running server when there is one, else writes the
  files.
- `folio ask --withdraw <id> [--worker W]` withdraws an open or answered
  questionnaire: status `withdrawn`, the file stays.
- `folio answers [<deck>] <id> [--wait] [--timeout S]` prints
  `{id, status, title, comment, answers, questions}` as one JSON line;
  `answers` is null while open. `--wait` blocks until the status is
  `answered` and then prints, through the server's event stream (polling the
  file once a second when no server runs); already answered returns at once.
  A withdrawal ends the wait with exit 5, `--timeout` with exit 4.
- The stream carries `question.posted`, `question.answered` and
  `question.withdrawn` events, each `{question}`, on the deck, and the
  comment's own `comment` event for the message and its status. A user's
  edit of their answers is a new `question.answered` with the next round.
  `folio watch` prints one `answers` line per submission and nothing for the
  agent's message or the mirrored status.
- HTTP: `GET /<deck>/questions`, `GET /<deck>/questions/<id>`,
  `POST /<deck>/questions` (the questionnaire, with optional `comment`;
  201, or 422 with the refusal lines in `detail` and `problems`),
  `POST /<deck>/questions/<id>/answers` `{answers}` (the user only; a worker
  is refused with 403), `POST /<deck>/questions/<id>/withdraw`.
- `folio_client`: `Deck.ask(questionnaire, comment=None)`,
  `Deck.questions()`, `Deck.answers(id)`, `Deck.withdraw_question(id)` and
  `Deck.wait_answers(id, timeout)`.
- The agent instructions (`folio prompt`, `catalog.prompt()`) and the folio
  skill say `folio ask` exists and when to use it: a decision only the user
  can make (which of two framings, whether a figure is final, a fact only
  they know), never something the agent can find out or decide itself; and
  that it is asked inside a comment conversation: when a user's comment
  needs a decision, reply to it with a questionnaire
  (`folio ask <deck> --comment <cid>`).

### What the user sees

- **In the thread.** Wherever a comment's thread is drawn (the editor's
  Comments tab once a card is opened, and the inbox board's floating chat
  panel), the questionnaire message is drawn in its place in time order, on
  the agent's side like a reply, as the form below inside a hairline card
  the full width of the thread (not a chat bubble: the form needs the
  width). In the Comments tab, when the questionnaire is the first message,
  the closed card shows its title and intro as the usual first bubble, and
  opening the card adds the form under it without repeating the title and
  intro.
- **The form** has the title, the asker and age, the intro, and one block
  per question: the prompt (with a quiet "Required" mark), then radios
  (radix `RadioGroup`), checkboxes (radix `Checkbox`), a one-line input or a
  textarea, all in the chrome's type sizes (13 px controls, 12 px labels,
  11 px notes), its 6 px control radius and hairlines, in both themes. Other
  adds a text field that takes focus when Other is chosen. It fits the
  thread's narrow width (the editor panel, the 380 px board panel).
- **Submit** is the one filled button. It is disabled until every required
  question is answered and every count is within `min`/`max`; until then a
  note under it lists which ("Answer 2 required questions: Framing,
  Figure"). Once the user has changed any answer, each question still
  missing shows its own one-line note ("This question needs an answer");
  a value that breaks a rule (a count outside `min`/`max`) shows its note
  at once. Notes are ink, not danger red: red is spent on the slide.
- **Drafts**: what the user has typed is kept per browser as they type
  (`localStorage` key `folio.question.<deck>.<id>`), so closing the card or
  the page and coming back keeps it; submitting clears it.
- **After submitting** the form switches to the answers read-only, with who
  and when, and an "Edit answers" button that reopens the form with them
  filled in; submitting again sends round 2 and a new `question.answered`
  event. Nothing else is posted into the thread.
- **Withdrawn** questionnaires show "Withdrawn by <asker>" and their
  questions read-only, with no Submit.
- **Rail**: a slide an open questionnaire points at carries a small ink dot
  at its thumbnail's top-left corner ("has an open question").
- **Links**: `?question=<id>` on an editor address opens the
  questionnaire's comment instead (its slide, the Comments tab, the card
  opened), and the address is rewritten to `?comment=<cid>`.

## Never

- A Questions tab in the editor's panel, or a Questions column (or its
  "Show Questions column" setting) on the inbox board *(removed 2026-10-13:
  "the question component lives within the tiny conversation")*.
- Anything added to the editor's Slide tab for questionnaires.
- A questionnaire outside a comment conversation, or inside a slide.
- A worker answering a questionnaire: answers are the user's.
- An extra thread message when the user answers (the form switches to its
  answered view; the agent learns of it from the event, `folio answers` or
  `folio watch`).
- Deleting a questionnaire or an earlier round of answers, or rewriting an
  older questionnaire file just to link it.
- Polling the server for answers while it runs (`--wait` follows the
  stream).
- Native `<select>` or unstyled browser radios and checkboxes.

## Where it lives

`packages/core/src/questions.ts` (record, `checkAnswers`,
`questionMessageText`), `packages/core/src/questionschema.ts`,
`packages/core/src/comments.ts` (`CommentMessage.question`, `commentTurn`),
`packages/server/src/questions/` (`service.ts`: ask, answer, withdraw, the
link to a conversation and the adoption of older files; `routes.ts`),
`packages/server/src/comments/service.ts` (`create` and `reply` with a
questionnaire message, `markQuestion`), `packages/cli/src/askcmds.ts`,
`packages/cli/src/services.ts` (registers the routes, adopts older files in
`folio serve`), `packages/core/src/catalog.ts` (the prompt section),
`skills/folio/SKILL.md`, `packages/web/src/questions/` (`useQuestions.ts`,
`QuestionForm.tsx`, `QuestionFields.tsx`, `QuestionMessage.tsx`),
`packages/web/src/comments/Chat.tsx` and `CommentsTab.tsx` (drawing it in the
thread), `packages/web/src/extensions.tsx` (`?question=` routing, the rail's
set), `packages/web/src/ui/field.tsx`, `packages/web/src/ui/choice.tsx`,
`packages/web/src/editor/Rail.tsx`, `python/folio_client/client.py`.

## Checks

`packages/core/test/questions.test.ts`: each refusal names its field and
fix (missing title, a single question with one option, duplicate ids, an
unknown key, a default not in the options, min above max, a region without
a slide, a blank comment); answers are refused for a missing required
question, a value not among the options, Other where not allowed, and a
count outside min/max; a complete answer passes; an answered questionnaire
message gives the turn back to the agent.
`packages/server/test/questions.test.ts` (a real workspace): ask without
`comment` starts a conversation authored by the asker with the user
following and one unread message, and the record names it; ask with
`comment` appends to that thread; an unknown or resolved comment is refused
by name; answer as the user (status answered, round 1, event
`question.answered`, the message's status answered, no new message, the
turn back to the agent), a worker's answer refused, an edit (round 2,
history kept), withdraw; an older file without `comment` is linked once,
left unchanged on disk, and linked to the same conversation on a second
read. `e2e/questions.mjs`: an isolated workspace; a bad questionnaire is
refused; a user comment, then `folio ask --comment` into it and an ask
through the API without one; the editor has no Questions tab and the board
no Questions column or setting; the form renders inline in the comment's
thread in the editor (all four kinds) and in the board's chat panel;
`?question=<id>` opens its comment; Submit is disabled until the required
answers are in; a draft survives a reload; submit; `folio answers --wait`
started before resolves and `folio answers` returns the answers; the thread
gained no message; Edit answers sends round 2; a withdrawn one reads
"Withdrawn by".
