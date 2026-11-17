import os
import pandas as pd
from PIL import Image

folder = "dataset/train"   # folder berisi gambar + _classes.csv
df = pd.read_csv(os.path.join(folder, "_classes.csv"))
df.columns = [c.strip() for c in df.columns]
classes = [c for c in df.columns if c != "filename"]

for c in classes:
    only = df[(df[c] == 1) & (df[classes].sum(axis=1) == 1)]
    pick = (only if len(only) >= 9 else df[df[c] == 1]).head(9)
    sheet = Image.new("RGB", (600, 600), "white")
    for i, name in enumerate(pick["filename"]):
        im = Image.open(os.path.join(folder, name)).convert("RGB").resize((200, 200))
        sheet.paste(im, ((i % 3) * 200, (i // 3) * 200))
    sheet.save(f"preview_{c}.jpg")
    print(c, int(df[c].sum()), "foto ->", f"preview_{c}.jpg")