from PIL import Image
import numpy as np

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
H, W = arr.shape[0], arr.shape[1]

zone = np.zeros((H, W), dtype=bool)
zone[0:350, :] = True

# 1) Quitar tinte verde en pixeles casi blancos (letras A y S)
near_white = (r > 190) & (b > 190) & (a > 40) & zone
green_tint = near_white & (g > r + 8) & (g > b + 8)
print("Pixeles blancos con tinte verde corregidos:", green_tint.sum())
avg_rb = ((arr[..., 0] + arr[..., 2]) // 2)
g[green_tint] = avg_rb[green_tint]

# 2) Unificar SOLO el verde solido y saturado (no toca bordes/antialiasing junto a la pica)
strong_green = (g > r + 40) & (g > b + 40) & (g > 110) & (a > 30) & zone
print("Pixeles de verde solido encontrados:", strong_green.sum())
ref_r = int(np.median(r[strong_green]))
ref_g = int(np.median(g[strong_green]))
ref_b = int(np.median(b[strong_green]))
print("Verde de referencia:", ref_r, ref_g, ref_b)
r[strong_green] = ref_r
g[strong_green] = ref_g
b[strong_green] = ref_b

arr[..., 0] = r
arr[..., 1] = g
arr[..., 2] = b

out = Image.fromarray(arr.astype(np.uint8))
out.save(path)
print("Listo: logo.png corregido (sin tocar bordes de la pica)")
