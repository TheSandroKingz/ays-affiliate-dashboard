from PIL import Image
import numpy as np

img = Image.open("public/logo.png").convert("RGB")
arr = np.array(img).astype(int)
brightness = arr.sum(axis=2)
content = brightness > 30
H, W = content.shape

rows = np.where(content.any(axis=1))[0]
top, bottom = rows.min(), rows.max()

row_density = content.sum(axis=1)
gap_rows = np.where(row_density < 3)[0]
gap_rows_in_range = gap_rows[(gap_rows > top) & (gap_rows < bottom)]
print("Imagen:", W, "x", H)
print("Filas con contenido:", top, "a", bottom)
if len(gap_rows_in_range) > 0:
    split_row = int(np.median(gap_rows_in_range))
    print("Fila de separacion A&S / AFILIADOS:", split_row)

    main_cols = np.where(content[top:split_row, :].any(axis=0))[0]
    caption_cols = np.where(content[split_row:bottom, :].any(axis=0))[0]

    print("A&S: izquierda=", main_cols.min(), "derecha=", main_cols.max(), "centro=", (main_cols.min()+main_cols.max())/2)
    print("AFILIADOS: izquierda=", caption_cols.min(), "derecha=", caption_cols.max(), "centro=", (caption_cols.min()+caption_cols.max())/2)
    print("Centro de imagen:", W/2)
else:
    print("No se encontro separacion clara de filas")
