from PIL import Image, ImageFilter
import numpy as np
import colorsys

path = "public/logo.png"
img = Image.open(path).convert("RGBA")
arr = np.array(img).astype(int)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
H, W = arr.shape[0], arr.shape[1]

zone = np.zeros((H, W), dtype=bool)
zone[0:350, :] = True

# A) Ampliar correccion de tinte verde en blancos (A y S)
near_white = (r > 165) & (b > 165) & (a > 40) & zone
green_tint = near_white & (g > r + 5) & (g > b + 5)
print("Blancos con tinte verde corregidos:", green_tint.sum())
avg_rb = (arr[..., 0] + arr[..., 2]) // 2
g[green_tint] = avg_rb[green_tint]

# B) Unificar TONO de todos los verdes, preservando brillo/sombra natural
greenish = (g > r + 10) & (g > b + 10) & (a > 20) & zone
print("Pixeles verdosos a unificar tono:", greenish.sum())

strong = greenish & (g > 110) & (r < 90)
sr, sg, sb = r[strong], g[strong], b[strong]
hs = [colorsys.rgb_to_hsv(rr/255, gg/255, bb/255)[0] for rr, gg, bb in list(zip(sr, sg, sb))[:3000]]
target_hue = float(np.median(hs))
print("Tono verde objetivo:", target_hue)

ys, xs = np.where(greenish)
for y, x in zip(ys, xs):
    rr, gg, bb = arr[y, x, 0], arr[y, x, 1], arr[y, x, 2]
    hh, ss, vv = colorsys.rgb_to_hsv(rr/255, gg/255, bb/255)
    nr, ng, nb = colorsys.hsv_to_rgb(target_hue, ss, vv)
    arr[y, x, 0] = int(round(nr*255))
    arr[y, x, 1] = int(round(ng*255))
    arr[y, x, 2] = int(round(nb*255))

# C) Suavizar el canal alfa (reduce el efecto pixelado en bordes finos como AFILIADOS)
alpha_img = Image.fromarray(arr[..., 3].astype(np.uint8))
alpha_blurred = alpha_img.filter(ImageFilter.GaussianBlur(radius=0.7))
arr[..., 3] = np.array(alpha_blurred).astype(int)

out = Image.fromarray(arr.astype(np.uint8), "RGBA")
out.save(path)
print("Listo: verde unificado por tono + alfa suavizado")
