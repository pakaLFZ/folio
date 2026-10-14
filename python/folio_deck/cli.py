"""The `folio` console script.

folio's CLI is a bundled Node program (`_dist/packages/cli/bin/folio.mjs`);
this just needs a Node to run it on. Rather than ask the user to install
Node, it runs on the Node that the `playwright` package already ships inside
its driver, and points the bundle's Playwright import at that same driver
(`FOLIO_PLAYWRIGHT`, read by `loadPlaywright` in `@folio/server`), so the
bundled CLI, Node and the browser automation it drives all come from one
`pip install`.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent / "_dist"
BUNDLE = DIST / "packages" / "cli" / "bin" / "folio.mjs"

PLAYWRIGHT_INSTALL = 'pip install "playwright>=1.62"'


def _driver() -> tuple[Path, Path]:
    """The Node executable and the playwright-core directory Playwright's own driver carries.

    Raises SystemExit, naming what is missing and the command that fixes it, instead of a traceback.
    """
    try:
        from playwright._impl._driver import compute_driver_executable
    except ImportError as error:
        raise SystemExit(f"folio needs the playwright package for its Node and Chromium; run: {PLAYWRIGHT_INSTALL}") from error

    try:
        node_exe, cli_js = compute_driver_executable()
    except Exception as error:  # pragma: no cover - depends on playwright internals
        raise SystemExit(f"folio could not ask playwright for its driver: {error}; run: {PLAYWRIGHT_INSTALL}") from error

    node_path, driver_dir = Path(node_exe), Path(cli_js).parent
    if not node_path.exists():
        raise SystemExit(f"folio needs playwright's own Node, missing at {node_path}; run: {PLAYWRIGHT_INSTALL}")
    if not (driver_dir / "package.json").exists():
        raise SystemExit(f"folio expected a playwright-core package at {driver_dir}, found none; run: {PLAYWRIGHT_INSTALL}")
    return node_path, driver_dir


def main(argv: list[str] | None = None) -> None:
    if not BUNDLE.exists():
        raise SystemExit(f"folio's bundled CLI is missing at {BUNDLE}; reinstall with: pip install --force-reinstall folio-deck")

    node_path, driver_dir = _driver()
    args = sys.argv[1:] if argv is None else argv
    env = os.environ.copy()
    env["FOLIO_PLAYWRIGHT"] = str(driver_dir)

    if sys.platform == "win32":
        import subprocess

        raise SystemExit(subprocess.call([str(node_path), str(BUNDLE), *args], env=env))
    os.execve(str(node_path), [str(node_path), str(BUNDLE), *args], env)


if __name__ == "__main__":
    main()
