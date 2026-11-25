# PWA weekday icons (2026-11-24, speed item K): the day-header icons are CSS masks shown ~0.9em tall, so only their
# shape (alpha) matters. This makes small alpha-only copies of the PNGs in WeekdayIcons.html (originals untouched,
# Apps Script keeps them) → tools/pwa/wd-icons.json, which tools/build-pwa.mjs swaps into the PWA page.
# Re-run after changing WeekdayIcons.html:  python3 tools/pwa/wd-icons.py   (needs Pillow)
import base64, hashlib, io, json, re
from PIL import Image

H = 64  # px tall: ~3.5x the shown size on a phone, still sharp
src = open('WeekdayIcons.html', encoding='utf-8').read()
b64 = re.findall(r"'([A-Za-z0-9+/=]{200,})'", src)
out = []
for b in b64:
    im = Image.open(io.BytesIO(base64.b64decode(b))).convert('RGBA')
    w = max(1, round(im.width * H / im.height))
    a = im.getchannel('A').resize((w, H), Image.LANCZOS)
    small = Image.new('LA', (w, H), 255)
    small.putalpha(a)
    buf = io.BytesIO(); small.save(buf, 'PNG', optimize=True)
    out.append(base64.b64encode(buf.getvalue()).decode())
json.dump({'src': hashlib.sha1(src.encode()).hexdigest(), 'height': H, 'icons': out}, open('tools/pwa/wd-icons.json', 'w'), indent=0)
print('%d icons: %d → %d bytes base64' % (len(out), sum(map(len, b64)), sum(map(len, out))))
