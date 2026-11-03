# print-pipeline

Turns the plates of a Tags › Production request into the files the Bambu Lab A1 prints: per-code meshes, the `.3mf`
(the Bambu Studio project), the offline slice (`.gcode.3mf`) and the checks (every QR decoded from layer 1 of the
G-code, the chip pause before the first bridge), and keeps the Print Now folder. Nothing is sent to the printer: you
open a plate in Bambu Studio, print it and mark it printed in Xpot. Xpot is the record of what was asked, built and
printed; this folder holds no state.
Plan: [`../docs/PRINT_EXECUTION_PLAN.md`](../docs/PRINT_EXECUTION_PLAN.md).

## Set up the bench (once, on the computer with Bambu Studio)

```bash
pip install -r print-pipeline/requirements.txt
```

```bash
python print-pipeline/bench.py doctor
```

`doctor` checks the packages, Bambu Studio (`C:\Program Files\Bambu Studio\bambu-studio.exe`, or `XPOT_BAMBU_STUDIO`)
and the fonts the faces use (Segoe UI Bold and Bold Italic from Windows; Inria Serif Bold and Bold Italic and
Metropolis Medium and Bold, Inter SemiBold and Nunito Black installed for the user). Fonts are never in the repository.

```bash
python print-pipeline/bench.py pair <code>
```

The code comes from Xpot › Tags › NFC writers › pair a computer. The token is saved in
`%LOCALAPPDATA%\XpotBench\credentials.json`, never in the repository.

## Run it

```bash
python print-pipeline/bench.py run
```

Takes every plate whose version has a builder, oldest first, builds it, uploads the files and marks it ready (or
failed, with the reason, which shows on the plate in Xpot). A partial plate (the last 2 of a request of 10 on a 4-up
bed) fills the first slots of the bed. Start it with Windows (a shortcut to `pythonw print-pipeline\bench.py run` in
`shell:startup`) and the plates build themselves. `bench.py build <order-id>` does one plate now.

Manual halves, for a file built by hand (a part, a design not ported yet): `bench.py ticket <order-id>` writes the
order's codes, positions and recipe; `bench.py attach <order-id> <folder>` uploads the files and marks it ready;
`bench.py attach-bed <model> <bed> <file>` puts a part's fixed file on its current version.

## The Print Now folder

```bash
python print-pipeline/bench.py folder "<path>/Print Now"
```

From then on `bench.py run` keeps that folder as Xpot's list of plates, every minute (`bench.py sync` does it once):

```
Print Now/
  Para imprimir/2026-10-22 15h53 - Stand Large - Instagram - Black - 10 un/
    IG-2026-004 - placa 1 de 3 - 4 un.3mf          the Bambu Studio project (open, check, slice, print)
    IG-2026-004 - placa 1 de 3 - 4 un.gcode.3mf    the slice the bench checked (every QR, the pause)
  Impressos/...                                    plates marked printed in the last 14 days
```

A plate marked printed moves to `Impressos/`; a cancelled or failed one, or one printed more than two weeks ago,
leaves the folder (it stays downloadable in Xpot). The bench only moves or removes the files it wrote itself, listed
in `.xpot-print-now.json`: anything else in the folder is never touched.

## Layout

| Path | What it is |
|---|---|
| `bench.py` | the bench (pair, run, folder, sync, build, doctor, ticket, attach, attach-bed, fail) |
| `pipeline.py` | one plate → meshes, `.3mf`, slice, checks, serial map, `report.json` |
| `print_now.py` | the Print Now folder: Xpot's plates by status and request (standard library only) |
| `builders/` | the builder ids a version names (`plate.instagram`, `plate.google`, `plate.menu`, `plate.venmo`, `plate.pay`, `stand.google`, `stand.instagram`, `stand.menu`): one code → that piece's meshes and parts |
| `nfc/Stand/source/design/`, `nfc/Plate/source/` | the geometry, copied from the 3D Printing repo (`NFC Signs/*/source/`) on 2026-10-22 |
| `nfc/*/source/mesh/` | the Fusion sample meshes the Stand cards and the G tokens start from: `large/` the Large card and base; `small/` the retired Small card (Fusion v8) and its G token, with the live Small base (Fusion `small-v9`), copied on 2026-10-31 |
| `library/scripts/` | `build-3mf-from-fusion.py` (the 3MF assembler), `gcode-qr-check.py`, `gcode-verify.py` |
| `library/presets/` | the two A1 project templates the NFC recipes name |
| `library/svg/` | the logos and the NFC mark, with their sources in `SOURCES.md` |
| `catalog/` | `catalog.json`, the catalog loaded into Xpot (every model's v1), and `make_catalog.py`, which wrote it from the 3D repo's batch recipes |
| `tests/` | `test_pipeline.py`, `test_print_now.py` (CI, standard library), `test_gcode_qr_check.py` (the layer-1 QR check on a sliced card from `fixtures/`; needs OpenCV, so it runs on the bench) and `rebuild.py` (on the bench: rebuild a batch and compare) |

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

**Project rule: every new model, and every new version of one, gets its 3D preview** (user, 2026-10-30): right
after `print_model_create` / `print_model_version_create`, build and attach it, then check `print_model_get` shows
`currentVersion.preview`. Parts with no builder (bases, tokens, stickers) have none.

**Project rule: every face comes in every form and every colour** (user, 2026-10-31): Menu, Google Review,
Instagram, Venmo and any face added later each exist as Small Plate, Large Plate, Small Stand and Large Stand, in
white, black, or a custom colour. Asked for one of them, make it; don't ask whether the other forms or colours are
wanted. A missing combination is a gap to fill (the builder grows a size or theme), not a question.

**Project rule: a black piece's QR is inverted** (user, 2026-11-01), Plates and Stands of every face and size: white
modules straight on the black body, no white panel (`qr: inverted` in the version's params; the Stand's Google and
Instagram cards always were). Versions without it keep the panel only so printed batches can be rebuilt.

**Project rule: every print asks which NFC goes inside** (user, 2026-11-02), because each type is a different print
file, and every serialized model offers all three (`nfcVariants` on its version; `nfc/Stand/source/design/nfc_mounts.py`
holds the measures): the 1 inch round NTAG215 sticker, the default (28.4 x 0.48 pocket, 17.2 mm below the top edge; behind
the G pocket on Google faces); the 10 x 20 sticker (23 x 13 x 0.48); the 25 mm round tag (25.6 x 0.96). If a builder cannot
make a type for a size, extend the builder. `catalog/nfc_versions.py` writes the versions from the catalog.

```bash
XPOT_MCP_TOKEN=... python print-pipeline/preview.py version.json preview.glb --upload <model-slug> --version-id <uuid>
```

## Checks

CI compiles every Python file and runs `tests/test_*.py`. The slicer never runs in CI: the bench slices and reports.


## Flyer catalog and single-plate generation

New serialized requests are limited to the selected bed's capacity: one generation, one printer plate, one batch.
Historical requests with several plates retain their history, retry and stock lifecycle. Parts without serials
can still be ordered as whole beds.

`catalog/design_catalog.py` defines 160 ready recipes: four physical products, fifteen services, approved white/black bodies
and six Menu styles. Each recipe has all three NFC variants. Historic versions are preserved by the generated
forward migration; only future requests use the new recipes. The service builders decode the QR from the mesh,
check watertightness, non-manifold edges and expected volume before writing STLs.

```powershell
python print-pipeline/catalog/design_catalog.py --migration migrations/0080_flyer_design_catalog.sql --previews client/public/production/previews
python print-pipeline/tests/validate_design_geometry.py --workers 4 --out .cache/plaque-geometry.json
python print-pipeline/tests/validate_design_slices.py --out .cache/plaque-slices
```

Black and white primary filaments default to ELEGOO standard PLA, 1.75 mm. Accent colours may be generic PLA.
The conservative baseline is nozzle 215 °C on layer 1 / 210 °C after that, textured bed 60 / 55 °C,
and maximum volumetric flow 12 mm³/s. Layer height stays 0.16 mm, first-layer speed 30 mm/s,
artwork first and body last. Dark-to-light flushes keep at least 600 mm³. This is a default recipe,
not a claim of physical calibration of every ELEGOO product line; PLA+, Rapid, Matte and Silk may require
their own profiles. An admin can still author another version for another filament.

Offline tests use TEST0001..TEST0008 and the non-issued preview code A7K3P9X2. Never receive these samples
into stock or substitute them for production batch codes.
