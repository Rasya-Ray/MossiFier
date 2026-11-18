# Mossifier - AI

Dashboard monitoring kondisi lumut: **React (frontend)** + **FastAPI (backend)**.
Analisis kondisi memakai aturan warna/tekstur per petak grid di `grid_core.py` (bukan deep learning).

## Struktur folder

```
Mossifier - AI/
├── api.py               # entry point FastAPI (JANGAN dipindah)
├── engine.py            # mesin start/stop kamera + kirim ke ESP32
├── grid_core.py         # inti analisis grid 16x16
├── grid_params.json     # ambang hasil tuning (dipakai runtime)
├── config.json          # konfigurasi runtime (kamera, interval, URL ESP32)
├── live_log.csv         # riwayat hasil (dibaca /api/history)
├── requirements.txt
├── frontend/            # aplikasi React + Vite
├── venv/                # virtualenv Python (jangan dipindah)
│
├── data/                # bahan training/tuning (tidak dipakai runtime)
│   ├── dataset/         # dataset Roboflow (train/val/test)
│   ├── nonmoss/         # foto bukan lumut untuk tuning
│   └── preview/         # gambar preview kelas
├── tools/               # script pengembangan
│   ├── tune_grid.py     # menyetel ambang -> grid_params.json
│   ├── train_multilabel.py  # melatih model -> models/moss_multilabel.pt
│   ├── moss_tiles.py    # prototipe analisis per petak
│   └── esp32_check.py   # diagnosa koneksi ESP32
├── legacy/              # UI lama (tidak dipakai aplikasi utama)
│   ├── app_grid.py      # UI Gradio
│   └── live_server.py   # web server MJPEG versi lama
├── models/
│   └── moss_multilabel.pt   # model hasil training (belum dipakai runtime)
└── logs/
    └── training_log.csv
```

## Menjalankan aplikasi utama

```powershell
# 1. backend (dari folder proyek)
venv\Scripts\activate
uvicorn api:app --port 8000

# 2. frontend (terminal terpisah)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Mode produksi: `cd frontend && npm run build`, lalu `frontend/dist` otomatis
disajikan oleh FastAPI di `http://127.0.0.1:8000`.

## Script pengembangan (opsional)

Semua dijalankan dari folder proyek:

```powershell
py tools/tune_grid.py --fast
py tools/tune_grid.py --nonmoss data/nonmoss
py tools/train_multilabel.py --epochs 20
py tools/moss_tiles.py foto.jpg
py tools/esp32_check.py http://IP-ESP32/vision
```

`tools/` dan `legacy/` sudah disesuaikan supaya tetap menemukan `grid_core.py`
dan `grid_params.json` di folder utama, jadi tidak perlu pindah ke dalam folder itu.
