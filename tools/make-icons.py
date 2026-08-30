#!/usr/bin/env python3
"""Generate the PWA icon set from the app palette. Requires Pillow.

    python3 tools/make-icons.py

Regenerate whenever the palette or glyph changes; the PNGs are committed so a
normal checkout needs no image tooling.
"""

from pathlib import Path

from PIL import Image, ImageDraw

NAVY = (22, 35, 58, 255)
CYAN = (56, 189, 248, 255)
OUT = Path(__file__).resolve().parent.parent / "public"

# Icon geometry as fractions of the canvas, so every size is identical.
BAR_H = 0.075
BAR_W = 0.66
INNER_W, INNER_H = 0.10, 0.34
OUTER_W, OUTER_H = 0.075, 0.22
GAP = 0.012


def draw(size: int, scale: float, radius_ratio: float | None) -> Image.Image:
    """scale shrinks the glyph for maskable safe-zone; radius_ratio rounds the
    ground (None = full bleed, required for maskable)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if radius_ratio is None:
        d.rectangle([0, 0, size, size], fill=NAVY)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * radius_ratio, fill=NAVY)

    c = size / 2
    px = lambda f: f * size * scale  # noqa: E731

    def rounded(box, radius):
        """Pillow rejects a radius wider than half the box, which happens at
        favicon sizes; fall back to a plain rectangle when it cannot round."""
        w, h = box[2] - box[0], box[3] - box[1]
        r = max(0, min(radius, w / 2 - 1, h / 2 - 1))
        if r < 1:
            d.rectangle(box, fill=CYAN)
        else:
            d.rounded_rectangle(box, radius=r, fill=CYAN)

    def bar(w, h):
        rounded(
            [c - px(w) / 2, c - px(h) / 2, c + px(w) / 2, c + px(h) / 2],
            px(min(w, h)) * 0.28,
        )

    def plate(offset, w, h):
        for sign in (-1, 1):
            x = c + sign * px(offset)
            rounded([x - px(w) / 2, c - px(h) / 2, x + px(w) / 2, c + px(h) / 2], px(w) * 0.3)

    bar(BAR_W, BAR_H)
    plate(BAR_W / 2 - INNER_W / 2, INNER_W, INNER_H)
    plate(BAR_W / 2 - INNER_W / 2 + INNER_W / 2 + OUTER_W / 2 + GAP, OUTER_W, OUTER_H)
    return img


def main() -> None:
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    targets = [
        (OUT / "icons/icon-192.png", 192, 1.0, 0.18),
        (OUT / "icons/icon-512.png", 512, 1.0, 0.18),
        # Maskable: glyph inside the central 80% safe zone, full-bleed ground,
        # because Android crops to a circle or squircle.
        (OUT / "icons/icon-512-maskable.png", 512, 0.72, None),
        (OUT / "icons/apple-touch-icon.png", 180, 1.0, 0.0),
        (OUT / "favicon.png", 32, 1.0, 0.15),
    ]
    for path, size, scale, radius in targets:
        draw(size, scale, radius).save(path)
        print(f"{path.relative_to(OUT.parent)}  {size}x{size}")


if __name__ == "__main__":
    main()
