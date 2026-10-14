"""Test hook: imports matplotlib (the cost warm mode saves) and draws a line."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from folio_hook import run, save_figure


def draw(request):
    """Draw one line at the box size."""
    fig, ax = plt.subplots()
    ax.plot([0, 1], [0, float(len(request.inputs["label"]))])
    save_figure(fig, request)
    plt.close(fig)


if __name__ == "__main__":
    run(draw)
