# print-pipeline

The code that turns a Tags › Production print order into a print file for the Bambu Lab A1: per-code meshes, the
`.3mf` project, the slice, and the checks (QR decoded from layer 1 of the G-code for every piece). It is moving here
from the 3D Printing repository on Google Drive (`NFC Signs/*/source/`, `.claude/library/scripts/`); the plan, the
contract and the phases are in [`../docs/PRINT_EXECUTION_PLAN.md`](../docs/PRINT_EXECUTION_PLAN.md).

Xpot is the record of what was ordered, built and printed; this folder holds no state. Input is an order's ticket
(JSON), output is a folder of files the bench attaches to the order.

## Today (phase 1)

Only `bench.py`, the command-line side of the bench (standard library only):

```bash
python print-pipeline/bench.py pair <code>
```

The code comes from Xpot › Tags › NFC writers › pair a computer. The token is saved in
`%LOCALAPPDATA%\XpotBench\credentials.json` (or `~/.config/XpotBench/` elsewhere), never in the repository.

```bash
python print-pipeline/bench.py ticket <order-id> --out job.json
```

Takes the order (it shows as `building` with this computer's name) and writes what the build needs: the codes with
their bed positions, the version's builder, params, recipe and bed.

```bash
python print-pipeline/bench.py attach <order-id> <build-folder> --report <build-folder>/report.json
```

Uploads every print file in the folder (`.3mf`, `.gcode.3mf`, `.csv` serial map, `report.json`, `.png` preview) and
marks the order ready. `--no-ready` leaves it building; `bench.py fail <order-id> --message "…"` reports a build that
did not work.

## Next (phase 2)

`builders/` (one module per builder id: `plate.menu`, `plate.google`, `plate.instagram`, `plate.venmo`,
`stand.google`, `stand.instagram`), `lib/` (the 3MF assembler, G-code and QR checks), `recipes/`, the two `.3mf`
templates the NFC recipes use, `svg/` with its sources, and `tests/` that build every builder's sample
(`A7K3P9X2`) without the slicer. `bench.py build --job job.json --out DIR` then produces the folder that `attach`
uploads, and the bench app runs the whole loop by itself.

## Checks

CI compiles every Python file here (`python -m py_compile`). The slicer never runs in CI: the bench slices and
reports the numbers.
