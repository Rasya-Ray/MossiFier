/*
 * ESP32 — Mossifier sensor publisher
 * POST satu baris sensor ke Supabase REST (/rest/v1/devices).
 * Dashboard membaca lewat Realtime INSERT, jadi tidak perlu polling dari client.
 * Kompatibel Arduino IDE 1.8.3+ (library bawaan: WiFi, HTTPClient).
 */

#include <WiFi.h>
#include <HTTPClient.h>

// === KONFIGURASI WI-FI ===
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// === SUPABASE ===
// Sama dengan NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.
// URL tanpa /rest/v1 — path itu ditambahkan di bawah.
// Publishable/anon key AMAN ditanam di firmware yang akan dipublisikan;
// aksesnya dibatasi RLS. JANGAN pernah taruh DATABASE_URL atau service_role key di sini.
const char* supabaseUrl = "https://ujnwgtdvwguebwxnorut.supabase.co";
const char* supabaseKey = "sb_publishable_Z8m_9Kld6vLzO-dsVH5SHQ_ctsCVZXH";

// === DEVICE IDENTIFIER ===
// Harus sama persis dengan device_id yang diisi di sidebar dashboard,
// kalau tidak data tidak akan muncul (dashboard memfilter per device).
String deviceId = "MOSS-ESP32-001";

// Interval kirim ESP32. Boleh diperlambat kalau tidak butuh data terlalu rapat.
const unsigned long sendInterval = 7500;
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  randomSeed(micros());

  Serial.println("Menyiapkan ESP32...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (millis() - lastSend >= sendInterval) {
    lastSend = millis();
    kirimKeSupabase();
  }
}

// Reconnect dengan batas waktu supaya loop tidak menggantung selamanya.
bool pastikanWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.println("WiFi terputus, mencoba reconnect...");
  WiFi.reconnect();
  unsigned long deadline = millis() + 10000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Gagal reconnect, pengiriman dilewati.");
    return false;
  }
  return true;
}

void kirimKeSupabase() {
  if (!pastikanWifi()) return;

  HTTPClient http;

  // Tidak mengirim `id`: devices.id punya default gen_random_uuid() di database.
  // Status dikirim sebagai teks langsung (bukan kode angka), misalnya "Sehat".
  // Ganti nilai di bawah dengan hasil klasifikasi kondisi lumut yang sebenarnya.
  String plantStatus = "Sehat";
  String jsonData = "{\"device_id\":\"" + deviceId + "\",";
  jsonData += "\"status\":\"" + plantStatus + "\",";
  jsonData += "\"air_quality\":" + String(random(0, 500)) + ",";
  jsonData += "\"co2_in\":" + String(random(400, 2000)) + ",";
  jsonData += "\"co2_out\":" + String(random(400, 2000)) + ",";
  jsonData += "\"humidity\":" + String(random(30, 80)) + ",";
  jsonData += "\"brightness\":" + String(random(0, 1000)) + ",";
  jsonData += "\"fan_speed\":" + String(random(0, 100)) + "}";

  Serial.print("Mengirim ke Supabase: ");
  Serial.println(jsonData);

  http.begin(String(supabaseUrl) + "/rest/v1/devices");
  http.setTimeout(10000);
  http.addHeader("apikey", supabaseKey);
  // Perhatikan String(...) — "Bearer " + const char* itu pointer arithmetic di C++.
  http.addHeader("Authorization", String("Bearer ") + supabaseKey);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  int httpCode = http.POST(jsonData);

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.printf("HTTP code: %d\nResponse: %s\n", httpCode, payload.c_str());
    if (httpCode == 201) {
      Serial.println("Data berhasil disimpan ke tabel devices.");
    } else {
      Serial.println("Pengiriman ditolak — cek RLS/key/format payload.");
    }
  } else {
    Serial.print("Error HTTP request: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();

  Serial.print("Kirim berikutnya dalam ");
  Serial.print(sendInterval / 1000);
  Serial.println(" detik.");
}
