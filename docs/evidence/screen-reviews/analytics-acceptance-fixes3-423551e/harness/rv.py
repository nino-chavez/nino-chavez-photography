import sys, os
from PIL import Image
# usage: rv.py <captures dir> <out dir> <file prefix glob parts...>: writes resized copies (long edge <= 1380) named like the originals, and joins consecutive parts side by side when --join is given
src, out = sys.argv[1], sys.argv[2]
names = [a for a in sys.argv[3:] if not a.startswith('--')]
os.makedirs(out, exist_ok=True)
imgs = []
for n in names:
    im = Image.open(os.path.join(src, n)).convert('RGB')
    s = min(1.0, 1380 / max(im.size))
    if s < 1:
        im = im.resize((int(im.size[0] * s), int(im.size[1] * s)), Image.LANCZOS)
    imgs.append((n, im))
if '--join' in sys.argv:
    h = max(i.size[1] for _, i in imgs)
    w = sum(i.size[0] for _, i in imgs) + 8 * (len(imgs) - 1)
    sheet = Image.new('RGB', (w, h), 'white')
    x = 0
    for _, i in imgs:
        sheet.paste(i, (x, 0)); x += i.size[0] + 8
    s = min(1.0, 1380 / max(sheet.size))
    if s < 1:
        sheet = sheet.resize((int(sheet.size[0] * s), int(sheet.size[1] * s)), Image.LANCZOS)
    p = os.path.join(out, 'sheet.png'); sheet.save(p); print(p, sheet.size)
else:
    for n, i in imgs:
        p = os.path.join(out, n.replace('.jpg', '.png')); i.save(p); print(p, i.size)
