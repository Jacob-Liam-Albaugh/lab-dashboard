"""Matplotlib backend for dashboard runs: renders like Agg, but saves every figure instead of showing it."""
import atexit
import os

from matplotlib._pylab_helpers import Gcf
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas  # noqa: F401

OUT = os.environ.get("LABDASH_FIG_DIR", ".")
_count = 0


def show(*args, **kwargs):
    global _count
    for manager in Gcf.get_all_fig_managers():
        _count += 1
        manager.canvas.figure.savefig(os.path.join(OUT, f"figure-{_count:02d}.png"), dpi=150, bbox_inches="tight")
    Gcf.destroy_all()


atexit.register(show)
