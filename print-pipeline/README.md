# print-pipeline

Turns a Tags › Production print order into the files the Bambu Lab A1 prints: per-code meshes, the `.3mf`, the
offline slice (`.gcode.3mf`) and the checks (every QR decoded from layer 1 of the G-code, the chip pause before
the first bridge). Xpot is the record of what was ordered, built and printed; this folder holds no state.
Plan: [`../docs/PRINT_EXECUTION_PLAN.md`](../docs/PRINT_EXECUTION_PLAN.md).

## Set up the bench (once, on the computer next to the printer)

```bash
pip install -r print-pipeline/requirements.txt
```

```bash
python print-pipeline/bench.py doctor
```

`doctor` checks the packages, Bambu Studio (`C:\Program Files\Bambu Studio\bambu-studio.exe`, or `XPOT_BAMBU_STUDIO`)
and the fonts the faces use (Segoe UI Bold and Bold Italic from Windows; Inria Serif Bold and Bold Italic and
Metropolis Medium installed for the user). Fonts are never in the repository.

```bash
python print-pipeline/bench.py pair <code>
```

The code comes from Xpot › Tags › NFC writers › pair a computer. The token is saved in
`%LOCALAPPDATA%\XpotBench\credentials.json`, never in the repository.

## Run it

```bash
python print-pipeline/bench.py run
```

Takes every order whose version has a builder, oldest first, builds it, uploads the files and marks it ready (or
failed, with the reason, which shows on the order in Xpot). Start it with Windows (a shortcut to
`pythonw print-pipeline\bench.py run` in `shell:startup`) and the queue builds itself. `bench.py build <order-id>`
does one order now.

Manual halves, for a file built by hand (a part, a design not ported yet): `bench.py ticket <order-id>` writes the
order's codes, positions and recipe; `bench.py attach <order-id> <folder>` uploads the files and marks it ready;
`bench.py attach-bed <model> <bed> <file>` puts a part's fixed file on its current version.

## Layout

| Path | What it is |
|---|---|
| `bench.py` | the bench (pair, run, build, doctor, ticket, attach, attach-bed, fail) |
| `pipeline.py` | one order → meshes, `.3mf` per bed, slice, checks, serial map, `report.json` |
| `builders/` | the builder ids a version names (`plate.instagram`, `plate.google`, `plate.menu`, `plate.venmo`, `stand.google`, `stand.instagram`): one code → that piece's meshes and parts |
| `nfc/Stand/source/design/`, `nfc/Plate/source/` | the geometry, copied from the 3D Printing repo (`NFC Signs/*/source/`) on 2026-10-22 |
| `nfc/*/source/mesh/` | the Fusion sample meshes the Stand cards and the G tokens start from |
| `library/scripts/` | `build-3mf-from-fusion.py` (the 3MF assembler), `gcode-qr-check.py`, `gcode-verify.py` |
| `library/presets/` | the two A1 project templates the NFC recipes name |
| `library/svg/` | the logos and the NFC mark, with their sources in `SOURCES.md` |
| `catalog/` | `catalog.json`, the catalog loaded into Xpot (every model's v1), and `make_catalog.py`, which wrote it from the 3D repo's batch recipes |
| `tests/` | `test_pipeline.py` (CI, standard library) and `rebuild.py` (on the bench: rebuild a batch and compare) |

The copied geometry is unchanged except its paths (the repo root is the folder holding `bench.py`, the library is
`library/`). The batch scripts' own `main()` entry points still point at the 3D repo's layout and are not used: the
bench calls their per-piece functions.

## A new design or a fix

A new face, font or colour is Claude's job: a builder (or a new param on one) here, a sample build with the design
code `A7K3P9X2`, then `print_model_version_create` over MCP with the recipe and bed. A fix to a recipe (more walls,
another pause) is a new version in Xpot and needs no code. Before changing a builder, rebuild a printed batch:

```bash
python print-pipeline/tests/rebuild.py LPLATE-2026-006 plate-large-venmo-mixed "<3D repo>/NFC Signs/Plate/production/LPLATE-2026-006"
```

Every mesh must come out byte-identical (2026-10-22: LPLATE-2026-002, -003, -005, -006, SPLATE-2026-001, -002,
REV-2026-003, -004 and IG-2026-003 do; LPLATE-2026-004 printed an older Menu pocket), and the slice numbers match
the batch's (LPLATE-2026-006: 311.4 min, 25 swaps, 4/4 QR; SPLATE-2026-002: 334.6 min, 8/8 QR).

## Checks

CI compiles every Python file and runs `tests/test_*.py`. The slicer never runs in CI: the bench slices and reports.
