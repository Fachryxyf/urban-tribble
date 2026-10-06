#!/usr/bin/env python3
"""Generate meeting-table.png: isometric boardroom table aligned to floor axes."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sprites', 'furniture', 'meeting-table.png')

W, H = 1900, 1000
U = (1.0, 0.463)
V = (1.0, -0.538)
FCX, FCY = 950.0, 480.4
A = 420.0
T = 56


def wp(u, v):
    return (FCX + u * U[0] + v * V[0], FCY + u * U[1] + v * V[1])


def diamond(a, b):
    return [wp(a, b), wp(a, -b), wp(-a, -b), wp(-a, b)]


def shift(pts, dy):
    return [(x, y + dy) for x, y in pts]


def face_mask():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(diamond(A, A), fill=255)
    return m


def face_layer():
    gx = np.clip((np.arange(W, dtype=np.float32) - 110.0) / 1680.0, 0, 1)
    c0 = np.array([178, 133, 85], np.float32)
    c1 = np.array([122, 86, 48], np.float32)
    row = c0 * (1.0 - gx)[None, :, None] + c1 * gx[None, :, None]
    grad = np.repeat(row, H, axis=0)
    vfac = (1.06 - 0.12 * (np.arange(H, dtype=np.float32) / H))[:, None, None]
    grad = np.clip(grad * vfac, 0, 255).astype(np.uint8)
    return Image.fromarray(grad, 'RGB')


def draw_thickness(img):
    edge_a = [wp(-A, -A), wp(A, -A)]
    edge_b = [wp(A, -A), wp(A, A)]
    d = ImageDraw.Draw(img)
    top = np.array([128, 92, 54], np.float32)
    bot = np.array([74, 51, 28], np.float32)
    for i in range(T):
        f = i / max(T - 1, 1)
        c = tuple(int(x) for x in (top * (1 - f) + bot * f))
        for edge in (edge_a, edge_b):
            poly = [(edge[0][0], edge[0][1] + i), (edge[1][0], edge[1][1] + i),
                    (edge[1][0], edge[1][1] + i + 1), (edge[0][0], edge[0][1] + i + 1)]
            d.polygon(poly, fill=c)
    d.line(edge_a, fill=(220, 184, 130, 255), width=5, joint='curve')
    d.line(edge_b, fill=(220, 184, 130, 255), width=5, joint='curve')
    d.line(shift(edge_a, T), fill=(56, 38, 20, 255), width=4, joint='curve')
    d.line(shift(edge_b, T), fill=(56, 38, 20, 255), width=4, joint='curve')


def draw_surface(img):
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for k in range(-5, 6):
        v0 = k * 84.0
        d.line([wp(-A, v0), wp(A, v0)], fill=(102, 71, 38, 84), width=4)
    d.polygon(diamond(A, A), outline=(78, 54, 30, 200))
    d.line(diamond(337, 337) + [wp(337, 337)], fill=(212, 172, 112, 235), width=10, joint='curve')
    d.line(diamond(321, 321) + [wp(321, 321)], fill=(110, 76, 40, 220), width=4, joint='curve')
    far = [wp(-A, -A), wp(-A, A), wp(A, A)]
    d.line(far, fill=(226, 194, 142, 190), width=5, joint='curve')
    img.alpha_composite(ov)


def shadow(img, pts, blur, alpha):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=alpha)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    sh = Image.new('RGBA', (W, H), (34, 20, 8, 255))
    sh.putalpha(m)
    img.alpha_composite(sh)


def item_shadow(d, u, v, su, sv, alpha=85):
    pts = [wp(u - su, v + sv), wp(u + su, v + sv), wp(u + su, v - sv), wp(u - su, v - sv)]
    d.polygon(pts, fill=(60, 38, 18, alpha))


def laptop(d, u, v, s=1.1):
    lu, lv = 56 * s, 42 * s
    bl, br = wp(u - lu, v + lv), wp(u + lu, v + lv)
    fl, fr = wp(u - lu, v - lv), wp(u + lu, v - lv)
    d.polygon([fl, fr, br, bl], fill=(56, 61, 70, 255))
    i = 13 * s
    ibl, ibr = wp(u - lu + i, v + lv - i), wp(u + lu - i, v + lv - i)
    ifr, ifl = wp(u + lu - i, v - lv + i), wp(u - lu + i, v - lv + i)
    d.polygon([ifl, ifr, ibr, ibl], fill=(76, 82, 94, 255))
    tp = wp(u, v - lv * 0.3)
    d.rounded_rectangle([tp[0] - 15 * s, tp[1] - 8 * s, tp[0] + 15 * s, tp[1] + 8 * s],
                        radius=4, fill=(92, 99, 112, 255))
    sx, sy = 30 * s, -78 * s
    d.polygon([bl, br, (br[0] + sx, br[1] + sy), (bl[0] + sx, bl[1] + sy)],
              fill=(24, 28, 35, 255))
    qc = ((bl[0] + br[0]) / 2 + sx / 2, (bl[1] + br[1]) / 2 + sy / 2)

    def inset(p, f):
        return (qc[0] + (p[0] - qc[0]) * f, qc[1] + (p[1] - qc[1]) * f)
    quad = [bl, br, (br[0] + sx, br[1] + sy), (bl[0] + sx, bl[1] + sy)]
    d.polygon([inset(p, 0.84) for p in quad], fill=(45, 97, 172, 255))
    d.polygon([inset(quad[0], 0.9), inset(quad[1], 0.9),
               inset(quad[2], 0.9), inset(quad[3], 0.9)],
              outline=(120, 170, 230, 255), width=2)


def cup(d, u, v, s=1.1):
    cx, cy = wp(u, v)
    rx, ry, hgt = 27 * s, 13 * s, 44 * s
    d.rectangle([cx - rx, cy - hgt, cx + rx, cy], fill=(214, 207, 191, 255))
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(186, 178, 162, 255))
    d.ellipse([cx - rx, cy - hgt - ry, cx + rx, cy - hgt + ry], fill=(238, 232, 218, 255))
    d.ellipse([cx - rx + 7, cy - hgt - ry + 4, cx + rx - 7, cy - hgt + ry - 4],
              fill=(76, 47, 26, 255))


def papers(d, u, v):
    lu, lv = 70, 50
    for k in range(4):
        dy = -k * 4.5
        col = (236, 231, 219, 255) if k % 2 == 0 else (222, 216, 202, 255)
        pts = [wp(u - lu, v + lv), wp(u + lu, v + lv), wp(u + lu, v - lv), wp(u - lu, v - lv)]
        d.polygon([(x, y + dy) for x, y in pts], fill=col)
    for k in (-16, 0, 16):
        p1 = wp(u - 40, v + k)
        p2 = wp(u + 18, v + k)
        d.line([p1, (p2[0], p2[1] - 3)], fill=(150, 148, 140, 255), width=3)


def main():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shadow(img, shift(diamond(A + 14, A + 14), T + 10), 18, 112)

    img.paste(face_layer(), (0, 0), face_mask())
    draw_surface(img)
    draw_thickness(img)

    d = ImageDraw.Draw(img)
    for u, v in ((-190, 120), (145, 255), (-33, 250), (-295, 75), (185, 65)):
        item_shadow(d, u, v, 74, 56)
    laptop(d, -190, 120)
    laptop(d, 145, 255)
    papers(d, -33, 250)
    cup(d, -295, 75)
    cup(d, 185, 65)

    img.save(OUT, optimize=True)
    print(f'{OUT} written {img.size}')


if __name__ == '__main__':
    main()
