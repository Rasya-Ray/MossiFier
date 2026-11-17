"""
api.py - REST API Mossifier untuk dashboard React.
Jalankan: uvicorn api:app --port 8000
"""
import asyncio, base64, csv, json, os, socket, urllib.error, urllib.request
from pathlib import Path
from urllib.parse import urlparse

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import grid_core as gc
from engine import DEFAULT_CONFIG, MossEngine

BASE = Path(__file__).parent
CONFIG_PATH = BASE / "config.json"
PARAMS_PATH = BASE / "grid_params.json"
FRONTEND_DIST = BASE / "frontend" / "dist"

engine = MossEngine(str(PARAMS_PATH))

app = FastAPI(title="Mossifier API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)


class ConfigModel(BaseModel):
    camera: str | None = None
    interval: float | None = None
    esp32_url: str | None = None
    esp32_every: float | None = None
    esp32_timeout: float | None = None
    fps: float | None = None
    smooth: int | None = None
    log: str | None = None


class TestUrl(BaseModel):
    url: str


def load_config():
    if CONFIG_PATH.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(CONFIG_PATH.read_text(encoding="utf-8"))}
        except Exception:
            pass
    return dict(DEFAULT_CONFIG)


def save_config(patch):
    data = load_config()
    data.update(patch)
    CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------- status & kontrol ----------------
@app.get("/api/status")
def status():
    return engine.status()


@app.get("/api/config")
def get_config():
    return {"config": load_config()}


@app.post("/api/start")
def start(cfg: ConfigModel | None = None):
    if engine.running:
        raise HTTPException(409, "Mesin sudah berjalan")
    data = {k: v for k, v in (cfg.model_dump() if cfg else {}).items() if v is not None}
    merged = {**load_config(), **data}
    save_config(merged)
    return engine.start(merged)


@app.post("/api/stop")
def stop():
    return engine.stop()


@app.patch("/api/config")
def patch_config(cfg: ConfigModel):
    data = {k: v for k, v in cfg.model_dump().items() if v is not None}
    save_config(data)
    return engine.update_config(data)


# ---------------- video ----------------
@app.get("/api/stream.mjpg")
async def stream(request: Request):
    async def gen():
        last = -1
        while True:
            if await request.is_disconnected():
                break
            jpeg, last = engine.wait_frame(last, timeout=1.0)
            if jpeg is None:
                await asyncio.sleep(0.1)
                continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                   + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/snapshot")
def snapshot():
    jpeg, _ = engine.wait_frame(-1, timeout=0.5)
    if jpeg is None:
        raise HTTPException(503, "belum ada frame")
    return StreamingResponse(iter([jpeg]), media_type="image/jpeg")


@app.get("/api/cameras")
def cameras(max_index: int = 4):
    """Probe kamera 0..max_index. Lambat di Windows (~1-2 dtk per index)."""
    found = []
    for i in range(max_index + 1):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(i)
        ok = cap.isOpened()
        cap.release()
        if ok:
            found.append({"index": i, "label": f"Kamera {i}" + (" (bawaan)" if i == 0 else "")})
    return {"cameras": found}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """Pengganti tab Gradio: unggah 1 foto, balikan gambar ber-grid + ringkasan."""
    data = await file.read()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Gambar tidak bisa dibaca")
    res = gc.analyze_frame(img, engine.params)
    out = gc.draw_grid(res["frame"], res["cls"], res["status"])
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return {
        "image": "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode(),
        "summary": gc.text_summary(res),
        "counts": res["counts"],
        "status": res["status"],
    }


# ---------------- ESP32 ----------------
@app.post("/api/esp32/test")
def esp32_test(body: TestUrl):
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL kosong")
    if not url.startswith("http"):
        url = "http://" + url
    u = urlparse(url)
    host, port = u.hostname, u.port or 80
    steps = []
    try:
        socket.create_connection((host, port), timeout=4).close()
        steps.append({"ok": True, "msg": f"TCP ke {host}:{port} OK"})
    except Exception as e:
        steps.append({"ok": False, "msg": f"TCP gagal ({type(e).__name__}): IP salah, ESP32 mati, "
                                          "beda Wi-Fi, atau client isolation"})
        return {"ok": False, "steps": steps}

    payload = {"healthy": 70.0, "stressed": 20.0, "critical": 10.0,
               "moss": 100.0, "status": "tes"}
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as r:
            body_txt = r.read(200).decode(errors="replace")
        steps.append({"ok": True, "msg": f"POST OK (HTTP {r.status}): {body_txt}"})
        return {"ok": True, "steps": steps}
    except urllib.error.HTTPError as e:
        steps.append({"ok": False, "msg": f"HTTP {e.code}" + (
            " - endpoint tidak ditangani firmware ESP32" if e.code == 404 else "")})
    except Exception as e:
        steps.append({"ok": False, "msg": f"{type(e).__name__}: {e}"})
    return {"ok": False, "steps": steps}


# ---------------- riwayat & parameter ----------------
@app.get("/api/history")
def history(limit: int = 200):
    path = BASE / (engine.status()["config"].get("log") or "live_log.csv")
    if not path.exists():
        return {"rows": []}
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return {"rows": rows[-limit:]}


@app.get("/api/params")
def get_params():
    return {"params": engine.params}


@app.put("/api/params")
def put_params(body: dict):
    raw = {}
    if PARAMS_PATH.exists():
        raw = json.loads(PARAMS_PATH.read_text(encoding="utf-8"))
    current = dict(raw.get("params", raw))
    current.update({k: v for k, v in (body or {}).items() if k in gc.DEFAULT_PARAMS})
    raw["params"] = current
    PARAMS_PATH.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    engine.params = gc.load_params(str(PARAMS_PATH))
    return {"params": engine.params}


# ---------------- serve React (produksi) ----------------
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="ui")