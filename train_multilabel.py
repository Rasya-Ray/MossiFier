"""
train_multilabel.py - Melatih model pengenal kondisi lumut dari dataset "moss test 2".

Dataset ini berformat "Multiclass Classification CSV" dari Roboflow:
    dataset/
      train/   gambar-gambar + _classes.csv
      valid/   gambar-gambar + _classes.csv
      test/    (opsional) gambar-gambar + _classes.csv
Tiap baris CSV = satu gambar, kolom kelas berisi 1 (ada) atau 0 (tidak ada).
Satu gambar bisa punya BEBERAPA kelas sekaligus (multi-label).

Cara pakai (venv aktif, dari folder proyek):
    py train_multilabel.py --dataset dataset --epochs 3      # tes cepat
    py train_multilabel.py --dataset dataset --epochs 20     # latihan sungguhan
    py train_multilabel.py --dataset dataset --regroup       # bagi ulang data per foto asli

Hasil: moss_multilabel.pt (model) dan training_log.csv
"""

import argparse
import csv
import os
import random
import re
import time

import numpy as np
import pandas as pd


# ----------------------------------------------------------------------
# Bagian data (tanpa torch, jadi mudah diuji)
# ----------------------------------------------------------------------
def original_id(filename):
    """Tebak foto asli dari nama file Roboflow: IMG_2451_2_jpg.rf.xxx.jpg -> IMG_2451."""
    base = filename.split(".rf.")[0]
    base = re.sub(r"_(jpg|jpeg|png)$", "", base, flags=re.I)
    return re.sub(r"_\d{1,2}$", "", base)


def find_splits(root):
    found = {}
    for key, names in {"train": ["train"], "val": ["valid", "val"], "test": ["test"]}.items():
        for n in names:
            d = os.path.join(root, n)
            if os.path.exists(os.path.join(d, "_classes.csv")):
                found[key] = d
                break
    return found


def read_split(folder):
    df = pd.read_csv(os.path.join(folder, "_classes.csv"))
    df.columns = [c.strip() for c in df.columns]
    classes = [c for c in df.columns if c != "filename"]
    df["filename"] = df["filename"].astype(str).str.strip()
    df["path"] = df["filename"].apply(lambda f: os.path.join(folder, f))
    exists = df["path"].apply(os.path.exists)
    if (~exists).any():
        print(f"  PERINGATAN: {(~exists).sum()} gambar di CSV tidak ditemukan di {folder}, dilewati.")
    df = df[exists].reset_index(drop=True)
    df["orig"] = df["filename"].apply(original_id)
    return df, classes


def leakage_report(splits):
    owners = {}
    for name, df in splits.items():
        for o in df["orig"].unique():
            owners.setdefault(o, set()).add(name)
    leaked = {o: s for o, s in owners.items() if len(s) > 1}
    print(f"\nCek kebocoran: foto asli unik = {len(owners)}, muncul di >1 bagian = {len(leaked)}")
    if leaked:
        print("  PERINGATAN: foto yang sama ada di train dan val/test, angka validasi bisa menipu.")
        print("  Coba jalankan lagi dengan --regroup. Contoh:", list(leaked.items())[:5])
    return leaked


def regroup(frames, seed=0, val_frac=0.15, test_frac=0.10):
    """Gabungkan semua data, lalu bagi ulang PER FOTO ASLI supaya tidak bocor."""
    alldf = pd.concat(frames, ignore_index=True)
    groups = sorted(alldf["orig"].unique())
    random.Random(seed).shuffle(groups)
    n = len(groups)
    n_test = max(1, int(round(n * test_frac)))
    n_val = max(1, int(round(n * val_frac)))
    test_g = set(groups[:n_test])
    val_g = set(groups[n_test:n_test + n_val])
    test = alldf[alldf["orig"].isin(test_g)].reset_index(drop=True)
    val = alldf[alldf["orig"].isin(val_g)].reset_index(drop=True)
    train = alldf[~alldf["orig"].isin(test_g | val_g)].reset_index(drop=True)
    return {"train": train, "val": val, "test": test}


def metrics(probs, targets, classes, thr=0.5):
    """Precision / recall / F1 per kelas (probs dan targets: array N x C)."""
    pred = probs >= thr
    rows = []
    f1s = []
    for i, c in enumerate(classes):
        t = targets[:, i] > 0.5
        p = pred[:, i]
        tp = int((p & t).sum())
        fp = int((p & ~t).sum())
        fn = int((~p & t).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        rows.append((c, int(t.sum()), prec, rec, f1))
        if t.sum() > 0:
            f1s.append(f1)
    macro = float(np.mean(f1s)) if f1s else 0.0
    return rows, macro


def print_metrics(rows, macro, title):
    print(f"\n{title}")
    print(f"  {'kelas':10s}{'jumlah':>8s}{'precision':>11s}{'recall':>9s}{'F1':>7s}")
    for c, n, p, r, f in rows:
        print(f"  {c:10s}{n:8d}{p:11.2f}{r:9.2f}{f:7.2f}")
    print(f"  F1 rata-rata (kelas yang ada di data): {macro:.3f}")


# ----------------------------------------------------------------------
# Bagian model (butuh torch)
# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="dataset")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--imgsz", type=int, default=224)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--regroup", action="store_true")
    ap.add_argument("--out", default="moss_multilabel.pt")
    args = ap.parse_args()

    import torch
    import torch.nn as nn
    from PIL import Image
    from torch.utils.data import DataLoader, Dataset
    from torchvision import models, transforms

    # ---- 1. baca data ----
    found = find_splits(args.dataset)
    if "train" not in found or "val" not in found:
        raise SystemExit("Folder train dan valid (atau val) berisi _classes.csv tidak ditemukan di: " + args.dataset)
    splits, classes = {}, None
    for key, folder in found.items():
        df, cls = read_split(folder)
        if classes is None:
            classes = cls
        elif cls != classes:
            raise SystemExit(f"Kolom kelas di {folder} berbeda dari bagian lain.")
        splits[key] = df
        print(f"[{key}] {len(df)} gambar dari {df['orig'].nunique()} foto asli")
    print("Kelas:", classes)

    leakage_report(splits)
    if args.regroup:
        splits = regroup(list(splits.values()))
        print("\nData dibagi ulang per foto asli:",
                {k: f"{len(v)} gambar / {v['orig'].nunique()} foto" for k, v in splits.items()})
        leakage_report(splits)

    # ---- 2. dataset torch ----
    mean, std = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]
    train_tf = transforms.Compose([
        transforms.Resize((args.imgsz, args.imgsz)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),   # tanpa hue: warna penting untuk lumut
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((args.imgsz, args.imgsz)),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    class MossData(Dataset):
        def __init__(self, df, tf):
            self.paths = df["path"].tolist()
            self.y = df[classes].values.astype("float32")
            self.tf = tf

        def __len__(self):
            return len(self.paths)

        def __getitem__(self, i):
            img = Image.open(self.paths[i]).convert("RGB")
            return self.tf(img), torch.from_numpy(self.y[i])

    def loader(df, tf, shuffle):
        return DataLoader(
            MossData(df, tf),
            batch_size=args.batch,
            shuffle=shuffle,
            num_workers=0
        )

    train_loader = loader(splits["train"], train_tf, True)
    val_loader = loader(splits["val"], eval_tf, False)
    test_loader = loader(splits["test"], eval_tf, False) if "test" in splits and len(splits["test"]) else None

    # ---- 3. model ----
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Perangkat:", device)
    model = models.mobilenet_v3_small(weights="DEFAULT")       # perlu internet saat pertama kali
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(classes))
    model.to(device)

    # kelas jarang (misal Fungus) diberi bobot lebih besar
    pos = splits["train"][classes].values.sum(axis=0).astype("float32")
    neg = len(splits["train"]) - pos
    pos_weight = torch.tensor(np.clip(neg / np.maximum(pos, 1), 1.0, 10.0), dtype=torch.float32).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    def predict_all(dl):
        model.eval()
        ps, ys = [], []
        with torch.no_grad():
            for x, y in dl:
                ps.append(
                    torch.sigmoid(model(x.to(device, non_blocking=True)))
                    .cpu().numpy()
                )
                ys.append(y.numpy())
        return np.concatenate(ps), np.concatenate(ys)

    # ---- 4. latihan ----
    best, log = -1.0, []
    for epoch in range(1, args.epochs + 1):
        start_time = time.perf_counter()
        model.train()
        total = 0.0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            total += loss.item() * x.size(0)
        train_loss = total / len(train_loader.dataset)

        probs, ys = predict_all(val_loader)
        rows, macro = metrics(probs, ys, classes)
        elapsed = time.perf_counter() - start_time
        print(
            f"Epoch {epoch:3d}/{args.epochs} | "
            f"loss latih {train_loss:.4f} | "
            f"F1 val {macro:.3f} | "
            f"Waktu {elapsed:.2f} detik"
        )
        log.append((epoch, train_loss, macro))
        if macro > best:
            best = macro
            torch.save({"state_dict": model.state_dict(), "classes": classes,
                        "imgsz": args.imgsz}, args.out)

    with open("training_log.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["epoch", "loss_latih", "f1_val"])
        w.writerows(log)

    # ---- 5. laporan akhir memakai model terbaik ----
    ckpt = torch.load(args.out, map_location=device)
    model.load_state_dict(ckpt["state_dict"])
    probs, ys = predict_all(val_loader)
    print_metrics(*metrics(probs, ys, classes), "Hasil di data VALIDASI (model terbaik)")
    if test_loader:
        probs, ys = predict_all(test_loader)
        print_metrics(*metrics(probs, ys, classes), "Hasil di data TEST (ujian akhir)")
    print(f"\nModel disimpan: {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()