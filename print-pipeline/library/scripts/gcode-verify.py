"""Report what a sliced Bambu G-code actually does, so a .3mf can be checked against intent.

Usage:
  python gcode-verify.py <slice_dir | plate_1.gcode> [--compare <slice_dir | gcode>] [--area x0,x1,y0,y1]

<slice_dir> is the --outputdir given to `bambu-studio.exe --slice`. Its result.json adds time,
swaps, grams and the object footprints.

Only extrusion inside the part area counts, so the prime tower and purge lines stay out. The area
defaults to the union of the result.json object footprints plus 1 mm.

It reports facts, not verdicts:
- layer grid: shows whether the top band is thinner;
- Z range per filament: shows whether the colour sits only where it should;
- colour swaps;
- pauses: shows whether each pause comes before that layer's first roof bridge;
- supports and ironing;
- speed and E per mm of every top surface.

--compare prints the same facts for a second slice, plus the top-surface flow ratio at each
shared layer.
"""
import json, math, os, re, sys, collections

SKIP_FEATURES = {'Prime tower', 'Flush', 'Custom'}
T_RE = re.compile(r'^T(\d+)\s*$')
M620_RE = re.compile(r'^M620\s+S(\d+)A')
WORD_RE = re.compile(r'([XYZEFIJ])(-?\d*\.?\d+)')


def locate(p):
    if os.path.isdir(p):
        return os.path.join(p, 'plate_1.gcode'), os.path.join(p, 'result.json')
    return p, os.path.join(os.path.dirname(os.path.abspath(p)), 'result.json')


def arc_length(x, y, nx, ny, i, j, clockwise):
    cx, cy = x + i, y + j
    a0, a1 = math.atan2(y - cy, x - cx), math.atan2(ny - cy, nx - cx)
    sweep = a1 - a0
    if clockwise and sweep >= 0:
        sweep -= 2 * math.pi
    elif not clockwise and sweep <= 0:
        sweep += 2 * math.pi
    return abs(sweep) * math.hypot(i, j)


def analyse(path, area=None):
    gcode, result_path = locate(path)
    result = json.load(open(result_path, encoding='utf-8')) if os.path.exists(result_path) else None
    objects = []
    if result:
        for o in result['sliced_plates'][0].get('objects', []):
            b = o['bbox']
            objects.append((o['name'], b['x'], b['x'] + b['width'], b['y'], b['y'] + b['depth']))
    if area is None and objects:
        area = (min(o[1] for o in objects) - 1, max(o[2] for o in objects) + 1,
                min(o[3] for o in objects) - 1, max(o[4] for o in objects) + 1)

    def inside(px, py):
        return area is None or (area[0] <= px <= area[1] and area[2] <= py <= area[3])

    def object_at(px, py):
        for name, x0, x1, y0, y1 in objects:
            if x0 - 0.5 <= px <= x1 + 0.5 and y0 - 0.5 <= py <= y1 + 0.5:
                return name
        return None

    s = {
        'gcode': gcode, 'result': result, 'area': area, 'layers': [],
        'features': collections.defaultdict(set),                       # z -> features extruded in the area
        'tool_z': collections.defaultdict(lambda: [math.inf, -math.inf, set()]),
        'swaps': [], 'pauses': [], 'bridges': collections.defaultdict(list),
        'top': collections.defaultdict(lambda: [0.0, 0.0, set()]),     # (z, tool) -> E, mm, speeds
        'ironing': collections.defaultdict(lambda: [0.0, 0.0]),        # object -> E, mm
        'absolute_e': False,
    }
    tool = z = feature = x = y = None
    feed = 0.0
    with open(gcode, encoding='utf-8', errors='ignore') as f:
        for lineno, line in enumerate(f, 1):
            if line[0] == ';':
                if line.startswith('; Z_HEIGHT:'):
                    z = round(float(line[11:]), 3)
                    s['layers'].append(z)
                elif line.startswith('; FEATURE:'):
                    feature = line[10:].strip()
                continue
            if tool is None:
                m = M620_RE.match(line)
                if m:
                    tool = int(m.group(1))
            m = T_RE.match(line)
            if m:
                v = int(m.group(1))
                if v < 100:                       # T1000 / T255 are Bambu control codes, not tools
                    if tool is not None and v != tool and z is not None:
                        s['swaps'].append((z, tool, v))
                    tool = v
                continue
            if line.startswith('M82'):
                s['absolute_e'] = True
            if line.startswith('M400 U1'):
                s['pauses'].append((lineno, z))
                continue
            g = line[:3]
            if g not in ('G0 ', 'G1 ', 'G2 ', 'G3 '):
                continue
            w = {k: float(v) for k, v in WORD_RE.findall(line.split(';', 1)[0])}
            if 'F' in w:
                feed = w['F']
            nx, ny = w.get('X', x), w.get('Y', y)
            e = w.get('E')
            if (e is not None and e > 0 and z is not None and x is not None and nx is not None
                    and feature not in SKIP_FEATURES and inside(nx, ny)):
                if g in ('G2 ', 'G3 ') and 'I' in w and 'J' in w:
                    length = arc_length(x, y, nx, ny, w['I'], w['J'], g == 'G2 ')
                else:
                    length = math.hypot(nx - x, ny - y)
                s['features'][z].add(feature)
                tz = s['tool_z'][tool]
                tz[0], tz[1] = min(tz[0], z), max(tz[1], z)
                tz[2].add(z)
                if feature == 'Bridge':
                    s['bridges'][z].append(lineno)
                if length > 0.3:
                    if feature == 'Top surface':
                        t = s['top'][(z, tool)]
                        t[0] += e; t[1] += length; t[2].add(round(feed / 60))
                    elif feature == 'Ironing':
                        it = s['ironing'][object_at((x + nx) / 2, (y + ny) / 2)]
                        it[0] += e; it[1] += length
            x, y = nx, ny
    return s


def runs(layers):
    """Layer grid as runs of equal height: [(height, count, z_first, z_last)]."""
    out, prev = [], 0.0
    for z in layers:
        h = round(z - prev, 3)
        if out and abs(out[-1][0] - h) < 1e-6:
            out[-1] = (h, out[-1][1] + 1, out[-1][2], z)
        else:
            out.append((h, 1, z, z))
        prev = z
    return out


def zlist(zs):
    return ', '.join(f'{z:g}' for z in sorted(zs))


def report(s):
    print(f"== {s['gcode']}")
    r = s['result']
    if r:
        pl = r['sliced_plates'][0]
        grams = ', '.join(f"filament {fl['id']} {fl['total_used_g']:.2f} g" for fl in pl['filaments'])
        print(f"slice      : {r['error_string']}  warning: {pl.get('warning_message') or 'none'}")
        print(f"             {pl['total_predication'] / 60:.1f} min, {pl['filament_change_times']} swaps, {grams}")
        for name, x0, x1, y0, y1 in (
                (o['name'], o['bbox']['x'], o['bbox']['x'] + o['bbox']['width'], o['bbox']['y'], o['bbox']['y'] + o['bbox']['depth'])
                for o in pl.get('objects', [])):
            print(f"object     : {name}  X {x0:.1f}..{x1:.1f}  Y {y0:.1f}..{y1:.1f}")
    else:
        print('slice      : no result.json next to the G-code (time, swaps and footprints unknown)')
    if s['area']:
        print(f"part area  : X {s['area'][0]:.1f}..{s['area'][1]:.1f}  Y {s['area'][2]:.1f}..{s['area'][3]:.1f}")
    else:
        print('part area  : whole plate (no footprints; prime tower and purge excluded by feature only)')
    if s['absolute_e']:
        print('WARNING    : M82 absolute extrusion found; E per mm below assumes relative E')

    grid = '; '.join(f"{h:.2f} x{n} ({a:g}..{b:g})" for h, n, a, b in runs(s['layers']))
    print(f"layers     : {len(s['layers'])} -- {grid}")

    for t in sorted(k for k in s['tool_z'] if k is not None):
        lo, hi, zs = s['tool_z'][t]
        print(f"filament {t + 1:<2}: T{t}, z {lo:g}..{hi:g} on {len(zs)} layers")

    print(f"swaps      : {len(s['swaps'])}" + ''.join(f"\n             z {z:g}: T{a} -> T{b}" for z, a, b in s['swaps']))

    if not s['pauses']:
        print('pauses     : none')
    for lineno, z in s['pauses']:
        later = [b for b in s['bridges'].get(z, []) if b > lineno]
        earlier = [b for b in s['bridges'].get(z, []) if b < lineno]
        if not s['bridges'].get(z):
            note = 'no Bridge on that layer'
        elif earlier:
            note = f'WARNING: {len(earlier)} Bridge moves on that layer come BEFORE the pause (first at line {earlier[0]})'
        else:
            note = f'first Bridge on that layer at line {later[0]}, after the pause'
        print(f"pause      : M400 U1 at line {lineno}, layer z {z:g}; {note}")

    support = [z for z, fs in s['features'].items() if any(f and f.startswith('Support') for f in fs)]
    print(f"supports   : {'on layers ' + zlist(support) if support else 'none'}")

    ironing = [z for z, fs in s['features'].items() if 'Ironing' in fs]
    print(f"ironing    : {'on layers ' + zlist(ironing) if ironing else 'none'}")
    if s['ironing']:
        order = [o['name'] for o in (r['sliced_plates'][0].get('objects', []) if r else [])]
        names = sorted(s['ironing'], key=lambda n: order.index(n) if n in order else len(order))
        base = None
        for name in names:
            e, mm = s['ironing'][name]
            if mm > 0:
                ratio = e / mm
                base = base or ratio
                print(f"             {name or '(no object)'}: {mm:.0f} mm, E/mm {ratio:.5f}, x{ratio / base:.3f} of the first object")

    for (z, t), (e, mm, speeds) in sorted(s['top'].items(), key=lambda kv: (kv[0][0], kv[0][1] or 0)):
        if mm >= 5:
            print(f"top surface: z {z:g} T{t}: {mm:.0f} mm, E/mm {e / mm:.5f}, {'/'.join(str(v) for v in sorted(speeds))} mm/s")


def compare(a, b):
    print(f"== compare: first vs second")
    ra, rb = a['result'], b['result']
    if ra and rb:
        pa, pb = ra['sliced_plates'][0], rb['sliced_plates'][0]
        print(f"time       : {pa['total_predication'] / 60:.1f} vs {pb['total_predication'] / 60:.1f} min")
        print(f"swaps      : {pa['filament_change_times']} vs {pb['filament_change_times']}")
        ga = {f['id']: f['total_used_g'] for f in pa['filaments']}
        gb = {f['id']: f['total_used_g'] for f in pb['filaments']}
        for k in sorted(set(ga) | set(gb)):
            print(f"filament {k:<2}: {ga.get(k, 0):.3f} vs {gb.get(k, 0):.3f} g")
    print(f"layers     : {'same grid' if a['layers'] == b['layers'] else 'DIFFERENT grids'}")
    for t in sorted(set(a['tool_z']) | set(b['tool_z']), key=lambda v: -1 if v is None else v):
        za = sorted(a['tool_z'][t][2]) if t in a['tool_z'] else []
        zb = sorted(b['tool_z'][t][2]) if t in b['tool_z'] else []
        print(f"T{t} layers  : {'same' if za == zb else f'DIFFERENT ({len(za)} vs {len(zb)})'}")
    pa_ = [z for _, z in a['pauses']]
    pb_ = [z for _, z in b['pauses']]
    print(f"pauses     : {pa_} vs {pb_}")
    for key in sorted(set(a['top']) & set(b['top']), key=lambda k: (k[0], k[1] or 0)):
        ea, ma, _ = a['top'][key]
        eb, mb, _ = b['top'][key]
        if ma >= 5 and mb >= 5:
            print(f"top z {key[0]:g} T{key[1]}: E/mm ratio second/first {(eb / mb) / (ea / ma):.3f}, length {ma:.0f} vs {mb:.0f} mm")


def main(argv):
    args, area, other = [], None, None
    it = iter(argv)
    for a in it:
        if a == '--area':
            area = tuple(float(v) for v in next(it).split(','))
        elif a == '--compare':
            other = next(it)
        else:
            args.append(a)
    if len(args) != 1:
        print(__doc__)
        return 2
    first = analyse(args[0], area)
    report(first)
    if other:
        second = analyse(other, area)
        print()
        report(second)
        print()
        compare(first, second)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
