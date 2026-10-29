import sys
from PIL import Image
# usage: crops.py <png> [segment height, default 1300] -> <png minus .png>-c<N>.png
path = sys.argv[1]
seg = int(sys.argv[2]) if len(sys.argv) > 2 else 1300
im = Image.open(path)
w, h = im.size
n = 0
for y in range(0, h, seg):
    im.crop((0, y, w, min(h, y + seg))).save(path[:-4] + '-c%d.png' % n)
    n += 1
print(n, 'crops of', w, 'x', seg)
