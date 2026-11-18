"""
tune_grid.py - Menyetel dan menguji aturan grid memakai dataset "moss test 2".

Dataset punya label PER FOTO (5 kelas), sedangkan grid butuh keputusan PER PETAK.
Jadi dataset dipakai untuk MENYETEL dan MENGUJI aturan grid, begini:
  1. 5 kelas dipetakan ke 3 kelas per foto:
        critical : ada Brown atau Fungus
        stressed : ada wither (tanpa Brown/Fungus)
        healthy  : sisanya (hanya Green dan/atau Bloom)
  2. Semua foto dibagi per FOTO ASLI menjadi tune / val / test (tidak ada kebocoran).
  3. Tiap foto dibagi grid 16x16, tiap petak dinilai, lalu hasilnya dirangkum jadi
     satu status per foto.
  4. Dicari ambang terbaik pada bagian tune, lalu dilaporkan pada val dan test.
  5. (Opsional) --nonmoss folder berisi foto BUKAN lumut (wajah, meja, dinding, tangan...)
     supaya petak non-lumut tidak salah dibaca sebagai lumut.

Cara pakai (venv aktif, dari folder proyek):
    py tools/tune_grid.py --fast
    py tools/tune_grid.py --nonmoss data/nonmoss
Hasil: grid_params.json di folder utama (dibaca otomatis oleh api.py/engine.py)
"""

import argparse
import itertools
import json
import os
import random
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import grid_core as gc

NAMES = ["healthy", "stressed", "critical"]


# ------------------------------------------------------------------ data
def original_id(filename):
    base = filename.split(".rf.")[0]
    base = re.sub(r"_(jpg|jpeg|png)$", "", base, flags=re.I)
    return re.sub(r"_\d{1,2}$", "", base)


def read_dataset(root):
    frames = []
    for name in ("train", "valid", "val", "test"):
        d = os.path.join(root, name)
        csv_path = os.path.join(d, "_classes.csv")
        if not os.path.exists(csv_path):
            continue
        df = pd.read_csv(csv_path)
        df.columns = [c.strip() for c in df.columns]
        df["filename"] = df["filename"].astype(str).str.strip()
        df["path"] = df["filename"].apply(lambda f: os.path.join(d, f))
        frames.append(df)
    if not frames:
        raise SystemExit(f"Tidak ada _classes.csv di train/valid/test dalam folder: {root}")
    df = pd.concat(frames, ignore_index=True)
    missing = ~df["path"].apply(os.path.exists)
    if missing.any():
        print(f"PERINGATAN: {int(missing.sum())} gambar di CSV tidak ditemukan, dilewati.")
    df = df[~missing].reset_index(drop=True)

    low = {c.lower(): c for c in df.columns}
    for need in ("brown", "fungus", "wither"):
        if need not in low:
            raise SystemExit(f"Kolom '{need}' tidak ada di CSV. Kolom yang ada: {list(df.columns)}")
    crit = (df[low["brown"]] > 0) | (df[low["fungus"]] > 0)
    stress = df[low["wither"]] > 0
    df["label"] = np.where(crit, 2, np.where(stress, 1, 0))
    df["orig"] = df["filename"].apply(original_id)
    return df


def group_split(df, tries=300, val_frac=0.15, test_frac=0.15):
    """Bagi per foto asli; pilih pembagian yang kelasnya paling merata di val dan test."""
    groups = sorted(df["orig"].unique())
    best, best_score = None, -1
    for seed in range(tries):
        g = groups[:]
        random.Random(seed).shuffle(g)
        n = len(g)
        nt, nv = max(1, round(n * test_frac)), max(1, round(n * val_frac))
        test, val = set(g[:nt]), set(g[nt:nt + nv])
        cv = np.bincount(df.loc[df["orig"].isin(val), "label"], minlength=3)
        ct = np.bincount(df.loc[df["orig"].isin(test), "label"], minlength=3)
        score = min(cv.min(), ct.min())
        if score > best_score:
            best_score, best = score, (test, val)
    test, val = best
    df = df.copy()
    df["split"] = np.where(df["orig"].isin(test), "test", np.where(df["orig"].isin(val), "val", "tune"))
    return df


def load_small(path):
    im = Image.open(path)
    im.draft("RGB", (gc.WORK_LONG_SIDE * 2, gc.WORK_LONG_SIDE * 2))   # percepat decode JPEG besar
    arr = cv2.cvtColor(np.array(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    return gc.prepare(arr)


def hue_combos(fast):
    b1 = [19, 21] if fast else [19, 21, 23]       # batas coklat | kuning
    b2 = [27, 29, 31] if fast else [27, 29, 31]   # batas kuning | hijau
    return [(x, y) for x in b1 for y in b2]


def params_for(b1, b2, **kw):
    p = dict(gc.DEFAULT_PARAMS)
    p.update(hue_brown=[5, b1], hue_yellow=[b1, b2], hue_green=[b2, 85])
    p.update(kw)
    return p


def compute_features(paths, combos, desc, grid):
    """Hasil: dict {combo: (fg, fy, fb, tex)} masing-masing array (N, grid*grid)."""
    store = {c: ([], [], [], []) for c in combos}
    t0 = time.time()
    for i, path in enumerate(paths, 1):
        pre = gc.precompute(load_small(path), grid)
        for (b1, b2) in combos:
            fg, fy, fb, tex = gc.fractions(pre, params_for(b1, b2))
            for lst, arr in zip(store[(b1, b2)], (fg, fy, fb, tex)):
                lst.append(arr.reshape(-1))
        if i % 100 == 0 or i == len(paths):
            print(f"  {desc}: {i}/{len(paths)} gambar ({time.time() - t0:.0f} dtk)")
    return {c: tuple(np.stack(v) for v in vals) for c, vals in store.items()}


# ------------------------------------------------------------------ metrik
def macro_f1(y, pred):
    f1s = []
    for k in range(3):
        tp = int(((pred == k) & (y == k)).sum())
        fp = int(((pred == k) & (y != k)).sum())
        fn = int(((pred != k) & (y == k)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return float(np.mean(f1s)), f1s


def evaluate(F, y, p):
    cls = gc.classify_cells(*F, p)
    pred = gc.frame_status_index(cls, p)
    return pred, macro_f1(y, pred)[0]


def report(title, y, pred):
    mf, f1s = macro_f1(y, pred)
    acc = float((y == pred).mean()) if len(y) else 0.0
    print(f"\n{title}  (n={len(y)} foto)  akurasi {acc:.2f} | F1 rata-rata {mf:.3f}")
    print("  F1 per kelas: " + ", ".join(f"{n} {f:.2f}" for n, f in zip(NAMES, f1s)))
    print(f"  {'benar \\ tebakan':18s}{'healthy':>9s}{'stressed':>10s}{'critical':>10s}{'tdk lumut':>11s}")
    for k in range(3):
        row = [int(((y == k) & (pred == j)).sum()) for j in (0, 1, 2, -1)]
        print(f"  {NAMES[k]:18s}{row[0]:9d}{row[1]:10d}{row[2]:10d}{row[3]:11d}")


# ------------------------------------------------------------------ utama
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(ROOT / "data" / "dataset"))
    ap.add_argument("--nonmoss", default=None, help="folder foto BUKAN lumut (opsional, sangat disarankan)")
    ap.add_argument("--max-false", type=float, default=0.05,
                    help="batas petak non-lumut yang boleh salah dibaca sebagai lumut (0-1)")
    ap.add_argument("--fast", action="store_true", help="ruang pencarian lebih kecil")
    ap.add_argument("--limit", type=int, default=0, help="batasi jumlah foto (untuk uji cepat)")
    ap.add_argument("--out", default=str(ROOT / "grid_params.json"))
    args = ap.parse_args()
    grid = gc.DEFAULT_PARAMS["grid"]

    df = read_dataset(args.dataset)
    if args.limit:
        df = df.sample(n=min(args.limit, len(df)), random_state=0).reset_index(drop=True)
    df = group_split(df)
    print("Pemetaan: critical = Brown/Fungus, stressed = wither, healthy = sisanya")
    for s in ("tune", "val", "test"):
        part = df[df["split"] == s]
        cnt = np.bincount(part["label"], minlength=3)
        print(f"[{s}] {len(part)} foto dari {part['orig'].nunique()} foto asli | "
              + ", ".join(f"{n} {c}" for n, c in zip(NAMES, cnt)))
    if (np.bincount(df.loc[df['split'] != 'tune', 'label'], minlength=3) == 0).any():
        print("PERINGATAN: ada kelas yang tidak muncul di val/test, hasil kelas itu tidak bermakna.")

    combos = hue_combos(args.fast)
    print(f"\nMenghitung fitur ({len(combos)} kombinasi batas warna)...")
    feats = {}
    for s in ("tune", "val", "test"):
        feats[s] = compute_features(df.loc[df["split"] == s, "path"].tolist(), combos, s, grid)
    y = {s: df.loc[df["split"] == s, "label"].to_numpy() for s in ("tune", "val", "test")}

    nonmoss = None
    if args.nonmoss:
        files = [os.path.join(args.nonmoss, f) for f in sorted(os.listdir(args.nonmoss))
                 if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))]
        if files:
            print(f"\nFoto bukan-lumut: {len(files)}")
            nonmoss = compute_features(files, combos, "nonmoss", grid)
        else:
            print("\nPERINGATAN: tidak ada gambar di folder --nonmoss, batasan diabaikan.")
    else:
        print("\nCATATAN: tanpa --nonmoss, deteksi 'bukan lumut' TIDAK diuji. Sangat disarankan menambahkannya.")

    if args.fast:
        space = dict(t_critical=[0.4, 0.6], t_stressed=[0.3, 0.5], moss_min_color=[0.3, 0.5],
                     tex_min=[0.0, 8.0], frame_critical=[0.1, 0.3], frame_stressed=[0.2, 0.4])
    else:
        space = dict(t_critical=[0.3, 0.4, 0.5, 0.6], t_stressed=[0.2, 0.3, 0.4, 0.5],
                     moss_min_color=[0.3, 0.5], tex_min=[0.0, 8.0],
                     frame_critical=[0.05, 0.1, 0.2, 0.3], frame_stressed=[0.1, 0.2, 0.3, 0.4, 0.5])
    keys = list(space)
    n_total = len(combos) * int(np.prod([len(v) for v in space.values()]))
    print(f"Mencari ambang terbaik ({n_total} kombinasi)...")

    # kandidat yang lolos batasan non-lumut
    def false_rate(combo, mmc, tex_min):
        fg, fy, fb, tex = nonmoss[combo]
        fcol = fg + fy + fb
        return float(((fcol >= mmc) & (tex >= tex_min)).mean())

    best, best_score, n_eval, t0 = None, -1.0, 0, time.time()
    gate_ok = {}
    for combo in combos:
        for mmc in space["moss_min_color"]:
            for tmin in space["tex_min"]:
                gate_ok[(combo, mmc, tmin)] = false_rate(combo, mmc, tmin) if nonmoss else 0.0
    min_false = min(gate_ok.values())
    limit = args.max_false if min_false <= args.max_false else min_false + 1e-9
    if nonmoss and min_false > args.max_false:
        print(f"PERINGATAN: tidak ada pengaturan dengan salah-lumut <= {args.max_false:.2f}. "
              f"Memakai yang terbaik yang ada ({min_false:.2f}).")

    for combo in combos:
        for values in itertools.product(*[space[k] for k in keys]):
            kw = dict(zip(keys, values))
            if gate_ok[(combo, kw["moss_min_color"], kw["tex_min"])] > limit:
                continue
            p = params_for(*combo, **kw)
            _, score = evaluate(feats["tune"][combo], y["tune"], p)
            n_eval += 1
            if score > best_score:
                best_score, best = score, (combo, kw)
    print(f"Selesai: {n_eval} kombinasi diuji dalam {time.time() - t0:.0f} dtk.")

    combo, kw = best
    best_params = params_for(*combo, **kw)
    base = params_for(21, 29)

    print("\nAmbang terbaik:")
    print(json.dumps({k: best_params[k] for k in ("hue_brown", "hue_yellow", "hue_green", *keys)}, indent=2))
    out = {"params": best_params, "mapping": "critical=Brown/Fungus, stressed=wither, healthy=sisanya"}

    for s in ("tune", "val", "test"):
        pred0, _ = evaluate(feats[s][(21, 29)], y[s], base)
        pred1, _ = evaluate(feats[s][combo], y[s], best_params)
        if s == "tune":
            report("TUNE - ambang bawaan", y[s], pred0)
        report(f"{s.upper()} - ambang hasil tuning", y[s], pred1)
        out[f"macro_f1_{s}"] = round(macro_f1(y[s], pred1)[0], 4)

    if nonmoss:
        fr = false_rate(combo, best_params["moss_min_color"], best_params["tex_min"])
        print(f"\nFoto bukan-lumut: {100 * fr:.1f}% petak salah dibaca sebagai lumut.")
        out["false_moss_rate"] = round(fr, 4)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\nTersimpan: {os.path.abspath(args.out)}")
    print("Catatan: skor val/test hanya terpercaya kalau jumlah foto asli cukup. Lihat jumlah di atas.")


if __name__ == "__main__":
    main()