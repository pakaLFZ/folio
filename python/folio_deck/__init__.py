"""folio_deck: the folio slide-deck CLI, packaged for pip.

`folio` (see `cli.main`) finds Playwright's own bundled Node and execs the
bundled CLI at `folio_deck/_dist/packages/cli/bin/folio.mjs` on it, passing
stdin, stdout and the exit code straight through.
"""
from importlib.metadata import PackageNotFoundError, version as _version

try:
    __version__ = _version("folio-deck")
except PackageNotFoundError:
    __version__ = "0.0.0"

__all__ = ["__version__"]
