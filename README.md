# lab-dashboard

A local, read-only dashboard for agentic research projects: autoresearch loops, paper
replications, sampler gauntlets. Point it at project folders and it shows their results,
charts, tables and notebooks, runs scripts, and turns pinned views into a presentation.

## Run

```bash
cp projects.example.json projects.json   # list your project folders
make dash                                # http://127.0.0.1:4300
```

Needs [bun](https://bun.sh) and [uv](https://docs.astral.sh/uv/) (for `.npz` files and figure capture).

## What it shows

| File | View |
|---|---|
| `capability-matrix.json` | Capability matrix: models × capabilities with kind, gate and required-capability filters; shown first on the project page when at the root |
| `results.tsv`, `runs/ledger.jsonl` | Experiment ledger: kept/discarded scatter, incumbent step line, per-run detail and artifacts |
| `*.npz`, `*.npy` | Per-array stats and series/histogram; MCMC chains get trace, R-hat and ESS |
| folder of `*.npz` | Sweep: mean and 90% band over a numeric key |
| folder of `*/*.json` | Comparison matrix: best metric per file, winner per row |
| folder with `paper_manifest.json` | Replication status: target matrix, run index, report PDF |
| `.ipynb`, `.md`, `.csv`, `.tsv`, `.jsonl`, images, PDF, video, HTML, code | Rendered inline |

Views refresh live when files change.

## Palettes

Pick a colour palette from the sidebar footer. Palettes live in `src/lib/palette.ts`
(name, light or dark, swatch) and `src/index.css` (one `[data-palette]` block of ten
colours each). More palettes to borrow from: [Color Hunt](https://colorhunt.co).

## Runs

The Runs page executes a command in the project folder through your login shell and
streams its output. `plt.show()` calls are captured as PNGs into the dashboard's own
`data/` folder, never the project.

## Present

Pin any file, chart or captured figure, then open **Present** (or press `p`) for a
full-screen slide deck. Arrow keys or space move between slides, `f` toggles fullscreen, and `Esc` exits.

## Notes

- The dashboard writes to project folders only when you save an edited file; its own state (pins, run logs) lives in `data/`.
- It binds to `127.0.0.1` and rejects cross-origin writes. Don't expose it on a network:
  the Runs page executes arbitrary commands.
- `make check` type-checks and runs the tests.
