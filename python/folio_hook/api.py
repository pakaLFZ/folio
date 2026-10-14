"""The hook author's functions. Output goes through a sink so the same calls
work in a spawned process (JSON lines on stdout) and in a warm worker
(collected per request)."""
from __future__ import annotations

import json
import os
import sys
from typing import Any, Callable

from .request import Request, SlotRequest, parse_request


class HookFailure(Exception):
    """Raised by fail(); folio records the message and keeps the last good figure."""


_warnings: list[dict[str, Any]] | None = None


def warn(message: str, field: str | None = None) -> None:
    """Report a problem with the figure without failing it.

    Args:
        message: what is wrong, in plain words.
        field: the input key it concerns, if any.
    """
    record = {"warning": message, **({"field": field} if field else {})}
    if _warnings is not None:
        _warnings.append(record)
    else:
        sys.stdout.write(json.dumps(record) + "\n")
        sys.stdout.flush()


def fail(message: str) -> None:
    """Stop the hook; folio shows the last good figure with this message."""
    raise HookFailure(message)


def read_request(stream: Any = None) -> Request | SlotRequest:
    """Read the request folio wrote on stdin.

    Returns:
        The parsed request.
    """
    return parse_request(json.load(stream or sys.stdin))


def save_figure(fig: Any, request: Request) -> str:
    """Write a matplotlib figure at exactly the box size.

    The figure is resized to the box, saved without ``bbox_inches="tight"``
    (which would change the size), and written atomically. SVG ids use a fixed
    salt and folio sets ``SOURCE_DATE_EPOCH``, so equal requests give equal bytes.

    Args:
        fig: a matplotlib Figure.
        request: the hook request.

    Returns:
        The path written.
    """
    fig.set_size_inches(*_figure_inches(request))
    tmp = f"{request.out}.part"
    import matplotlib

    with matplotlib.rc_context({"svg.hashsalt": "folio"}):
        fig.savefig(tmp, dpi=request.dpi, format=request.format)
    os.replace(tmp, request.out)
    return request.out


VECTOR_FORMATS = {"svg", "pdf", "eps", "ps"}


def _figure_inches(request: Request) -> tuple[float, float]:
    """The figure size that gives exactly the box.

    A vector figure is the box in inches. matplotlib truncates a raster
    figure's pixel size, so a raster figure is sized a quarter pixel past the
    rounded size folio checks (``request.size_pixels``), which truncates to it.
    """
    if request.format in VECTOR_FORMATS:
        return request.size_inches
    w, h = request.size_pixels
    return ((w + 0.25) / request.dpi, (h + 0.25) / request.dpi)


def response_of(request: Request | SlotRequest, result: Any) -> dict[str, Any] | None:
    """The response line of a hook's return value.

    A figure hook returns nothing (its figure is the file). A text hook returns
    the new text; a table hook returns ``{"columns": [...], "rows": [[...]]}``.

    Returns:
        ``{"text": ...}``, ``{"columns": ..., "rows": ...}``, or None for a figure.
    """
    if isinstance(request, Request):
        return None
    if request.kind == "text":
        return {"text": result}
    table = result if isinstance(result, dict) else {}
    return {"columns": table.get("columns"), "rows": table.get("rows")}


def run(fn: Callable[[Any], Any]) -> None:
    """Run a hook script once: read the request, call fn, answer, exit.

    One entry point for every kind: a figure hook's fn saves its figure; a text
    hook's fn returns the new text; a table hook's fn returns the table. Exits
    0 on success, 1 after fail() or an exception (the message goes to stderr,
    which folio shows as the stderr tail).
    """
    try:
        request = read_request()
        response = response_of(request, fn(request))
    except HookFailure as failure:
        sys.stderr.write(f"{failure}\n")
        sys.exit(1)
    if response is not None:
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


def collect(fn: Callable[[Any], Any], data: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Run fn for one request inside a warm worker, collecting warnings.

    Returns:
        The warnings fn reported, and the response of a text or table hook.
    """
    global _warnings
    _warnings = []
    try:
        request = parse_request(data)
        return _warnings, response_of(request, fn(request))
    finally:
        _warnings = None
