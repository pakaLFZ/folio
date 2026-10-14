"""Draw a one-off figure with your own script, sized to its slot and traced.

    import matplotlib.pyplot as plt
    from folio_hook import save_traced, slot_size

    size = slot_size("decks/talk", "s004", "fig:a")
    fig = plt.figure(figsize=size.figsize)
    ...
    save_traced(fig, "decks/talk/fig/loop.png", script=__file__, inputs=["runs/summary.csv"])

``slot_size`` asks ``folio box`` for the slot's box as the slide lays it out
now (overrides and flowed heights count). ``save_traced`` saves the figure at
exactly its own size and writes ``loop.png.trace.json`` beside it: the box,
dpi, the script, the command line, each input with its sha256, the time and
the image's sha256. Run the script with ``folio py script.py`` (the
workspace's Python with this package importable); the recorded command that
draws it again is that same form. ``folio trace`` prints it, and ``folio check`` warns when
the slot's box changes and names the command that draws the figure again.
"""
from __future__ import annotations

import datetime
import json
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Sequence, Union

from .api import save_figure
from .call import folio_command
from .request import Request
from .tables import sha256_of

PathLike = Union[str, os.PathLike]
FORMATS = ("png", "svg", "pdf")


@dataclass(frozen=True)
class SlotSize:
    """A slot's box in pt; ``figsize`` is the same box in inches, for ``plt.figure``."""

    w_pt: float
    h_pt: float

    @property
    def figsize(self) -> tuple[float, float]:
        return (self.w_pt / 72, self.h_pt / 72)


def slot_size(deck: PathLike, slide: str, slot: str) -> SlotSize:
    """The box of one slot as the slide lays it out now.

    Args:
        deck: the deck folder, e.g. ``"decks/talk"``.
        slide: the slide id, e.g. ``"s004"``.
        slot: the slot, e.g. ``"fig:a"``.

    Returns:
        The box; raises RuntimeError with folio's message for an unknown slide or slot.
    """
    args = [*folio_command(), "box", f"{Path(deck)}/{slide}", slot, "--json"]
    done = subprocess.run(args, capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip() or f"folio box exited {done.returncode}")
    box = json.loads(done.stdout)
    return SlotSize(box["w"], box["h"])


def save_traced(
    fig: Any,
    path: PathLike,
    script: Optional[PathLike] = None,
    inputs: Sequence[PathLike] = (),
    dpi: int = 200,
    command: Optional[str] = None,
) -> dict[str, Any]:
    """Save a matplotlib figure at its own size, with its trace file beside it.

    Args:
        fig: the figure, made at the slot's size (``slot_size(...).figsize``).
        path: the image, ``.png``, ``.svg`` or ``.pdf``, inside the deck folder.
        script: the script that drew it (``__file__``); the running script by default.
        inputs: the data files it was drawn from; each is recorded with its sha256.
        dpi: the resolution of a PNG.
        command: the command that draws it again; by default ``folio py`` with the
            running script and its arguments, run from the working folder.

    Returns:
        The trace record written to ``<path>.trace.json``.
    """
    target = Path(path)
    format = target.suffix[1:].lower()
    if format not in FORMATS:
        raise ValueError(f"{target} must end in .png, .svg or .pdf")
    w_in, h_in = fig.get_size_inches()
    box = {"w": round(w_in * 72, 2), "h": round(h_in * 72, 2)}
    target.parent.mkdir(parents=True, exist_ok=True)
    save_figure(fig, Request(inputs={}, width_pt=box["w"], height_pt=box["h"], dpi=dpi, out=str(target), format=format))
    fig.set_size_inches(w_in, h_in)
    record = {
        "trace": 1, "kind": "figure-file", "file": target.name, "box": box, "dpi": dpi, "format": format,
        "cwd": str(Path.cwd()), "source": _source(script, inputs, command),
        "output": {"sha256": sha256_of(target), "bytes": target.stat().st_size},
    }
    trace = target.with_name(f"{target.name}.trace.json")
    tmp = trace.with_name(f".{trace.name}.tmp")
    tmp.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, trace)
    return record


def _folio() -> list[str]:
    """The folio CLI as the recorded command calls it; plain ``folio`` when none is found here."""
    try:
        return folio_command()
    except RuntimeError:
        return ["folio"]


def _source(script: Optional[PathLike], inputs: Sequence[PathLike], command: Optional[str]) -> dict[str, Any]:
    """The source block: the script, the command line, each input's sha256 and the time."""
    return {
        "script": str(Path(script or sys.argv[0]).resolve()),
        "command": command if command is not None else shlex.join([*_folio(), "py", *sys.argv]),
        "inputs": [{"path": str(Path(p).resolve()), "sha256": sha256_of(p)} for p in inputs],
        "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
