import json
import math
import re
import sys
from pathlib import Path

import numpy as np

MAX_POINTS = 1000
MAX_COLUMNS = 16
BINS = 40
NUMBER = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def thin(a, n=MAX_POINTS):
    return a[:: max(1, len(a) // n)]


def series(a, n=MAX_POINTS):
    return [num(v) for v in thin(np.asarray(a, dtype=float), n).tolist()]


def num(v):
    return float(v) if v is not None and math.isfinite(v) else None


def finite(x):
    return x[np.isfinite(x)]


def stats(x):
    x = finite(np.asarray(x, dtype=float).ravel())
    if x.size == 0:
        return None
    lo, hi = np.quantile(x, [0.025, 0.975])
    return {"mean": float(x.mean()), "sd": float(x.std()), "lo": float(lo), "hi": float(hi), "min": float(x.min()), "max": float(x.max())}


def hist(x):
    x = finite(np.asarray(x, dtype=float).ravel())
    if x.size == 0:
        return None
    counts, edges = np.histogram(x, bins=BINS)
    return {"counts": counts.tolist(), "edges": edges.tolist()}


def split_rhat(c):
    n = c.shape[1] // 2
    s = np.concatenate([c[:, :n], c[:, n : 2 * n]])
    w = s.var(axis=1, ddof=1).mean()
    b = n * s.mean(axis=1).var(ddof=1)
    return float(np.sqrt(((n - 1) / n * w + b / n) / w)) if w > 0 else None


def ess(c):
    """Bulk ESS with Geyer's initial monotone sequence, as in Stan."""
    m, n = c.shape
    x = c - c.mean(axis=1, keepdims=True)
    f = np.fft.rfft(x, 2 * n)
    acov = np.fft.irfft(f * np.conj(f))[:, :n] / n
    w = (acov[:, 0] * n / (n - 1)).mean()
    var_plus = w * (n - 1) / n + (c.mean(axis=1).var(ddof=1) if m > 1 else 0.0)
    if var_plus <= 0:
        return None
    rho = 1 - (w - acov.mean(axis=0)) / var_plus
    rho[0] = 1.0
    tau, prev, t = -1.0, np.inf, 0
    while t + 1 < n:
        pair = min(rho[t] + rho[t + 1], prev)
        if pair < 0:
            break
        tau += 2 * pair
        prev, t = pair, t + 2
    return float(m * n / tau)


def column(x):
    x = np.asarray(x, dtype=float)
    idx = np.arange(len(x))
    return {"stats": stats(x), "hist": hist(x), "x": thin(idx).tolist(), "y": series(x), "ess": num(ess(finite(x)[None, :])) if finite(x).size >= 20 else None}


def chains(c):
    """c: (chains, draws)."""
    return {
        "stats": stats(c),
        "hist": hist(c),
        "rhat": num(split_rhat(c)) if np.isfinite(c).all() else None,
        "ess": num(ess(c)) if np.isfinite(c).all() else None,
        "x": thin(np.arange(c.shape[1]), 500).tolist(),
        "traces": [series(ch, 500) for ch in c],
    }


def band(s):
    """s: (samples, T) -> mean and 95% interval over samples."""
    lo, hi = np.nanquantile(s, [0.025, 0.975], axis=0)
    mean = np.nanmean(s, axis=0)
    idx = np.arange(s.shape[1])
    return {"x": thin(idx).tolist(), "mean": series(mean), "lo": series(lo), "hi": series(hi)}


def looks_like_chains(shape):
    return shape[0] <= 16 and shape[1] >= 100


def describe(name, a, mode):
    out = {"name": name, "shape": list(a.shape), "dtype": str(a.dtype)}
    if not np.issubdtype(a.dtype, np.number) or a.size == 0:
        return {**out, "kind": "other", "repr": repr(a.tolist())[:2000] if a.size <= 100 else None}
    a = a.astype(float)
    if a.size == 1:
        return {**out, "kind": "scalar", "value": num(a.ravel()[0])}
    if a.ndim == 1:
        return {**out, "kind": "columns", "columns": [column(a)]}
    if a.ndim == 2:
        if mode == "chains" or (mode == "auto" and looks_like_chains(a.shape)):
            return {**out, "kind": "chains", "columns": [chains(a)]}
        return {**out, "kind": "columns", "columns": [column(a[:, j]) for j in range(min(a.shape[1], MAX_COLUMNS))]}
    if a.ndim == 3:
        d = min(a.shape[2], MAX_COLUMNS)
        if mode == "chains" or (mode == "auto" and looks_like_chains(a.shape)):
            return {**out, "kind": "chains", "columns": [chains(a[:, :, j]) for j in range(d)]}
        return {**out, "kind": "band", "columns": [band(a[:, :, j]) for j in range(d)]}
    return {**out, "kind": "other"}


def inspect(file, mode="auto"):
    data = np.load(file, allow_pickle=False)
    items = data.items() if hasattr(data, "items") else [("array", data)]
    return [describe(k, v, mode) for k, v in items]


def sweep(directory, key):
    """Summarise one array across every .npz in a directory, keyed by the first number in each filename."""
    points, keys = [], set()
    for f in sorted(Path(directory).glob("*.npz")):
        with np.load(f, allow_pickle=False) as d:
            keys.update(d.files)
            match = NUMBER.search(f.stem.split("_", 1)[-1]) or NUMBER.search(f.stem)
            if key not in d.files or not match:
                continue
            a = np.asarray(d[key], dtype=float)
            a = a.reshape(len(a), -1) if a.ndim > 1 else a.reshape(-1, 1)
            points.append({"file": f.name, "x": float(match.group()), "columns": [stats(a[:, j]) for j in range(min(a.shape[1], MAX_COLUMNS))]})
    return {"keys": sorted(keys), "points": sorted(points, key=lambda p: p["x"])}


def self_check():
    rng = np.random.default_rng(0)
    iid = rng.normal(size=(4, 2000))
    assert abs(split_rhat(iid) - 1) < 0.01
    assert 6000 < ess(iid) < 10000, ess(iid)
    ar = np.zeros((4, 4000))
    for t in range(1, 4000):
        ar[:, t] = 0.9 * ar[:, t - 1] + rng.normal(size=4)
    assert 500 < ess(ar) < 1300, ess(ar)  # tau = (1 + 0.9) / (1 - 0.9) = 19
    stuck = iid + np.arange(4)[:, None] * 3
    assert split_rhat(stuck) > 1.5
    assert describe("s", rng.normal(size=(500, 30, 2)), "auto")["kind"] == "band"
    assert describe("c", iid, "auto")["kind"] == "chains"
    print("ok")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "check":
        self_check()
    else:
        print(json.dumps({"inspect": inspect, "sweep": sweep}[cmd](*args), allow_nan=False))
