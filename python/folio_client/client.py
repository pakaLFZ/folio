"""HTTP client for a running folio server (standard library only)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class FolioError(Exception):
    """The server refused a request; ``problem`` is its RFC 9457 body."""

    def __init__(self, status: int, problem: dict[str, Any]):
        super().__init__(f"{status} {problem.get('title', '')}: {problem.get('detail', '')}")
        self.status = status
        self.problem = problem


class RevisionConflict(FolioError):
    """The slide changed since it was read; ``current`` holds the newer slide."""

    @property
    def current(self) -> dict[str, Any] | None:
        return self.problem.get("current")


def _call(url: str, method: str = "GET", body: Any = None, headers: dict[str, str] | None = None) -> Any:
    """Send one request and decode the JSON reply, raising FolioError on failure."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as err:
        problem = json.loads(err.read().decode() or "{}")
        raise (RevisionConflict if err.code == 409 else FolioError)(err.code, problem) from None


def viewing(base: str, wait_change: bool = False, timeout: float | None = None) -> dict[str, Any]:
    """What the user has open in the editor now: ``{"version", "tabs"}``, the tab most likely
    in front of the user first. Each tab names ``deck`` (e.g. ``decks/example``, which
    ``Deck.open`` and every ``folio`` command take), ``slide`` (id, position, layout),
    ``mode`` and ``selection``. ``wait_change`` blocks until the view changes; raises
    TimeoutError after ``timeout`` seconds."""
    import time

    url = f"{base.rstrip('/')}/api/viewing"
    now = _call(url)
    if not wait_change:
        return now
    deadline = None if timeout is None else time.monotonic() + timeout
    while True:
        left = 50 if deadline is None else min(50, deadline - time.monotonic())
        if left <= 0:
            raise TimeoutError(f"the view did not change within {timeout} s")
        fresh = _call(f"{url}?since={now['version']}&wait={max(1, int(left))}")
        if fresh["version"] != now["version"]:
            return fresh


@dataclass
class Slide:
    """One slide: its id, its revision and its spec. ``patch`` and ``set`` send
    the revision they were made on."""

    deck: "Deck"
    id: str
    rev: str
    spec: dict[str, Any] | None

    @property
    def props(self) -> dict[str, Any]:
        """The slot contents."""
        return (self.spec or {}).get("elements", {}).get((self.spec or {}).get("root", ""), {}).get("props", {})

    def patch(self, ops: list[dict[str, Any]]) -> "Slide":
        """Apply an RFC 6902 patch at this slide's revision.

        Returns:
            self, updated to the new revision. Raises RevisionConflict when stale.
        """
        reply = _call(self.deck.url(f"slides/{self.id}"), "PATCH", ops, {"if-match": f'"{self.rev}"', "x-folio-worker": self.deck.worker})
        self.rev, self.spec = reply["rev"], reply["spec"]
        return self

    def set(self, slot: str, value: Any) -> "Slide":
        """Set one slot (text, a figure path, or {"hook": ..., "inputs": ...})."""
        token = slot.replace("~", "~0").replace("/", "~1")
        return self.patch([{"op": "add", "path": f"/elements/{self.spec['root']}/props/{token}", "value": value}])

    def set_table(self, slot: str, columns: list[str] | None = None, rows: list[list[str]] | None = None,
                  src: str | None = None, table_style: str | None = None) -> "Slide":
        """Fill a table slot (``table:a``) with rows of one-line strings, or with
        ``src``, a deck-relative ``<subject>.table.json`` file of the same shape.
        ``table_style`` picks another of the pack's named table styles."""
        if (src is None) == (columns is None):
            raise ValueError("give columns and rows, or src, not both")
        value: dict[str, Any] = {"src": src} if src is not None else {"columns": columns, "rows": rows or []}
        if table_style is not None:
            value["tableStyle"] = table_style
        return self.set(slot, value)

    @property
    def overrides(self) -> dict[str, Any]:
        """The slide's overrides of its template (``{}`` when it follows the template)."""
        return self.props.get("overrides") or {}

    def _edit_overrides(self, edit: dict[str, Any]) -> "Slide":
        reply = _call(self.deck.url(f"slides/{self.id}/overrides"), "POST", edit, {"if-match": f'"{self.rev}"', "x-folio-worker": self.deck.worker})
        self.rev, self.spec = reply["rev"], reply["spec"]
        return self

    def set_overrides(self, values: dict[str, Any]) -> "Slide":
        """Override template values by dotted path, e.g. ``{"slots.note.box": [25, 120, 420, 380],
        "slots.note.text.size": 16, "background": "smoke"}``. An override wins over the template;
        prefer the template unless this slide truly needs a change. Raises FolioError (422)
        naming each bad path when the template's types refuse the result."""
        return self._edit_overrides({"set": values})

    def clear_overrides(self, paths: list[str] | None = None) -> "Slide":
        """Reset the given override paths to the template, or every override when ``paths`` is None."""
        return self._edit_overrides({"clearAll": True} if paths is None else {"clear": paths})

    def promote(self, name: str | None = None, description: str | None = None, keep_slide: bool = False,
                into_layout: bool = False, all_slides: bool = False) -> dict[str, Any]:
        """Turn this slide's overrides into a template: a new layout ``name`` of the deck's pack
        (the slide then uses it, unless ``keep_slide``), or, with ``into_layout`` and the explicit
        ``all_slides`` confirmation, its own layout, which changes every slide using that layout.
        Returns the server's outcome; the slide is reloaded."""
        body = {"as": name, "description": description, "keepSlide": keep_slide, "intoLayout": into_layout, "allSlides": all_slides}
        outcome = _call(self.deck.url(f"slides/{self.id}/promote"), "POST", {k: v for k, v in body.items() if v not in (None, False)},
                        {"x-folio-worker": self.deck.worker})
        self.reload()
        return outcome

    def reload(self) -> "Slide":
        """Read the slide again."""
        fresh = self.deck.slide(self.id)
        self.rev, self.spec = fresh.rev, fresh.spec
        return self


class Deck:
    """A deck on a folio server, addressed by its 8-hex token."""

    def __init__(self, base: str, token: str, worker: str = "python"):
        self.base = base.rstrip("/")
        self.token = token
        self.worker = worker

    @classmethod
    def open(cls, base: str, name: str, worker: str = "python") -> "Deck":
        """Find a deck by token, folder name or title."""
        decks = _call(f"{base.rstrip('/')}/api/decks")["decks"]
        for d in decks:
            if name in (d["token"], d["title"]) or d["dir"].rstrip("/").endswith("/" + name):
                return cls(base, d["token"], worker)
        raise FolioError(404, {"title": "No such deck", "detail": f"{name} is not one of {[d['title'] for d in decks]}"})

    def url(self, path: str) -> str:
        """An address under this deck."""
        return f"{self.base}/{self.token}/{path}"

    def manifest(self) -> list[dict[str, Any]]:
        """Every slide's id, revision, layout and title, in order."""
        return _call(self.url("manifest"))["slides"]

    def slide(self, slide_id: str) -> Slide:
        """Read one slide."""
        r = _call(self.url(f"slides/{slide_id}"))
        return Slide(self, r["id"], r["rev"], r["spec"])

    def new_slide(self, layout: str, props: dict[str, Any] | None = None, after: str | None = None) -> Slide:
        """Create a slide with the next free id and return it."""
        made = _call(self.url("slides"), "POST", {"layout": layout, "props": props or {}, "after": after}, {"x-folio-worker": self.worker})
        return self.slide(made["id"])

    def warnings(self) -> list[dict[str, Any]]:
        """The deck's current warnings (the same records folio check prints)."""
        return _call(self.url("warnings"))["warnings"]

    def comments(self, archived: bool = False) -> list[dict[str, Any]]:
        """The deck's comments (open ones, or all with archived=True), oldest first."""
        return _call(self.url("comments" + ("?archived=1" if archived else "")))["comments"]

    def search_comments(self, query: str = "", every_deck: bool = False, **filters: Any) -> list[dict[str, Any]]:
        """Search every comment of this deck (or of every deck with every_deck=True), in any status.

        Matches the whole chat and attachment names; every term must occur. Filters are
        slide, slot, status (a name or a list: open, answered, held, resolved, archived,
        queue, progress, review, done), author, since (a date) and limit.

        Returns:
            hits ranked by occurrences, then newest activity, each with its matching
            messages and snippets (matches in [brackets]) and the comment's url.
        """
        import urllib.parse

        if isinstance(filters.get("status"), (list, tuple)):
            filters["status"] = ",".join(filters["status"])
        params = {"q": query, **({} if every_deck else {"deck": self.token}), **{k: str(v) for k, v in filters.items() if v is not None}}
        return _call(f"{self.base}/api/comments/search?{urllib.parse.urlencode(params)}")["hits"]

    def upload(self, path: str) -> str:
        """Upload a file for a comment message; returns the upload id."""
        import mimetypes
        import os
        import urllib.parse

        with open(path, "rb") as f:
            data = f.read()
        kind = mimetypes.guess_type(path)[0] or "application/octet-stream"
        req = urllib.request.Request(self.url("uploads"), data=data, method="POST", headers={"content-type": kind, "x-file-name": urllib.parse.quote(os.path.basename(path))})
        with urllib.request.urlopen(req, timeout=120) as res:
            return json.loads(res.read().decode())["id"]

    def reply(self, cid: str, text: str, files: list[str] | None = None, answered: bool = False) -> dict[str, Any]:
        """Reply to a comment as this worker, with optional files; answered=True marks it done for review."""
        uploads = [self.upload(p) for p in files or []]
        return _call(self.url(f"comments/{cid}/reply"), "POST", {"text": text, "answered": answered, "uploads": uploads}, {"x-folio-worker": self.worker})

    def follow(self, cid: str, follow: bool = True) -> dict[str, Any]:
        """Follow (or stop following) a comment's chat as this worker."""
        return _call(self.url(f"comments/{cid}/follow"), "POST", {"follow": follow}, {"x-folio-worker": self.worker})

    def claim_next(self) -> dict[str, Any] | None:
        """Claim the top card of the workspace queue for this worker; None when the queue is empty."""
        r = _call(f"{self.base}/api/inbox/claim", "POST", {}, {"x-folio-worker": self.worker})
        return r["comment"]

    def ask(self, questionnaire: dict[str, Any], comment: str | None = None) -> dict[str, Any]:
        """Ask the user a questionnaire as this worker, as a message in comment ``comment``'s chat;
        without ``comment`` a new comment conversation is started. Returns the stored record
        (its ``id`` and ``comment`` included).

        Raises FolioError (422) whose ``problem["problems"]`` names each refused field and its fix.
        """
        body = {**questionnaire, "comment": comment} if comment else questionnaire
        return _call(self.url("questions"), "POST", body, {"x-folio-worker": self.worker})

    def questions(self) -> list[dict[str, Any]]:
        """Every questionnaire of the deck, any status, oldest first."""
        return _call(self.url("questions"))["questions"]

    def answers(self, qid: str) -> dict[str, Any] | None:
        """The answers to a questionnaire, ``{by, at, round, values}``, or None while it is open."""
        return _call(self.url(f"questions/{qid}"))["answers"]

    def withdraw_question(self, qid: str) -> dict[str, Any]:
        """Withdraw a questionnaire that no longer matters; its file stays."""
        return _call(self.url(f"questions/{qid}/withdraw"), "POST", {}, {"x-folio-worker": self.worker})

    def wait_answers(self, qid: str, timeout: float | None = None) -> dict[str, Any]:
        """Block until the user answers (or the asker withdraws) and return the record.

        Follows the deck's event stream; raises TimeoutError after ``timeout`` seconds.
        """
        import socket
        import time

        deadline = None if timeout is None else time.monotonic() + timeout
        req = urllib.request.Request(self.url("events"), headers={"accept": "text/event-stream"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as stream:
                for raw in stream:
                    line = raw.decode()
                    if line.startswith("event: hello") or (line.startswith("data: ") and ('"question.' in line or '"resync"' in line)):
                        record = _call(self.url(f"questions/{qid}"))
                        if record["status"] != "open":
                            return record
                    if deadline is not None and time.monotonic() > deadline:
                        break
        except (socket.timeout, TimeoutError):
            pass
        raise TimeoutError(f"no answer to {qid} within {timeout} s")

    def prompt(self) -> str:
        """The agent instructions generated from the deck's pack."""
        return _call(self.url("pack"))["prompt"]
