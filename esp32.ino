#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>
#include "esp_adc_cal.h"

// ==================================================
// PIN
// ==================================================

#define PUMP_RELAY_PIN 13
#define FAN_MOSFET_PIN 14
#define LED_MOSFET_PIN 18
#define SOIL_SENSOR_PIN 32
#define MQ135_1_PIN 33
#define MQ135_2_PIN 34
#define PMS_RX_PIN 16
#define PMS_TX_PIN 17

// Relay active LOW
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==================================================
// WIFI + SUPABASE
// ==================================================

const char* WIFI_SSID = "Ga modal";
const char* WIFI_PASSWORD = "Atuampe8";

const char* SUPABASE_URL = "https://ujnwgtdvwguebwxnorut.supabase.co";
const char* SUPABASE_KEY = "sb_publishable_Z8m_9Kld6vLzO-dsVH5SHQ_ctsCVZXH";
const char* SUPABASE_TABLE = "/rest/v1/devices";

#define SUPABASE_INTERVAL_MS 8000UL
#define WIFI_RETRY_INTERVAL 10000UL

unsigned long lastSupabaseUpload = 0;
unsigned long lastWifiAttempt = 0;
bool firstUpload = true;
bool clockSynced = false;

WebServer server(80);
WiFiClientSecure secureClient;

// ROOT CA - GTS ROOT R4
const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIICCjCCAZGgAwIBAgIQbkepyIuUtui7OyrYorLBmTAKBggqhkjOPQQDAzBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQA
IgNiAATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzu
hXyiQHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/l
xKvRHYqjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1Ud
DgQWBBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNnADBkAjBqUFJ0
CMRw3J5QdCHojXohw0+WbhXRIjVhLfoIN+4Zba3bssx9BzT1YBkstTTZbyACMANx
sbqjYAuG7ZoIapVon+Kz4ZNkfF6Tpt95LY2F45TPI11xzPKwTdb+mciUqXWi4w==
-----END CERTIFICATE-----
)EOF";

String getDeviceID() {
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return "MOSS-" + mac;
}

// ==================================================
// KALIBRASI & AMBANG BATAS
// ==================================================

const int SOIL_DRY = 3000;
const int SOIL_WET = 1200;

#define MQ_VCC 5.0f
#define MQ_RL_KOHM 1.0f
#define DIVIDER_RATIO 1.0f
const float MQ135_1_R0 = 9.3f;
const float MQ135_2_R0 = 9.3f;
const float PARA = 116.6020682f;
const float PARB = 2.769034857f;
const float SMOOTH = 0.1f;

const float AIR_CO2_UNSAFE_PPM = 10000.0f;  // CO2 di atas ini = tidak aman
const float AIR_PM25_UNSAFE = 28.0f;        // PM2.5 (ug/m3) di atas ini = tidak aman
const float SOIL_DRY_PCT = 35.0f;          // tanah di bawah ini = kering
const float SOIL_CRITICAL_PCT = 20.0f;     // tanah di bawah ini = sangat kering

#define SENSOR_INTERVAL_MS 2000UL
#define VISION_TIMEOUT_MS 15000UL
#define PUMP_PULSE_MS 15000UL
#define PUMP_COOLDOWN_MS 30000UL

#define FAN_PWM_CHANNEL 0
#define LED_PWM_CHANNEL 1
#define PWM_FREQUENCY 5000
#define PWM_RESOLUTION 8

// ==================================================
// STATE
// ==================================================

struct SensorData {
    float soil;          // %
    bool soilOk;
    float ppm1, ppm2;    // CO2 per sensor (smoothed)
    float co2;           // rata-rata
    bool co2Ok;
    float pm1, pm25, pm10;
    bool pmsOk;
    unsigned long pmsTime;
} sensorData = {};

float healthy = 0, stressed = 0, critical = 0;
bool visionReceived = false;
unsigned long lastVisionUpdate = 0;

bool pumpState = false;
float fanLevel = 0, ledLevel = 0;
unsigned long lastPumpStarted = 0;
unsigned long lastPumpStopped = 0;
unsigned long lastSensorSample = 0;

esp_adc_cal_characteristics_t adcChars;

const char* STATUS_NAME[3] = {"HEALTHY", "STRESSED", "CRITICAL"};

// ==================================================
// NTP + WIFI
// ==================================================

void syncClock() {
    if (WiFi.status() != WL_CONNECTED) {
        clockSynced = false;
        return;
    }
    Serial.println("[NTP] Sync...");
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    time_t now = time(nullptr);
    unsigned long start = millis();
    while (now < 1700000000 && millis() - start < 15000) {
        delay(500);
        now = time(nullptr);
    }
    clockSynced = (now >= 1700000000);
    Serial.println(clockSynced ? "[NTP] OK" : "[NTP] FAILED");
}

void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("[WIFI] Connecting");
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 20000) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WIFI] IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("[WIFI] Device ID: ");
        Serial.println(getDeviceID());
    } else {
        Serial.println("[WIFI] Gagal connect");
    }
}

bool ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;
    Serial.println("[WIFI] Reconnecting...");
    WiFi.reconnect();
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) delay(250);
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WIFI] Terhubung lagi, IP: ");
        Serial.println(WiFi.localIP());
        return true;
    }
    return false;
}

// ==================================================
// SENSOR
// ==================================================

float readRs(int pin) {
    uint32_t total = 0;
    for (int i = 0; i < 64; i++) total += analogRead(pin);
    float mv = (float)esp_adc_cal_raw_to_voltage(total / 64, &adcChars);
    if (mv < 100.0f) return -1.0f;
    float v = (mv / 1000.0f) * DIVIDER_RATIO;
    if (v >= MQ_VCC - 0.05f) return -1.0f;
    return MQ_RL_KOHM * (MQ_VCC - v) / v;
}

float readAirPPM(int pin, float r0, float &smooth) {
    float rs = readRs(pin);
    if (rs <= 0.0f) return -1.0f;
    float ppm = constrain(PARA * pow(rs / r0, -PARB), 0.0f, 50000.0f);
    smooth = (smooth < 0.0f) ? ppm : (1.0f - SMOOTH) * smooth + SMOOTH * ppm;
    return smooth;
}

void readSoil() {
    long total = 0;
    for (int i = 0; i < 10; i++) total += analogRead(SOIL_SENSOR_PIN);
    int raw = total / 10;
    sensorData.soilOk = raw > 10 && raw < 4085;
    if (!sensorData.soilOk) {
        sensorData.soil = 0;
        return;
    }
    sensorData.soil = constrain((float)(SOIL_DRY - raw) * 100.0f / (SOIL_DRY - SOIL_WET), 0.0f, 100.0f);
}

float smooth1 = -1.0f, smooth2 = -1.0f;

void readMQ135() {
    sensorData.ppm1 = readAirPPM(MQ135_1_PIN, MQ135_1_R0, smooth1);
    sensorData.ppm2 = readAirPPM(MQ135_2_PIN, MQ135_2_R0, smooth2);
    bool v1 = sensorData.ppm1 >= 0, v2 = sensorData.ppm2 >= 0;
    sensorData.co2Ok = v1 || v2;
    if (v1 && v2) sensorData.co2 = (sensorData.ppm1 + sensorData.ppm2) / 2.0f;
    else if (v1) sensorData.co2 = sensorData.ppm1;
    else if (v2) sensorData.co2 = sensorData.ppm2;
    else sensorData.co2 = -1.0f;
}

uint8_t pmsBuf[32];
int pmsIdx = 0;

void readPMS5003() {
    while (Serial2.available()) {
        uint8_t d = (uint8_t)Serial2.read();

        if (pmsIdx == 0 && d != 0x42) continue;
        if (pmsIdx == 1 && d != 0x4D) {
            pmsIdx = 0;
            if (d == 0x42) pmsBuf[pmsIdx++] = d;
            continue;
        }

        pmsBuf[pmsIdx++] = d;
        if (pmsIdx < 32) continue;
        pmsIdx = 0;

        uint16_t sum = 0;
        for (int i = 0; i < 30; i++) sum += pmsBuf[i];
        if ((((uint16_t)pmsBuf[2] << 8) | pmsBuf[3]) != 28 ||
            sum != (((uint16_t)pmsBuf[30] << 8) | pmsBuf[31])) continue;

        float a = (float)(((uint16_t)pmsBuf[10] << 8) | pmsBuf[11]);
        float b = (float)(((uint16_t)pmsBuf[12] << 8) | pmsBuf[13]);
        float c = (float)(((uint16_t)pmsBuf[14] << 8) | pmsBuf[15]);

        if (!sensorData.pmsOk) {
            sensorData.pm1 = a; sensorData.pm25 = b; sensorData.pm10 = c;
        } else {  // smoothing ringan
            sensorData.pm1  = 0.8f * sensorData.pm1  + 0.2f * a;
            sensorData.pm25 = 0.8f * sensorData.pm25 + 0.2f * b;
            sensorData.pm10 = 0.8f * sensorData.pm10 + 0.2f * c;
        }
        sensorData.pmsOk = true;
        sensorData.pmsTime = millis();
    }

    if (sensorData.pmsOk && millis() - sensorData.pmsTime > 5000UL) {
        sensorData.pmsOk = false;
    }
}

// ==================================================
// AKTUATOR
// ==================================================

void setPump(bool on) {
    if (pumpState == on) return;
    pumpState = on;
    digitalWrite(PUMP_RELAY_PIN, on ? RELAY_ON : RELAY_OFF);
    if (on) lastPumpStarted = millis();
    else lastPumpStopped = millis();
}

void setFan(float pct) {
    fanLevel = constrain(pct, 0.0f, 100.0f);
    ledcWrite(FAN_PWM_CHANNEL, (uint8_t)roundf(fanLevel * 255.0f / 100.0f));
}

void setLED(float pct) {
    ledLevel = constrain(pct, 0.0f, 100.0f);
    ledcWrite(LED_PWM_CHANNEL, (uint8_t)roundf(ledLevel * 255.0f / 100.0f));
}

void servicePumpPulse() {
    if (pumpState && millis() - lastPumpStarted >= PUMP_PULSE_MS) setPump(false);
}

// ==================================================
// EDGE AI (fusi vision + semua sensor)
//
// Tiap siklus, tiga sumber dinilai sendiri-sendiri:
//   vision : HEALTHY(0) / STRESSED(1) / CRITICAL(2)   (0 jika vision tidak aktif)
//   tanah  : >=35% OK(0) | <35% kering(1) | <20% sangat kering(2)
//   udara  : jumlah yang tidak aman dari CO2 > 10000 ppm & PM2.5 > 28 (0/1/2)
//
// care = max(vision, tanah)  -> menentukan LED & ambang pompa
//
//   care      LED   Fan dasar   Pompa nyala jika tanah <
//   HEALTHY   60%   30%         35%
//   STRESSED  80%   50%         40%
//   CRITICAL  100%  70%         45%
//
// Fan: udara 1 tidak aman -> min 70% | udara 2 tidak aman -> 100%
//      udara aman tapi tanah kering -> maks 30% (kurangi penguapan)
//
// Tanah kering tetap disiram walau vision tidak ada / bilang HEALTHY.
// ==================================================

bool visionFresh() {
    return visionReceived && millis() - lastVisionUpdate < VISION_TIMEOUT_MS;
}

int plantLevel() {
    if (healthy >= stressed && healthy >= critical) return 0;
    if (stressed >= critical) return 1;
    return 2;
}

void applyCareDecision() {
    static const float LED_PCT[3]  = {60, 80, 100};
    static const float FAN_BASE[3] = {30, 50, 70};
    static const float SOIL_MIN[3] = {35, 40, 45};

    // --- baca kondisi dari tiap sumber ---
    bool vision = visionFresh();
    int vLv = vision ? plantLevel() : 0;

    int soilLv = 0;
    if (sensorData.soilOk) {
        if (sensorData.soil < SOIL_CRITICAL_PCT) soilLv = 2;
        else if (sensorData.soil < SOIL_DRY_PCT) soilLv = 1;
    }

    bool co2Bad = sensorData.co2Ok && sensorData.co2 > AIR_CO2_UNSAFE_PPM;
    bool pmBad = sensorData.pmsOk && sensorData.pm25 > AIR_PM25_UNSAFE;
    int airLv = (co2Bad ? 1 : 0) + (pmBad ? 1 : 0);

    // --- gabungkan ---
    int care = max(vLv, soilLv);

    // --- aktuator ---
    setLED(LED_PCT[care]);

    float fan = FAN_BASE[care];
    if (airLv == 2) fan = 100;
    else if (airLv == 1) fan = fmaxf(fan, 70);
    else if (soilLv >= 1) fan = fminf(fan, 30);
    setFan(fan);

    bool cooldownOk = lastPumpStopped == 0 || millis() - lastPumpStopped >= PUMP_COOLDOWN_MS;
    if (sensorData.soilOk && sensorData.soil < SOIL_MIN[care] && !pumpState && cooldownOk) {
        setPump(true);
    }

    Serial.printf("[EDGE AI] vision=%s soil=%s air=%s -> care=%s | fan=%.0f%% led=%.0f%% pump=%s\n",
                  vision ? STATUS_NAME[vLv] : "NO_VISION",
                  soilLv == 0 ? "OK" : (soilLv == 1 ? "DRY" : "VERY_DRY"),
                  airLv == 0 ? "SAFE" : (airLv == 1 ? "WARN" : "UNSAFE"),
                  STATUS_NAME[care], fanLevel, ledLevel, pumpState ? "ON" : "OFF");
}

// ==================================================
// SERIAL MONITOR OUTPUT
// ==================================================

void printSensors() {
    Serial.printf("[SENSOR] soil=%.1f%% | co2=%.0fppm (%.0f/%.0f) | pm1=%.1f pm25=%.1f pm10=%.1f\n",
                  sensorData.soil, sensorData.co2, sensorData.ppm1, sensorData.ppm2,
                  sensorData.pm1, sensorData.pm25, sensorData.pm10);
}

// ==================================================
// VISION (HTTP POST /vision)
// ==================================================

void handleVisionPost() {
    StaticJsonDocument<256> doc;

    if (deserializeJson(doc, server.arg("plain"))) {
        server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        return;
    }

    if (doc["healthy"].isNull() || doc["stressed"].isNull() || doc["critical"].isNull()) {
        server.send(400, "application/json", "{\"error\":\"Missing data\"}");
        return;
    }

    float h = doc["healthy"].as<float>();
    float s = doc["stressed"].as<float>();
    float c = doc["critical"].as<float>();

    if (h < 0 || h > 100 || s < 0 || s > 100 || c < 0 || c > 100) {
        server.send(400, "application/json", "{\"error\":\"Invalid percentage\"}");
        return;
    }

    healthy = h;
    stressed = s;
    critical = c;
    visionReceived = true;
    lastVisionUpdate = millis();

    Serial.printf("[VISION] H=%.1f S=%.1f C=%.1f -> %s\n", h, s, c, STATUS_NAME[plantLevel()]);

    applyCareDecision();  // langsung bereaksi

    server.send(200, "application/json", "{\"received\":true}");
}

// ==================================================
// SUPABASE UPLOAD
// ==================================================

String numOrNull(bool ok, float v) {
    return ok ? String((int)roundf(v)) : String("null");
}

void uploadSupabase() {
    if (!ensureWiFi()) return;

    if (!clockSynced) {
        syncClock();
        if (!clockSynced) return;
    }

    String json = "{\"device_id\":\"" + getDeviceID() + "\",";

    if (visionFresh()) json += "\"status\":\"" + String(STATUS_NAME[plantLevel()]) + "\",";
    else json += "\"status\":null,";

    json += "\"pm1\":" + numOrNull(sensorData.pmsOk, sensorData.pm1) + ",";
    json += "\"pm25\":" + numOrNull(sensorData.pmsOk, sensorData.pm25) + ",";
    json += "\"pm10\":" + numOrNull(sensorData.pmsOk, sensorData.pm10) + ",";

    json += "\"pump_status\":" + String(pumpState ? "true" : "false") + ",";

    json += "\"co2_in\":null,";
    json += "\"co2_out\":null,";
    json += "\"humidity\":null,";
    json += "\"brightness\":null,";
    json += "\"fan_speed\":null}";

    Serial.print("[UPLOAD] ");
    Serial.println(json);

    HTTPClient http;
    if (!http.begin(secureClient, String(SUPABASE_URL) + SUPABASE_TABLE)) {
        Serial.println("[UPLOAD] HTTP begin failed");
        return;
    }

    http.setTimeout(15000);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal");

    int code = http.POST(json);

    if (code == 201 || code == 204) {
        Serial.println("[UPLOAD] OK");
    } else if (code > 0) {
        Serial.printf("[UPLOAD] FAILED %d: %s\n", code, http.getString().c_str());
    } else {
        Serial.printf("[UPLOAD] ERROR: %s\n", http.errorToString(code).c_str());
    }

    http.end();
}

// ==================================================
// WEB SERVER
// ==================================================

void initWebServer() {
    server.on("/", HTTP_GET, []() {
        String r = "MOSSIFIER ESP32 ONLINE\nIP: " + WiFi.localIP().toString() +
                   "\nDEVICE ID: " + getDeviceID();
        server.send(200, "text/plain", r);
    });

    server.on("/vision", HTTP_POST, handleVisionPost);

    server.onNotFound([]() {
        server.send(404, "application/json", "{\"error\":\"Endpoint not found\"}");
    });

    server.begin();
    Serial.println("[SERVER] Started");
}

// ==================================================
// SETUP
// ==================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== MOSSIFIER ESP32 ===");

    // Aktuator
    digitalWrite(PUMP_RELAY_PIN, RELAY_OFF);
    pinMode(PUMP_RELAY_PIN, OUTPUT);
    ledcSetup(FAN_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcSetup(LED_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcAttachPin(FAN_MOSFET_PIN, FAN_PWM_CHANNEL);
    ledcAttachPin(LED_MOSFET_PIN, LED_PWM_CHANNEL);
    setFan(0);
    setLED(0);

    // ADC
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 1100, &adcChars);
    pinMode(SOIL_SENSOR_PIN, INPUT);
    pinMode(MQ135_1_PIN, INPUT);
    pinMode(MQ135_2_PIN, INPUT);

    // PMS5003
    Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);

    // Network
    connectWiFi();
    if (WiFi.status() == WL_CONNECTED) syncClock();
    secureClient.setCACert(ROOT_CA);
    initWebServer();

    Serial.println("[READY] Sistem berjalan.");
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[READY] Terhubung WiFi, IP: ");
        Serial.println(WiFi.localIP());
    }
}

// ==================================================
// LOOP
// ==================================================

void loop() {
    server.handleClient();
    readPMS5003();
    servicePumpPulse();

    // Baca semua sensor -> Edge AI -> aktuator
    if (lastSensorSample == 0 || millis() - lastSensorSample >= SENSOR_INTERVAL_MS) {
        lastSensorSample = millis();
        readSoil();
        readMQ135();
        readPMS5003();
        applyCareDecision();
        printSensors();
    }

    // WiFi + upload
    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWifiAttempt >= WIFI_RETRY_INTERVAL) {
            lastWifiAttempt = millis();
            ensureWiFi();
        }
    } else if (firstUpload || millis() - lastSupabaseUpload >= SUPABASE_INTERVAL_MS) {
        uploadSupabase();
        lastSupabaseUpload = millis();
        firstUpload = false;
    }
}