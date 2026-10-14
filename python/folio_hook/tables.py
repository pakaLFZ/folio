"""Write a ``.table.json`` file that says what made it.

    from folio_hook import write_table
    write_table("decks/talk/barriers.table.json", ["Hop", "Barrier / eV"], rows,
                script=__file__, inputs=["runs/neb/summary.csv"])

The ``source`` block records the script, the command line, each input file
with its sha256, and the time. folio validates it, records it beside the
table and prints it in ``folio trace``; it never guesses one.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional, Sequence, Union

PathLike = Union[str, os.PathLike]


def sha256_of(path: PathLike) -> str:
    """The sha256 of a file's bytes."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_table(
    path: PathLike,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    script: Optional[PathLike] = None,
    inputs: Sequence[PathLike] = (),
    command: Optional[str] = None,
) -> dict[str, Any]:
    """Write ``{"columns", "rows", "source"}`` atomically.

    Args:
        path: the ``<subject>.table.json`` file, usually beside the deck's slides.
        columns: the header cells.
        rows: the body rows; every cell is written as a string.
        script: the script that made the table (``__file__``); the running script by default.
        inputs: the data files the table was computed from; each is recorded with its sha256.
        command: the command line; the running one by default.

    Returns:
        The JSON object written.
    """
    target = Path(path)
    if not target.name.endswith(".table.json"):
        raise ValueError(f"{target} must end in .table.json")
    body = [[str(cell) for cell in row] for row in rows]
    bad = next((i for i, row in enumerate(body) if len(row) != len(columns)), None)
    if bad is not None:
        raise ValueError(f"row {bad + 1} has {len(body[bad])} cells; the table has {len(columns)} columns")
    source = {
        "script": str(Path(script or sys.argv[0]).resolve()),
        "command": command if command is not None else " ".join([Path(sys.executable).name, *sys.argv]),
        "inputs": [{"path": str(Path(p).resolve()), "sha256": sha256_of(p)} for p in inputs],
        "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    table = {"columns": [str(c) for c in columns], "rows": body, "source": source}
    tmp = target.with_name(f".{target.name}.tmp")
    tmp.write_text(json.dumps(table, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, target)
    return table
