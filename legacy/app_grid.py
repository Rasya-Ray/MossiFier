"""
app_grid.py - Halaman web Mossifier dengan tampilan grid 16 x 16.

Cara pakai (venv aktif, dari folder proyek):
    pip install gradio
    py legacy/app_grid.py            # mode foto: webcam (ambil foto) atau unggah gambar
    py legacy/app_grid.py --live     # tambah tab webcam langsung (butuh Gradio versi baru)
Lalu buka alamat yang tercetak di terminal (biasanya http://127.0.0.1:7860).

Tiap petak diberi warna:
    hijau  = healthy      kuning = stressed      merah = critical
    tanpa warna          = bukan lumut
Ambang diambil dari grid_params.json (hasil tune_grid.py). Kalau file itu tidak ada,
dipakai ambang bawaan di grid_core.py.
"""

import argparse
import sys
from pathlib import Path

import cv2
import gradio as gr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import grid_core as gc

parser = argparse.ArgumentParser()
parser.add_argument("--live", action="store_true", help="tambah tab webcam langsung")
parser.add_argument("--params", default=str(ROOT / "grid_params.json"))
args = parser.parse_args()

PARAMS = gc.load_params(args.params)


def analyze(image):
    """image: array RGB dari Gradio. Mengembalikan (gambar berGrid RGB, ringkasan teks)."""
    if image is None:
        return None, "Belum ada gambar. Ambil foto dari webcam atau unggah gambar."
    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    res = gc.analyze_frame(bgr, PARAMS)
    out = gc.draw_grid(res["frame"], res["cls"], res["status"])
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB), gc.text_summary(res)


with gr.Blocks(title="Mossifier - Grid 16x16") as demo:
    gr.Markdown("# Mossifier - Grid 16x16\n"
                "Hijau = healthy, kuning = stressed, merah = critical, tanpa warna = bukan lumut.")
    with gr.Tab("Foto atau unggah"):
        inp = gr.Image(sources=["webcam", "upload"], type="numpy", label="Webcam atau unggah gambar")
        btn = gr.Button("Analisis")
        out_img = gr.Image(label="Hasil grid")
        out_txt = gr.Textbox(label="Ringkasan", lines=4)
        btn.click(analyze, inputs=inp, outputs=[out_img, out_txt])
    if args.live:
        with gr.Tab("Webcam langsung"):
            cam = gr.Image(sources=["webcam"], streaming=True, type="numpy", label="Webcam langsung")
            live_img = gr.Image(label="Hasil grid (langsung)")
            live_txt = gr.Textbox(label="Ringkasan", lines=4)
            cam.stream(analyze, inputs=cam, outputs=[live_img, live_txt], stream_every=0.5, time_limit=120)

if __name__ == "__main__":
    demo.launch()