"""
server.py - Backend (API) untuk dashboard React Mossifier.

Menggantikan Gradio dan live_server.py. Python tetap mengerjakan kamera, grid, dan
pengiriman ke ESP32. React hanya menjadi tampilan dan pengendali lewat API ini.

Cara pakai (venv aktif, dari folder proyek; tidak butuh library tambahan):
    py server.py                       # API di http://127.0.0.1:8000 (mesin belum menyala)
    py server.py --autostart           # langsung menyalakan kamera
    py server.py --static dashboard/dist   # sekaligus menyajikan dashboard hasil build

Endpoint:
    GET  /api/state            status mesin, pengaturan, persentase terbaru, riwayat, status ESP32
    GET  /api/cameras          daftar kamera yang terdeteksi (nomor 0, 1, 2, ...)
    POST /api/config           ubah pengaturan (sebagian saja boleh), mis. {"interval": 5}
    POST /api/start            nyalakan kamera + analisis
    POST /api/stop             matikan kamera + analisis
    POST /api/esp32/test       kirim data contoh ke ESP32 untuk tes koneksi
    POST /api/analyze-image    analisis satu gambar unggahan (isi request = byte gambar)
    GET  /video                stream video langsung dengan grid (MJPEG)
    GET  /snapshot             satu frame JPEG terbaru
Pengaturan disimpan di mossifier_config.json.
"""

import argparse
import base64
import csv
import json
import mimetypes
import os
import threading
import time
import urllib.request
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import cv2
import numpy as np

import grid_core as gc

CONFIG_FILE = "mossifier_config.json"
DEFAULT_CONFIG = {
    "source": "0",            # nomor kamera ("0", "1", ...) atau path file video / URL stream
    "interval": 3.0,          # detik per perhitungan persentase
    "fps": 8.0,               # frame yang diproses per detik
    "smooth": 3,              # jumlah frame untuk menghaluskan tampilan petak
    "esp32_ip": "",           # mis. 10.20.219.29 atau http://10.20.219.29
    "esp32_path": "/vision",
    "esp32_enabled": False,
    "esp32_every": 10.0,      # kirim ke ESP32 tiap berapa detik
    "esp32_timeout": 4.0,     # detik menunggu jawaban ESP32
}
LIMITS = {"interval": (0.5, 60.0), "fps": (1.0, 30.0), "smooth": (1, 15),
          "esp32_every": (1.0, 3600.0), "esp32_timeout": (0.5, 30.0)}


# ---------------------------------------------------------------- util ESP32
def build_esp32_url(ip, path):
    ip = (ip or "").strip()
    if not ip:
        return None
    if not ip.lower().startswith(("http://", "https://")):
        ip = "http://" + ip
    u = urlparse(ip)
    if u.path in ("", "/"):
        p = (path or "/vision").strip()
        ip = f"{u.scheme}://{u.netloc}{p if p.startswith('/') else '/' + p}"
    return ip


def send_esp32(url, payload, timeout):
    """Kirim JSON ke ESP32. Mengembalikan (berhasil, pesan)."""
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return True, f"terkirim (HTTP {r.status}) {datetime.now().strftime('%H:%M:%S')}"
    except Exception as e:
        return False, f"gagal ({type(e).__name__})"


def source_kind(src):
    s = str(src).strip()
    if s.isdigit():
        return "webcam"
    if os.path.exists(s):
        return "file"
    return "stream"


def open_source(src):
    s = str(src).strip()
    if s.isdigit():
        idx = int(s)
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(idx)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return cap
    return cv2.VideoCapture(s)


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


# ---------------------------------------------------------------- mesin
class Engine:
    def __init__(self, params, log_path=None):
        self.params = params
        self.log_path = log_path
        self.cfg = dict(DEFAULT_CONFIG)
        self.lock = threading.Lock()
        self.cond = threading.Condition()
        self.shutdown = threading.Event()
        self.stop_evt = threading.Event()
        self.threads = []
        self.running = False
        self.jpeg = None
        self.frame_id = 0
        self.stats = {}
        self.history = []
        self.error = None
        self.esp32_msg = None
        self.load_config()

    # ---- pengaturan
    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, encoding="utf-8") as f:
                    self.cfg.update({k: v for k, v in json.load(f).items() if k in DEFAULT_CONFIG})
            except Exception:
                pass

    def snapshot_cfg(self):
        with self.lock:
            return dict(self.cfg)

    def set_config(self, partial):
        changed = {}
        for key, value in (partial or {}).items():
            if key not in DEFAULT_CONFIG:
                continue
            try:
                if key in ("source", "esp32_ip", "esp32_path"):
                    v = str(value).strip()
                elif key == "esp32_enabled":
                    v = bool(value)
                elif key == "smooth":
                    v = int(value)
                else:
                    v = float(value)
                if key in LIMITS:
                    lo, hi = LIMITS[key]
                    v = min(max(v, lo), hi)
                    v = int(v) if key == "smooth" else v
            except (TypeError, ValueError):
                raise ValueError(f"Nilai '{key}' tidak valid: {value!r}")
            changed[key] = v
        with self.lock:
            source_changed = "source" in changed and changed["source"] != self.cfg["source"]
            self.cfg.update(changed)
            data = dict(self.cfg)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        if source_changed and self.running:
            self.stop()
            self.start()
        return data

    # ---- start / stop
    def start(self):
        if self.running:
            return
        self.stop_evt = threading.Event()
        self.error = None
        self.running = True
        self.threads = [threading.Thread(target=self._worker, args=(self.stop_evt,), daemon=True),
                        threading.Thread(target=self._sender, args=(self.stop_evt,), daemon=True)]
        for t in self.threads:
            t.start()

    def stop(self):
        self.stop_evt.set()
        for t in self.threads:
            t.join(timeout=5)
        self.threads = []
        self.running = False
        with self.cond:
            self.jpeg = None
            self.frame_id += 1
            self.cond.notify_all()

    # ---- pembacaan kamera + analisis
    def _worker(self, stop_evt):
        cfg = self.snapshot_cfg()
        kind = source_kind(cfg["source"])
        cap = open_source(cfg["source"])
        if not cap.isOpened():
            self.error = (f"Kamera/sumber '{cfg['source']}' tidak bisa dibuka. Coba nomor kamera lain, "
                          "tutup aplikasi lain yang memakai kamera, dan cek izin kamera di Windows.")
            self.running = False
            return
        g = self.params["grid"]
        n_cells = g * g
        smooth = deque(maxlen=cfg["smooth"])
        win_counts, win_frames, t_win, last, fails = np.zeros(4), 0, time.time(), 0.0, 0
        log_f = writer = None
        if self.log_path:
            new = not os.path.exists(self.log_path)
            log_f = open(self.log_path, "a", newline="", encoding="utf-8")
            writer = csv.writer(log_f)
            if new:
                writer.writerow(["waktu", "lumut_pct", "healthy_pct", "stressed_pct", "critical_pct", "status"])
        try:
            while not stop_evt.is_set():
                cfg = self.snapshot_cfg()
                min_dt = 1.0 / cfg["fps"]
                ok, frame = cap.read()
                if kind == "file":
                    time.sleep(min_dt)
                if not ok:
                    if kind == "file":
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    fails += 1
                    if fails > 100:
                        self.error = "Kamera berhenti mengirim gambar."
                    time.sleep(0.05)
                    continue
                fails = 0
                self.error = None
                now = time.time()
                if kind != "file" and now - last < min_dt:
                    continue
                last = now
                try:
                    res = gc.analyze_frame(frame, self.params)
                except Exception as e:      # jangan matikan thread karena satu frame bermasalah
                    self.error = f"Gagal menganalisis frame: {type(e).__name__}"
                    continue
                if smooth.maxlen != cfg["smooth"]:
                    smooth = deque(smooth, maxlen=cfg["smooth"])
                smooth.append(res["cls"])
                stack = np.stack(smooth)
                cls = np.argmax(np.stack([(stack == k).sum(axis=0) for k in range(4)]), axis=0)
                idx = int(gc.frame_status_index(cls.reshape(1, -1), self.params)[0])
                out = gc.draw_grid(res["frame"], cls, gc.STATUS_NAMES[idx])
                okj, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if okj:
                    with self.cond:
                        self.jpeg = buf.tobytes()
                        self.frame_id += 1
                        self.cond.notify_all()

                win_counts += np.array([(cls == k).sum() for k in range(4)])
                win_frames += 1
                if now - t_win >= cfg["interval"] and win_frames:
                    avg = win_counts / win_frames
                    moss = float(avg[1:].sum())
                    pct = lambda v: round(100.0 * v / moss, 1) if moss > 0 else 0.0
                    row = {"time": datetime.now().strftime("%H:%M:%S"),
                           "moss_pct": round(100.0 * moss / n_cells, 1),
                           "healthy_pct": pct(avg[1]), "stressed_pct": pct(avg[2]), "critical_pct": pct(avg[3])}
                    status = status_from_counts(avg, n_cells, self.params)
                    self.history = (self.history + [{**row, "status": status}])[-20:]
                    self.stats = {**row, "status": status, "frames": win_frames, "updated_at": time.time()}
                    if writer:
                        writer.writerow([datetime.now().isoformat(timespec="seconds"), row["moss_pct"],
                                         row["healthy_pct"], row["stressed_pct"], row["critical_pct"], status])
                        log_f.flush()
                    win_counts, win_frames, t_win = np.zeros(4), 0, now
        finally:
            cap.release()
            if log_f:
                log_f.close()
            if not stop_evt.is_set():
                self.running = False

    # ---- pengiriman ke ESP32 (thread mandiri, tidak mengganggu pembacaan kamera)
    def _sender(self, stop_evt):
        fails, next_t, last_url = 0, 0.0, None
        while not stop_evt.is_set():
            time.sleep(0.2)
            cfg = self.snapshot_cfg()
            if not cfg["esp32_enabled"]:
                self.esp32_msg, fails, next_t, last_url = None, 0, 0.0, None
                continue
            url = build_esp32_url(cfg["esp32_ip"], cfg["esp32_path"])
            if not url:
                self.esp32_msg = "isi IP ESP32 dulu"
                continue
            if url != last_url:
                fails, next_t, last_url = 0, 0.0, url
            now = time.time()
            st = self.stats
            if now < next_t or not st or now - st.get("updated_at", 0) > 3 * cfg["interval"] + 5:
                continue
            payload = {"healthy": st["healthy_pct"], "stressed": st["stressed_pct"],
                       "critical": st["critical_pct"], "moss": st["moss_pct"], "status": st["status"]}
            ok, msg = send_esp32(url, payload, cfg["esp32_timeout"])
            if ok:
                fails, delay = 0, cfg["esp32_every"]
                self.esp32_msg = msg
            else:
                fails += 1
                delay = min(cfg["esp32_every"] * (2 ** fails), 60.0)
                self.esp32_msg = f"{msg}, coba lagi {delay:.0f} dtk lagi"
            next_t = time.time() + delay

    # ---- fungsi bantu untuk API
    def state(self):
        return {"running": self.running, "config": self.snapshot_cfg(), "stats": self.stats,
                "history": self.history, "error": self.error, "esp32": self.esp32_msg,
                "server_time": time.time()}

    def test_esp32(self):
        cfg = self.snapshot_cfg()
        url = build_esp32_url(cfg["esp32_ip"], cfg["esp32_path"])
        if not url:
            return {"ok": False, "url": None, "message": "IP ESP32 belum diisi."}
        ok, msg = send_esp32(url, {"healthy": 0, "stressed": 0, "critical": 0, "moss": 0, "status": "tes"},
                             cfg["esp32_timeout"])
        hint = "" if ok else (" Cek IP, pastikan laptop dan ESP32 satu jaringan, dan program ESP32 punya "
                              f"penanganan POST {urlparse(url).path}.")
        return {"ok": ok, "url": url, "message": msg + hint}

    def analyze_image(self, data):
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("File bukan gambar yang valid.")
        res = gc.analyze_frame(img, self.params)
        out = gc.draw_grid(res["frame"], res["cls"], res["status"])
        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 85])
        m, c = res["n_moss"], res["counts"]
        pct = lambda v: round(100.0 * v / m, 1) if m else 0.0
        return {"image": "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii"),
                "summary": {"status": res["status"], "moss_pct": round(100.0 * m / res["n_cells"], 1),
                            "healthy_pct": pct(c["healthy"]), "stressed_pct": pct(c["stressed"]),
                            "critical_pct": pct(c["critical"])}}

    def list_cameras(self, max_index=4):
        cfg = self.snapshot_cfg()
        found = []
        for i in range(max_index):
            if self.running and cfg["source"] == str(i):
                found.append({"index": i, "label": f"Kamera {i} (sedang dipakai)"})
                continue
            cap = open_source(str(i))
            ok = cap.isOpened() and cap.read()[0]
            cap.release()
            if ok:
                found.append({"index": i, "label": f"Kamera {i}"})
        return found


# ---------------------------------------------------------------- HTTP
def make_handler(engine, static_dir):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def _send(self, code, ctype, body):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, "application/json", json.dumps(obj, ensure_ascii=False).encode("utf-8"))

        def _body(self):
            n = int(self.headers.get("Content-Length", 0) or 0)
            if n > 25 * 1024 * 1024:
                raise ValueError("File terlalu besar (maksimal 25 MB).")
            return self.rfile.read(n) if n else b""

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/api/state":
                self._json(engine.state())
            elif path == "/api/cameras":
                self._json({"cameras": engine.list_cameras()})
            elif path == "/snapshot":
                if engine.jpeg is None:
                    self._send(503, "text/plain", b"belum ada frame")
                else:
                    self._send(200, "image/jpeg", engine.jpeg)
            elif path == "/video":
                self._stream()
            elif static_dir:
                self._static(path)
            else:
                self._json({"error": "tidak ditemukan"}, 404)

        def do_POST(self):
            path = self.path.split("?")[0]
            try:
                if path == "/api/config":
                    body = json.loads(self._body() or b"{}")
                    self._json({"config": engine.set_config(body)})
                elif path == "/api/start":
                    engine.start()
                    self._json({"running": engine.running})
                elif path == "/api/stop":
                    engine.stop()
                    self._json({"running": engine.running})
                elif path == "/api/esp32/test":
                    self._body()
                    self._json(engine.test_esp32())
                elif path == "/api/analyze-image":
                    self._json(engine.analyze_image(self._body()))
                else:
                    self._json({"error": "tidak ditemukan"}, 404)
            except (ValueError, json.JSONDecodeError) as e:
                self._json({"error": str(e)}, 400)
            except Exception as e:
                self._json({"error": f"{type(e).__name__}: {e}"}, 500)

        def _stream(self):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self._cors()
            self.end_headers()
            last_id = -1
            try:
                while not engine.shutdown.is_set():
                    with engine.cond:
                        engine.cond.wait_for(lambda: engine.frame_id != last_id or engine.shutdown.is_set(), timeout=2)
                        jpeg, last_id = engine.jpeg, engine.frame_id
                    if jpeg is None:
                        if not engine.running:
                            break
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(jpeg))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

        def _static(self, path):
            root = os.path.abspath(static_dir)
            rel = path.lstrip("/") or "index.html"
            full = os.path.abspath(os.path.join(root, rel))
            if not full.startswith(root) or not os.path.isfile(full):
                full = os.path.join(root, "index.html")      # fallback untuk aplikasi satu halaman
            if not os.path.isfile(full):
                self._json({"error": "dashboard belum di-build (npm run build)"}, 404)
                return
            with open(full, "rb") as f:
                data = f.read()
            self._send(200, mimetypes.guess_type(full)[0] or "application/octet-stream", data)

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1",
                    help="127.0.0.1 = hanya laptop ini; 0.0.0.0 = bisa dibuka perangkat lain di jaringan yang sama")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--params", default="grid_params.json")
    ap.add_argument("--log", default=None, help="catat hasil tiap interval ke file CSV")
    ap.add_argument("--static", default=None, help="folder hasil build dashboard, mis. dashboard/dist")
    ap.add_argument("--autostart", action="store_true")
    args = ap.parse_args()

    params = gc.load_params(args.params)
    if not os.path.exists(args.params):
        print(f"CATATAN: {args.params} tidak ada, memakai ambang bawaan. Jalankan tune_grid.py untuk menyetelnya.")
    engine = Engine(params, args.log)
    if args.autostart:
        engine.start()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(engine, args.static))
    shown = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    print(f"API siap di http://{shown}:{args.port}   (dashboard dev: npm run dev di folder dashboard)")
    print("Hentikan dengan Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        engine.shutdown.set()
        engine.stop()
        server.server_close()


if __name__ == "__main__":
    main()