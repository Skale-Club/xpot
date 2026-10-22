"""Build a Bambu Studio .3mf from exported STLs.

Usage:
  python build-3mf-from-fusion.py <source/build.json> --out <file.3mf> [--stl-dir <dir>]

It keeps its name for history, but it is the assembler for **both** pipelines: it takes STLs and a
`build.json` and does not care which program made the meshes — Fusion through `fusion-export.py`
(`.claude/docs/09-fusion.md`) or Blender through `blender-popout-build.py`
(`.claude/docs/12-blender.md`).

`--stl-dir` defaults to `mesh/` next to the `build.json`, i.e. the piece's `source/mesh/`. Every
key is explained in `.claude/docs/09-fusion.md`, "Building the .3mf".

  {
    "name": "Skale Club Relief",
    "template": "a1-petg-keychain-template.3mf",
    "orientation": "face-up",                     // or "face-down": 180 deg about X, design face on the bed
    "parts": [                                    // one Studio part per entry; STLs matching a glob merge
      {"name": "Black - Body", "stl": "Black_Body.stl", "extruder": 1,
       "settings_files": ["ironing-petg-black.json"],   // optional part presets, applied first
       "settings": {"ironing_type": "top"}},      // optional per-part overrides (Studio "part settings")
      {"name": "White - Logo", "stl": "White_*.stl",    "extruder": 3}
    ],
    "pause_top_z": 3.4,                           // M400 U1 at this layer, or null
    "pause_plates": [1],                          // optional: only these plates pause (default: every plate)
    "top_band": {"depth": 0.8, "layer_height": 0.1,
                 "options": {"outer_wall_speed": 40, "inner_wall_speed": 60, "top_surface_speed": 20}},
    "settings_files": ["keychain-baseline-petg.json", "keychain-finish-petg.json"],   // applied in order
    "settings": {"first_layer_print_sequence": ["1", "3"]},
    "ranges": [                                   // optional extra height ranges, merged with the top band
      {"min_z": 4.8, "max_z": 5.0, "settings_files": ["ironing-petg-black.json"]},   // iron the face only
      {"min_z": 1.0, "max_z": 2.0, "options": {"sparse_infill_density": "50%"}}],
    "copies": [                                   // optional: several objects on one plate (test plates)
      // a copy that names "parts" takes only those, which is how one plate holds several
      // *different* objects - a piece and the insert that drops into it, side by side, so the
      // plate can run print_sequence "by object". Every mesh must then sit at z=0 on its own.
      {"name": "Flower", "parts": ["White - Flower"], "offset": [-16, 0],
       "rotation_z_deg": 90},                    // optional in-plane rotation about the object's centre
      {"name": "A - flow 10%", "offset": [-40, 0], "settings": {}, "part_settings": {"Black - Body": {"ironing_flow": "10%"}}},
      {"name": "B - flow 15%", "offset": [0, 0],   "part_settings": {"Black - Body": {"ironing_flow": "15%"}}},
      {"name": "Bee", "parts": ["Black - Bee"], "plate": 2}   // optional: build plate N (1-based), a kit
    ]
  }

Relative `template` and `settings_files` paths resolve against the build.json folder first, then
`.claude/library/presets/`. Keys starting with "_" are comments.

Setting levels:
- `settings` applies to the whole project.
- A copy's `settings` apply to that object.
- A part's `settings_files`, then its `settings`, then a copy's `part_settings`, apply to that part
  only, each winning over the one before.

Each copy is its own object with its own copy of the meshes, so every copy can carry different
settings. Offsets are mm from `position` (default 128, 128); `rotation_z_deg` rotates that centred
object in the plate plane.

A copy's `plate` puts it on build plate N of the same project (default 1): a **kit** is one file with
one plate per colour (doc 10 §1). Plates follow Studio's grid (column count as Studio computes it, a
stride of 1.2 bed sizes, rows going -Y); `offset` stays relative to that plate. Slice every plate with
`--slice 0`. Each plate's object must stand at z=0 on its own, as for any `parts` subset.

A part may carry `"subtype": "negative_part"`: Studio subtracts it from every other part of the
object at slice time, which is how a mesh too dirty for a boolean gets trimmed (Boston: nothing
standing under the frame's lip). It never sizes or centres the design.

`"subtype": "modifier_part"` is written through as well, but **do not rely on it**: on 2026-10-05 a box
modifier with `ironing_type: top` over a serial (NFC Plaque serial coupon) produced no ironing at all, an
`sparse_infill_density` on it changed nothing, and inside its volume the visible top layer was sliced as
"Bottom surface". Use a height range (`ranges`) for ironing, as the keychains do.

`"custom_gcode": [{"top_z": 3.08, "gcode": "M104 S205", "plates": [2]}]` adds Studio's per-layer custom
G-code (type 4), run after the layer whose top is `top_z`, exactly where the pause runs; `plates`
defaults to every plate. Check the G-code: nothing later may undo it.

A part's `stl` may also name indexed `.obj` files, used as-is with no re-weld (dense third-party
meshes, Wall Art/Cities/Boston). The script refuses meshes with non-manifold edges, unless the part says
`"allow_nonmanifold": true` — for an upstream that is non-manifold itself; it is then passed through
unsplit, with a warning, and only the slice can vouch for it. It prints each part's print-space bounding
box and warns when the pause or the band start is off the 0.2 mm grid.

This is not verification. Slice the output, then run gcode-verify.py on it.
"""
import glob, json, os, re, struct, sys, uuid, zipfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PRESETS = os.path.normpath(os.path.join(HERE, '..', 'presets'))


def resolve(name, config_dir):
    for base in (config_dir, PRESETS):
        p = os.path.join(base, name)
        if os.path.exists(p):
            return p
    raise SystemExit(f'not found: {name} (looked in {config_dir} and {PRESETS})')


def read_stl(fn):
    data = open(fn, 'rb').read()
    if len(data) >= 84:
        n = struct.unpack('<I', data[80:84])[0]
        if len(data) == 84 + 50 * n:
            arr = np.frombuffer(data[84:], dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]), count=n)
            return arr['v'].astype(np.float64).reshape(-1, 3, 3)
    text = data.decode('ascii', errors='ignore')
    verts = [tuple(map(float, m)) for m in re.findall(r'vertex\s+(\S+)\s+(\S+)\s+(\S+)', text)]
    if not verts or len(verts) % 3:
        raise SystemExit(f'{fn}: not a readable STL')
    return np.array(verts).reshape(-1, 3, 3)


def read_obj(fn):
    """Indexed mesh, used as-is: no float32 round trip and no re-weld. A dense upstream mesh (a city's
    roads) has distinct vertices closer than float32 resolution; an STL merges them into ~35 000
    non-manifold edges that the indexed original does not have."""
    v, f = [], []
    for line in open(fn, encoding='utf-8'):
        if line.startswith('v '):
            v.append(line.split()[1:4])
        elif line.startswith('f '):
            f.append([int(t.split('/')[0]) - 1 for t in line.split()[1:4]])
    v, f = np.array(v, float), np.array(f, np.int64)
    e = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, cnt = np.unique(e, axis=0, return_counts=True)
    return v, f, int((cnt != 2).sum())


def weld(tris):
    pts = tris.reshape(-1, 3)
    q = np.round(pts / 1e-5).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    f = inv.reshape(-1, 3)
    e = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, cnt = np.unique(e, axis=0, return_counts=True)
    return pts[first], f, int((cnt != 2).sum())


def split_touching(v, f):
    """A body whose outline touches itself (an SVG letter pinched at one point) exports as shells
    sharing an edge: that edge has 4 triangles. Give each shell its own copy of the shared vertices,
    so every shell is closed and manifold; the geometry is unchanged.
    Returns (v, f, remaining non-manifold edges, number of shells)."""
    nf = len(f)
    e = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    owner = np.repeat(np.arange(nf), 3)
    key = e[:, 0].astype(np.int64) * (len(v) + 1) + e[:, 1]
    order = np.argsort(key, kind='stable')
    ks, ow = key[order], owner[order]
    parent = np.arange(nf)
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    starts = np.flatnonzero(np.r_[True, ks[1:] != ks[:-1]])
    ends = np.r_[starts[1:], len(ks)]
    for s, t in zip(starts, ends):
        if t - s == 2:                       # manifold edge: its two triangles belong to one shell
            ra, rb = find(ow[s]), find(ow[s + 1])
            if ra != rb: parent[ra] = rb
    comp = np.array([find(i) for i in range(nf)])
    vs, fs, off = [], [], 0
    shells = np.unique(comp)
    for c in shells:
        ff = f[comp == c]
        used, inv = np.unique(ff, return_inverse=True)
        vs.append(v[used]); fs.append(inv.reshape(-1, 3) + off); off += len(used)
    v2, f2 = np.vstack(vs), np.vstack(fs)
    e2 = np.sort(np.concatenate([f2[:, [0, 1]], f2[:, [1, 2]], f2[:, [2, 0]]]), axis=1)
    _, cnt = np.unique(e2, axis=0, return_counts=True)
    return v2, f2, int((cnt != 2).sum()), len(shells)


def mesh_xml(oid, v, f):
    vs = '\n'.join(f'     <vertex x="{x:.6f}" y="{y:.6f}" z="{z:.6f}"/>' for x, y, z in v)
    ts = '\n'.join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in f)
    return (f'  <object id="{oid}" p:UUID="{uuid.uuid4()}" type="model">\n   <mesh>\n    <vertices>\n{vs}\n    </vertices>\n'
            f'    <triangles>\n{ts}\n    </triangles>\n   </mesh>\n  </object>\n')


def esc(s):
    return str(s).replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


def meta(settings, indent):
    return ''.join(f'{indent}<metadata key="{esc(k)}" value="{esc(v)}"/>\n' for k, v in settings.items() if not k.startswith('_'))


BBL_PROFILES = r'C:\Program Files\Bambu Studio\resources\profiles\BBL'
_PRESET_KEYS = {}


def preset_keys(kind):
    """Every key any Bambu system preset of this kind ('process', 'filament', 'machine') defines."""
    if kind not in _PRESET_KEYS:
        keys = set()
        for fn in glob.glob(os.path.join(BBL_PROFILES, kind, '*.json')):
            try:
                keys.update(json.load(open(fn, encoding='utf-8-sig')))
            except (ValueError, OSError):
                pass
        keys -= {'name', 'inherits', 'from', 'type', 'setting_id', 'instantiation', 'filament_id',
                 'compatible_printers', 'compatible_printers_condition', 'description'}
        _PRESET_KEYS[kind] = keys
    return _PRESET_KEYS[kind]


def register_diffs(ps, wanted, template_ps):
    """List every changed preset key in `different_settings_to_system`.

    **Studio's GUI does not trust the values in project_settings.config.** On open it rebuilds each
    preset from the system profile plus the keys this list names, and silently drops every other
    change. The CLI slices the file's values, so a build verified on the CLI opened in the GUI as a
    different print: Boston came up at 0.20 layers with classic walls instead of 0.16 and Arachne
    (2026-09-19). Slot 0 is the process, then one slot per filament, then the printer.
    Project keys (colours, flush matrix, wipe tower, bed type) belong to no preset and need no entry."""
    diffs = ps.get('different_settings_to_system')
    if not isinstance(diffs, list) or not diffs:
        return
    slots = [set(filter(None, s.split(';'))) for s in diffs]
    nfil = len(slots) - 2
    for k, v in wanted.items():
        if template_ps.get(k) == v:
            continue
        if k in preset_keys('process'):
            slots[0].add(k)
        elif k in preset_keys('filament'):
            old = template_ps.get(k)
            for i in range(nfil):
                if not isinstance(v, list) or not isinstance(old, list) or i >= len(v) or i >= len(old) or v[i] != old[i]:
                    slots[1 + i].add(k)
        elif k in preset_keys('machine'):
            slots[-1].add(k)
        elif not k.startswith(('filament_', 'flush_', 'wipe_tower_', 'curr_bed_type', 'prime_')) and k in template_ps:
            slots[0].add(k)   # a process key no system preset spells out (precise_outer_wall)
    ps['different_settings_to_system'] = [';'.join(sorted(s)) for s in slots]


def on_grid(z, step=0.2):
    return abs(z / step - round(z / step)) < 1e-6


def main(argv):
    args, stl_dir, out = [], None, None
    it = iter(argv)
    for a in it:
        if a == '--stl-dir': stl_dir = next(it)
        elif a == '--out': out = next(it)
        else: args.append(a)
    if len(args) != 1 or not out:
        print(__doc__)
        return 2
    cfg_path = os.path.abspath(args[0])
    cfg_dir = os.path.dirname(cfg_path)
    cfg = json.load(open(cfg_path, encoding='utf-8-sig'))
    # `source/mesh/` next to the build.json is where both pipelines put their STLs, and keeping
    # them in the repo is what lets check-piece.py prove the shipped .3mf is a build of the
    # editable at the piece root. --stl-dir stays, for a build from a scratchpad export.
    if not stl_dir:
        stl_dir = os.path.join(cfg_dir, 'mesh')
        if not os.path.isdir(stl_dir):
            raise SystemExit(f'no --stl-dir given and {stl_dir} does not exist')
    warnings = []

    # meshes
    parts = []
    for p in cfg['parts']:
        files = sorted(glob.glob(os.path.join(stl_dir, p['stl'])))
        if not files:
            raise SystemExit(f"part {p['name']!r}: no STL matches {p['stl']!r} in {stl_dir}")
        vs, fs, off, bad = [], [], 0, 0
        for fn in files:
            if fn.lower().endswith('.obj'):
                v, f, nm = read_obj(fn)
            else:
                v, f, nm = weld(read_stl(fn))
            if nm and not p.get('allow_nonmanifold'):   # accepted as-is: splitting would only fragment it
                v, f, nm2, shells = split_touching(v, f)
                if nm2 == 0:
                    warnings.append(f'{os.path.basename(fn)}: {nm} edge(s) shared by 4 triangles (outline touching itself); '
                                    f'split into {shells} closed shells, geometry unchanged')
                nm = nm2
            bad += nm
            vs.append(v); fs.append(f + off); off += len(v)
        if bad and p.get('allow_nonmanifold'):
            warnings.append(f"part {p['name']!r}: {bad} non-manifold edges ACCEPTED (allow_nonmanifold) - "
                            'third-party mesh passed through as the upstream has it; the slice is the only check')
        elif bad:
            raise SystemExit(f"part {p['name']!r}: {bad} non-manifold edges in {len(files)} STL(s); fix the export")
        # A part's settings_files (presets, e.g. ironing-petg-black.json) apply first, its inline settings win.
        pset0 = {}
        for sf in p.get('settings_files', []):
            pset0.update({k: v for k, v in json.load(open(resolve(sf, cfg_dir), encoding='utf-8-sig')).items() if not k.startswith('_')})
        pset0.update(p.get('settings', {}))
        parts.append({'name': p['name'], 'extruder': int(p['extruder']), 'v': np.vstack(vs), 'f': np.vstack(fs),
                      'files': len(files), 'settings': pset0, 'subtype': p.get('subtype', 'normal_part')})
        print(f"part {p['name']!r}: {len(files)} STL, {len(parts[-1]['v'])} vertices, {len(parts[-1]['f'])} triangles, watertight")

    allp = np.vstack([p['v'] for p in parts if p['subtype'] == 'normal_part'])   # a negative part never sizes the design
    mn, mx = allp.min(0), allp.max(0)
    centre = (mn + mx) / 2
    height = float(mx[2] - mn[2])
    for p in parts:
        p['v'] = p['v'] - centre
    orientation = cfg.get('orientation', 'face-up')
    if orientation == 'face-up':
        rot = '1 0 0 0 1 0 0 0 1'; R = np.eye(3)
    elif orientation == 'face-down':
        rot = '1 0 0 0 -1 0 0 0 -1'; R = np.diag([1.0, -1.0, -1.0])
    else:
        raise SystemExit(f'orientation must be face-up or face-down, not {orientation!r}')
    px, py = cfg.get('position', [128, 128])
    print(f'design bbox {np.round(mx - mn, 3)} mm; orientation {orientation}; height {height:.3f}')

    template = zipfile.ZipFile(resolve(cfg.get('template', 'a1-petg-keychain-template.3mf'), cfg_dir))
    names = template.namelist()
    ps = json.loads(template.read('Metadata/project_settings.config'))
    template_ps = json.loads(json.dumps(ps))

    copies = cfg.get('copies') or [{}]
    single = len(copies) == 1
    plate_ids = [int(c.get('plate', 1)) for c in copies]
    nplates = max(plate_ids)
    empty = sorted(set(range(1, nplates + 1)) - set(plate_ids))
    if empty:
        raise SystemExit(f'plates {empty} have no object; number the plates 1..{nplates} without gaps')
    area = [tuple(map(float, a.split('x'))) for a in ps.get('printable_area', ['0x0', '256x0', '256x256', '0x256'])]
    bed_w = max(a[0] for a in area) - min(a[0] for a in area)
    bed_d = max(a[1] for a in area) - min(a[1] for a in area)
    root = nplates ** 0.5                                  # Studio's PartPlateList::compute_colum_count
    cols = int(round(root)) + (1 if root > round(root) else 0)

    def plate_origin(k):
        i = k - 1                                          # stride: bed size x (1 + 1/5), rows go -Y
        return (i % cols) * bed_w * 1.2, -(i // cols) * bed_d * 1.2

    m = template.read('3D/3dmodel.model').decode()
    head = m[:m.index('<resources>')]
    tpl_oid = re.search(r'<item objectid="(\d+)"', m).group(1)
    build_tag = re.search(r'<build[^>]*>', m).group(0)
    ms = template.read('Metadata/model_settings.config').decode()
    plate = re.search(r'  <plate>.*?</plate>', ms, flags=re.S).group(0)
    tpl_instance = re.search(r'    <model_instance>.*?</model_instance>\n?', plate, flags=re.S)
    identify0 = int(re.search(r'key="identify_id" value="(\d+)"', plate).group(1)) if 'identify_id' in plate else 1000
    n = len(parts)
    by_name = {p['name']: p for p in parts}

    def parts_of(copy):
        """A copy takes every part unless it names a subset. Naming a subset is what turns
        `copies` from N identical objects into N *different* objects on one plate - the flower and
        the dome it drops into, printed side by side so the plate can run print_sequence=by object.
        Each object still has to stand on the bed on its own: every mesh must arrive with its own
        z minimum at 0, because the centring below is global and keeps the parts' relative Z."""
        want = copy.get('parts')
        if want is None:
            return parts
        missing = [w for w in want if w not in by_name]
        if missing:
            raise SystemExit(f'copy {copy.get("name", "?")!r}: no such part(s): {missing}')
        return [by_name[w] for w in want]

    mesh_objs, asm_objs, items, ms_objects, ranges = [], [], [], [], []
    instances = {k: [] for k in range(1, nplates + 1)}
    base = 0
    for ci, copy in enumerate(copies):
        # The assembly's id must not equal a mesh id: they live in different .model files, so Studio
        # tells them apart, but anything keyed by id alone does not (check-piece.py lost all five
        # parts of Boston, the first single object with >= tpl_oid parts, 2026-09-21).
        oid = tpl_oid if single and n < int(tpl_oid) else str(1000 + ci)
        sel = parts_of(copy)
        dx, dy = copy.get('offset', [0, 0])
        ox, oy = plate_origin(plate_ids[ci])
        dx, dy = dx + ox, dy + oy
        deg = float(copy.get('rotation_z_deg', 0))
        a = np.deg2rad(deg)
        # 3MF stores the linear transform for row-vector multiplication.  Apply the global
        # face-up/down orientation first, then the copy's in-plane rotation around its centred mesh.
        zrot = np.array([[np.cos(a), np.sin(a), 0],
                         [-np.sin(a), np.cos(a), 0],
                         [0, 0, 1]])
        copy_matrix = R @ zrot
        copy_rot = ' '.join(f'{v:.12g}' for v in copy_matrix.reshape(-1))
        for i, p in enumerate(sel):
            mesh_objs.append(mesh_xml(base + i + 1, p['v'], p['f']))
        comps = '\n'.join(f'    <component p:path="/3D/Objects/object_1.model" objectid="{base + i + 1}" p:UUID="{uuid.uuid4()}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
                          for i in range(len(sel)))
        asm_objs.append(f'  <object id="{oid}" p:UUID="{uuid.uuid4()}" type="model">\n   <components>\n{comps}\n   </components>\n  </object>\n')
        items.append(f'  <item objectid="{oid}" p:UUID="{uuid.uuid4()}" transform="{copy_rot} {px + dx:g} {py + dy:g} {height / 2:.6f}" printable="1"/>\n')
        part_xml = ''
        for i, p in enumerate(sel):
            pset = dict(p['settings'])
            pset.update(copy.get('part_settings', {}).get(p['name'], {}))
            for k in pset:
                if not k.startswith('_') and k not in ps:
                    warnings.append(f'part setting {k!r} is not a key of the template profile')
            if ci == 0 and pset.get('ironing_type', 'no ironing') != 'no ironing':
                warnings.append(f'part {p["name"]!r} irons at part level: that irons EVERY top of the part, hidden '
                                'ones included (Skale Club Relief: 60 % of the ironing, +7.6 min a piece). '
                                'Put the ironing in a range ending at the visible face instead (doc 09)')
            # Studio matches a <part> to its volume by the mesh object id the component points at, not by
            # position: with copies, part ids restarting at 1 silently dropped every part setting (and the
            # part extruder) of every copy but the first.
            part_xml += (f'    <part id="{base + i + 1}" subtype="{p["subtype"]}">\n      <metadata key="name" value="{esc(p["name"])}"/>\n'
                         '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
                         f'      <metadata key="extruder" value="{p["extruder"]}"/>\n' + meta(pset, '      ') +
                         f'      <mesh_stat face_count="{len(p["f"])}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n'
                         '    </part>\n')
        oset = copy.get('settings', {})
        for k in oset:
            if not k.startswith('_') and k not in ps:
                warnings.append(f'object setting {k!r} is not a key of the template profile')
        name = copy.get('name', cfg.get('name', 'Piece'))
        ms_objects.append(f'  <object id="{oid}">\n    <metadata key="name" value="{esc(name)}"/>\n'
                          f'    <metadata key="extruder" value="{sel[0]["extruder"]}"/>\n' + meta(oset, '    ') +
                          f'    <metadata face_count="{sum(len(p["f"]) for p in sel)}"/>\n{part_xml}  </object>\n')
        if tpl_instance:
            inst = re.sub(r'(key="object_id" value=")\d+', lambda g: g.group(1) + oid, tpl_instance.group(0))
            inst = re.sub(r'(key="identify_id" value=")\d+', lambda g: g.group(1) + str(identify0 + ci), inst)
            instances[plate_ids[ci]].append(inst if inst.endswith('\n') else inst + '\n')
        ranges.append(ci + 1)
        copy['_resolved_name'] = name
        base += len(sel)

    obj_model = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
                 'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n'
                 ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n' + ''.join(mesh_objs) + ' </resources>\n <build/>\n</model>\n')
    model3d = head + '<resources>\n' + ''.join(asm_objs) + ' </resources>\n ' + build_tag + '\n' + ''.join(items) + ' </build>\n</model>\n'
    bare = re.sub(r'    <model_instance>.*?</model_instance>\n?', '', plate, flags=re.S)
    plate_new = '\n'.join(re.sub(r'(key="plater_id" value=")\d+', lambda g: g.group(1) + str(k), bare)
                          .replace('  </plate>', ''.join(instances[k]) + '  </plate>') for k in range(1, nplates + 1))
    model_settings = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + ''.join(ms_objects) + plate_new + '\n</config>\n'

    # Metadata/project_settings.config
    wanted = {}
    for fn in cfg.get('settings_files', []):
        wanted.update({k: v for k, v in json.load(open(resolve(fn, cfg_dir), encoding='utf-8-sig')).items() if not k.startswith('_')})
    wanted.update({k: v for k, v in cfg.get('settings', {}).items() if not k.startswith('_')})
    for k, v in wanted.items():
        if k not in ps:
            warnings.append(f'setting {k!r} is not a key of the template profile; Studio may ignore it')
        if ps.get(k) != v:
            print(f'  setting {k}: {ps.get(k)} -> {v}')
    ps.update(wanted)
    register_diffs(ps, wanted, template_ps)
    bed = wanted.get('curr_bed_type')
    if bed:   # also on the plate itself, which the GUI reads before the project value
        model_settings = re.sub(r'\s*<metadata key="curr_bed_type" value="[^"]*"/>', '', model_settings)
        model_settings = model_settings.replace('  <plate>\n', f'  <plate>\n    <metadata key="curr_bed_type" value="{esc(bed)}"/>\n', 1)
        if f'key="curr_bed_type" value="{esc(bed)}"' not in model_settings:
            warnings.append('could not write the plate-level curr_bed_type')
    # "first_layer_sequence": [2, 3, 1] fixes the order of the filaments on the FIRST layer (Studio's plate setting
    # "First layer filament sequence"); without it Studio picks the cheapest order. On a face-down piece the first
    # layer is the face: the art (black, colours) goes first and the body last, sealing around it (user, 2026-10-11;
    # white first, tried 2026-10-10, came out worse). A dark body is the same rule mirrored: body last.
    seq = cfg.get('first_layer_sequence')
    if seq:
        seq_meta = ('    <metadata key="first_layer_sequence_choice" value="Customize"/>\n'
                f'    <metadata key="first_layer_print_sequence" value="{" ".join(str(int(s)) for s in seq)}"/>\n')
        model_settings = model_settings.replace('  <plate>\n', '  <plate>\n' + seq_meta)
        print(f'  first layer filament sequence: {seq}')
    extruders = sorted({p['extruder'] for p in parts})
    if max(extruders) > len(ps.get('filament_colour', [])):
        raise SystemExit(f'extruder {max(extruders)} used but the profile declares {len(ps.get("filament_colour", []))} filaments')

    # pause, custom G-code per layer, and top band
    pause = cfg.get('pause_top_z')
    layers = {k: [] for k in range(1, nplates + 1)}
    if pause is not None:
        # "pause_plates": [1] limits the pause to those plates (default every plate): a glue-on topping
        # printed on plate 2 has no tag to insert (Strawberry Cheesecake Slice Small NFC, 2026-10-18)
        for k in cfg.get('pause_plates', list(layers)):
            k = int(k)
            layers[k].append((float(pause), f'<layer top_z="{float(pause):.10f}" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>\n'))
        if not on_grid(float(pause)):
            warnings.append(f'pause_top_z {pause} is off the 0.2 mm grid')
    # "custom_gcode": [{"top_z": 3.08, "gcode": "M104 S205", "plates": [2]}] - Studio's per-layer custom G-code
    # (type 4), run after the layer whose top is top_z, like the pause; "plates" defaults to every plate.
    for cg in cfg.get('custom_gcode', []):
        z = float(cg['top_z'])
        g = cg['gcode'].replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('\n', '&#10;')
        for k in cg.get('plates', list(layers)):
            # Studio reads a Custom code's text from `extra` (it writes `gcode` too); with extra="" it emits an empty
            # "; CUSTOM_GCODE" block (2026-10-05)
            layers[int(k)].append((z, f'<layer top_z="{z:.10f}" type="4" extruder="1" color="" extra="{g}" gcode="{g}"/>\n'))
        print(f'  custom G-code after top_z {z:g} on plate(s) {cg.get("plates", "all")}: {cg["gcode"]!r}')
    mode = 'MultiAsSingle' if len(extruders) > 1 else 'SingleExtruder'
    custom = ('<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n' + ''.join(
              f'<plate>\n<plate_info id="{k}"/>\n' + ''.join(x for _, x in sorted(layers[k])) + f'<mode value="{mode}"/>\n</plate>\n'
              for k in range(1, nplates + 1)) + '</custom_gcodes_per_layer>\n')
    band = cfg.get('top_band')
    if band:
        zmin_band = round(height - float(band['depth']), 4)
        if not on_grid(zmin_band):
            warnings.append(f'top band starts at {zmin_band}, off the 0.2 mm grid')
        print(f'top band: {zmin_band:.2f}..{height:.2f} at {band.get("layer_height", 0.1)} mm')
    else:
        warnings.append('no top band: the standing rule asks for thinner last layers on every file')

    def intervals(extra):
        """Height ranges for one object: the top band plus extra ranges ({min_z, max_z, options}).
        Studio ranges cannot overlap, so they are split at every boundary; later ranges win."""
        pieces = []
        if band:
            base = {'layer_height': band.get('layer_height', 0.1)}
            base.update(band.get('options', {}))
            pieces.append((zmin_band, round(height, 4), base))
        for r in extra:
            opts = {}
            for sf in r.get('settings_files', []):       # range presets first, inline options win
                opts.update({k: v for k, v in json.load(open(resolve(sf, cfg_dir), encoding='utf-8-sig')).items()
                             if not k.startswith('_')})
            opts.update(r.get('options', {}))
            # A range with no layer_height segfaults bambu-studio --slice (2026-10-05, NFC Plaque serial coupon,
            # face-down, 2 plates): always write the project's layer height into it.
            opts.setdefault('layer_height', ps.get('layer_height', '0.2'))
            lo, hi = round(float(r['min_z']), 4), round(float(r['max_z']), 4)
            if abs((hi - lo) - float(opts['layer_height'])) < 1e-6:
                warnings.append(f'range {lo}..{hi} is ONE layer at the base layer height: Studio drops such a range '
                                'silently (ironing on 1.96..2.12 at 0.16 produced none); start it one layer lower')
            for zb in (lo, hi):
                if not on_grid(zb) and not (band and zb >= zmin_band - 1e-9 and abs(zb * 10 - round(zb * 10)) < 1e-6):
                    warnings.append(f'range boundary {zb} is off the layer grid; a range that splits a layer '
                                    'loses its settings (ironing in a 4.95..5.05 range produced none)')
            pieces.append((lo, hi, opts))
        cuts = sorted({v for lo, hi, _ in pieces for v in (lo, hi)})
        out = []
        for a, b in zip(cuts, cuts[1:]):
            opts, hit = {}, False
            for lo, hi, o in pieces:
                if lo <= a + 1e-9 and b <= hi + 1e-9:
                    opts.update(o); hit = True
            if hit:
                out.append((a, b, opts))
        return out

    ranges_xml = None
    per_object = [(idx, intervals(cfg.get('ranges', []) + copies[idx - 1].get('ranges', []))) for idx in ranges]
    if any(iv for _, iv in per_object):
        ranges_xml = '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n'
        for idx, iv in per_object:
            if not iv:
                continue
            ranges_xml += f' <object id="{idx}">\n'
            for a, b, opts in iv:
                ranges_xml += f'  <range min_z="{a:.2f}" max_z="{b:.2f}">\n' + ''.join(
                    f'   <option opt_key="{k}">{v}</option>\n' for k, v in opts.items()) + '  </range>\n'
            ranges_xml += ' </object>\n'
            if len(iv) > 1 or cfg.get('ranges') or copies[idx - 1].get('ranges'):
                print(f'  object {idx} ranges: ' + '; '.join(f'{a:.2f}..{b:.2f} {opts}' for a, b, opts in iv))
        ranges_xml += '</objects>\n'

    content_types = template.read('[Content_Types].xml').decode()
    if ranges_xml and 'Extension="xml"' not in content_types:
        content_types = content_types.replace('</Types>', ' <Default Extension="xml" ContentType="application/xml"/>\n</Types>')

    zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    zout.writestr('[Content_Types].xml', content_types)
    for nm in names:
        if nm in ('[Content_Types].xml', 'Metadata/layer_config_ranges.xml'):
            continue
        data = template.read(nm)
        if nm == '3D/Objects/object_1.model': data = obj_model.encode()
        elif nm == '3D/3dmodel.model': data = model3d.encode()
        elif nm == 'Metadata/model_settings.config': data = model_settings.encode()
        elif nm == 'Metadata/project_settings.config': data = json.dumps(ps, indent=4).encode()
        elif nm == 'Metadata/custom_gcode_per_layer.xml': data = custom.encode()
        zout.writestr(nm, data)
    if 'Metadata/custom_gcode_per_layer.xml' not in names:
        zout.writestr('Metadata/custom_gcode_per_layer.xml', custom)
    if ranges_xml:
        zout.writestr('Metadata/layer_config_ranges.xml', ranges_xml)
    zout.close()
    print(f'written {out} ({os.path.getsize(out)} bytes)')

    for ci, copy in enumerate(copies):
        dx, dy = copy.get('offset', [0, 0])
        T = np.array([px + dx, py + dy, height / 2])
        if not single:
            print(f"  copy {ci + 1} {copy['_resolved_name']!r} on plate {plate_ids[ci]} at ({px + dx:g}, {py + dy:g}) of that plate")
        for i, p in enumerate(parts_of(copy)):
            w = p['v'] @ R.T + T
            print(f"    part {i + 1} {p['name']!r} extruder {p['extruder']}: X {w[:, 0].min():.3f}..{w[:, 0].max():.3f}"
                  f" Y {w[:, 1].min():.3f}..{w[:, 1].max():.3f} Z {w[:, 2].min():.3f}..{w[:, 2].max():.3f}")
    if pause is not None:
        print(f'  pause M400 U1 at top_z {float(pause):g} on plate(s) {cfg.get("pause_plates", "all")}')
    for wmsg in dict.fromkeys(warnings):
        print('WARNING', wmsg)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
