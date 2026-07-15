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

# ignorar márgenes exteriores (donde ya sabemos que hay huecos)
left_margin, right_margin = 15, 815

# buscar el minimo local en el tercio izquierdo-medio (entre A y &)
zone1 = col_density[left_margin:400]
split1 = left_margin + int(np.argmin(zone1))

# buscar el minimo local en el tercio medio-derecho (entre & y S)
zone2 = col_density[400:right_margin]
split2 = 400 + int(np.argmin(zone2))

print("split1 (entre A y &):", split1, "valor:", col_density[split1])
print("split2 (entre & y S):", split2, "valor:", col_density[split2])
print("Ancho total:", W)
