"""Gera os ícones PNG do app (desenho "Vidro"): círculo claro com a casa escura sobre cinza quente.

A casa é o mesmo traço do ícone `home` do painel (web/src/ui/Icon.jsx, grade 24). Os SVGs em web/public são escritos à mão
com a mesma geometria; este script só desenha os PNGs (o PIL não lê SVG).
Uso: python scripts/gerar-icones.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

PUBLIC = Path(__file__).resolve().parent.parent / "web" / "public"
BG_TOP, BG_BOTTOM = (69, 69, 68), (38, 38, 37)  # sf2 -> acc-ink
GLOW = (243, 181, 90)  # --glow, bem fraco no canto
DISC, INK = (245, 245, 243), (38, 38, 37)  # --acc e --acc-ink
ROOF = [(4, 11.5), (12, 4), (20, 11.5)]
BODY = [(6, 10), (6, 19), (10.5, 19), (10.5, 14), (13.5, 14), (13.5, 19), (18, 19), (18, 10)]


def house(pen, cx, cy, size, width, color):
    """Desenha a casa da grade 24 centrada em (cx, cy) ocupando `size` px."""
    k = size / 24
    for line in (ROOF, BODY):
        points = [(cx + (x - 12) * k, cy + (y - 11.5) * k) for x, y in line]
        pen.line(points, fill=color, width=round(width * k), joint="curve")
        r = width * k / 2
        for x, y in (points[0], points[-1]):
            pen.ellipse((x - r, y - r, x + r, y + r), fill=color)  # ponta arredondada


def icon(px, disc=0.62):
    """Ícone quadrado de borda a borda (o sistema recorta o canto; serve como maskable: o disco fica na zona segura)."""
    s = px * 4  # desenha grande e reduz: borda lisa
    image = Image.new("RGB", (s, s))
    pen = ImageDraw.Draw(image)
    for y in range(s):
        t = y / (s - 1)
        pen.line([(0, y), (s, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    glow = Image.new("L", (s, s), 0)
    ImageDraw.Draw(glow).ellipse((-s * 0.3, -s * 0.45, s * 0.7, s * 0.4), fill=46)
    image.paste(Image.new("RGB", (s, s), GLOW), mask=glow.filter(ImageFilter.GaussianBlur(s * 0.14)))
    d = s * disc
    pen.ellipse(((s - d) / 2, (s - d) / 2, (s + d) / 2, (s + d) / 2), fill=DISC)
    house(pen, s / 2, s / 2 + s * 0.012, d * 0.7, 2.0, INK)
    return image.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    for name, px in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        img = icon(px)
        assert img.size == (px, px) and img.getpixel((px // 2, px // 2 - px // 5)) == DISC, name  # disco claro no topo do centro
        img.save(PUBLIC / name, optimize=True)
        print("gravado", PUBLIC / name)
