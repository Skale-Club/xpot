"""Build a four-up black Large Menu Plate batch from an issued Xpot response.

Uses the established Plate slab, embedded NFC stack and A1 recipe. The Menu
composition matches face_composition_tile's Large Inria Serif Bold option.
"""
from pathlib import Path
import csv
import datetime
import json
import subprocess
import sys
import tempfile
import shutil

SOURCE = Path(__file__).resolve().parent
PIECE = SOURCE.parent
REPO = PIECE.parent.parent
sys.path.insert(0, str(SOURCE / 'design'))
import tile_per_code as tile
import face_composition_tile as composition
from matplotlib.textpath import TextPath
from shapely.geometry import Point, box
from shapely.ops import unary_union
import numpy as np
fa, geom = tile.fa, tile.igc
FONT = 'Inria Serif Bold'


def artwork(code):
    composition.configure('large')
    tile.configure_size('large')
    size, cx, margin = 103., 51.5, 8.
    tap, _ = fa.tap_row_geom(cx, dict(icon_h=7.2, cap=4.9, gap=2.5, label='Tap here', y=margin))
    prop = composition._font(composition.MENU_FONTS[FONT][0])
    ref = TextPath((0, 0), 'H', size=100, prop=prop).get_extents().height
    path = TextPath((0, 0), 'Menu', size=100, prop=prop)
    ext = path.get_extents()
    scale = min(30 / ref, 80 / ext.width)
    cap = ref * scale
    qr_top, qr_size, border = 64., 31., 2.48
    group_h = cap + 4.5 + 4.7
    space = (qr_top - border - (margin + 7.2) - group_h) / 2
    assert space > 0
    title_top = margin + 7.2 + space
    title = fa.even_odd([[(cx - ext.width * scale / 2 + (x-ext.x0)*scale,
                           title_top + cap - y*scale) for x,y in ring]
                         for ring in path.to_polygons(closed_only=True)])
    sub, width = fa.text_geom('Scan or tap to view', 4.7, cx, title_top + cap + 4.5 + 4.7)
    assert width < 87
    dark, _, qr = fa.qr_geom(dict(x=cx-qr_size/2, y=qr_top, size=qr_size, modules=25), fa.QR_BASE+code)
    panel = tile._rounded_rect(cx-qr_size/2-border, qr_top-border,
                              cx+qr_size/2+border, qr_top+qr_size+border, border*.6)
    ink = unary_union([tap, title, sub, panel.difference(dark)]).simplify(.002, preserve_topology=True)
    return ink, dark, panel, qr, title_top + cap/2, space


def build_one(code, out):
    ink_comp, dark, panel, qr, nfc_top, space = artwork(code)
    ink, panel_tile = tile.to_tile(ink_comp), tile.to_tile(panel)
    back_text,_ = fa.text_geom(code, 3.2, 51.5, 53.1)
    back = tile.to_tile_back(back_text.buffer(-.01,join_style='mitre').buffer(.01,join_style='mitre').simplify(.002,preserve_topology=True))
    nfc = Point(0,103-nfc_top).buffer(12.8,quad_segs=64)
    assert nfc_top > 12.8 and nfc_top < 90.2
    body = tile.body() - geom.prism(nfc,.96,1.92)
    volume = geom.to_trimesh(body).volume
    body = body - geom.prism(ink,tile.TOP-.52,tile.TOP+.2) - geom.prism(back,-.2,.32)
    body_mesh = geom.to_trimesh(body)
    art_mesh = geom.to_trimesh(geom.prism(ink,tile.TOP-.52,tile.TOP))
    expected = volume-ink.area*.52-back.area*.32
    q = dict(size=31., modules=25, y=64.)
    geom.H = 103.
    decoded = geom.decode_qr_polygons(tile.to_tile(dark),q,qr['url'])
    section = geom.mesh_section_polygons(art_mesh,tile.TOP-.26)
    qr_box = box(-16.5,7.,16.5,40.)
    decoded_mesh = geom.decode_qr_polygons(panel_tile.difference(section).intersection(qr_box),q,qr['url'])
    bad = geom.welded_bad_edges(body_mesh)+geom.welded_bad_edges(art_mesh)
    ok = (body_mesh.is_watertight and art_mesh.is_watertight and bad==0 and len(body.decompose())==2
          and abs(body_mesh.volume-expected)/expected<.005
          and abs(art_mesh.volume-ink.area*.52)/(ink.area*.52)<.005
          and decoded==qr['url'] and decoded_mesh==qr['url'])
    report = dict(code=code,ok=bool(ok),font=FONT,qr=qr,qr_decoded_polygons=decoded,qr_decoded_mesh=decoded_mesh,
                  watertight=[bool(body_mesh.is_watertight),bool(art_mesh.is_watertight)],bad_edges=bad,
                  tile_shells=len(body.decompose()),tile_bounds=body_mesh.bounds.tolist(),
                  body_mm3=body_mesh.volume,expected_mm3=expected,nfc_centre_from_top_mm=nfc_top,
                  message_gap_mm=space)
    if not ok: raise RuntimeError(report)
    out.mkdir(parents=True,exist_ok=True)
    body_mesh.export(out/'Black_Menu_Plate.stl')
    art_mesh.export(out/'White_Menu_Art.stl')
    # Store the exact source polygons used to create the two solids.
    art_dir=out.parent.parent/'art'
    art_dir.mkdir(exist_ok=True)
    (art_dir/f'{code}.json').write_text(json.dumps(dict(version='menu',code=code,qr=qr,
        white_inlay=fa.levels(ink),black_body='rounded 103 x 103 x 3.56; chamfer 0.5',
        back_engraving=fa.levels(back),report=report),indent=2)+'\n')
    def svg(g,color): return g.svg(scale_factor=1,fill_color=color).replace('opacity="0.6"','opacity="1.0"').replace('stroke="#555555"','stroke="none"')
    drawing=(f'<svg xmlns="http://www.w3.org/2000/svg" width="103mm" height="103mm" viewBox="0 0 103 103">'
             '<rect width="103" height="103" rx="10" fill="#161616"/>'+svg(ink_comp,'#F2F2F2')+'</svg>')
    import fitz
    doc=fitz.open(stream=drawing.encode(),filetype='svg')
    doc[0].get_pixmap(matrix=fitz.Matrix(3,3),alpha=False).save(str(art_dir/f'{code}.png'))
    return report


def main():
    response=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    batch=response['batch']['batchCode']
    assert response['batch']['face']=='menu' and response['batch']['productType']=='large_plate'
    assert len(response['tags'])==4 and len({r['publicCode'] for r in response['tags']})==4
    batch_dir=PIECE/'production'/batch
    output=PIECE/'PRINT NOW'/f'1 - PLATES MENU LARGE - {batch} BLACK - PLA x4.3mf'
    recipe_path=batch_dir/'build-menu-large-black-pla.json'
    if output.exists() or recipe_path.exists(): raise RuntimeError('Refusing to overwrite existing Menu batch')
    rows=[dict(batch_code=batch,serial_number=f"{r['serialNumber']:03d}",public_code=r['publicCode'],
               qr_url=r['qrUrl'],nfc_url=r['nfcUrl'],qr_asset_filename='') for r in response['tags']]
    external=PIECE/'production'/f'{batch}-import.csv'
    with external.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    subprocess.run([sys.executable,str(PIECE.parent/'Stand/source/production.py'),'--root',str(PIECE/'production'),'import',str(external)],check=True)
    external.unlink() # canonical copy exists in the imported batch directory
    cfg=json.loads((SOURCE/'build-instagram-large-plate-pla.json').read_text())
    from build_instagram_batch import _swap_filament_slots
    _swap_filament_slots(cfg,0,1)
    cfg.update(name=f'{batch} Menu Plates Large Black PLA x4',_about='Four black 103 x 103 x 3.56 Menu plates; Inria Serif Bold; normal 31 mm QR; embedded NFC pause Z 2.76.',parts=[],copies=[],first_layer_sequence=[2,1])
    cfg['_first_layer_sequence']='White Menu art first; black body last.'
    cfg['_batch']=f"{batch}, Xpot {response['batch']['id']}"
    positions=['front-left','front-right','back-left','back-right']
    offsets=[(-72.5,-53.5),(72.5,-53.5),(-72.5,53.5),(72.5,53.5)]
    reports=[]
    for row,offset in zip(rows,offsets):
        serial,code=row['serial_number'],row['public_code']
        reports.append(build_one(code,batch_dir/'mesh'/serial))
        names=[f'Black - Menu Plate {serial}',f'White - Menu Art {serial}']
        cfg['parts'] += [dict(name=names[0],stl=f'{serial}/Black_Menu_Plate.stl',extruder=1),dict(name=names[1],stl=f'{serial}/White_Menu_Art.stl',extruder=2)]
        cfg['copies'].append(dict(name=f'{batch} #{serial} {code}',parts=names,offset=list(offset)))
    (batch_dir/'geometry-verification.json').write_text(json.dumps(reports,indent=2)+'\n')
    recipe_path.write_text(json.dumps(cfg,indent=1)+'\n')
    with tempfile.TemporaryDirectory(prefix='xpot-menu-') as temp:
        tmp=Path(temp)/'menu.3mf'
        subprocess.run([sys.executable,str(REPO/'library/scripts/build-3mf-from-fusion.py'),str(recipe_path),'--stl-dir',str(batch_dir/'mesh'),'--out',str(tmp)],check=True)
        shutil.copy2(tmp,output)
    map_path=PIECE/'PRINT NOW'/f'SERIAL MAP - {batch}.csv'
    with map_path.open('w',newline='') as f:
        writer=csv.writer(f);writer.writerow(['bed_position','serial_number','public_code','qr_url','nfc_url'])
        for position,row in zip(positions,rows): writer.writerow([position,row['serial_number'],row['public_code'],row['qr_url'],row['nfc_url']])
    # production.py's art command has Stand-only layouts; register actual Menu artwork only.
    sys.path.insert(0,str(PIECE.parent/'Stand/source'))
    import production
    ledger=production.read_ledger(str(PIECE/'production'))
    for row in ledger:
        if row['batch_code']==batch:
            row['version']='menu';row['art_built']=datetime.date.today().isoformat()
            row['note']='Plate Large black Menu; actual Plate polygons verified by build_menu_batch.py.'
    production.write_ledger(str(PIECE/'production'),ledger)
    print(json.dumps(dict(batch=batch,print_file=str(output),serial_map=str(map_path),reports=reports),indent=2))

if __name__=='__main__': main()
