from PIL import Image
import numpy as np

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
H, W = arr.shape[0], arr.shape[1]

# solo la zona del "A&S" principal, no tocar "AFILIADOS"
row_top, row_bottom = 0, 350

zone = np.zeros((H, W), dtype=bool)
zone[row_top:row_bottom, :] = True

# pixeles verdosos (cualquier tono de verde, incluido el parche anterior)
greenish = (g > r + 15) & (g > b + 15) & (a > 30) & zone
print("Pixeles verdosos encontrados:", greenish.sum())

# color de referencia: mediana de los verdes MAS saturados (evita bordes mezclados)
strong = greenish & (g > 120) & (r < 100)
ref_r = int(np.median(r[strong]))
ref_g = int(np.median(g[strong]))
ref_b = int(np.median(b[strong]))
print("Verde de referencia unico:", ref_r, ref_g, ref_b)

arr[greenish, 0] = ref_r
arr[greenish, 1] = ref_g
arr[greenish, 2] = ref_b

out = Image.fromarray(arr.astype(np.uint8), "RGBA")
out.save(path)
print("Listo: logo.png actualizado, verde unificado")
