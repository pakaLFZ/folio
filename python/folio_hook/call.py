"""Call a pack's hook from Python without a deck.

    from folio_hook import call
    result = call("lectern/line-plot", inputs, size=(120, 80), unit="mm", out="fig.png")

This runs ``folio hook run``, so the figure goes through the same key, cache,
runner and checks as a figure in a deck, and is identical to one. The CLI is
``$FOLIO_BIN``, else the repository's ``packages/cli/bin/folio.mjs`` beside
this ``python/`` folder, else ``folio`` on ``PATH``.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional, Sequence, Tuple, Union

REPO_CLI = Path(__file__).resolve().parents[2] / "packages" / "cli" / "bin" / "folio.mjs"


def folio_command() -> list[str]:
    """The command that starts the folio CLI.

    Returns:
        The program and its first arguments; raises RuntimeError naming
        ``FOLIO_BIN`` when no CLI can be found.
    """
    if os.environ.get("FOLIO_BIN"):
        return [os.environ["FOLIO_BIN"]]
    if REPO_CLI.exists() and shutil.which("node"):
        return ["node", str(REPO_CLI)]
    if shutil.which("folio"):
        return ["folio"]
    raise RuntimeError("folio CLI not found: set FOLIO_BIN to the folio executable")


def call(
    hook: str,
    inputs: Any,
    size: Optional[Tuple[float, float]] = None,
    out: Union[str, os.PathLike] = "figure.png",
    unit: str = "pt",
    dpi: Optional[int] = None,
    format: Optional[str] = None,
    workspace: Union[str, os.PathLike, None] = None,
    fresh: bool = False,
) -> dict[str, Any]:
    """Run one hook and write its output.

    Args:
        hook: ``pack/hook``, e.g. ``"lectern/line-plot"``.
        inputs: the hook's inputs, or a trace record (then ``size`` may be None).
        size: width and height of the box in ``unit``.
        out: the file to write.
        unit: ``pt``, ``mm`` or ``in``.
        dpi, format: override the hook's own.
        workspace: a folder inside the folio workspace; the working folder by default.
        fresh: draw again even when the cache has the figure.

    Returns:
        ``{"out", "key", "cached", "sha256", "trace", "matches"}``. Raises
        RuntimeError with folio's message when the hook fails or the inputs
        fail its schema.
    """
    args = [*folio_command(), "hook", "run", hook, "--inputs", "-", "--out", str(Path(out).resolve()), "--unit", unit, "--json"]
    args += _optional(size, dpi, format, fresh)
    done = subprocess.run(args, input=json.dumps(inputs), capture_output=True, text=True, cwd=str(workspace or Path.cwd()))
    if done.returncode not in (0, 1) or not done.stdout.strip():
        raise RuntimeError(done.stderr.strip() or f"folio hook run exited {done.returncode}")
    return json.loads(done.stdout.strip().splitlines()[-1])


def _optional(size: Optional[Sequence[float]], dpi: Optional[int], format: Optional[str], fresh: bool) -> list[str]:
    """The optional flags of ``folio hook run``."""
    flags: list[str] = []
    if size is not None:
        flags += ["--size", f"{size[0]},{size[1]}"]
    if dpi is not None:
        flags += ["--dpi", str(dpi)]
    if format is not None:
        flags += ["--format", format]
    if fresh:
        flags.append("--fresh")
    return flags
