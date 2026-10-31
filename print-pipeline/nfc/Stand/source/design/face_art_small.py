"""Point face_art back at the 60 x 85 mm Small Stand card, the layout it was written for.

face_art_large.configure() moves face_art's globals to the Large card for the whole process; this puts them back,
so a process can build a Small card after a Large one (the bench builds plate after plate in one process).
"""
import face_art as base
import face_composition as composition

QR_BASE = 'HTTPS://XPOT.PLACE/Q/'
SAMPLE_CODE = base.SAMPLE_CODE
# face_art.py's own numbers: the back seen from behind, y down; the bottom 9.5 mm sit in the slot.
BACK_SERIAL = {'code_cap': 3.2, 'code_baseline': 65.3, 'line2_cap': 2.7, 'line2_baseline': 70.5}


def configure():
    base.fc = composition
    base.CARD_W, base.CARD_H = composition.CARD_W, composition.CARD_H
    base.QR_BASE = QR_BASE
    base.BACK_SERIAL = dict(BACK_SERIAL)
