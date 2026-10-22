"""Build the 103 x 137 mm Google face without changing the archived Small pipeline."""
import os

import face_art as base
import face_composition_large as composition

QR_BASE = 'HTTPS://XPOT.PLACE/Q/'
NFC_BASE = 'https://xpot.place/n/'
SAMPLE_CODE = base.SAMPLE_CODE


def configure():
    """Point the proven geometry/QR builder at the Large composition for this process."""
    base.fc = composition
    base.CARD_W, base.CARD_H = composition.CARD_W, composition.CARD_H
    base.QR_BASE = QR_BASE
    base.BACK_SERIAL = {
        'code_cap': 5.0,
        'code_baseline': 113.0,
        'line2_cap': 4.0,
        'line2_baseline': 120.0,
    }


def build(code=SAMPLE_CODE, batch='', serial='', out_json=None, out_check=None):
    configure()
    here = os.path.dirname(os.path.abspath(__file__))
    piece = os.path.dirname(os.path.dirname(here))
    out_json = out_json or os.path.join(here, 'large', 'face_art_google.json')
    out_check = out_check or os.path.join(piece, 'preview', 'face', 'face-art-large-google-check.png')
    data, decoded = base.build('google', code, batch, serial, out_json, out_check)
    data['source'] = 'face_art_large.py + face_composition_large.py'
    data['tag']['nfc_url'] = NFC_BASE + base.normalize_code(code)
    # base.build wrote before the source/nfc metadata adjustments above.
    import json
    json.dump(data, open(out_json, 'w', encoding='utf-8'), indent=0)
    return data, decoded


if __name__ == '__main__':
    import json
    data, decoded = build()
    print(json.dumps({'qr': decoded, 'measured': data['measured'],
                      'groups': {g['key']: [g['role'], g['area_mm2'], g['regions']]
                                 for g in data['groups']},
                      'probes': len(data['probes'])}))
