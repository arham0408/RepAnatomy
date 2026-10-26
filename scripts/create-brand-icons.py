"""Regenerate RepAnatomy's original vector-derived icons (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
image = Image.new("RGB", (512, 512), "#e9ecdd")
draw = ImageDraw.Draw(image)
# R built as geometry, paired with three articulated landmarks.
draw.rectangle((151, 142, 196, 365), fill="#4d603b")
draw.rounded_rectangle((170, 142, 343, 283), radius=65, fill="#4d603b")
draw.rounded_rectangle((196, 180, 298, 243), radius=29, fill="#e9ecdd")
draw.polygon([(239, 269), (284, 269), (355, 365), (302, 365)], fill="#4d603b")
draw.line([(354, 136), (389, 178), (369, 229)], fill="#9baa7d", width=12)
for x, y in [(354, 136), (389, 178), (369, 229)]:
    draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill="#b28050")
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("icon-maskable-512.png", 512), ("apple-touch-icon.png", 180)]:
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / "public/icons" / name)
(root / "public/favicon.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
<title id="title">RepAnatomy</title><rect width="512" height="512" rx="104" fill="#e9ecdd"/>
<path d="M151 365V142h104c57 0 88 27 88 69 0 34-21 58-58 67l70 87h-52l-64-82h-43v82zm45-122h56c30 0 46-12 46-32s-16-31-46-31h-56z" fill="#4d603b"/>
<path d="m354 136 35 42-20 51" stroke="#9baa7d" stroke-width="12" fill="none" stroke-linecap="round"/>
<g fill="#b28050"><circle cx="354" cy="136" r="12"/><circle cx="389" cy="178" r="12"/><circle cx="369" cy="229" r="12"/></g></svg>
''', encoding="utf-8")
print("RepAnatomy favicon and four app icons generated.")
