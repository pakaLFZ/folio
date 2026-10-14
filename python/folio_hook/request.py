"""The hook request, pure part: what folio sends a hook, and the size maths.

Every hook receives one JSON object with the same envelope: ``{"kind":
"figure" | "text" | "table", "slot", "role", "box": {"w": pt, "h": pt},
"deck", "slide", "input", "deck_dir"}``, where ``input`` is what the slot
received. A figure request adds ``"inputs"`` (the same object), ``"dpi"``,
``"out"`` and ``"format"``; the figure must be written at exactly the box size,
and is never cropped or rescaled afterwards.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

PT_PER_INCH = 72.0


@dataclass(frozen=True)
class Request:
    """One hook request.

    Attributes:
        inputs: what the slide asked to plot, already checked against the hook's schema.
        width_pt, height_pt: the slot box in pt.
        dpi: output resolution for raster output.
        out: the path the figure must be written to.
        format: "png" or "svg".
    """

    inputs: dict[str, Any]
    width_pt: float
    height_pt: float
    dpi: int
    out: str
    format: str = "png"
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def size_inches(self) -> tuple[float, float]:
        """The figure size matplotlib needs, in inches."""
        return (self.width_pt / PT_PER_INCH, self.height_pt / PT_PER_INCH)

    @property
    def size_pixels(self) -> tuple[int, int]:
        """The pixel size folio checks a PNG against: pt x dpi / 72, halves rounded up (as folio's own check)."""
        return (math.floor(self.width_pt * self.dpi / PT_PER_INCH + 0.5), math.floor(self.height_pt * self.dpi / PT_PER_INCH + 0.5))


@dataclass(frozen=True)
class SlotRequest:
    """A request to rewrite what a text or table slot received.

    Attributes:
        kind: "text" or "table".
        input: the raw text, or the table ``{"columns", "rows"}``.
        slot, role: the slot name and its role.
        width_pt, height_pt: the slot box in pt.
        deck, slide: the ids the slot belongs to.
    """

    kind: str
    input: Any
    slot: str
    role: str
    width_pt: float
    height_pt: float
    deck: str = ""
    slide: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def text(self) -> str:
        """The raw text of a text slot."""
        return self.input if isinstance(self.input, str) else ""

    @property
    def table(self) -> dict[str, Any]:
        """The table a table slot received."""
        return self.input if isinstance(self.input, dict) else {}


ENVELOPE = {"kind", "slot", "role", "box", "deck", "slide", "input"}


def parse_request(data: dict[str, Any]) -> Request | SlotRequest:
    """Build a request from the decoded JSON folio sent.

    Args:
        data: the decoded request object.

    Returns:
        A Request for a figure, a SlotRequest for text or a table. Raises
        ValueError naming the missing key.
    """
    if data.get("kind", "figure") != "figure":
        try:
            box = data["box"]
            return SlotRequest(
                kind=str(data["kind"]),
                input=data["input"],
                slot=str(data.get("slot", "")),
                role=str(data.get("role", "")),
                width_pt=float(box["w"]),
                height_pt=float(box["h"]),
                deck=str(data.get("deck", "")),
                slide=str(data.get("slide", "")),
                extra={k: v for k, v in data.items() if k not in ENVELOPE},
            )
        except KeyError as missing:
            raise ValueError(f"hook request lacks {missing}") from None
    try:
        box = data["box"]
        return Request(
            inputs=dict(data.get("inputs") or {}),
            width_pt=float(box["w"]),
            height_pt=float(box["h"]),
            dpi=int(data.get("dpi", 200)),
            out=str(data["out"]),
            format=str(data.get("format", "png")),
            extra={k: v for k, v in data.items() if k not in {"inputs", "box", "dpi", "out", "format"}},
        )
    except KeyError as missing:
        raise ValueError(f"hook request lacks {missing}") from None
