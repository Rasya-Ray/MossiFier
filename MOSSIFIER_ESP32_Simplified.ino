#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <math.h>
#include "esp_adc_cal.h"
#include "esp_system.h"

// ==================================================
// MOSSIFIER ESP32 - SIMPLIFIED BOOT / NO MANUAL FREERTOS QUEUE
// Pin, sensor, dan aktuator sama persis dengan uji.ino (sudah teruji works)
// ==================================================

// ==================================================
// PIN CONFIGURATION (sama dengan uji.ino)
// ==================================================

#define PUMP_RELAY_PIN 13
#define FAN_MOSFET_PIN 14
#define LED_MOSFET_PIN 18

#define SOIL_SENSOR_PIN 32

#define MQ135_1_PIN 33
#define MQ135_2_PIN 34

#define PMS_RX_PIN 16
#define PMS_TX_PIN 17

// ==================================================
// HARDCODED WIFI CONFIGURATION
// ==================================================

const char* WIFI_SSID = "your_wifi_ssid_here";
const char* WIFI_PASSWORD = "your_wifi_password_here";

// ==================================================
// SUPABASE RPC CONFIGURATION
// ==================================================

const char* SUPABASE_URL = "https://ujnwgtdvwguebwxnorut.supabase.co";
const char* SUPABASE_KEY = "sb_publishable_Z8m_9Kld6vLzO-dsVH5SHQ_ctsCVZXH";

const char* RPC_REGISTER_DEVICE = "/rest/v1/rpc/register_device";
const char* RPC_INSERT_SENSOR = "/rest/v1/rpc/insert_sensor";

bool deviceRegistered = false;

// ==================================================
// CALIBRATION (sama dengan uji.ino)
// ==================================================

const int SOIL_DRY = 3000;
const int SOIL_WET = 1200;

float MQ135_1_R0 = 9.3f;
float MQ135_2_R0 = 9.3f;
const float MQ_VCC = 5.0f;
const float MQ_RL_KOHM = 1.0f;
const float DIVIDER_RATIO = 1.0f;
const float PARA = 116.6020682f;
const float PARB = 2.769034857f;
#define MQ135_WARMUP_MS 180000UL
const float SMOOTH = 0.1f;

esp_adc_cal_characteristics_t adcChars1;
esp_adc_cal_characteristics_t adcChars2;

const float AIR_CO2_UNSAFE_PPM  = 10000.0f;  // CO2 setara di atas ini = tidak aman
const float AIR_PM1_UNSAFE_UGM3 = 55.5f;     // PM1 di atas ini = tidak aman
const float AIR_PM25_UNSAFE_UGM3 = 55.0f;    // PM2.5 di atas ini = tidak aman
const float AIR_PM10_UNSAFE_UGM3 = 75.0f;    // PM10 di atas ini = tidak aman

#define SENSOR_INTERVAL_MS 2000UL
#define VISION_TIMEOUT_MS 15000UL
#define PUMP_PULSE_MS 15000UL     // pompa nyala 15 detik saat ON
#define FAN_PWM_CHANNEL 0
#define LED_PWM_CHANNEL 1
#define PWM_FREQUENCY 5000
#define PWM_RESOLUTION 8
#define PWM_MAX 255

const float SOIL_DRY_HEALTHY = 35.0f;
const float SOIL_DRY_STRESSED = 40.0f;
const float SOIL_DRY_CRITICAL = 45.0f;

const float TEST_FAN_PERCENT = 60.0f;
const float TEST_LED_PERCENT = 100.0f;

// ==================================================
// GLOBAL STATE
// ==================================================

unsigned long lastSensorSample = 0;
// WiFi reconnect otomatis sengaja tidak digunakan: koneksi dicoba sekali saat boot.
unsigned long lastVisionUpdate = 0;
unsigned long lastPumpStarted = 0;
unsigned long lastPumpStopped = 0;
unsigned long lastSupabaseUpload = 0;
bool pumpCooldownActive = false;
bool pendingPumpUpload = false;  // flag upload setelah pompa mati 15 detik

bool pumpState = false;
float fanLevel = 0.0f;
float ledLevel = 0.0f;
bool decisionEnabled = false;

float healthy = 0;
float stressed = 0;
float critical = 0;
float confidence = 0;
int statusCode = 0;
String status = "UNKNOWN";

bool visionReceived = false;
String decisionReason = "Waiting for vision and sensor data";

// RELAY ACTIVE LEVEL
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==================================================
// GLOBAL OBJECTS
// ==================================================

WebServer server(80);
WiFiClientSecure secureClient;


// ==================================================
// DEVICE IDENTIFICATION
// ==================================================

String getMacAddress() {
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return mac;
}

String getDeviceID() {
    return "MOSS-" + getMacAddress();
}

// ==================================================
// WIFI CONNECTION - COBA SEKALI SAAT BOOT
// ==================================================

bool connectWiFi() {
    Serial.println();
    Serial.println("================================");
    Serial.println("       WIFI CONNECTION");
    Serial.println("================================");

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("[WIFI] Connecting");
    const unsigned long startTime = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - startTime < 10000UL) {
        delay(250);
        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WIFI] Connected!");
        Serial.print("[WIFI] IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("[WIFI] MAC: ");
        Serial.println(WiFi.macAddress());
        Serial.println("================================");
        return true;
    }

    Serial.println("[WIFI] Failed. Local mode tetap berjalan.");
    Serial.println("================================");
    WiFi.disconnect(false);
    return false;
}

bool ensureWiFi() {
    return WiFi.status() == WL_CONNECTED;
}

// ==================================================
// ANALOG READ HELPERS (non-blocking)
// ==================================================

int readAnalogAverage(int pin, int samples = 10) {
    uint32_t total = 0;
    for (int i = 0; i < samples; i++) {
        total += analogRead(pin);
        yield();  // yield to other tasks instead of blocking delay
    }
    return (int)(total / samples);
}

bool validAnalogReading(int raw) {
    return raw > 10 && raw < 4085;
}

// ==================================================
// SOIL MOISTURE V2
// ==================================================

struct SensorData {
    int soilRaw;
    float soilMoisture;
    bool soilAvailable;

    int mq135Raw1;
    int mq135Raw2;
    float mq135Rs1;
    float mq135Rs2;
    float mq135Mv1;
    float mq135Mv2;
    float mq135Ppm1;
    float mq135Ppm2;
    float mq135PpmAvg;
    float smoothPpm1;
    float smoothPpm2;
    bool mq135Valid1;
    bool mq135Valid2;
    bool mq135WarmedUp;

    int pm1;
    int pm25;
    int pm10;
    float pm1Average;
    float pm25Average;
    float pm10Average;
    bool pmsAvailable;
    uint8_t pmsAverageCount;
    uint8_t pmsAverageIndex;
    unsigned long pmsLastUpdate;
};

SensorData sensorData = {};
int pmsHistory1[10] = {};
int pmsHistory25[10] = {};
int pmsHistory10[10] = {};

void readSoilMoisture() {
    const int raw = readAnalogAverage(SOIL_SENSOR_PIN, 10);
    sensorData.soilRaw = raw;
    sensorData.soilAvailable = validAnalogReading(raw) && SOIL_DRY != SOIL_WET;

    if (!sensorData.soilAvailable) {
        sensorData.soilMoisture = 0;
        return;
    }

    float moisture = (float)(SOIL_DRY - raw) * 100.0f /
                     (float)(SOIL_DRY - SOIL_WET);
    if (moisture < 0) moisture = 0;
    if (moisture > 100) moisture = 100;
    sensorData.soilMoisture = moisture;
}

// ==================================================
// MQ135 - CO2-EQUIVALENT PPM
// ==================================================

float readRs(int pin, esp_adc_cal_characteristics_t *chars, int &rawOut, float &pinMv) {
    uint32_t total = 0;
    for (int i = 0; i < 64; i++) {
        total += analogRead(pin);
        yield();  // yield to other tasks
    }
    rawOut = (int)(total / 64);
    pinMv = (float)esp_adc_cal_raw_to_voltage(total / 64, chars);

    if (pinMv < 100.0f) return -1.0f;

    float v = (pinMv / 1000.0f) * DIVIDER_RATIO;
    if (v >= MQ_VCC - 0.05f) return -1.0f;

    return MQ_RL_KOHM * (MQ_VCC - v) / v;
}

float readAirPPM(int pin, esp_adc_cal_characteristics_t *chars, float r0,
                 int &rawOut, float &rsOut, float &mvOut, float &smoothPpm) {
    rsOut = readRs(pin, chars, rawOut, mvOut);
    if (rsOut <= 0.0f) return -1.0f;

    float ppm = PARA * pow(rsOut / r0, -PARB);
    ppm = constrain(ppm, 0.0f, 10000.0f);

    smoothPpm = (smoothPpm < 0.0f) ? ppm
                                   : (1.0f - SMOOTH) * smoothPpm + SMOOTH * ppm;
    return smoothPpm;
}

void readMQ135Sensors() {
    sensorData.mq135Ppm1 = readAirPPM(MQ135_1_PIN, &adcChars1, MQ135_1_R0,
        sensorData.mq135Raw1, sensorData.mq135Rs1, sensorData.mq135Mv1, sensorData.smoothPpm1);
    sensorData.mq135Ppm2 = readAirPPM(MQ135_2_PIN, &adcChars2, MQ135_2_R0,
        sensorData.mq135Raw2, sensorData.mq135Rs2, sensorData.mq135Mv2, sensorData.smoothPpm2);

    sensorData.mq135Valid1 = sensorData.mq135Ppm1 >= 0.0f;
    sensorData.mq135Valid2 = sensorData.mq135Ppm2 >= 0.0f;
    sensorData.mq135WarmedUp = millis() >= MQ135_WARMUP_MS;

    if (sensorData.mq135Valid1 && sensorData.mq135Valid2) {
        sensorData.mq135PpmAvg = (sensorData.mq135Ppm1 + sensorData.mq135Ppm2) / 2.0f;
    } else if (sensorData.mq135Valid1) {
        sensorData.mq135PpmAvg = sensorData.mq135Ppm1;
    } else if (sensorData.mq135Valid2) {
        sensorData.mq135PpmAvg = sensorData.mq135Ppm2;
    } else {
        sensorData.mq135PpmAvg = -1.0f;
    }
}

// ==================================================
// PMS5003 (PM1 + PM2.5 + PM10)
// ==================================================

uint8_t pmsBuffer[32];
int pmsIndex = 0;

void readPMS5003() {
    while (Serial2.available()) {
        const uint8_t data = (uint8_t)Serial2.read();

        if (pmsIndex == 0 && data != 0x42) continue;
        if (pmsIndex == 1 && data != 0x4D) {
            pmsIndex = 0;
            if (data == 0x42) pmsBuffer[pmsIndex++] = data;
            continue;
        }

        pmsBuffer[pmsIndex++] = data;
        if (pmsIndex < 32) continue;
        pmsIndex = 0;

        const uint16_t frameLength = ((uint16_t)pmsBuffer[2] << 8) | pmsBuffer[3];
        uint16_t checksum = 0;
        for (int i = 0; i < 30; i++) checksum += pmsBuffer[i];
        const uint16_t receivedChecksum = ((uint16_t)pmsBuffer[30] << 8) | pmsBuffer[31];

        if (frameLength != 28 || checksum != receivedChecksum) continue;

        sensorData.pm1 = ((uint16_t)pmsBuffer[10] << 8) | pmsBuffer[11];
        sensorData.pm25 = ((uint16_t)pmsBuffer[12] << 8) | pmsBuffer[13];
        sensorData.pm10 = ((uint16_t)pmsBuffer[14] << 8) | pmsBuffer[15];

        pmsHistory1[sensorData.pmsAverageIndex] = sensorData.pm1;
        pmsHistory25[sensorData.pmsAverageIndex] = sensorData.pm25;
        pmsHistory10[sensorData.pmsAverageIndex] = sensorData.pm10;
        sensorData.pmsAverageIndex = (sensorData.pmsAverageIndex + 1) % 10;
        if (sensorData.pmsAverageCount < 10) {
            sensorData.pmsAverageCount++;
        }

        uint32_t total1 = 0, total25 = 0, total10 = 0;
        for (uint8_t i = 0; i < sensorData.pmsAverageCount; i++) {
            total1 += pmsHistory1[i];
            total25 += pmsHistory25[i];
            total10 += pmsHistory10[i];
        }
        sensorData.pm1Average = (float)total1 / sensorData.pmsAverageCount;
        sensorData.pm25Average = (float)total25 / sensorData.pmsAverageCount;
        sensorData.pm10Average = (float)total10 / sensorData.pmsAverageCount;
        sensorData.pmsAvailable = true;
        sensorData.pmsLastUpdate = millis();
    }

    if (sensorData.pmsAvailable &&
        millis() - sensorData.pmsLastUpdate > 5000UL) {
        sensorData.pmsAvailable = false;
        sensorData.pmsAverageCount = 0;
        sensorData.pmsAverageIndex = 0;
        sensorData.pm1Average = 0.0f;
        sensorData.pm25Average = 0.0f;
        sensorData.pm10Average = 0.0f;
    }
}

// ==================================================
// ACTUATORS
// ==================================================

void setPump(bool state) {
    if (pumpState == state) return;
    pumpState = state;
    digitalWrite(PUMP_RELAY_PIN, state ? RELAY_ON : RELAY_OFF);
    if (state) {
        lastPumpStarted = millis();
    } else {
        lastPumpStopped = millis();
        pumpCooldownActive = true;
    }
}

void setFan(float percentage) {
    if (percentage < 0.0f) percentage = 0.0f;
    if (percentage > 100.0f) percentage = 100.0f;
    fanLevel = percentage;
    const uint8_t pwm = (uint8_t)roundf(percentage * PWM_MAX / 100.0f);
    ledcWrite(FAN_PWM_CHANNEL, pwm);
}

void setLED(float percentage) {
    if (percentage < 0.0f) percentage = 0.0f;
    if (percentage > 100.0f) percentage = 100.0f;
    ledLevel = percentage;
    const uint8_t pwm = (uint8_t)roundf(percentage * PWM_MAX / 100.0f);
    ledcWrite(LED_PWM_CHANNEL, pwm);
}

// ==================================================
// VISION STATUS
// ==================================================

void updateVisionStatus() {
    if (healthy >= stressed && healthy >= critical) {
        status = "HEALTHY";
        confidence = healthy;
        statusCode = 1;
    } else if (stressed >= healthy && stressed >= critical) {
        status = "STRESSED";
        confidence = stressed;
        statusCode = 2;
    } else {
        status = "CRITICAL";
        confidence = critical;
        statusCode = 3;
    }
}

// ==================================================
// EDGE AI (berdasarkan uji.ino, nested if-else)
// Persentase terbesar menentukan status tanaman, lalu branch sesuai udara aman/tidak aman
// ==================================================

void applyCareDecision() {
    decisionEnabled = visionReceived &&
        (millis() - lastVisionUpdate <= VISION_TIMEOUT_MS);

    if (!decisionEnabled) {
        setFan(0.0f);
        setLED(0.0f);
        return;
    }

    // Ambil status code dari persentase tertinggi (tanpa perlu nama string)
    // 1 = HEALTHY, 2 = STRESSED, 3 = CRITICAL, 0 = tidak ada vision
    int plantStatusCode = 0;
    if (healthy >= stressed && healthy >= critical && healthy > 0.0f) {
        plantStatusCode = 1;
    } else if (stressed >= healthy && stressed >= critical && stressed > 0.0f) {
        plantStatusCode = 2;
    } else if (critical > 0.0f) {
        plantStatusCode = 3;
    }

    statusCode = plantStatusCode;
    status = (plantStatusCode == 1) ? "HEALTHY" :
             (plantStatusCode == 2) ? "STRESSED" :
             (plantStatusCode == 3) ? "CRITICAL" : "UNKNOWN";

    const bool co2Unsafe = sensorData.mq135PpmAvg > AIR_CO2_UNSAFE_PPM;
    const bool pm1Unsafe = sensorData.pmsAvailable &&
                           sensorData.pmsAverageCount > 0 &&
                           sensorData.pm1Average > AIR_PM1_UNSAFE_UGM3;
    const bool pm25Unsafe = sensorData.pmsAvailable &&
                            sensorData.pmsAverageCount > 0 &&
                            sensorData.pm25Average > AIR_PM25_UNSAFE_UGM3;
    const bool pm10Unsafe = sensorData.pmsAvailable &&
                            sensorData.pmsAverageCount > 0 &&
                            sensorData.pm10Average > AIR_PM10_UNSAFE_UGM3;

    const bool anyPMUnsafe = pm1Unsafe || pm25Unsafe || pm10Unsafe;
    const bool airAman = !(co2Unsafe || anyPMUnsafe);

    float fanTarget = 0.0f;
    float ledTarget = 0.0f;

    if (airAman) {
        // BASIC IDLE: semua parameter udara aman
        fanTarget = 50.0f;
        ledTarget = 30.0f;
    } else {
        // UDARA TIDAK AMAN -> nested if-else berdasarkan status tanaman
        if (plantStatusCode == 1) {
            // HEALTHY
            ledTarget = 40.0f;
            if (co2Unsafe && anyPMUnsafe) fanTarget = 90.0f;
            else if (co2Unsafe) fanTarget = 70.0f;
            else fanTarget = 55.0f; // hanya PM yang melanggar
        } else if (plantStatusCode == 2) {
            // STRESSED
            ledTarget = 70.0f;
            if (co2Unsafe && anyPMUnsafe) fanTarget = 65.0f;
            else if (co2Unsafe) fanTarget = 50.0f;
            else fanTarget = 30.0f; // hanya PM yang melanggar
        } else {
            // CRITICAL (3) atau UNKNOWN (0)
            ledTarget = 100.0f;
            if (co2Unsafe && anyPMUnsafe) fanTarget = 40.0f;
            else if (co2Unsafe) fanTarget = 30.0f;
            else fanTarget = 15.0f; // hanya PM yang melanggar
        }
    }

    setFan(fanTarget);
    setLED(ledTarget);

    // Soil-based watering (pump ON)
    float dryThreshold = SOIL_DRY_HEALTHY;
    if (plantStatusCode == 2) dryThreshold = SOIL_DRY_STRESSED;
    else if (plantStatusCode == 3) dryThreshold = SOIL_DRY_CRITICAL;

    if (sensorData.soilAvailable && sensorData.soilMoisture < dryThreshold &&
        !pumpState && (!pumpCooldownActive ||
        millis() - lastPumpStopped >= 30000UL)) {
        setPump(true);
    }

    decisionReason = String("status_code=") + statusCode +
        String("; co2Unsafe=") + (co2Unsafe ? "true" : "false") +
        String("; anyPMUnsafe=") + (anyPMUnsafe ? "true" : "false");
}

// Pompa ON selama 15 detik, lalu OFF dan tandai untuk upload ke DB
void servicePumpPulse() {
    if (pumpState && millis() - lastPumpStarted >= PUMP_PULSE_MS) {
        setPump(false);
        pendingPumpUpload = true;
    }
}

// ==================================================
// RECEIVE VISION JSON dari laptop via /vision
// Format: {"healthy": 80, "stressed": 15, "critical": 5}
// ==================================================

void handleVisionPost() {
    String body = server.arg("plain");

    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    if (error) {
        server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        return;
    }

    if (doc["healthy"].isNull() || doc["stressed"].isNull() ||
        doc["critical"].isNull()) {
        server.send(400, "application/json", "{\"error\":\"Missing data\"}");
        return;
    }

    healthy = doc["healthy"].as<float>();
    stressed = doc["stressed"].as<float>();
    critical = doc["critical"].as<float>();

    if (healthy < 0 || healthy > 100 || stressed < 0 || stressed > 100 ||
        critical < 0 || critical > 100 ||
        healthy + stressed + critical <= 0.0f) {
        server.send(400, "application/json", "{\"error\":\"Invalid percentage\"}");
        return;
    }

    visionReceived = true;
    lastVisionUpdate = millis();
    applyCareDecision();

    server.send(200, "application/json", "{\"received\":true}");
}

// ==================================================
// /STATUS - cek apakah aman
// ==================================================

void handleStatusGet() {
    bool co2Unsafe = (sensorData.mq135PpmAvg > AIR_CO2_UNSAFE_PPM);
    bool pm1Unsafe = (sensorData.pmsAvailable && sensorData.pmsAverageCount > 0 &&
                      sensorData.pm1Average > AIR_PM1_UNSAFE_UGM3);
    bool pm25Unsafe = (sensorData.pmsAvailable && sensorData.pmsAverageCount > 0 &&
                       sensorData.pm25Average > AIR_PM25_UNSAFE_UGM3);
    bool pm10Unsafe = (sensorData.pmsAvailable && sensorData.pmsAverageCount > 0 &&
                       sensorData.pm10Average > AIR_PM10_UNSAFE_UGM3);
    bool aman = !(co2Unsafe || pm1Unsafe || pm25Unsafe || pm10Unsafe);

    String json = "{\"status\":\"";
    json += aman ? "aman" : "tidak aman";
    json += "\",\"plant_status\":\"";
    json += status;
    json += "\",\"co2_unsafe\":";
    json += co2Unsafe ? "true" : "false";
    json += ",\"pm1_unsafe\":";
    json += pm1Unsafe ? "true" : "false";
    json += ",\"pm25_unsafe\":";
    json += pm25Unsafe ? "true" : "false";
    json += ",\"pm10_unsafe\":";
    json += pm10Unsafe ? "true" : "false";
    json += "}";

    server.send(200, "application/json", json);
}

// ==================================================
// SUPABASE RPC: register_device - SEKALI SAAT BOOT
// ==================================================

bool registerDevice() {
    if (!ensureWiFi()) {
        Serial.println("[SUPABASE] Register dilewati: WiFi tidak tersambung.");
        return false;
    }

    HTTPClient http;
    const String url = String(SUPABASE_URL) + RPC_REGISTER_DEVICE;

    if (!http.begin(secureClient, url)) {
        Serial.println("[SUPABASE] Gagal memulai HTTP register.");
        return false;
    }

    http.setTimeout(12000);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal");

    const String mac = getMacAddress();
    String jsonData = "{\"mac_address\":\"";
    jsonData += mac;
    jsonData += "\",\"device_id\":\"";
    jsonData += getDeviceID();
    jsonData += "\"}";

    const int response = http.POST(jsonData);
    http.end();

    Serial.print("[SUPABASE] Register HTTP code: ");
    Serial.println(response);

    if (response >= 200 && response < 300) {
        deviceRegistered = true;
        return true;
    }

    deviceRegistered = false;
    return false;
}

// ==================================================
// SUPABASE RPC: insert_sensor - UPLOAD SETIAP 5 DETIK
// ==================================================

bool uploadSensorData() {
    if (!ensureWiFi() || !deviceRegistered) {
        return false;
    }

    HTTPClient http;
    const String url = String(SUPABASE_URL) + RPC_INSERT_SENSOR;

    if (!http.begin(secureClient, url)) {
        Serial.println("[SUPABASE] Gagal memulai HTTP upload.");
        return false;
    }

    http.setTimeout(12000);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal");

    StaticJsonDocument<1024> doc;
    doc["p_mac"] = getDeviceID();
    doc["p_plant_status"] = decisionEnabled ? statusCode : 0;

    if (sensorData.soilAvailable) {
        doc["p_soil_moisture"] = sensorData.soilMoisture;
    } else {
        doc["p_soil_moisture"] = nullptr;
    }

    if (sensorData.mq135Valid1) {
        doc["p_mq135_1"] = sensorData.mq135Ppm1;
    } else {
        doc["p_mq135_1"] = nullptr;
    }

    if (sensorData.mq135Valid2) {
        doc["p_mq135_2"] = sensorData.mq135Ppm2;
    } else {
        doc["p_mq135_2"] = nullptr;
    }

    if (sensorData.pmsAvailable) {
        doc["p_pm1"] = (int)sensorData.pm1Average;
        doc["p_pm25"] = (int)sensorData.pm25Average;
        doc["p_pm10"] = (int)sensorData.pm10Average;
    } else {
        doc["p_pm1"] = nullptr;
        doc["p_pm25"] = nullptr;
        doc["p_pm10"] = nullptr;
    }

    doc["p_pump"] = pumpState;
    doc["p_fan"] = fanLevel;
    doc["p_led"] = ledLevel;

    String jsonData;
    serializeJson(doc, jsonData);

    const int response = http.POST(jsonData);
    http.end();

    Serial.print("[SUPABASE] Upload HTTP code: ");
    Serial.println(response);

    return response >= 200 && response < 300;
}

// ==================================================
// WEB SERVER (hanya 2 endpoint: /vision dan /status)
// ==================================================

void initWebServer() {
    server.on("/vision", HTTP_POST, handleVisionPost);
    server.on("/status", HTTP_GET, handleStatusGet);

    server.onNotFound([]() {
        server.send(404, "application/json", "{\"error\":\"Endpoint not found\"}");
    });

    server.begin();
}

// ==================================================
// INITIALIZE ACTUATORS
// ==================================================

void initActuators() {
    digitalWrite(PUMP_RELAY_PIN, RELAY_OFF);
    pinMode(PUMP_RELAY_PIN, OUTPUT);

    ledcSetup(FAN_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcSetup(LED_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcAttachPin(FAN_MOSFET_PIN, FAN_PWM_CHANNEL);
    ledcAttachPin(LED_MOSFET_PIN, LED_PWM_CHANNEL);
    ledcWrite(FAN_PWM_CHANNEL, 0);
    ledcWrite(LED_PWM_CHANNEL, 0);
    fanLevel = 0.0f;
    ledLevel = 0.0f;
    setPump(false);
}

// ==================================================
// SETUP
// ==================================================

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("====================================");
    Serial.println("       MOSSIFIER ESP32 SYSTEM");
    Serial.println("====================================");

    Serial.print("[BOOT] Reset reason: ");
    Serial.println((int)esp_reset_reason());

    // TLS untuk pengujian. Untuk produksi gunakan CA certificate yang valid.
    secureClient.setInsecure();

    // 1. Aktuator
    initActuators();
    Serial.println("[DBG] Actuators initialized");

    // 2. ADC dan sensor analog
    analogReadResolution(12);
    analogSetPinAttenuation(SOIL_SENSOR_PIN, ADC_11db);
    analogSetPinAttenuation(MQ135_1_PIN, ADC_11db);
    analogSetPinAttenuation(MQ135_2_PIN, ADC_11db);

    pinMode(SOIL_SENSOR_PIN, INPUT);
    pinMode(MQ135_1_PIN, INPUT);
    pinMode(MQ135_2_PIN, INPUT);

    esp_adc_cal_characterize(
        ADC_UNIT_1, ADC_ATTEN_DB_11,
        ADC_WIDTH_BIT_12, 1100, &adcChars1
    );

    esp_adc_cal_characterize(
        ADC_UNIT_1, ADC_ATTEN_DB_11,
        ADC_WIDTH_BIT_12, 1100, &adcChars2
    );

    // Inisialisasi filter MQ135 agar sampel pertama langsung dipakai.
    sensorData.smoothPpm1 = -1.0f;
    sensorData.smoothPpm2 = -1.0f;

    Serial.println("[DBG] ADC initialized");

    // 3. WebServer lokal
    Serial.println("[DBG] Before WebServer");
    initWebServer();
    Serial.println("[DBG] WebServer initialized");

    // 4. PMS5003
    Serial.println("[DBG] Before Serial2.begin");
    Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
    Serial.println("[DBG] PMS5003 initialized");

    // 5. Coba WiFi satu kali saat boot.
    // Jika gagal, sensor dan WebServer tetap berjalan secara lokal.
    if (connectWiFi()) {
        Serial.println("[SUPABASE] Register device saat boot...");
        if (registerDevice()) {
            Serial.println("[SUPABASE] Device registered.");
        } else {
            Serial.println("[SUPABASE] Register gagal. Reboot untuk mencoba lagi.");
        }
    } else {
        Serial.println("[SUPABASE] Tidak register karena WiFi mati.");
    }

    Serial.println();
    Serial.println("========== SYSTEM READY ==========");
    Serial.println("[INFO] Mode: local + cloud jika WiFi tersedia");
    Serial.println("[INFO] WiFi tidak reconnect otomatis");
    Serial.println("[INFO] Endpoint: /vision dan /status");
    Serial.println("==================================");
}

// ==================================================
// LOOP
// ==================================================

void loop() {
    // Layani endpoint lokal terus-menerus.
    server.handleClient();

    // Baca PMS dan kontrol durasi pompa.
    readPMS5003();
    servicePumpPulse();

    // Sampling sensor setiap 2 detik.
    if (lastSensorSample == 0 ||
        millis() - lastSensorSample >= SENSOR_INTERVAL_MS) {

        readSoilMoisture();
        readMQ135Sensors();
        readPMS5003();

        lastSensorSample = millis();
        applyCareDecision();
    }

    // Matikan keputusan vision jika data vision kedaluwarsa.
    if (decisionEnabled &&
        millis() - lastVisionUpdate > VISION_TIMEOUT_MS) {
        applyCareDecision();
    }

    // Upload berkala hanya jika WiFi tersambung dan device berhasil register.
    // Pending pump upload ikut dikirim pada kesempatan upload berikutnya.
    const bool uploadDue =
        (lastSupabaseUpload == 0 ||
         millis() - lastSupabaseUpload >= 5000UL);

    if (deviceRegistered && ensureWiFi() && uploadDue) {

        const bool uploadOK = uploadSensorData();
        lastSupabaseUpload = millis();

        if (uploadOK) {
            pendingPumpUpload = false;
        }
    }

    delay(2);
}
