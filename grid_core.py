"""
grid_core.py - Inti analisis grid untuk Mossifier.

Sebuah foto/frame dibagi menjadi grid (default 16 x 16 petak). Tiap petak diberi satu
dari 4 kelas:
    bukan lumut | healthy | stressed | critical

Cara menilai satu petak (berdasarkan WARNA dan TEKSTUR, tanpa deep learning):
  1. Apakah ini lumut?   Cukup banyak piksel berwarna hijau/kuning/coklat DAN ada tekstur.
  2. Kalau lumut, seberapa sehat?
        critical : porsi coklat tinggi
        stressed : porsi kuning + coklat tinggi
        healthy  : sisanya (dominan hijau)
Ambang-ambangnya disetel oleh tune_grid.py memakai dataset, lalu disimpan di grid_params.json.
"""

import json
import os

import cv2
import numpy as np

CLASSES = ["bukan lumut", "healthy", "stressed", "critical"]   # indeks 0..3
WORK_LONG_SIDE = 480    # semua gambar diperkecil ke sisi terpanjang ini (dataset DAN webcam)

DEFAULT_PARAMS = {
    "grid": 16,
    "hue_brown": [5, 21],
    "hue_yellow": [21, 29],
    "hue_green": [29, 85],
    "min_sat": 50,            # saturasi di bawah ini = abu-abu/putih -> bukan warna lumut
    "min_val": 50,            # kecerahan di bawah ini = gelap -> bukan warna lumut
    "moss_min_color": 0.5,    # minimal porsi piksel berwarna lumut dalam satu petak
    "tex_min": 6.0,           # minimal tekstur (simpangan baku abu-abu) dalam satu petak
    "t_critical": 0.5,        # porsi coklat (dari piksel berwarna) agar petak = critical
    "t_stressed": 0.4,        # porsi kuning+coklat agar petak = stressed
    "frame_critical": 0.10,   # porsi petak critical (dari petak lumut) agar frame = critical
    "frame_stressed": 0.20,   # porsi petak stressed+critical agar frame = stressed
    "min_moss_frac": 0.05,    # kalau petak lumut < 5% dari frame -> "tidak ada lumut"
}


def load_params(path="grid_params.json"):
    params = dict(DEFAULT_PARAMS)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            saved = json.load(f)
        params.update(saved.get("params", saved))
    return params


def prepare(img_bgr, long_side=WORK_LONG_SIDE):
    """Perkecil gambar ke ukuran kerja yang seragam (supaya tekstur sebanding)."""
    h, w = img_bgr.shape[:2]
    scale = long_side / float(max(h, w))
    if scale >= 1.0:
        return img_bgr
    return cv2.resize(img_bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
                      interpolation=cv2.INTER_AREA)


def precompute(img_bgr, grid=16):
    """Hitung bagian yang tidak bergantung pada ambang hue (dipakai ulang saat tuning)."""
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    mean = cv2.resize(gray, (grid, grid), interpolation=cv2.INTER_AREA)
    mean2 = cv2.resize(gray * gray, (grid, grid), interpolation=cv2.INTER_AREA)
    tex = np.sqrt(np.maximum(mean2 - mean * mean, 0.0))
    return {"h": hsv[..., 0].astype(np.int16), "s": hsv[..., 1], "v": hsv[..., 2],
            "tex": tex, "grid": grid}


def fractions(pre, params):
    """Porsi piksel hijau / kuning / coklat di tiap petak (array grid x grid)."""
    g = pre["grid"]
    ok = (pre["s"] >= params["min_sat"]) & (pre["v"] >= params["min_val"])

    def frac(lo, hi):
        m = (ok & (pre["h"] >= lo) & (pre["h"] < hi)).astype(np.float32)
        return cv2.resize(m, (g, g), interpolation=cv2.INTER_AREA)

    return (frac(*params["hue_green"]), frac(*params["hue_yellow"]),
            frac(*params["hue_brown"]), pre["tex"])


def classify_cells(fg, fy, fb, tex, params):
    """Beri kelas 0..3 untuk setiap petak. Boleh dipakai pada array berbentuk apa saja."""
    fcol = fg + fy + fb
    moss = (fcol >= params["moss_min_color"]) & (tex >= params["tex_min"])
    denom = np.maximum(fcol, 1e-6)
    bad = (fy + fb) / denom
    brown = fb / denom
    cls = np.where(moss, 1, 0)
    cls = np.where(moss & (bad >= params["t_stressed"]), 2, cls)
    cls = np.where(moss & (brown >= params["t_critical"]), 3, cls)
    return cls


def frame_status_index(cls_flat, params):
    """
    cls_flat: array (N, jumlah_petak) berisi kelas 0..3.
    Kembalikan indeks status frame: -1 tidak ada lumut, 0 healthy, 1 stressed, 2 critical.
    """
    cells = cls_flat.shape[1]
    n_moss = (cls_flat > 0).sum(axis=1)
    denom = np.maximum(n_moss, 1)
    crit = (cls_flat == 3).sum(axis=1) / denom
    bad = ((cls_flat == 2) | (cls_flat == 3)).sum(axis=1) / denom
    status = np.where(crit >= params["frame_critical"], 2,
                      np.where(bad >= params["frame_stressed"], 1, 0))
    return np.where(n_moss / cells < params["min_moss_frac"], -1, status)


STATUS_NAMES = {-1: "tidak ada lumut", 0: "healthy", 1: "stressed", 2: "critical"}


def analyze_frame(img_bgr, params):
    """Analisis satu gambar penuh. Mengembalikan dict hasil."""
    frame = prepare(img_bgr)
    g = params["grid"]
    pre = precompute(frame, g)
    fg, fy, fb, tex = fractions(pre, params)
    cls = classify_cells(fg, fy, fb, tex, params)
    idx = int(frame_status_index(cls.reshape(1, -1), params)[0])
    counts = {name: int((cls == i).sum()) for i, name in enumerate(CLASSES)}
    n_moss = cls.size - counts["bukan lumut"]
    return {"frame": frame, "cls": cls, "counts": counts, "n_cells": cls.size,
            "n_moss": n_moss, "status": STATUS_NAMES[idx]}


def text_summary(res):
    c, n, m = res["counts"], res["n_cells"], res["n_moss"]
    lines = [f"Status keseluruhan: {res['status']}",
             f"Petak lumut: {m} dari {n} ({100.0 * m / n:.0f}% frame)"]
    if m:
        lines.append("Di area lumut: " + ", ".join(
            f"{k} {100.0 * c[k] / m:.0f}%" for k in ("healthy", "stressed", "critical")))
    return "\n".join(lines)


CELL_COLORS = {1: (60, 200, 60), 2: (0, 215, 255), 3: (40, 60, 220)}   # BGR


def draw_grid(frame, cls, status):
    """Gambar grid dan warnai petak: hijau healthy, kuning stressed, merah critical."""
    out = frame.copy()
    h, w = out.shape[:2]
    g = cls.shape[0]
    layer = out.copy()
    for r in range(g):
        for c in range(g):
            k = int(cls[r, c])
            if k > 0:
                x0, x1 = c * w // g, (c + 1) * w // g
                y0, y1 = r * h // g, (r + 1) * h // g
                cv2.rectangle(layer, (x0, y0), (x1, y1), CELL_COLORS[k], -1)
    out = cv2.addWeighted(layer, 0.40, out, 0.60, 0)
    for i in range(1, g):
        cv2.line(out, (i * w // g, 0), (i * w // g, h), (255, 255, 255), 1)
        cv2.line(out, (0, i * h // g), (w, i * h // g), (255, 255, 255), 1)
    text = f"Status: {status}"
    cv2.putText(out, text, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(out, text, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    return out