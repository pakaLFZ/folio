"""The lectern plot style, as a pack option (folio itself imposes no style).

Near-black ink, neutral warm greys, one vermilion accent, IBM Plex Sans from
the pack's own fonts folder, a bold left panel title, a shared legend at the
bottom, a light y grid, no top or right spine. Sizes are the pack's sizes for
an 89 mm figure, scaled to the slot's width and never below them. Margins are
lengths, not fractions: the layout engine places labels, title and legend from
their measured sizes plus a fixed pad in pt, so a short or narrow box keeps
every label inside the figure and apart.
"""
from __future__ import annotations

from pathlib import Path

from matplotlib import font_manager, rcParams

INK = "#17191C"
SERIES = ["#17191C", "#8A867D", "#B9B5AC", "#4D5157"]
ACCENT = "#C23A1E"
GRID = "#E6E3DC"
FAMILY = "IBM Plex Sans"
FONTS = Path(__file__).resolve().parents[2] / "fonts"
ONE_COLUMN_PT = 89 / 25.4 * 72
PAD_PT = 3

for _file in FONTS.glob("IBMPlexSans-*.ttf"):
    font_manager.fontManager.addfont(str(_file))
if any(f.name == FAMILY for f in font_manager.fontManager.ttflist):
    rcParams["font.family"] = FAMILY
    rcParams["mathtext.fontset"] = "custom"
    rcParams["mathtext.rm"] = FAMILY
    rcParams["mathtext.it"] = f"{FAMILY}:italic"
    rcParams["mathtext.bf"] = f"{FAMILY}:bold"


def scale_for(width_pt: float) -> float:
    """How much larger than the 89 mm sizes the text must be for this box."""
    return max(1.0, min(2.0, width_pt / ONE_COLUMN_PT))


def colours(accent_flags: list[bool]) -> list[str]:
    """One colour per series: the accent for the flagged one, greys for the rest."""
    greys = iter(SERIES)
    return [ACCENT if flag else next(greys, SERIES[-1]) for flag in accent_flags]


def apply(ax, scale: float) -> None:
    """Style one axes: spines, ticks, grid and text colours."""
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK)
        ax.spines[side].set_linewidth(0.6)
    ax.tick_params(colors=INK, labelsize=7 * scale, width=0.6, length=3)
    ax.xaxis.label.set_color(INK)
    ax.yaxis.label.set_color(INK)
    ax.xaxis.label.set_size(7 * scale)
    ax.yaxis.label.set_size(7 * scale)
    ax.grid(axis="y", color=GRID, linewidth=0.5)
    ax.set_axisbelow(True)


def title(ax, text: str, scale: float) -> None:
    """A bold, left-aligned panel title in ink."""
    ax.set_title(text, loc="left", pad=4, fontsize=8 * scale, fontweight="bold", color=INK)


def legend(fig, handles, labels, scale: float) -> None:
    """The one shared legend: horizontal, frameless, below the panels."""
    fig.legend(handles, labels, loc="outside lower center", ncol=min(len(labels), 4), frameon=False, fontsize=7 * scale, labelcolor=INK, handlelength=1.6)


def pad(fig) -> None:
    """The space around and between the parts, in pt whatever the box size."""
    fig.get_layout_engine().set(w_pad=PAD_PT / 72, h_pad=PAD_PT / 72, wspace=0, hspace=0)


def collapsed(fig, ax) -> bool:
    """Whether the labels left the axes no room: the box is too small for the pack's sizes."""
    box = ax.get_position()
    return box.width <= 0.05 or box.height <= 0.05
