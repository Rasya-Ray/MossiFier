"""
moss_tiles.py - Analisis kondisi lumut per petak berdasarkan warna (HSV).

Cara pakai (di terminal VS Code, venv aktif):
    py tools/moss_tiles.py foto.jpg                 # grid 4 x 4 (default)
    py tools/moss_tiles.py foto.jpg --grid 6 6      # grid 6 baris x 6 kolom
    py tools/moss_tiles.py foto.jpg --csv           # simpan juga hasil per petak ke CSV
    py tools/moss_tiles.py foto.jpg --calibrate     # tampilkan sebaran hue untuk menyetel ambang

Hasil: foto bernama <nama>_hasil.jpg berisi overlay warna per petak.

Library yang dibutuhkan: opencv-python dan numpy
(sudah ikut terpasang bila kamu sudah install ultralytics).
"""

import argparse
import csv
import os

import cv2
import numpy as np

# ---------------------------------------------------------------
# AMBANG WARNA (skala OpenCV: Hue 0-179, Saturation 0-255, Value 0-255)
# Nilai awal ini hasil pengamatan pada beberapa foto contoh. Setelah
# kamera Mossifier terpasang, SETEL ULANG dengan mode --calibrate.
# ---------------------------------------------------------------
HUE_COKLAT = (5, 21)        # coklat / kering
HUE_KUNING = (21, 29)       # kekuningan / olive
HUE_HIJAU = (29, 85)        # hijau
MIN_SAT = 50                # di bawah ini dianggap abu-abu/putih (bukan lumut)
MIN_VAL = 50                # di bawah ini dianggap gelap/hitam (bukan lumut)
MIN_VALID_FRAC = 0.25       # petak dengan piksel lumut < 25% -> "bukan lumut"

# Warna overlay (BGR)
COLORS = {
    "hijau": (60, 200, 60),
    "kekuningan": (0, 215, 255),
    "coklat": (40, 90, 170),
    "bukan lumut": (150, 150, 150),
}
SHORT = {"hijau": "H", "kekuningan": "K", "coklat": "C", "bukan lumut": "-"}


def read_image(path):
    """Baca gambar (aman untuk path berisi karakter non-ASCII di Windows)."""
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Gagal membaca gambar: {path}")
    return img


def write_image(path, img):
    ok, buf = cv2.imencode(os.path.splitext(path)[1] or ".jpg", img)
    if not ok:
        raise SystemExit(f"Gagal menyimpan gambar: {path}")
    buf.tofile(path)


def moss_masks(hsv_tile):
    """Kembalikan mask piksel lumut dan mask per kondisi untuk satu petak."""
    h = hsv_tile[..., 0].astype(int)
    s = hsv_tile[..., 1].astype(int)
    v = hsv_tile[..., 2].astype(int)
    lo = HUE_COKLAT[0]
    hi = HUE_HIJAU[1]
    valid = (s >= MIN_SAT) & (v >= MIN_VAL) & (h >= lo) & (h < hi)
    coklat = valid & (h >= HUE_COKLAT[0]) & (h < HUE_COKLAT[1])
    kuning = valid & (h >= HUE_KUNING[0]) & (h < HUE_KUNING[1])
    hijau = valid & (h >= HUE_HIJAU[0]) & (h < HUE_HIJAU[1])
    return valid, {"hijau": hijau, "kekuningan": kuning, "coklat": coklat}


def analyze(img, rows, cols):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    height, width = img.shape[:2]
    results = []
    totals = {"hijau": 0, "kekuningan": 0, "coklat": 0}
    for r in range(rows):
        for c in range(cols):
            y0, y1 = r * height // rows, (r + 1) * height // rows
            x0, x1 = c * width // cols, (c + 1) * width // cols
            tile = hsv[y0:y1, x0:x1]
            valid, masks = moss_masks(tile)
            n_valid = int(valid.sum())
            n_total = tile.shape[0] * tile.shape[1]
            valid_frac = n_valid / max(n_total, 1)
            if valid_frac < MIN_VALID_FRAC or n_valid == 0:
                label = "bukan lumut"
                pct = {k: 0.0 for k in masks}
            else:
                counts = {k: int(m.sum()) for k, m in masks.items()}
                pct = {k: 100.0 * v / n_valid for k, v in counts.items()}
                label = max(pct, key=pct.get)
                for k in totals:
                    totals[k] += counts[k]
            results.append({
                "row": r, "col": c, "label": label,
                "valid_frac": round(100 * valid_frac, 1),
                "hijau": round(pct["hijau"], 1),
                "kekuningan": round(pct["kekuningan"], 1),
                "coklat": round(pct["coklat"], 1),
                "box": (x0, y0, x1, y1),
            })
    return results, totals


def draw_overlay(img, results):
    out = img.copy()
    layer = img.copy()
    for t in results:
        x0, y0, x1, y1 = t["box"]
        cv2.rectangle(layer, (x0, y0), (x1, y1), COLORS[t["label"]], -1)
    out = cv2.addWeighted(layer, 0.35, out, 0.65, 0)
    for t in results:
        x0, y0, x1, y1 = t["box"]
        cv2.rectangle(out, (x0, y0), (x1, y1), (255, 255, 255), 1)
        scale = max(0.35, min((x1 - x0), (y1 - y0)) / 200.0)
        text = SHORT[t["label"]]
        if t["label"] != "bukan lumut":
            text += f" {int(t[t['label']])}%"
        cv2.putText(out, text, (x0 + 4, y0 + int(22 * scale) + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6 * scale, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(out, text, (x0 + 4, y0 + int(22 * scale) + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6 * scale, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def calibrate(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    mask = (s >= MIN_SAT) & (v >= MIN_VAL)
    vals = h[mask]
    if vals.size == 0:
        print("Tidak ada piksel berwarna yang terdeteksi.")
        return
    hist, _ = np.histogram(vals, bins=range(0, 181, 5))
    total = hist.sum()
    print("Sebaran Hue piksel berwarna (bin 5). Pakai ini untuk menyetel HUE_*:")
    for i, n in enumerate(hist):
        pct = 100.0 * n / total
        if pct >= 0.5:
            print(f"  Hue {i * 5:3d}-{i * 5 + 4:3d}: {pct:5.1f}% {'#' * int(pct / 2)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--grid", nargs=2, type=int, default=[4, 4], metavar=("BARIS", "KOLOM"))
    ap.add_argument("--csv", action="store_true")
    ap.add_argument("--calibrate", action="store_true")
    args = ap.parse_args()

    img = read_image(args.image)
    if args.calibrate:
        calibrate(img)
        return

    rows, cols = args.grid
    results, totals = analyze(img, rows, cols)

    base = os.path.splitext(args.image)[0]
    out_path = base + "_hasil.jpg"
    write_image(out_path, draw_overlay(img, results))

    print(f"Gambar: {args.image}  |  grid {rows} x {cols}")
    print(f"{'Petak':8s}{'Label':14s}{'Lumut%':>8s}{'Hijau%':>8s}{'Kuning%':>9s}{'Coklat%':>9s}")
    for t in results:
        print(f"({t['row']},{t['col']})   {t['label']:14s}{t['valid_frac']:8.1f}"
              f"{t['hijau']:8.1f}{t['kekuningan']:9.1f}{t['coklat']:9.1f}")

    n_moss_tiles = sum(1 for t in results if t["label"] != "bukan lumut")
    total_px = sum(totals.values())
    print(f"\nPetak berisi lumut: {n_moss_tiles} dari {len(results)}")
    if total_px:
        print("Proporsi piksel lumut keseluruhan: " + ", ".join(
            f"{k} {100.0 * v / total_px:.1f}%" for k, v in totals.items()))
    else:
        print("Tidak ada piksel lumut yang terdeteksi. Cek ambang warna (--calibrate).")
    print(f"Overlay disimpan: {out_path}")

    if args.csv:
        csv_path = base + "_petak.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["baris", "kolom", "label", "lumut_pct", "hijau_pct", "kuning_pct", "coklat_pct"])
            for t in results:
                w.writerow([t["row"], t["col"], t["label"], t["valid_frac"],
                            t["hijau"], t["kekuningan"], t["coklat"]])
        print(f"CSV disimpan: {csv_path}")


if __name__ == "__main__":
    main()