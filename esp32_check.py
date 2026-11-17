"""
esp32_check.py - Cek apakah laptop bisa menjangkau ESP32 dan endpoint-nya.

Cara pakai:
    py esp32_check.py http://10.20.219.29/vision

Yang dicek berurutan:
  1. Sambungan TCP ke ESP32 (alamat IP dan port)
  2. Kirim data contoh (POST JSON) ke URL itu
Hasilnya disertai penjelasan kemungkinan penyebab kalau gagal.
"""

import json
import socket
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

if len(sys.argv) < 2:
    sys.exit("Pakai: py esp32_check.py http://IP-ESP32/vision")

url = sys.argv[1]
u = urlparse(url)
host, port = u.hostname, u.port or 80
print(f"Target: {host}  port {port}  path {u.path or '/'}")

print("\n[1] Menyambung ke ESP32 (maks 4 detik)...")
try:
    socket.create_connection((host, port), timeout=4).close()
    print("    OK: ESP32 terjangkau dan ada yang mendengarkan di port itu.")
except socket.timeout:
    sys.exit("    TIMEOUT: tidak ada balasan sama sekali. Penyebab umum: IP salah atau berubah, "
             "ESP32 mati/belum konek Wi-Fi, laptop dan ESP32 beda jaringan, atau Wi-Fi memblokir "
             "komunikasi antar-perangkat (client isolation).")
except ConnectionRefusedError:
    sys.exit("    DITOLAK: ESP32 terjangkau, tapi tidak ada web server di port itu. "
             "Program di ESP32 belum menjalankan server HTTP.")
except OSError as e:
    sys.exit(f"    GAGAL: {e}. Biasanya jaringan tidak bisa menuju IP itu (beda subnet atau VPN aktif).")

print("\n[2] Mengirim data contoh (POST JSON)...")
payload = {"healthy": 70.0, "stressed": 20.0, "critical": 10.0, "status": "tes"}
req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                             headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=4) as r:
        print(f"    OK: HTTP {r.status}. Balasan ESP32: {r.read(200)!r}")
except urllib.error.HTTPError as e:
    print(f"    ESP32 menjawab HTTP {e.code}. "
          + ("Endpoint tidak ditemukan: program ESP32 belum punya penanganan untuk path ini."
             if e.code == 404 else "Server ada, tapi menolak atau error saat memproses data."))
except Exception as e:
    print(f"    Terkirim tapi tidak ada jawaban yang valid: {type(e).__name__}: {e}")