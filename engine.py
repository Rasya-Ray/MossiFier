"""
engine.py - Mesin Mossifier yang bisa start/stop dari API.
Logika analisis sama dengan live_server.py, hanya dibungkus class.
"""
import csv, json, os, threading, time, urllib.request
from collections import deque
from datetime import datetime

import cv2
import numpy as np

import grid_core as gc

DEFAULT_CONFIG = {
    "camera": "0",          # "0", "1", ... atau path video / URL RTSP
    "interval": 3.0,        # detik, jendela rata-rata persentase
    "esp32_url": "",        # http://192.168.1.10/vision
    "esp32_every": 10.0,    # detik, kirim ke ESP32 tiap berapa lama
    "esp32_timeout": 4.0,
    "fps": 8.0,
    "smooth": 3,
    "log": "live_log.csv",
}


def open_source(src):
    if str(src).isdigit():
        idx = int(src)
        return cv2.VideoCapture(idx, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(idx)
    return cv2.VideoCapture(src)


def status_from_counts(avg, n_cells, params):
    moss = float(avg[1:].sum())
    if moss / n_cells < params["min_moss_frac"]:
        return "tidak ada lumut"
    if avg[3] / moss >= params["frame_critical"]:
        return "critical"
    if (avg[2] + avg[3]) / moss >= params["frame_stressed"]:
        return "stressed"
    return "healthy"


class MossEngine:
    def __init__(self, params_path="grid_params.json"):
        self.params_path = params_path
        self.params = gc.load_params(params_path)
        self._cond = threading.Condition(threading.RLock())
        self._stop = threading.Event()
        self._threads = []
        self._jpeg = None
        self._frame_id = 0
        self._cfg = dict(DEFAULT_CONFIG)
        self._running = False
        self._started_at = None
        self._error = None
        self._esp32_msg = None
        self._stats = {"status": None, "moss_pct": 0.0, "healthy_pct": 0.0,
                       "stressed_pct": 0.0, "critical_pct": 0.0, "frames": 0,
                       "updated_at": None, "history": []}

    @property
    def running(self):
        return self._running

    def start(self, cfg=None):
        with self._cond:
            if self._running:
                raise RuntimeError("Mesin sudah berjalan")
            self._cfg = {**DEFAULT_CONFIG, **{k: v for k, v in (cfg or {}).items() if v is not None}}
            self.params = gc.load_params(self.params_path)
            self._stats = {"status": None, "moss_pct": 0.0, "healthy_pct": 0.0,
                           "stressed_pct": 0.0, "critical_pct": 0.0, "frames": 0,
                           "updated_at": None, "history": []}
            self._error = None
            self._esp32_msg = None
            self._jpeg = None
            self._frame_id += 1
            self._running = True
            self._started_at = time.time()
        self._stop.clear()
        self._threads = [threading.Thread(target=self._worker, daemon=True),
                         threading.Thread(target=self._esp32_sender, daemon=True)]
        for t in self._threads:
            t.start()
        return self.status()

    def stop(self):
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        for t in list(self._threads):
            t.join(timeout=3)
        self._threads = []
        with self._cond:
            self._running = False
            self._jpeg = None
            self._frame_id += 1
            self._cond.notify_all()
        return self.status()

    def update_config(self, patch):
        """Ubah interval / IP ESP32 tanpa restart. Ganti kamera = restart otomatis."""
        restart = False
        with self._cond:
            new = {k: v for k, v in (patch or {}).items() if k in DEFAULT_CONFIG and v is not None}
            camera_changed = str(new.get("camera", self._cfg["camera"])) != str(self._cfg["camera"])
            self._cfg.update(new)
            restart = camera_changed and self._running
            cfg = dict(self._cfg)
        if restart:
            self.stop()
            self.start(cfg)
        return self.status()

    def status(self):
        with self._cond:
            st = dict(self._stats)
            st["history"] = list(self._stats.get("history") or [])
            st["running"] = self._running
            st["config"] = dict(self._cfg)
            st["esp32"] = self._esp32_msg
            st["error"] = self._error
            st["uptime"] = round(time.time() - self._started_at) if self._started_at else 0
            return st

    def wait_frame(self, last_id=-1, timeout=1.0):
        """Dipakai endpoint MJPEG untuk mengambil frame terbaru."""
        with self._cond:
            self._cond.wait_for(lambda: self._frame_id != last_id or self._stop.is_set(), timeout=timeout)
            return self._jpeg, self._frame_id

    # ---------------- thread internal ----------------
    def _wait(self, seconds):
        """Tidur sambil mengecek stop. True kalau harus berhenti."""
        end = time.time() + max(0.0, seconds)
        while time.time() < end:
            if self._stop.wait(0.2):
                return True
        return self._stop.is_set()

    def _worker(self):
        with self._cond:
            cfg = dict(self._cfg)
        cap = open_source(cfg["camera"])
        if not cap.isOpened():
            cap.release()
            with self._cond:
                self._error = (f"Kamera/video '{cfg['camera']}' tidak bisa dibuka. "
                               "Coba index lain, tutup aplikasi lain yang memakai kamera.")
                self._running = False
            return

        is_file = not str(cfg["camera"]).isdigit()
        g = self.params["grid"]
        n_cells = g * g
        smooth = deque(maxlen=max(1, int(cfg["smooth"])))
        win_counts, win_frames, t_win = np.zeros(4), 0, time.time()
        fails, last = 0, 0.0
        log_f = writer = None
        if cfg.get("log"):
            new = not os.path.exists(cfg["log"])
            log_f = open(cfg["log"], "a", newline="", encoding="utf-8")
            writer = csv.writer(log_f)
            if new:
                writer.writerow(["waktu", "lumut_pct", "healthy_pct",
                                 "stressed_pct", "critical_pct", "status"])
        try:
            while not self._stop.is_set():
                with self._cond:
                    fps = float(self._cfg["fps"])
                    interval = float(self._cfg["interval"])
                min_dt = 1.0 / max(fps, 0.5)
                ok, frame = cap.read()
                if is_file:
                    time.sleep(min_dt)
                if not ok:
                    if is_file:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    fails += 1
                    if fails > 100:
                        with self._cond:
                            self._error = "Kamera berhenti mengirim gambar."
                    time.sleep(0.05)
                    continue
                fails = 0
                now = time.time()
                if not is_file and now - last < min_dt:
                    continue
                last = now

                res = gc.analyze_frame(frame, self.params)
                smooth.append(res["cls"])
                stack = np.stack(smooth)
                cls = np.argmax(np.stack([(stack == k).sum(axis=0) for k in range(4)]), axis=0)
                idx = int(gc.frame_status_index(cls.reshape(1, -1), self.params)[0])
                out = gc.draw_grid(res["frame"], cls, gc.STATUS_NAMES[idx])
                okj, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if okj:
                    with self._cond:
                        self._jpeg = buf.tobytes()
                        self._frame_id += 1
                        self._cond.notify_all()

                win_counts += np.array([(cls == k).sum() for k in range(4)])
                win_frames += 1
                if now - t_win >= interval and win_frames:
                    avg = win_counts / win_frames
                    moss = float(avg[1:].sum())
                    pct = lambda v: round(100.0 * v / moss, 1) if moss > 0 else 0.0
                    row = {"time": datetime.now().strftime("%H:%M:%S"),
                           "moss_pct": round(100.0 * moss / n_cells, 1),
                           "healthy_pct": pct(avg[1]), "stressed_pct": pct(avg[2]),
                           "critical_pct": pct(avg[3])}
                    status = status_from_counts(avg, n_cells, self.params)
                    with self._cond:
                        hist = (self._stats["history"] + [row])[-20:]
                        self._stats = {**row, "status": status, "frames": win_frames,
                                       "updated_at": time.time(), "history": hist}
                        self._error = None
                    if writer:
                        writer.writerow([datetime.now().isoformat(timespec="seconds"),
                                         row["moss_pct"], row["healthy_pct"],
                                         row["stressed_pct"], row["critical_pct"], status])
                        log_f.flush()
                    win_counts, win_frames, t_win = np.zeros(4), 0, now
        finally:
            cap.release()
            if log_f:
                log_f.close()
            with self._cond:
                self._running = False

    def _esp32_sender(self):
        fails = 0
        while not self._stop.is_set():
            with self._cond:
                url = (self._cfg.get("esp32_url") or "").strip()
                every = float(self._cfg.get("esp32_every") or 10.0)
                timeout = float(self._cfg.get("esp32_timeout") or 4.0)
            if not url:                       # IP belum diisi -> idle, tidak error
                if self._wait(1.0):
                    break
                continue
            if self._wait(min(every * (2 ** fails), 60.0)):
                break
            with self._cond:
                st = dict(self._stats)
            if not st.get("updated_at") or time.time() - st["updated_at"] > 3 * every + 5:
                continue
            payload = {"healthy": st["healthy_pct"], "stressed": st["stressed_pct"],
                       "critical": st["critical_pct"], "moss": st["moss_pct"],
                       "status": st["status"]}
            try:
                req = urllib.request.Request(
                    url, data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    with self._cond:
                        self._esp32_msg = f"terkirim (HTTP {r.status}) {datetime.now():%H:%M:%S}"
                fails = 0
            except Exception as e:
                fails += 1
                with self._cond:
                    self._esp32_msg = (f"gagal ({type(e).__name__}), coba lagi "
                                       f"{min(every * (2 ** fails), 60):.0f} dtk lagi")