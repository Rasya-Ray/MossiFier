#include <Arduino.h>
#include "esp_adc_cal.h"

// ==================================================
// MOSSIFIER - Edge AI Test Sketch (uji.ino)
// ESP32 | Arduino IDE 1.8.5
//
// Membaca semua sensor (soil, 2x MQ135 CO2 ppm, PMS5003 PM1+PM2.5),
// menjalankan decision tree Edge AI dengan nested if-else dan
// ambang batas numerik (WHO-style), lalu mencetak semua output
// ke Serial Monitor.
//
// TIDAK ada WiFi, TIDAK ada Supabase, TIDAK ada upload database.
//
// TEST MODE: saat testMode = true, fan + LED + pompa langsung ON
// dan decision tree Edge AI di-bypass (untuk cek hardware aktuator).
// Semua blocking delay() sudah dihapus (non-blocking / millis()).
// ==================================================

// ==================================================
// PIN CONFIGURATION
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
// CALIBRATION
// ==================================================

const int SOIL_DRY = 3000;
const int SOIL_WET = 1200;

const float SOIL_DRY_HEALTHY = 35.0f;
const float SOIL_DRY_STRESSED = 40.0f;
const float SOIL_DRY_CRITICAL = 45.0f;

// MQ135 esp_adc_cal
#define MQ_VCC 5.0f
#define MQ_RL_KOHM 1.0f
#define DIVIDER_RATIO 1.0f
float MQ135_1_R0 = 9.3f;
float MQ135_2_R0 = 9.3f;
const float PARA = 116.6020682f;
const float PARB = 2.769034857f;
#define MQ135_WARMUP_MS 180000UL
const float SMOOTH = 0.1f;

// Ambang batas numerik (WHO-style / sesuai permintaan).
const float AIR_CO2_UNSAFE_PPM = 10000.0f;   // CO2 setara di atas ini = tidak aman
const int   AIR_PM25_UNSAFE_UGM3 = 28;       // PM2.5 di atas ini = tidak aman

#define PMS_AVERAGE_WINDOW 10
#define PUMP_PULSE_MS 3000UL
#define PUMP_COOLDOWN_MS 30000UL

// ==================================================
// INTERVALS
// ==================================================

#define SENSOR_INTERVAL_MS 2000UL
#define VISION_TIMEOUT_MS 15000UL

// ==================================================
// PWM (LEDC)
// ==================================================

#define FAN_PWM_CHANNEL 0
#define LED_PWM_CHANNEL 1
#define PWM_FREQUENCY 5000
#define PWM_RESOLUTION 8
#define PWM_MAX 255

// ==================================================
// TEST MODE (cek hardware aktuator)
// true  = fan + LED + pompa langsung ON, Edge AI bypass
// false = decision tree Edge AI normal
// ==================================================

bool testMode = true;
const float TEST_FAN_PERCENT = 60.0f;    // kecepatan fan saat test ("normal")
const float TEST_LED_PERCENT = 100.0f;   // kecerahan LED saat test

// ==================================================
// GLOBAL STATE
// ==================================================

bool pumpState = false;
float fanLevel = 0.0f;
float ledLevel = 0.0f;
bool decisionEnabled = false;
unsigned long lastVisionUpdate = 0;
unsigned long lastPumpStarted = 0;
unsigned long lastPumpStopped = 0;
bool pumpCooldownActive = false;
unsigned long lastSensorSample = 0;

float healthy = 0;
float stressed = 0;
float critical = 0;
float confidence = 0;
int statusCode = 0;
String status = "UNKNOWN";
bool visionReceived = false;

// ==================================================
// SENSOR DATA STRUCT
// ==================================================

struct SensorData {
    int soilRaw;
    float soilMoisture;
    bool soilAvailable;

    // MQ135 CO2 ppm
    float mq135Ppm1;
    float mq135Ppm2;
    float mq135PpmAvg;
    float mq135Rs1;
    float mq135Rs2;
    float mq135Mv1;
    float mq135Mv2;
    bool mq135Valid1;
    bool mq135Valid2;
    bool mq135WarmedUp;
    float smoothPpm1;
    float smoothPpm2;

    // PMS5003
    int pm1;
    int pm25;
    float pm1Average;
    float pm25Average;
    bool pmsAvailable;
    uint8_t pmsAverageCount;
    uint8_t pmsAverageIndex;
    unsigned long pmsLastUpdate;
};

SensorData sensorData = {};
int pmsHistory1[PMS_AVERAGE_WINDOW] = {};
int pmsHistory25[PMS_AVERAGE_WINDOW] = {};

// ==================================================
// PMS5003 BUFFER
// ==================================================

uint8_t pmsBuffer[32];
int pmsIndex = 0;

// ==================================================
// MQ135 esp_adc_cal HELPERS
// ==================================================

esp_adc_cal_characteristics_t adcChars1;
esp_adc_cal_characteristics_t adcChars2;

float readRs(int pin, esp_adc_cal_characteristics_t *chars, float &pinMv) {
    uint32_t total = 0;
    for (int i = 0; i < 64; i++) {
        total += analogRead(pin);
    }
    pinMv = (float)esp_adc_cal_raw_to_voltage(total / 64, chars);

    if (pinMv < 100.0f) return -1.0f;

    float v = (pinMv / 1000.0f) * DIVIDER_RATIO;
    if (v >= MQ_VCC - 0.05f) return -1.0f;

    return MQ_RL_KOHM * (MQ_VCC - v) / v;
}

float readAirPPM(int pin, esp_adc_cal_characteristics_t *chars, float r0,
                 float &rsOut, float &mvOut, float &smoothPpm) {
    rsOut = readRs(pin, chars, mvOut);
    if (rsOut <= 0.0f) return -1.0f;

    float ppm = PARA * pow(rsOut / r0, -PARB);
    ppm = constrain(ppm, 0.0f, 10000.0f);

    smoothPpm = (smoothPpm < 0.0f) ? ppm
                                   : (1.0f - SMOOTH) * smoothPpm + SMOOTH * ppm;
    return smoothPpm;
}

const char* airCategory(float ppm) {
    if (ppm < 0.0f) return "TIDAK VALID";
    if (ppm < 600.0f)  return "Sangat baik";
    if (ppm < 1000.0f) return "Baik";
    if (ppm < 1500.0f) return "Sedang";
    if (ppm < 2500.0f) return "Buruk";
    return "Sangat buruk";
}

// ==================================================
// HELPERS
// ==================================================

int readAnalogAverage(int pin, int samples = 10) {
    uint32_t total = 0;
    for (int i = 0; i < samples; i++) {
        total += analogRead(pin);
    }
    return (int)(total / samples);
}

bool validAnalogReading(int raw) {
    return raw > 10 && raw < 4085;
}

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==================================================
// SOIL MOISTURE V2
// ==================================================

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
// MQ135 CO2 PPM
// ==================================================

void readMQ135Sensors() {
    sensorData.mq135Ppm1 = readAirPPM(MQ135_1_PIN, &adcChars1, MQ135_1_R0,
        sensorData.mq135Rs1, sensorData.mq135Mv1, sensorData.smoothPpm1);
    sensorData.mq135Ppm2 = readAirPPM(MQ135_2_PIN, &adcChars2, MQ135_2_R0,
        sensorData.mq135Rs2, sensorData.mq135Mv2, sensorData.smoothPpm2);

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
// PMS5003 (PM1 + PM2.5 only)
// ==================================================

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

        pmsHistory1[sensorData.pmsAverageIndex] = sensorData.pm1;
        pmsHistory25[sensorData.pmsAverageIndex] = sensorData.pm25;
        sensorData.pmsAverageIndex = (sensorData.pmsAverageIndex + 1) % PMS_AVERAGE_WINDOW;
        if (sensorData.pmsAverageCount < PMS_AVERAGE_WINDOW) {
            sensorData.pmsAverageCount++;
        }

        uint32_t total1 = 0;
        uint32_t total25 = 0;
        for (uint8_t i = 0; i < sensorData.pmsAverageCount; i++) {
            total1 += pmsHistory1[i];
            total25 += pmsHistory25[i];
        }
        sensorData.pm1Average = (float)total1 / sensorData.pmsAverageCount;
        sensorData.pm25Average = (float)total25 / sensorData.pmsAverageCount;
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
    }
}

// ==================================================
// ACTUATORS
// ==================================================

void setPump(bool state) {
    if (pumpState == state) return;
    pumpState = state;
    digitalWrite(PUMP_RELAY_PIN, state ? RELAY_ON : RELAY_OFF);
    if (state) lastPumpStarted = millis();
    else {
        lastPumpStopped = millis();
        pumpCooldownActive = true;
    }
    Serial.print("[PUMP] ");
    Serial.println(state ? "ON" : "OFF");
}

void setFan(float percentage) {
    if (percentage < 0.0f) percentage = 0.0f;
    if (percentage > 100.0f) percentage = 100.0f;
    fanLevel = percentage;
    const uint8_t pwm = (uint8_t)roundf(percentage * PWM_MAX / 100.0f);
    ledcWrite(FAN_PWM_CHANNEL, pwm);
    Serial.print("[FAN] ");
    Serial.print(fanLevel, 1);
    Serial.print("% (PWM ");
    Serial.print(pwm);
    Serial.println(")");
}

void setLED(float percentage) {
    if (percentage < 0.0f) percentage = 0.0f;
    if (percentage > 100.0f) percentage = 100.0f;
    ledLevel = percentage;
    const uint8_t pwm = (uint8_t)roundf(percentage * PWM_MAX / 100.0f);
    ledcWrite(LED_PWM_CHANNEL, pwm);
    Serial.print("[LED] ");
    Serial.print(ledLevel, 1);
    Serial.print("% (PWM ");
    Serial.print(pwm);
    Serial.println(")");
}

void servicePumpPulse() {
    if (pumpState && millis() - lastPumpStarted >= PUMP_PULSE_MS) {
        setPump(false);
    }
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
// EDGE AI: NESTED IF-ELSE DENGAN AMBANG BATAS NUMERIK
//
// Struktur:
//   if (!(co2Ppm > 10000 || pm25 > 28)) {
//       // KEDUAMA AMAN -> branch 1 (purifikasi ringan / mati)
//   } else {
//       // SATUATAU LEBIH TIDAK AMAN -> branch 2 (purifikasi lebih agresif)
//       if (status == ...) { ... }
//   }
// ==================================================

String decisionReason = "Waiting for vision and sensor data";

void applyCareDecision() {
    // NO EDGE AI dulu: paksa pompa RELAY nyala terus (always on, tidak ada off otomatis).
    // Fan dan LED di test level.
    setFan(TEST_FAN_PERCENT);
    setLED(TEST_LED_PERCENT);
    setPump(true);  // relay pompa ON terus, tidak mati

    decisionReason = "NO EDGE AI: pompa relay ON terus (always on); fan " +
        String(TEST_FAN_PERCENT, 0) + "%, led " +
        String(TEST_LED_PERCENT, 0) + "%";
}

// Helper untuk status (karena pmUnsafe lokal di applyCareDecision).
bool pmUnsafeHelper();

// ==================================================
// SERIAL COMMAND HANDLER
// Format: vision <healthy> <stressed> <critical>
// ==================================================

String serialCmd = "";

void handleSerialInput() {
    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            if (serialCmd.length() > 0) {
                serialCmd.trim();

                if (serialCmd.startsWith("vision ")) {
                    String rest = serialCmd.substring(7);
                    int firstSpace = rest.indexOf(' ');
                    int secondSpace = rest.indexOf(' ', firstSpace + 1);

                    if (firstSpace > 0 && secondSpace > firstSpace) {
                        float h = rest.substring(0, firstSpace).toFloat();
                        float s = rest.substring(firstSpace + 1, secondSpace).toFloat();
                        float cr = rest.substring(secondSpace + 1).toFloat();

                        if (h >= 0 && h <= 100 && s >= 0 && s <= 100 && cr >= 0 && cr <= 100 &&
                            h + s + cr > 0) {
                            healthy = h;
                            stressed = s;
                            critical = cr;
                            visionReceived = true;
                            lastVisionUpdate = millis();
                            updateVisionStatus();
                            applyCareDecision();

                            Serial.println("[VISION] Data diterima via Serial:");
                            Serial.print("  healthy="); Serial.println(healthy);
                            Serial.print("  stressed="); Serial.println(stressed);
                            Serial.print("  critical="); Serial.println(critical);
                            Serial.print("  status="); Serial.println(status);
                            Serial.print("  statusCode="); Serial.println(statusCode);
                        } else {
                            Serial.println("[VISION] Nilai tidak valid (0-100, jumlah > 0).");
                        }
                    } else {
                        Serial.println("[VISION] Format salah. Gunakan: vision <healthy> <stressed> <critical>");
                    }
                } else if (serialCmd == "help" || serialCmd == "?") {
                    Serial.println();
                    Serial.println("=== EDGE AI TEST (uji.ino) ===");
                    Serial.println("Perintah:");
                    Serial.println("  vision <healthy> <stressed> <critical>  - input data vision (0-100)");
                    Serial.println("  example: vision 80 15 5");
                    Serial.println("  fan <0-100>                             - set kecepatan fan (manual)");
                    Serial.println("  led <0-100>                             - set kecerahan LED (manual)");
                    Serial.println("  pump on / pump off                      - kontrol pompa (manual)");
                    Serial.println("  all on                                  - test mode: semua aktuator ON");
                    Serial.println("  all off                                 - matikan semua aktuator");
                    Serial.println("  test on / test off                      - Aktifkan/nonaktifkan test mode");
                    Serial.println("  help / ?                                - tampilkan bantuan ini");
                    Serial.println("  status                                  - tampilkan status sensor & keputusan terakhir");
                    Serial.println();
                } else if (serialCmd == "status") {
                    Serial.println();
                    Serial.println("=== STATUS TERAKHIR ===");
                    Serial.print("Vision: "); Serial.print(status);
                    Serial.print(" ("); Serial.print(healthy); Serial.print(", ");
                    Serial.print(stressed); Serial.print(", ");
                    Serial.print(critical); Serial.print(") code=");
                    Serial.println(statusCode);
                    Serial.print("Soil: "); Serial.print(sensorData.soilAvailable ? String(sensorData.soilMoisture, 1) + "%" : "NULL");
                    Serial.println();
                    Serial.print("MQ135 CO2: "); Serial.print(sensorData.mq135Valid1 || sensorData.mq135Valid2 ? String(sensorData.mq135PpmAvg, 0) + " ppm" : "NULL");
                    Serial.println();
                    Serial.print("PMS PM2.5: "); Serial.print(sensorData.pmsAvailable ? String(sensorData.pm25Average, 1) + " ug/m3" : "NULL");
                    Serial.println();
                    Serial.print("CO2 unsafe (>10000): "); Serial.print(sensorData.mq135PpmAvg > AIR_CO2_UNSAFE_PPM ? "true" : "false");
                    Serial.println();
                    Serial.print("PM2.5 unsafe (>28): "); Serial.print(pmUnsafeHelper() ? "true" : "false");
                    Serial.println();
                    Serial.print("Fan: "); Serial.print(fanLevel, 1); Serial.println("%");
                    Serial.print("LED: "); Serial.print(ledLevel, 1); Serial.println("%");
                    Serial.print("Pump: "); Serial.println(pumpState ? "ON" : "OFF");
                    Serial.print("Test mode: "); Serial.println(testMode ? "ON" : "OFF");
                    Serial.print("Decision: "); Serial.println(decisionReason);
                    Serial.println();
                } else if (serialCmd.startsWith("fan ")) {
                    float f = serialCmd.substring(4).toFloat();
                    if (f >= 0 && f <= 100) {
                        testMode = false; // keluar test mode saat kontrol manual
                        setFan(f);
                        Serial.print("[TEST] Fan di-set ke "); Serial.print(f); Serial.println("%");
                    } else {
                        Serial.println("[CMD] Nilai fan harus 0-100. Contoh: fan 60");
                    }
                } else if (serialCmd.startsWith("led ")) {
                    float l = serialCmd.substring(4).toFloat();
                    if (l >= 0 && l <= 100) {
                        testMode = false;
                        setLED(l);
                        Serial.print("[TEST] LED di-set ke "); Serial.print(l); Serial.println("%");
                    } else {
                        Serial.println("[CMD] Nilai LED harus 0-100. Contoh: led 100");
                    }
                } else if (serialCmd == "pump on") {
                    testMode = false;
                    if (!pumpState && (!pumpCooldownActive ||
                        millis() - lastPumpStopped >= PUMP_COOLDOWN_MS)) {
                        setPump(true);
                        Serial.println("[TEST] Pompa ON");
                    } else {
                        Serial.println("[TEST] Pompa tidak bisa ON (cooldown atau sudah ON)");
                    }
                } else if (serialCmd == "pump off") {
                    testMode = false;
                    setPump(false);
                    Serial.println("[TEST] Pompa OFF");
                } else if (serialCmd == "all on") {
                    testMode = true;
                    Serial.println("[TEST] Test mode ON - semua aktuator paksa nyala");
                } else if (serialCmd == "all off") {
                    testMode = false;
                    setFan(0.0f);
                    setLED(0.0f);
                    setPump(false);
                    Serial.println("[TEST] Semua aktuator OFF");
                } else if (serialCmd == "test on") {
                    testMode = true;
                    Serial.println("[TEST] Test mode ON");
                } else if (serialCmd == "test off") {
                    testMode = false;
                    Serial.println("[TEST] Test mode OFF");
                } else {
                    Serial.println("[CMD] Perintah tidak diketahui. Ketik 'help'.");
                }
                serialCmd = "";
            }
        } else if (serialCmd.length() < 60) {
            serialCmd += c;
        }
    }
}

// Helper untuk status (karena pmUnsafe lokal di applyCareDecision)
bool pmUnsafeHelper() {
    return sensorData.pmsAvailable &&
           sensorData.pmsAverageCount > 0 &&
           sensorData.pm25Average > AIR_PM25_UNSAFE_UGM3;
}

// ==================================================
// PRINT ALL SENSORS
// ==================================================

void printAllSensors() {
    Serial.println();
    Serial.println("========== SENSOR READING ==========");

    Serial.print("[SOIL V2] RAW: ");
    if (sensorData.soilAvailable) Serial.println(sensorData.soilRaw);
    else Serial.println("NOT AVAILABLE");
    Serial.print("[SOIL V2] Moisture: ");
    if (sensorData.soilAvailable) {
        Serial.print(sensorData.soilMoisture, 1);
        Serial.println("%");
    } else Serial.println("NULL");

    Serial.print("[MQ135 GPIO33] Rs=");
    if (sensorData.mq135Valid1) {
        Serial.print(sensorData.mq135Rs1, 2);
        Serial.print(" kOhm | mV=");
        Serial.print(sensorData.mq135Mv1, 0);
        Serial.print(" | ppm=");
        Serial.print(sensorData.mq135Ppm1, 0);
    } else Serial.print("INVALID");
    Serial.println();

    Serial.print("[MQ135 GPIO34] Rs=");
    if (sensorData.mq135Valid2) {
        Serial.print(sensorData.mq135Rs2, 2);
        Serial.print(" kOhm | mV=");
        Serial.print(sensorData.mq135Mv2, 0);
        Serial.print(" | ppm=");
        Serial.print(sensorData.mq135Ppm2, 0);
    } else Serial.print("INVALID");
    Serial.println();

    Serial.print("[AIR QUALITY] CO2 avg: ");
    if (sensorData.mq135Valid1 || sensorData.mq135Valid2) {
        Serial.print(sensorData.mq135PpmAvg, 0);
        Serial.print(" ppm | unsafe=");
        Serial.print(sensorData.mq135PpmAvg > AIR_CO2_UNSAFE_PPM ? "true" : "false");
    } else Serial.print("NULL");
    Serial.println();

    Serial.print("[PMS5003] PM1 raw/avg (ug/m3): ");
    if (sensorData.pmsAvailable) {
        Serial.print(sensorData.pm1); Serial.print(" / ");
        Serial.println(sensorData.pm1Average, 1);
    } else Serial.println("NULL");
    Serial.print("[PMS5003] PM2.5 raw/avg (ug/m3): ");
    if (sensorData.pmsAvailable) {
        Serial.print(sensorData.pm25); Serial.print(" / ");
        Serial.println(sensorData.pm25Average, 1);
    } else Serial.println("NULL");

    Serial.print("[VISION] ");
    Serial.println(decisionEnabled ? status : "WAITING / STALE");
    Serial.print("[DECISION] "); Serial.println(decisionReason);
    Serial.print("[PUMP] "); Serial.println(pumpState ? "ON" : "OFF");
    Serial.print("[FAN] "); Serial.print(fanLevel, 1); Serial.println("%");
    Serial.print("[LED] "); Serial.print(ledLevel, 1); Serial.println("%");
    Serial.println("====================================");
}

// ==================================================
// SETUP
// ==================================================

void setup() {
    Serial.begin(115200);

    Serial.println();
    Serial.println("====================================");
    Serial.println("     MOSSIFIER EDGE AI TEST (uji.ino)");
    Serial.println("====================================");

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
    Serial.println("[ACTUATOR] Relay OFF; fan/LED PWM 0%.");

    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11,
                             ADC_WIDTH_BIT_12, 1100, &adcChars1);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11,
                             ADC_WIDTH_BIT_12, 1100, &adcChars2);

    pinMode(SOIL_SENSOR_PIN, INPUT);
    pinMode(MQ135_1_PIN, INPUT);
    pinMode(MQ135_2_PIN, INPUT);
    Serial.println("[ADC] Initialized.");

    Serial2.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
    Serial.println("[PMS5003] UART2 initialized. Allow 30s warm-up.");
    Serial.println("[MQ135] Allow 3 minutes warm-up before trusting CO2 ppm.");

    Serial.println();
    Serial.println("========== SYSTEM READY ==========");
    Serial.println("[TEST MODE] Aktif - fan + LED + pompa paksa ON.");
    Serial.println("[SERIAL] Ketik 'help' untuk daftar perintah.");
    Serial.println("  Contoh: fan 60  |  led 100  |  pump on  |  test off");
    Serial.println("==================================");

    // Aktifkan test mode segera saat boot (tidak menunggu loop pertama).
    testMode = true;
    applyCareDecision();
}

// ==================================================
// LOOP
// ==================================================

void loop() {
    handleSerialInput();

    readPMS5003();

    if (lastSensorSample == 0 ||
        millis() - lastSensorSample >= SENSOR_INTERVAL_MS) {
        readSoilMoisture();
        readMQ135Sensors();
        readPMS5003();
        lastSensorSample = millis();
        applyCareDecision();
        printAllSensors();
    }

    if (decisionEnabled && millis() - lastVisionUpdate > VISION_TIMEOUT_MS) {
        applyCareDecision();
        printAllSensors();
    }
}
