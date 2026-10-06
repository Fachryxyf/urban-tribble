#!/usr/bin/env python3
"""Generate rapat-day.png / rapat-night.png: office background + isometric Red Team rug."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOMS = os.path.join(ROOT, 'public', 'rooms')
SIZE = (4800, 3584)

U = (1.0, 0.463)
V = (1.0, -0.538)
CX, CY = 2880.0, 2500.0
RU, RV = 600.0, 600.0

PAL = {
    'day': dict(band=(118, 90, 52), field=(38, 49, 76), field2=(47, 60, 92),
                gold=(178, 139, 80), emblem=(96, 114, 160)),
    'night': dict(band=(66, 50, 31), field=(23, 29, 47), field2=(28, 36, 56),
                  gold=(104, 80, 46), emblem=(58, 70, 102)),
}


def pt(u, v):
    return (CX + u * U[0] + v * V[0], CY + u * U[1] + v * V[1])


def ring(u, v):
    return [pt(u, v), pt(u, -v), pt(-u, -v), pt(-u, v)]


def mask_poly(u, v, blur=0):
    m = Image.new('L', SIZE, 0)
    ImageDraw.Draw(m).polygon(ring(u, v), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def mask_line(u, v, width):
    pts = ring(u, v)
    m = Image.new('L', SIZE, 0)
    ImageDraw.Draw(m).line(pts + [pts[0]], fill=255, width=width, joint='curve')
    return m


def build(phase):
    pal = PAL[phase]
    base = Image.open(os.path.join(ROOMS, f'office-{phase}.png')).convert('RGB')

    m_band = mask_poly(RU, RV)
    m_alpha = mask_poly(RU, RV, blur=2)
    m_field = mask_poly(RU - 38, RV - 38)
    m_field2 = mask_poly(RU - 122, RV - 122)
    m_ring1 = mask_line(RU - 92, RV - 92, 14)
    m_ring2 = mask_line(RU - 122, RV - 122, 5)
    m_emblem = mask_line(155, 155, 9)
    m_shadow = mask_poly(RU + 12, RV + 12, blur=24)

    rgb = np.zeros((SIZE[1], SIZE[0], 3), np.float32)

    def paint(mask, color):
        a = (np.asarray(mask, np.float32) / 255.0)[..., None]
        np.copyto(rgb, rgb * (1.0 - a) + np.array(color, np.float32) * a)
        del a

    paint(m_band, pal['band'])
    paint(m_field, pal['field'])
    paint(m_field2, pal['field2'])
    paint(m_ring1, pal['gold'])
    paint(m_ring2, pal['gold'])
    paint(m_emblem, pal['emblem'])
    del m_field, m_field2, m_ring1, m_ring2, m_emblem

    ys, xs = np.mgrid[0:SIZE[1], 0:SIZE[0]].astype(np.float32)
    dx = xs - CX
    dy = ys - CY
    u = (dy + 0.538 * dx) / 1.001
    v = dx - u
    del xs, ys, dx, dy
    t = np.clip(np.abs(u) / RU + np.abs(v) / RV, 0.0, 1.0)
    shade = 1.0 - 0.26 * np.clip((t - 0.5) / 0.5, 0.0, 1.0) ** 1.3
    rgb *= shade[..., None]
    del u, v, t, shade

    lum = np.asarray(base.filter(ImageFilter.GaussianBlur(110)).convert('L'), np.float32)
    x0, y0 = int(CX - RU - 60), int(CY - RV - 60)
    x1, y1 = int(CX + RU + 60), int(CY + RV + 60)
    med = float(np.median(lum[y0:y1, x0:x1]))
    ratio = np.clip(lum / max(med, 1.0), 0.45, 1.85)
    rgb *= ratio[..., None]
    del lum, ratio

    out = np.asarray(base, np.float32)
    sh = (np.asarray(m_shadow, np.float32) / 255.0) * 0.62
    out *= (1.0 - sh)[..., None]
    del sh

    a = (np.asarray(m_alpha, np.float32) / 255.0)[..., None]
    np.copyto(out, out * (1.0 - a) + np.clip(rgb, 0, 255) * a)

    dst = os.path.join(ROOMS, f'rapat-{phase}.png')
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst, optimize=True)
    print(f'{dst} written')


def main():
    for phase in ('day', 'night'):
        build(phase)


if __name__ == '__main__':
    main()
