from PIL import Image
import numpy as np

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
a = arr[..., 3]
H, W = arr.shape[0], arr.shape[1]

row_top, row_bottom = 10, 325
opaque = a[row_top:row_bottom, :] > 15
col_density = opaque.sum(axis=0)

# imprimir cada 10 columnas
for x in range(0, W, 10):
    print(x, col_density[x])
