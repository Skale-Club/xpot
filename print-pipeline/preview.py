"""The 3D preview of a catalog version: one sample piece as a coloured GLB that Xpot shows in Tags > Production.

    python preview.py <version.json> <out.glb> [--code A7K3P9X2] [--upload <model-slug> [--version-id <uuid>]]
    python preview.py --part <fixed-file.3mf> <out.glb> [--upright] [--upload <part-slug> [--version-id <uuid>]]

--upload sends the GLB to Xpot as that model's preview (the version in the JSON, or --version-id): POST
<XPOT_URL>/mcp/print-preview/<model> with the MCP token in XPOT_MCP_TOKEN (Tags > Settings > MCP tokens);
XPOT_URL defaults to https://xpot.place.

<version.json> is the version as Xpot lists it (print_model_get's currentVersion, or the model with it): builder,
params, recipe. The builder makes one piece with the sample code (never a client's code: the QR of a preview must not
be a live piece), exactly as the bench would, and each part takes the colour of its AMS slot from the recipe's
filament_colour. The separate parts are put where they go, so the preview looks like the finished piece: the flat G
token in the Google Plate's pocket; a Stand's card in its base's slot (Large or Small), with its G on the Google one.

--part makes a part's preview (a Stand base, a G token: no builder) from one piece of its fixed print file.

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
STAND_MESH_SMALL = ROOT / 'nfc' / 'Stand' / 'source' / 'mesh' / 'small'
# The Large base's card slot, measured from its mesh (sections at z 5 and 13): 4.11 wide, its centre at y 14.73 at
# z 5 and moving 0.364 per mm of height, so the card leans back atan(0.364) = 20 degrees; the floor is at z ~2.6.
SLOT_CENTRE_Y5, SLOT_SLOPE, SLOT_FLOOR_Z = 14.725, 0.364, 2.6
# The Small base (mesh/small/Black_Google_Base.stl, Fusion small-v9): the same 4.11 slot and 20 degrees, its centre
# at y 11.455 at z 5. The Small card and its G token meshes sit at x -45 (Fusion laid the versions side by side).
SLOT_CENTRE_Y5_SMALL, SMALL_X_OFF = 11.455, -45.0
BASE_COLOUR = '#161616'


def _rotation_x(degrees: float):
    import numpy as np
    return trimesh.transformations.rotation_matrix(np.radians(degrees), [1, 0, 0])


def stand_assembly(meshes: list[tuple[trimesh.Trimesh, str, str]], face: str,
                   size: str = 'large') -> list[tuple[trimesh.Trimesh, str, str]]:
    """The Stand as it stands: the card (and, for Google, its four-colour G) in the base's slot, Large or Small.

    Card frame: x across, y up from the bottom edge, z from the back (0) to the face (3.56). Base frame: x across,
    y from the front edge, z up. The card turns face-front (-y) and leans back with the slot.
    """
    import numpy as np
    mesh_dir = STAND_MESH_SMALL if size == 'small' else STAND_MESH
    card = list(meshes)
    if face == 'google':
        for colour, hex_colour in (('Blue', '#4285F4'), ('Red', '#EA4335'), ('Yellow', '#FBBC05'), ('Green', '#34A853')):
            card.append((trimesh.load(next(mesh_dir.glob(f'{colour}_Google_G_Token_*.stl')), force='mesh'), 'G token', hex_colour))
    tilt = np.degrees(np.arctan(SLOT_SLOPE))
    slot_y = (SLOT_CENTRE_Y5_SMALL if size == 'small' else SLOT_CENTRE_Y5) + SLOT_SLOPE * (SLOT_FLOOR_Z - 5)
    half = 3.56 / 2
    place = (trimesh.transformations.translation_matrix([0, slot_y + half * np.cos(np.radians(tilt)), SLOT_FLOOR_Z])
             @ _rotation_x(-tilt) @ _rotation_x(90))
    if size == 'small':
        place = place @ trimesh.transformations.translation_matrix([-SMALL_X_OFF, 0, 0])
    placed = []
    for mesh, label, colour in card:
        mesh = mesh.copy()
        mesh.apply_transform(place)
        placed.append((mesh, label, colour))
    base = trimesh.load(mesh_dir / 'Black_Google_Base.stl', force='mesh')
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
        meshes = stand_assembly(meshes, builder.split('.', 1)[1], params.get('size', 'large'))

    return _write_glb(meshes, out, code)


NS_3MF = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
          'p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'}


def _affine(transform: str | None):
    """A 3MF transform (twelve numbers, column by column of a 4x3) as a 4x4 matrix."""
    import numpy as np
    matrix = np.eye(4)
    if transform:
        v = [float(x) for x in transform.split()]
        matrix[:3, :3] = np.array(v[:9]).reshape(3, 3).T
        matrix[:3, 3] = v[9:12]
    return matrix


def _mesh_of(root, object_id: str) -> trimesh.Trimesh:
    import numpy as np
    obj = root.find(f".//m:object[@id='{object_id}']", NS_3MF)
    mesh = obj.find('m:mesh', NS_3MF)
    vertices = np.array([[float(v.get(k)) for k in 'xyz'] for v in mesh.find('m:vertices', NS_3MF)])
    faces = np.array([[int(t.get(k)) for k in ('v1', 'v2', 'v3')] for t in mesh.find('m:triangles', NS_3MF)])
    return trimesh.Trimesh(vertices, faces, process=True)


def part_meshes(project: Path) -> list[tuple[trimesh.Trimesh, str, str]]:
    """One piece of a part's fixed print file (a Bambu Studio .3mf of N copies): the first object on the plate, each
    of its parts in the colour of its AMS slot (project_settings' filament_colour), in the print's frame (z up)."""
    import xml.etree.ElementTree as ET
    import zipfile
    with zipfile.ZipFile(project) as z:
        settings = ET.fromstring(z.read('Metadata/model_settings.config'))
        colours = json.loads(z.read('Metadata/project_settings.config')).get('filament_colour') or []
        model = ET.fromstring(z.read('3D/3dmodel.model'))
        first = settings.find('object')
        extruder = {'object': first.find("metadata[@key='extruder']")}
        names = {p.get('id'): (p.find("metadata[@key='name']"), p.find("metadata[@key='extruder']")) for p in first.findall('part')}
        default_slot = int(extruder['object'].get('value')) if extruder['object'] is not None else 1
        colour = lambda slot: colours[slot - 1] if 1 <= slot <= len(colours) else '#999999'
        obj = model.find(f".//m:object[@id='{first.get('id')}']", NS_3MF)
        meshes: list[tuple[trimesh.Trimesh, str, str]] = []
        components = obj.find('m:components', NS_3MF)
        if components is None:
            meshes.append((_mesh_of(model, first.get('id')), first.find("metadata[@key='name']").get('value'), colour(default_slot)))
            return meshes
        sub_models: dict[str, ET.Element] = {}
        for component in components:
            path = (component.get(f"{{{NS_3MF['p']}}}path") or '/3D/3dmodel.model').lstrip('/')
            if path not in sub_models:
                sub_models[path] = model if path == '3D/3dmodel.model' else ET.fromstring(z.read(path))
            mesh = _mesh_of(sub_models[path], component.get('objectid'))
            mesh.apply_transform(_affine(component.get('transform')))
            name, slot = names.get(component.get('objectid'), (None, None))
            label = name.get('value') if name is not None else f'part {component.get("objectid")}'
            meshes.append((mesh, label, colour(int(slot.get('value')) if slot is not None else default_slot)))
    return meshes


def build_part_preview(project: Path, out: Path, upright: bool = False) -> dict:
    """The preview of a part (a Stand base, a G token): one piece of its fixed .3mf. A flat piece stays as printed,
    face toward the viewer; `upright` stands a tall one (a base) the way it is used."""
    meshes = part_meshes(project)
    if upright:
        for mesh, _, _ in meshes:
            mesh.apply_transform(_rotation_x(-90))
    return _write_glb(meshes, out, None)


def _write_glb(meshes: list[tuple[trimesh.Trimesh, str, str]], out: Path, code: str | None) -> dict:
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
    ap.add_argument('version', nargs='?', help='the version JSON (print_model_get output, or its currentVersion)')
    ap.add_argument('out', help='the .glb to write')
    ap.add_argument('--part', metavar='FILE_3MF', help="a part's fixed print file instead of a version: one piece of it")
    ap.add_argument('--upright', action='store_true', help='with --part: stand the piece up (a base), else face to the viewer')
    ap.add_argument('--code', default=SAMPLE_CODE)
    ap.add_argument('--upload', metavar='MODEL', help='send it to Xpot as this model\'s preview')
    ap.add_argument('--version-id', help='with --upload: this version instead of the current one')
    args = ap.parse_args()
    if args.part:
        result = build_part_preview(Path(args.part), Path(args.out), args.upright)
        if args.upload:
            result['uploaded'] = upload(Path(args.out), args.upload, args.version_id)
        print(json.dumps(result, indent=1))
        return
    if not args.version:
        ap.error('the version JSON, or --part <file.3mf>')
    data = json.loads(Path(args.version).read_text(encoding='utf-8'))
    version = data.get('currentVersion') or data
    result = build_preview(version, Path(args.out), args.code)
    if args.upload:
        result['uploaded'] = upload(Path(args.out), args.upload, args.version_id or version.get('id'))
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
