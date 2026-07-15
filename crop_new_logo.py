from PIL import Image
import numpy as np

img = Image.open("public/logo_new.jpeg").convert("RGB")
arr = np.array(img).astype(int)
brightness = arr.sum(axis=2)

# contenido = pixeles no negros (fondo negro puro)
content = brightness > 30
rows = np.where(content.any(axis=1))[0]
cols = np.where(content.any(axis=0))[0]
top, bottom = rows.min(), rows.max()
left, right = cols.min(), cols.max()
print("Recorte:", left, top, right, bottom, "de tamaño", img.size)

pad = 15
top = max(0, top - pad)
bottom = min(img.size[1]-1, bottom + pad)
left = max(0, left - pad)
right = min(img.size[0]-1, right + pad)

cropped = img.crop((left, top, right+1, bottom+1))
cropped.save("public/logo.png")
print("Guardado public/logo.png, tamaño final:", cropped.size)
