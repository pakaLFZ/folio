"""The lectern line-plot at many slot sizes: exact pixels, no text under the
house minimum, every label inside the figure and clear of the others.

Run: python python/tests/test_line_plot_sizes.py (exit 1 on a failure).
"""
from __future__ import annotations

import os
import sys
import tempfile
from itertools import combinations
from pathlib import Path

HOOK = Path(__file__).resolve().parents[2] / "templates" / "lectern" / "hooks" / "line-plot"
sys.path[:0] = [str(HOOK), str(HOOK.parents[3] / "python")]
os.environ.setdefault("MPLBACKEND", "Agg")

import draw  # noqa: E402
from folio_hook import Request, save_figure  # noqa: E402

SIZES = [(300, 200), (194.2, 151.7), (283.5, 144.6), (290.9, 239), (439.6, 360.2), (433.3, 200), (554.4, 367.2), (908.7, 300)]
INPUTS = {
    "title": "Energy profile",
    "x_label": "Reaction coordinate",
    "y_label": "$\\Delta E$ / eV",
    "series": [
        {"name": "Path A", "x": [0, 1, 2, 3, 4], "y": [0, 0.3, 0.68, 0.3, 0]},
        {"name": "Path B", "x": [0, 1, 2, 3, 4], "y": [0, 0.4, 0.74, 0.35, 0.05], "accent": True},
    ],
}
MIN_PT = 7.0


def ticks(prefix, places, labels, limits):
    """The tick labels drawn: those whose tick lies inside the axis limits."""
    low, high = sorted(limits)
    return [(f"{prefix}{i}", t) for i, (x, t) in enumerate(zip(places, labels)) if low - 1e-9 <= x <= high + 1e-9]


def texts(fig):
    """Every visible text of the figure with a name, its size in pt and its pixel box."""
    renderer = fig.canvas.get_renderer()
    ax = fig.axes[0]
    named = [("title", ax.title), ("xlabel", ax.xaxis.label), ("ylabel", ax.yaxis.label)]
    named += ticks("xtick", ax.get_xticks(), ax.get_xticklabels(), ax.get_xlim())
    named += ticks("ytick", ax.get_yticks(), ax.get_yticklabels(), ax.get_ylim())
    for legend in fig.legends:
        named += [(f"legend{i}", t) for i, t in enumerate(legend.get_texts())]
    return [(n, t.get_fontsize(), t.get_window_extent(renderer)) for n, t in named if t.get_visible() and t.get_text()]


def problems_at(w: float, h: float) -> list[str]:
    """What is wrong with the figure drawn for a w x h pt box."""
    found: list[str] = []
    out = os.path.join(tempfile.mkdtemp(), "f.png")
    request = Request(inputs=INPUTS, width_pt=w, height_pt=h, dpi=200, out=out)

    def capture(fig, req):
        save_figure(fig, req)
        fig.canvas.draw()
        width, height = fig.bbox.width, fig.bbox.height
        items = texts(fig)
        for name, size, box in items:
            if size < MIN_PT:
                found.append(f"{name} is {size:.1f} pt")
            if box.x0 < -1 or box.y0 < -1 or box.x1 > width + 1 or box.y1 > height + 1:
                found.append(f"{name} leaves the figure")
        for (a, _, ba), (b, _, bb) in combinations(items, 2):
            if a[:5] != b[:5] and ba.overlaps(bb):
                found.append(f"{a} overlaps {b}")
        return out

    draw.save_figure = capture
    draw.draw(request)
    from PIL import Image  # noqa: PLC0415 - matplotlib depends on Pillow

    size = Image.open(out).size
    want = request.size_pixels
    if size != want:
        found.append(f"{size} px, want {want}")
    return found


def main() -> int:
    failed = 0
    for w, h in SIZES:
        found = problems_at(w, h)
        failed += bool(found)
        print(f"{'FAIL' if found else 'PASS'}  {w} x {h} pt  {'; '.join(found)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
