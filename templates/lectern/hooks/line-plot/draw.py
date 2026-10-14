"""line-plot hook: up to six series as lines, drawn at exactly the slot size."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style  # noqa: E402
from folio_hook import fail, run, save_figure, warn  # noqa: E402


def check_series(series: list[dict]) -> None:
    """Refuse series whose x and y differ in length; warn on unsorted x."""
    for s in series:
        if len(s["x"]) != len(s["y"]):
            fail(f"series {s['name']} has {len(s['x'])} x values and {len(s['y'])} y values")
        if any(b < a for a, b in zip(s["x"], s["x"][1:])):
            warn(f"x values of series {s['name']} are not increasing", field="series")
    if sum(1 for s in series if s.get("accent")) > 1:
        warn("more than one series is marked accent; the pack style allows one", field="series")


def draw(request) -> None:
    """Draw the line plot for one request."""
    inputs = request.inputs
    series = inputs["series"]
    check_series(series)
    research = inputs.get("style", "research") == "research"
    scale = style.scale_for(request.width_pt) if research else 1.6
    fig, ax = plt.subplots(figsize=request.size_inches, layout="constrained" if research else None)
    fig.patch.set_facecolor("white")
    colours = style.colours([bool(s.get("accent")) for s in series]) if research else [None] * len(series)
    handles = []
    for s, colour in zip(series, colours):
        (line,) = ax.plot(s["x"], s["y"], color=colour, linewidth=1.2 * scale / 1.5, marker="o" if s.get("markers") else None, markersize=3 * scale / 1.5)
        handles.append(line)
    ax.set_xlabel(inputs.get("x_label", ""))
    ax.set_ylabel(inputs.get("y_label", ""))
    if inputs.get("y_zero"):
        ax.set_ylim(bottom=0)
    if research:
        style.apply(ax, scale)
        if inputs.get("title"):
            style.title(ax, inputs["title"], scale)
        style.legend(fig, handles, [s["name"] for s in series], scale)
        style.pad(fig)
    else:
        if inputs.get("title"):
            ax.set_title(inputs["title"])
        ax.legend(handles, [s["name"] for s in series])
        fig.tight_layout()
    save_figure(fig, request)
    if research and style.collapsed(fig, ax):
        warn(f"the {request.width_pt:.0f} x {request.height_pt:.0f} pt box is too small for the labels at their minimum size; give the figure a larger slot", field="series")
    plt.close(fig)


if __name__ == "__main__":
    run(draw)
