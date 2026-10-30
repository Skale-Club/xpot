"""The 3D preview of a catalog version: one sample piece as a coloured GLB that Xpot shows in Tags > Production.

    python preview.py <version.json> <out.glb> [--code A7K3P9X2] [--upload <model-slug> [--version-id <uuid>]]

--upload sends the GLB to Xpot as that model's preview (the version in the JSON, or --version-id): POST
<XPOT_URL>/mcp/print-preview/<model> with the MCP token in XPOT_MCP_TOKEN (Tags > Settings > MCP tokens);
XPOT_URL defaults to https://xpot.place.

<version.json> is the version as Xpot lists it (print_model_get's currentVersion, or the model with it): builder,
params, recipe. The builder makes one piece with the sample code (never a client's code: the QR of a preview must not
be a live piece), exactly as the bench would, and each part takes the colour of its AMS slot from the recipe's
filament_colour. The separate parts are put where they go, so the preview looks like the finished piece: the flat G
token in the Google Plate's pocket; a Large Stand's card in its base's slot, with its relief G on the Google one.

Frame of the GLB: metres (glTF), x right, y up, the face toward +z, centred on the piece; what the viewer expects.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import trimesh

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

SAMPLE_CODE = 'A7K3P9X2'
FALLBACK = {'white': '#F2F2F2', 'black': '#161616', 'yellow': '#FBBC05', 'blue': '#008CFF', 'silk': '#C85BD6'}
MM = 0.001


def _linear(channel: int) -> float:
    """One sRGB byte as the linear value glTF wants in baseColorFactor (the viewer converts it back for the screen)."""
    c = channel / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgba(hex_colour: str) -> list[float]:
    """The filament's hex colour as a glTF baseColorFactor. The factor is linear: writing the sRGB bytes as they are
    lifted every colour (black PLA #161616 showed as #535353, white as #F9F9F9, the Google blue and red washed out)."""
    h = hex_colour.lstrip('#')[:6]
    return [_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4)] + [1.0]


def part_colour(label: str, slot: int, recipe: dict) -> str:
    """The recipe's filament colour for this AMS slot, else a colour named in the part's label."""
    colours = (recipe.get('settings') or {}).get('filament_colour') or []
    if 1 <= slot <= len(colours):
        return colours[slot - 1]
    for word, hex_colour in FALLBACK.items():
        if word in label.lower():
            return hex_colour
    return '#999999'


def google_g_token(size: str) -> list[tuple[trimesh.Trimesh, str]]:
    """The four-colour flat G of the Google Plate, standing in its pocket, flush with the face."""
    import tile_per_code_google as tg
    from tile_per_code_google import fa, igc
    tg.configure(size)
    art = tg.layout(fa.SAMPLE_CODE)
    pieces = []
    for hex_colour, poly in art['g_pieces']:
        mesh = igc.to_trimesh(igc.prism(tg.ig.to_tile(poly), tg.TOP - tg.POCKET, tg.TOP))
        pieces.append((mesh, hex_colour))
    return pieces


STAND_MESH = ROOT / 'nfc' / 'Stand' / 'source' / 'mesh' / 'large'
# The Large base's card slot, measured from its mesh (sections at z 5 and 13): 4.11 wide, its centre at y 14.73 at
# z 5 and moving 0.364 per mm of height, so the card leans back atan(0.364) = 20 degrees; the floor is at z ~2.6.
SLOT_CENTRE_Y5, SLOT_SLOPE, SLOT_FLOOR_Z = 14.725, 0.364, 2.6
BASE_COLOUR = '#161616'


def _rotation_x(degrees: float):
    import numpy as np
    return trimesh.transformations.rotation_matrix(np.radians(degrees), [1, 0, 0])


def stand_assembly(meshes: list[tuple[trimesh.Trimesh, str, str]], face: str) -> list[tuple[trimesh.Trimesh, str, str]]:
    """The Large Stand as it stands: the card (and, for Google, its four-colour relief G) in the base's slot.

    Card frame: x across, y up from the bottom edge, z from the back (0) to the face (3.56). Base frame: x across,
    y from the front edge, z up. The card turns face-front (-y) and leans back with the slot.
    """
    import numpy as np
    card = list(meshes)
    if face == 'google':
        for colour, hex_colour in (('Blue', '#4285F4'), ('Red', '#EA4335'), ('Yellow', '#FBBC05'), ('Green', '#34A853')):
            card.append((trimesh.load(next(STAND_MESH.glob(f'{colour}_Google_G_Token_*.stl')), force='mesh'), 'G token', hex_colour))
    tilt = np.degrees(np.arctan(SLOT_SLOPE))
    slot_y = SLOT_CENTRE_Y5 + SLOT_SLOPE * (SLOT_FLOOR_Z - 5)
    half = 3.56 / 2
    place = (trimesh.transformations.translation_matrix([0, slot_y + half * np.cos(np.radians(tilt)), SLOT_FLOOR_Z])
             @ _rotation_x(-tilt) @ _rotation_x(90))
    placed = []
    for mesh, label, colour in card:
        mesh = mesh.copy()
        mesh.apply_transform(place)
        placed.append((mesh, label, colour))
    base = trimesh.load(STAND_MESH / 'Black_Google_Base.stl', force='mesh')
    placed.append((base, 'Base', BASE_COLOUR))
    # The viewer's frame: up is y, the face looks along +z.
    for mesh, _, _ in placed:
        mesh.apply_transform(_rotation_x(-90))
    return placed


def build_preview(version: dict, out: Path, code: str = SAMPLE_CODE) -> dict:
    from builders import build_piece
    builder, params, recipe = version['builder'], version.get('params') or {}, version.get('recipe') or {}
    if not builder:
        raise SystemExit('this version has no builder: a part has no generated preview')
    tag = {'serial_number': '001', 'public_code': code, 'qr_url': f'https://xpot.place/q/{code}',
           'nfc_url': f'https://xpot.place/n/{code}', 'position': ''}
    meshes: list[tuple[trimesh.Trimesh, str, str]] = []
    with tempfile.TemporaryDirectory(prefix='xpot-preview-') as tmp:
        _, parts = build_piece(builder, tag, 0, params, Path(tmp), batch='PREVIEW')
        for label, stl, slot in parts:
            mesh = trimesh.load(Path(tmp) / stl, force='mesh', process=True)
            meshes.append((mesh, label, part_colour(label, slot, recipe)))
    if builder == 'plate.google':
        for mesh, hex_colour in google_g_token(params.get('size', 'large')):
            meshes.append((mesh, 'G token', hex_colour))
    if builder.startswith('stand.'):
        meshes = stand_assembly(meshes, builder.split('.', 1)[1])

    centre = trimesh.util.concatenate([m for m, _, _ in meshes]).bounds.mean(axis=0)
    scene = trimesh.Scene()
    for i, (mesh, label, hex_colour) in enumerate(meshes):
        mesh = mesh.copy()
        mesh.apply_translation(-centre)
        mesh.apply_scale(MM)
        # one PBR material per part: no per-vertex colours in the file, and the viewer lights it like plastic
        material = trimesh.visual.material.PBRMaterial(name=label, baseColorFactor=_rgba(hex_colour),
                                                       metallicFactor=0.0, roughnessFactor=0.6)
        mesh.visual = trimesh.visual.TextureVisuals(material=material)
        scene.add_geometry(mesh, node_name=f'{i:02d} {label}', geom_name=f'{i:02d} {label}')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(scene.export(file_type='glb'))
    size_mm = (trimesh.util.concatenate([m for m, _, _ in meshes]).extents).round(2).tolist()
    return {'file': str(out), 'bytes': out.stat().st_size, 'parts': [label for _, label, _ in meshes],
            'colours': [c for _, _, c in meshes], 'size_mm': size_mm, 'code': code}


def upload(glb: Path, model: str, version_id: str | None = None) -> dict:
    """Set the GLB as the model's preview in Xpot (the server checks the MCP token like /mcp does)."""
    import os
    import urllib.error
    import urllib.parse
    import urllib.request
    token = os.environ.get('XPOT_MCP_TOKEN')
    if not token:
        raise SystemExit('XPOT_MCP_TOKEN is not set: an MCP token from Tags > Settings > MCP tokens')
    base = os.environ.get('XPOT_URL', 'https://xpot.place').rstrip('/')
    query = f'?{urllib.parse.urlencode({"version": version_id})}' if version_id else ''
    request = urllib.request.Request(f'{base}/mcp/print-preview/{urllib.parse.quote(model)}{query}', data=glb.read_bytes(),
                                     method='POST', headers={'Authorization': f'Bearer {token}',
                                                             'Content-Type': 'application/octet-stream'})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as err:
        raise SystemExit(f'upload of {model} failed ({err.code}): {err.read().decode(errors="replace")[:300]}')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('version', help='the version JSON (print_model_get output, or its currentVersion)')
    ap.add_argument('out', help='the .glb to write')
    ap.add_argument('--code', default=SAMPLE_CODE)
    ap.add_argument('--upload', metavar='MODEL', help='send it to Xpot as this model\'s preview')
    ap.add_argument('--version-id', help='with --upload: this version instead of the current one')
    args = ap.parse_args()
    data = json.loads(Path(args.version).read_text(encoding='utf-8'))
    version = data.get('currentVersion') or data
    result = build_preview(version, Path(args.out), args.code)
    if args.upload:
        result['uploaded'] = upload(Path(args.out), args.upload, args.version_id or version.get('id'))
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
