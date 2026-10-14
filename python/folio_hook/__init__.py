"""folio_hook: write a folio hook as the function that fills one slot.

    from folio_hook import run, save_figure, warn

    def draw(request):
        fig = plt.figure()
        ...
        if not data:
            warn("no data for that run", field="runs")
        save_figure(fig, request)

    if __name__ == "__main__":
        run(draw)

A text hook (``"output": "text"`` in hook.json) returns the new text:

    def transform(request):
        return request.text.upper()

    if __name__ == "__main__":
        run(transform)

A table hook returns ``{"columns": [...], "rows": [[...], ...]}`` from
``request.table``. The same function serves both modes: ``"mode": "spawn"``
runs the script once per request, ``"mode": "warm"`` keeps a worker that
imports it once.

Any hook can also be called without a deck, through folio's own cache:

    from folio_hook import call
    call("lectern/line-plot", inputs, size=(120, 80), unit="mm", out="fig.png")

A script that computes a table writes it with its source, so it stays traced:

    write_table("decks/talk/barriers.table.json", columns, rows, script=__file__, inputs=["summary.csv"])

A figure no hook draws is drawn at its slot's size and saved with its trace:

    fig = plt.figure(figsize=slot_size("decks/talk", "s004", "fig:a").figsize)
    save_traced(fig, "decks/talk/fig/loop.png", script=__file__, inputs=["summary.csv"])
"""
from .api import HookFailure, fail, read_request, run, save_figure, warn
from .call import call
from .figures import SlotSize, save_traced, slot_size
from .tables import write_table
from .request import Request, SlotRequest, parse_request

__all__ = [
    "HookFailure", "Request", "SlotRequest", "SlotSize", "call", "fail", "parse_request", "read_request", "run", "save_figure", "save_traced",
    "slot_size", "warn", "write_table",
]
