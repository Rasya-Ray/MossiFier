/*
 * ESP32 — Mossifier sensor publisher (schema device baru)
 *
 * 1. setup()  → panggil RPC register_device(p_mac) supaya baris devices ada.
 * 2. loop()   → panggil RPC insert_sensor(...) tiap interval.
 *
 * Semua akses lewat RPC security definer + RLS: firmware cukup memakai
 * publishable key. JANGAN pernah taruh DATABASE_URL / service_role key di sini.
 *
 * Kompatibel Arduino IDE 1.8.3+ (library bawaan: WiFi, HTTPClient).
 * Kalau nama parameter RPC di SQL-mu berbeda, sesuaikan blok JSON di bawah.
 */

#include <WiFi.h>
#include <HTTPClient.h>

// === KONFIGURASI WI-FI ===
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// === SUPABASE ===
// Sama dengan NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.
const char* supabaseUrl = "https://ujnwgtdvwguebwxnorut.supabase.co";
const char* supabaseKey = "sb_publishable_Z8m_9Kld6vLzO-dsVH5SHQ_ctsCVZXH";

// === IDENTITAS DEVICE ===
// Dibentuk otomatis saat boot: "MOSS-" + MAC 12 hex huruf besar tanpa titik dua,
// mis. MOSS-B0A7322B0960. ID ini dicetak di Serial Monitor — masukkan persis
// itu di dashboard (sidebar → Tambah/Ganti device).
String deviceId = "";

String buatDeviceId() {
  String mac = WiFi.macAddress();   // "B0:A7:32:2B:09:60"
  mac.replace(":", "");
  mac.toUpperCase();
  return "MOSS-" + mac;
}

// Interval kirim sensor. Dashboard memuat ulang data tiap ~10 detik.
const unsigned long sendInterval = 7500;
unsigned long lastSend = 0;
bool deviceRegistered = false;

void setup() {
  Serial.begin(115200);
  randomSeed(micros());

  Serial.println("Menyiapkan ESP32...");
  WiFi.mode(WIFI_STA);              // MAC baru terbaca benar setelah mode STA
  deviceId = buatDeviceId();
  Serial.println("ID device: " + deviceId);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  registerDevice();
}

void loop() {
  if (!pastikanWifi()) return;

  // Kalau register gagal (sinyal lemah / DB sibuk), coba lagi sebelum kirim.
  if (!deviceRegistered) {
    registerDevice();
    if (!deviceRegistered) {
      delay(2000);
      return;
    }
  }

  if (millis() - lastSend >= sendInterval) {
    lastSend = millis();
    kirimSensor();
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

void siapkanHeader(HTTPClient& http) {
  http.setTimeout(10000);
  http.addHeader("apikey", supabaseKey);
  // String(...) penting — "Bearer " + const char* itu pointer arithmetic di C++.
  http.addHeader("Authorization", String("Bearer ") + supabaseKey);
  http.addHeader("Content-Type", "application/json");
}

/** RPC register_device(p_mac TEXT, isinya ID MOSS-xxxxxxxxxxxx) — idempotent, aman dipanggil berulang. */
void registerDevice() {
  if (!pastikanWifi()) return;

  HTTPClient http;
  http.begin(String(supabaseUrl) + "/rest/v1/rpc/register_device");
  siapkanHeader(http);

  String body = "{\"p_mac\":\"" + deviceId + "\"}";
  int code = http.POST(body);
  String payload = http.getString();

  if (code >= 200 && code < 300) {
    deviceRegistered = true;
    Serial.println("Device terdaftar: " + deviceId);
  } else {
    Serial.printf("register_device gagal (%d): %s\n", code, payload.c_str());
  }
  http.end();
}

/** RPC insert_sensor(...) — satu baris = satu kiriman (riwayat). */
void kirimSensor() {
  HTTPClient http;
  http.begin(String(supabaseUrl) + "/rest/v1/rpc/insert_sensor");
  siapkanHeader(http);

  // === CONTOH NILAI ===
  // Ganti bagian ini dengan pembacaan sensor / hasil klasifikasi aslimu.
  int plantStatus = random(0, 3);                 // 0=Sehat, 1=Sakit, 2=Mati
  float soilMoisture = random(60, 96);            // persen
  int mq1 = random(0, 500);
  int mq2 = random(0, 500);
  int pm1 = random(0, 80);
  int pm25 = random(0, 150);
  int pm10 = random(0, 250);
  bool pump = random(0, 2) == 1;
  float fan = random(0, 101);                     // persen 0..100
  float led = random(0, 101);                     // persen 0..100

  String body = "{";
  body += "\"p_mac\":\"" + deviceId + "\",";
  body += "\"p_plant_status\":" + String(plantStatus) + ",";
  body += "\"p_soil_moisture\":" + String(soilMoisture, 1) + ",";
  body += "\"p_mq135_1\":" + String(mq1) + ",";
  body += "\"p_mq135_2\":" + String(mq2) + ",";
  body += "\"p_pm1\":" + String(pm1) + ",";
  body += "\"p_pm25\":" + String(pm25) + ",";
  body += "\"p_pm10\":" + String(pm10) + ",";
  body += "\"p_pump\":" + String(pump ? "true" : "false") + ",";
  body += "\"p_fan\":" + String(fan, 1) + ",";
  body += "\"p_led\":" + String(led, 1);
  body += "}";

  int code = http.POST(body);
  String payload = http.getString();

  if (code >= 200 && code < 300) {
    Serial.println("Sensor terkirim.");
  } else {
    Serial.printf("insert_sensor gagal (%d): %s\n", code, payload.c_str());
    // 404 di sini biasanya berarti parameter RPC belum cocok — cek SQL.
    if (code == 404 || code == 400) {
      Serial.println("Body: " + body);
    }
  }
  http.end();
}
