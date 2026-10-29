import sys
from PIL import Image
# usage: top.py <png> [height=844] [y0=0] -> <png minus .png>-top.png
path = sys.argv[1]
h = int(sys.argv[2]) if len(sys.argv) > 2 else 844
y0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
im = Image.open(path)
im.crop((0, y0, im.size[0], min(im.size[1], y0 + h))).save(path[:-4] + '-top.png')
