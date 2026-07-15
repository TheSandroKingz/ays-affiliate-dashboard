from PIL import Image
import numpy as np

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
H, W = arr.shape[0], arr.shape[1]

opaque = a > 15
col_density = opaque.sum(axis=0)

# Buscar los dos huecos (transparencia) que separan A | & | S
threshold = 2
gaps = []
i = 0
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
# fusionar huecos muy pequeños (ruido) y quedarnos con los mas anchos
gaps = [g for g in gaps if g[1] - g[0] > 3]
gaps_sorted = sorted(gaps, key=lambda g: g[0])
print("Huecos encontrados:", gaps_sorted)
