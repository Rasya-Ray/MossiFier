"""
live_server.py - Video webcam LIVE dengan grid 16x16 di halaman web.

Cara pakai (venv aktif, dari folder proyek). Tidak butuh library tambahan
(hanya opencv dan numpy yang sudah ada):
    py legacy/live_server.py                        # webcam bawaan laptop (kamera nomor 0)
    py legacy/live_server.py --source 1             # kamera nomor 1 (kalau ada beberapa kamera)
    py legacy/live_server.py --source video.mp4     # uji tanpa kamera memakai file video
    py legacy/live_server.py --interval 5 --log live_log.csv
Lalu buka http://127.0.0.1:8000 di browser.

Alurnya:
  1. Python membaca kamera terus-menerus lewat OpenCV.
  2. Setiap frame dibagi grid 16x16; tiap petak dinilai: bukan lumut / healthy / stressed / critical
     (aturan di grid_core.py, ambang dari grid_params.json).
  3. Video yang sudah berisi grid dikirim ke browser sebagai stream (MJPEG).
  4. Tiap --interval detik (default 3), hasil seluruh frame selama jendela itu dirata-ratakan,
     lalu persentasenya ditampilkan di halaman dan (opsional) dicatat ke file CSV.
"""

import argparse
import csv
import json
import os
import sys
import threading
import time
import urllib.request
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import grid_core as gc

HTML = """<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Mossifier Live</title>
<style>
 body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#101418;color:#e8eaed}
 header{padding:12px 20px;background:#1b222a}
 main{display:flex;flex-wrap:wrap;gap:20px;padding:20px}
 #video{max-width:100%;width:640px;border-radius:8px;background:#000}
 .panel{min-width:280px;max-width:420px;flex:1}
 .card{background:#1b222a;border-radius:8px;padding:14px 16px;margin-bottom:14px}
 .status{font-size:28px;font-weight:700}
 .bar{height:14px;border-radius:7px;background:#2a333d;overflow:hidden;margin:4px 0 10px}
 .bar>div{height:100%}
 table{width:100%;border-collapse:collapse;font-size:13px}
 td,th{padding:3px 6px;text-align:right} th:first-child,td:first-child{text-align:left}
 .muted{color:#9aa4ad;font-size:13px}
</style></head><body>
<header><b>Mossifier Live</b> &nbsp;<span class="muted">grid 16 x 16 | hijau = healthy, kuning = stressed, merah = critical, tanpa warna = bukan lumut</span></header>
<main>
 <img id="video" src="/video" alt="video live">
 <div class="panel">
  <div class="card"><div class="muted">Status (rata-rata <span id="win">3</span> detik terakhir)</div>
   <div class="status" id="status">menunggu...</div>
   <div class="muted" id="upd"></div><div class="muted" id="err" style="color:#ff8a80"></div><div class="muted" id="esp"></div></div>
  <div class="card">
   <div>Area lumut: <b id="moss">-</b></div><div class="bar"><div id="b_moss" style="background:#8ab4f8;width:0"></div></div>
   <div>Healthy: <b id="h">-</b></div><div class="bar"><div id="b_h" style="background:#3cc83c;width:0"></div></div>
   <div>Stressed: <b id="s">-</b></div><div class="bar"><div id="b_s" style="background:#ffd700;width:0"></div></div>
   <div>Critical: <b id="c">-</b></div><div class="bar"><div id="b_c" style="background:#dc3c28;width:0"></div></div>
   <div class="muted">Healthy, stressed, critical dihitung dari area lumut saja.</div>
  </div>
  <div class="card"><div class="muted" style="margin-bottom:6px">Riwayat</div>
   <table><thead><tr><th>Waktu</th><th>Lumut</th><th>H</th><th>S</th><th>C</th></tr></thead><tbody id="hist"></tbody></table></div>
 </div>
</main>
<script>
const f = v => (v==null? '-' : v.toFixed(0)+'%');
const col = {"healthy":"#3cc83c","stressed":"#ffd700","critical":"#dc3c28"};
async function tick(){
  try{
    const r = await fetch('/stats'); const d = await r.json();
    document.getElementById('win').textContent = d.interval;
    const st = document.getElementById('status'); st.textContent = d.status || 'menunggu...';
    st.style.color = col[d.status] || '#e8eaed';
    document.getElementById('err').textContent = d.error || '';
    document.getElementById('esp').textContent = d.esp32 ? 'ESP32: ' + d.esp32 : '';
    if(d.updated_at){ const age = Math.round(Date.now()/1000 - d.updated_at);
      document.getElementById('upd').textContent = 'diperbarui ' + age + ' detik lalu (' + d.frames + ' frame)'; }
    document.getElementById('moss').textContent = f(d.moss_pct);
    document.getElementById('h').textContent = f(d.healthy_pct);
    document.getElementById('s').textContent = f(d.stressed_pct);
    document.getElementById('c').textContent = f(d.critical_pct);
    for (const [id,k] of [['b_moss','moss_pct'],['b_h','healthy_pct'],['b_s','stressed_pct'],['b_c','critical_pct']])
      document.getElementById(id).style.width = (d[k]||0) + '%';
    document.getElementById('hist').innerHTML = (d.history||[]).slice().reverse().map(
      x => `<tr><td>${x.time}</td><td>${f(x.moss_pct)}</td><td>${f(x.healthy_pct)}</td><td>${f(x.stressed_pct)}</td><td>${f(x.critical_pct)}</td></tr>`).join('');
  }catch(e){}
}
setInterval(tick, 1000); tick();
</script></body></html>"""


class State:
    def __init__(self, interval):
        self.cond = threading.Condition()
        self.jpeg = None
        self.frame_id = 0
        self.stop = False
        self.stats = {"status": None, "interval": interval, "error": None, "history": []}
        self.esp32_busy = False
        self.esp32_msg = None


def open_source(src):
    if str(src).isdigit():
        idx = int(src)
        return cv2.VideoCapture(idx, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(idx)
    return cv2.VideoCapture(src)


def status_from_counts(avg, n_cells, params):
    moss = float(avg[1:].sum())
    if moss / n_cells < params["min_moss_frac"]:
        return "tidak ada lumut"
    crit = avg[3] / moss
    bad = (avg[2] + avg[3]) / moss
    if crit >= params["frame_critical"]:
        return "critical"
    if bad >= params["frame_stressed"]:
        return "stressed"
    return "healthy"


def esp32_sender(args, state):
    """
    Thread MANDIRI untuk mengirim hasil ke ESP32. Tidak terikat dengan proses scan video:
    mengirim tiap --esp32-every detik memakai hasil terbaru, dan memberi jeda lebih lama
    (backoff) kalau ESP32 tidak menjawab, supaya ESP32 tidak dibanjiri permintaan.
    """
    fails = 0
    while not state.stop:
        delay = min(args.esp32_every * (2 ** fails), 60.0)
        t_end = time.time() + delay
        while time.time() < t_end and not state.stop:
            time.sleep(0.2)
        st = state.stats
        if state.stop or "updated_at" not in st or time.time() - st["updated_at"] > 3 * args.interval + 5:
            continue
        payload = {"healthy": st["healthy_pct"], "stressed": st["stressed_pct"],
                   "critical": st["critical_pct"], "moss": st["moss_pct"], "status": st["status"]}
        try:
            req = urllib.request.Request(args.esp32, data=json.dumps(payload).encode("utf-8"),
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=args.esp32_timeout) as r:
                state.esp32_msg = f"terkirim (HTTP {r.status}) {datetime.now().strftime('%H:%M:%S')}"
            fails = 0
        except Exception as e:
            fails += 1
            state.esp32_msg = (f"gagal ({type(e).__name__}), coba lagi {min(args.esp32_every * (2 ** fails), 60):.0f} dtk "
                               "lagi - jalankan esp32_check.py")


def worker(args, params, state):
    is_file = not str(args.source).isdigit()
    cap = open_source(args.source)
    if not cap.isOpened():
        state.stats["error"] = (f"Kamera/video '{args.source}' tidak bisa dibuka. "
                                "Coba --source 1, tutup aplikasi lain yang memakai kamera, "
                                "dan cek izin kamera di pengaturan Windows.")
        print("ERROR:", state.stats["error"])
        return

    g = params["grid"]
    n_cells = g * g
    smooth = deque(maxlen=max(1, args.smooth))
    win_counts, win_frames, t_win = np.zeros(4), 0, time.time()
    min_dt, last = 1.0 / args.fps, 0.0
    fails = 0
    log_f = writer = None
    if args.log:
        new = not os.path.exists(args.log)
        log_f = open(args.log, "a", newline="", encoding="utf-8")
        writer = csv.writer(log_f)
        if new:
            writer.writerow(["waktu", "lumut_pct", "healthy_pct", "stressed_pct", "critical_pct", "status"])

    while not state.stop:
        ok, frame = cap.read()
        if is_file:
            time.sleep(min_dt)
        if not ok:
            if is_file:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            fails += 1
            if fails > 100:
                state.stats["error"] = "Kamera berhenti mengirim gambar."
            time.sleep(0.05)
            continue
        fails = 0
        state.stats["error"] = None
        now = time.time()
        if not is_file and now - last < min_dt:
            continue
        last = now

        res = gc.analyze_frame(frame, params)
        smooth.append(res["cls"])
        stack = np.stack(smooth)
        cls = np.argmax(np.stack([(stack == k).sum(axis=0) for k in range(4)]), axis=0)
        idx = int(gc.frame_status_index(cls.reshape(1, -1), params)[0])
        out = gc.draw_grid(res["frame"], cls, gc.STATUS_NAMES[idx])
        okj, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if okj:
            with state.cond:
                state.jpeg = buf.tobytes()
                state.frame_id += 1
                state.cond.notify_all()

        win_counts += np.array([(cls == k).sum() for k in range(4)])
        win_frames += 1
        if now - t_win >= args.interval and win_frames:
            avg = win_counts / win_frames
            moss = float(avg[1:].sum())
            pct = lambda v: round(100.0 * v / moss, 1) if moss > 0 else 0.0
            row = {"time": datetime.now().strftime("%H:%M:%S"),
                   "moss_pct": round(100.0 * moss / n_cells, 1),
                   "healthy_pct": pct(avg[1]), "stressed_pct": pct(avg[2]), "critical_pct": pct(avg[3])}
            status = status_from_counts(avg, n_cells, params)
            hist = (state.stats["history"] + [row])[-10:]
            state.stats = {**row, "status": status, "interval": args.interval, "frames": win_frames,
                           "updated_at": time.time(), "error": None, "history": hist}
            if writer:
                writer.writerow([datetime.now().isoformat(timespec="seconds"), row["moss_pct"],
                                 row["healthy_pct"], row["stressed_pct"], row["critical_pct"], status])
                log_f.flush()
            win_counts, win_frames, t_win = np.zeros(4), 0, now
    cap.release()
    if log_f:
        log_f.close()


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, ctype, body):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                self._send(200, "text/html; charset=utf-8", HTML.encode("utf-8"))
            elif path == "/stats":
                self._send(200, "application/json", json.dumps({**state.stats, "esp32": state.esp32_msg}).encode("utf-8"))
            elif path == "/snapshot":
                if state.jpeg is None:
                    self._send(503, "text/plain", b"belum ada frame")
                else:
                    self._send(200, "image/jpeg", state.jpeg)
            elif path == "/video":
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                last_id = -1
                try:
                    while not state.stop:
                        with state.cond:
                            state.cond.wait_for(lambda: state.frame_id != last_id or state.stop, timeout=2)
                            jpeg, last_id = state.jpeg, state.frame_id
                        if jpeg is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(jpeg))
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
            else:
                self._send(404, "text/plain", b"tidak ditemukan")

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="0", help="nomor kamera (0, 1, ...) atau path file video")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1",
                    help="127.0.0.1 = hanya laptop ini; 0.0.0.0 = bisa dibuka perangkat lain di Wi-Fi yang sama")
    ap.add_argument("--interval", type=float, default=3.0, help="detik per perhitungan persentase")
    ap.add_argument("--fps", type=float, default=8.0, help="frame yang diproses per detik")
    ap.add_argument("--smooth", type=int, default=3, help="jumlah frame untuk menghaluskan tampilan petak")
    ap.add_argument("--params", default=str(ROOT / "grid_params.json"))
    ap.add_argument("--log", default=None, help="catat hasil tiap interval ke file CSV")
    ap.add_argument("--esp32", default=None, help="URL ESP32 untuk menerima hasil, mis. http://192.168.137.107/vision")
    ap.add_argument("--esp32-timeout", type=float, default=4.0, help="detik menunggu jawaban ESP32")
    ap.add_argument("--esp32-every", type=float, default=10.0, help="kirim ke ESP32 tiap berapa detik")
    args = ap.parse_args()

    params = gc.load_params(args.params)
    if not os.path.exists(args.params):
        print(f"CATATAN: {args.params} tidak ada, memakai ambang bawaan. Jalankan tune_grid.py untuk menyetelnya.")
    state = State(args.interval)
    threading.Thread(target=worker, args=(args, params, state), daemon=True).start()
    if args.esp32:
        threading.Thread(target=esp32_sender, args=(args, state), daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    print(f"Buka di browser: http://{'127.0.0.1' if args.host == '0.0.0.0' else args.host}:{args.port}")
    print("Hentikan dengan Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        state.stop = True
        with state.cond:
            state.cond.notify_all()
        server.server_close()


if __name__ == "__main__":
    main()