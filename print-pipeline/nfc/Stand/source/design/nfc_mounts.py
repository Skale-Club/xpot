"""The NFC types a piece can take, chosen when a print is asked for (user, 2026-11-02). Each one is a different print file.

    sticker_round_25   the 1 inch (25.4 mm) NTAG215 round sticker, the default. Pocket 28.40 x 0.48, the 1.50 mm per
                       side that made the 10 x 20 sticker comfortable to place by hand (doc 16 s5).
    sticker_10x20      the LeadSeals 10 x 20 x 0.15 NTAG213 sticker in the 23.00 x 13.00 x 0.48 pocket.
    embedded_round     the 25 mm NTAG215 round tag in the 25.6 x 0.96 cavity, print z 1.64-2.60, pause 2.76.

The round sticker's pocket is centred 17.2 mm below the top edge on every piece, the closest to Tap here that keeps
EDGE_GAP. On a Google face that crosses the G pocket, so there it goes behind it, leaving the 0.48 mm floor the round
tag always had; elsewhere it sits at the 10 x 20 sticker's depth, by body colour. The thickness was not measured yet:
0.48 assumes a sticker as thin as the 10 x 20's, with air over it so it does not disturb the roof layer.
"""
ROUND_STICKER, RECT_STICKER, ROUND_TAG = 'sticker_round_25', 'sticker_10x20', 'embedded_round'
NFC_MOUNTS = (ROUND_STICKER, RECT_STICKER, ROUND_TAG)
DEFAULT_MOUNT = ROUND_STICKER

STICKER_D, CLEARANCE = 25.4, 1.5
POCKET_D = STICKER_D + 2 * CLEARANCE
POCKET_DEPTH = 0.48
ROOF_LAYER = 0.16
EDGE_GAP = 3.0
FROM_TOP = EDGE_GAP + POCKET_D / 2
TAG_D, TAG_PRINT_Z0, TAG_PRINT_Z1, TAG_PAUSE_Z = 25.6, 1.64, 2.60, 2.76
Z0_BY_THEME = {'white': 1.16, 'black': 0.68}
Z0_BEHIND_G = 1.64

PARTS = {ROUND_STICKER: 'nfc-sticker-round-25', RECT_STICKER: 'nfc-sticker-10x20', ROUND_TAG: 'nfc-tag-round-25'}
PAUSE_TEXT = {
    ROUND_STICKER: 'Press one blank 25.4 mm round NTAG215 sticker flat, adhesive down, into each pocket; resume.',
    RECT_STICKER: 'Press one blank 10 x 20 NTAG213 sticker flat, adhesive down, long side left-right, into each pocket; resume.',
    ROUND_TAG: 'Insert one programmed round NFC tag (NTAG215, 25 mm, 0.8 mm or thinner) into each cavity, by the serial map; resume.',
}


def print_z(theme, behind_g=False):
    """The round sticker pocket's (floor, roof, pause_top_z) in print z (face down: print z = thickness - model z)."""
    z0 = Z0_BEHIND_G if behind_g else Z0_BY_THEME[theme]
    z1 = round(z0 + POCKET_DEPTH, 2)
    return z0, z1, round(z1 + ROOF_LAYER, 2)


def pause_z(mount, theme, behind_g=False):
    """The layer a piece's pause runs before, for a body colour. Mixed beds use the white depth."""
    if mount == ROUND_TAG:
        return TAG_PAUSE_Z
    if mount == ROUND_STICKER:
        return print_z(theme, behind_g)[2]
    if mount == RECT_STICKER:
        return round(Z0_BY_THEME[theme] + POCKET_DEPTH + ROOF_LAYER, 2)
    raise ValueError('nfc_mount %r: one of %s' % (mount, ', '.join(NFC_MOUNTS)))
