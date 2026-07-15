from PIL import Image
import numpy as np

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
H, W = arr.shape[0], arr.shape[1]
print("Tamaño imagen:", W, H)

opaque = a > 15
row_density = opaque.sum(axis=1)

# Encontrar bloques de filas con contenido (separados por filas casi vacías)
threshold_row = 3
blocks = []
in_block = False
start = 0
for y in range(H):
    if row_density[y] > threshold_row:
        if not in_block:
            in_block = True
            start = y
    else:
        if in_block:
            in_block = False
            blocks.append((start, y))
if in_block:
    blocks.append((start, H))
print("Bloques de filas (A&S arriba, AFILIADOS abajo):", blocks)
