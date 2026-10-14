"""A warm hook worker: imports the hook once, then draws one figure per request.

Usage (started by folio): python -m folio_hook.warm <hook_dir> <module>:<function>

Protocol: one JSON request per line on stdin; one JSON result per line on the
real stdout: {"ok": true, "warnings": [...], "response": {...} | null} or
{"ok": false, "error": "..."}. The response is a text or table hook's answer.
Anything the hook prints goes to stderr, so it cannot corrupt the protocol.
"""
from __future__ import annotations

import importlib
import json
import sys
import traceback

from .api import HookFailure, collect


def main(argv: list[str]) -> int:
    """Serve requests until stdin closes."""
    hook_dir, entry = argv[1], argv[2]
    module_name, func_name = entry.split(":")
    sys.path.insert(0, hook_dir)
    draw = getattr(importlib.import_module(module_name), func_name)
    protocol = sys.stdout
    sys.stdout = sys.stderr
    protocol.write(json.dumps({"ready": True}) + "\n")
    protocol.flush()
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            warnings, response = collect(draw, json.loads(line))
            result = {"ok": True, "warnings": warnings, "response": response}
        except HookFailure as failure:
            result = {"ok": False, "error": str(failure)}
        except Exception:  # the hook's own bug: report it, keep serving
            result = {"ok": False, "error": traceback.format_exc()[-2000:]}
        protocol.write(json.dumps(result) + "\n")
        protocol.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
