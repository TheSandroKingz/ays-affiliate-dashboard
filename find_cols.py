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

threshold = 2
gaps = []
in_gap = False
gap_start = 0
for x in range(W):
    if col_density[x] <= threshold:
        if not in_gap:
            in_gap = True
            gap_start = x
    else:
        if in_gap:
            in_gap = False
            gaps.append((gap_start, x))
if in_gap:
    gaps.append((gap_start, W))

gaps = [g for g in gaps if g[1] - g[0] > 2]
print("Huecos de columnas (separan A | & | S):", gaps)
