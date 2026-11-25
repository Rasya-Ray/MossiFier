#include <Arduino.h>
#include "esp_adc_cal.h"

// ==================================================
// MOSSIFIER - MQ135 x2 CO2-equivalent ppm test
// ESP32 | Arduino IDE 1.8.5
//
// Menggunakan esp_adc_cal untuk mengubah raw ADC ke tegangan,
// lalu menghitung Rs dan mengonversi ke ppm CO2 setara
// dengan kurva PARA/PARB.
// Output: ppm (bukan persen response).
// ==================================================

// ---------- Pin & hardware ----------
#define MQ135_1_PIN 33
#define MQ135_2_PIN 34
#define MQ_VCC 5.0f          // tegangan supply modul
#define MQ_RL_KOHM 1.0f      // nilai RL di modul (kOhm)
#define DIVIDER_RATIO 1.0f   // tanpa pembagi tegangan = 1.0

// ---------- Hasil kalibrasi (isi manual setelah ukur R0 di udara bersih) ----------
float MQ135_1_R0 = 9.3f;     // kOhm, kalibrate tiap sensor
float MQ135_2_R0 = 9.3f;     // kOhm

// ---------- Kurva CO2 MQ-135 ----------
const float PARA = 116.6020682f;
const float PARB = 2.769034857f;

#define WARMUP_MS 180000UL   // 3 menit pertama tidak dihitung
#define SMOOTH 0.1f          // 0.1 = halus, 1.0 = tanpa penghalusan
#define READ_SAMPLES 64
#define READ_INTERVAL_MS 2000UL

esp_adc_cal_characteristics_t adcChars1;
esp_adc_cal_characteristics_t adcChars2;

float smoothPpm1 = -1;
float smoothPpm2 = -1;
unsigned long lastRead = 0;

// Rs sensor (kOhm), -1 kalau sinyal tidak valid
float readRs(int pin, esp_adc_cal_characteristics_t *chars, float &pinMv) {
    uint32_t total = 0;
    for (int i = 0; i < READ_SAMPLES; i++) {
        total += analogRead(pin);
        delay(2);
    }
    pinMv = (float)esp_adc_cal_raw_to_voltage(total / READ_SAMPLES, chars);

    if (pinMv < 100.0f) return -1.0f;

    float v = (pinMv / 1000.0f) * DIVIDER_RATIO;
    if (v >= MQ_VCC - 0.05f) return -1.0f;

    return MQ_RL_KOHM * (MQ_VCC - v) / v;
}

// ppm CO2 setara, sudah dihaluskan. -1 kalau tidak valid.
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

void setup() {
    Serial.begin(115200);
    delay(500);

    analogSetAttenuation(ADC_11db);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11,
                             ADC_WIDTH_BIT_12, 1100, &adcChars1);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11,
                             ADC_WIDTH_BIT_12, 1100, &adcChars2);

    pinMode(MQ135_1_PIN, INPUT);
    pinMode(MQ135_2_PIN, INPUT);

    Serial.println("=== MOSSIFIER MQ135 CO2-equivalent ppm test ===");
    Serial.print("MQ135 GPIO33 R0: "); Serial.print(MQ135_1_R0); Serial.println(" kOhm");
    Serial.print("MQ135 GPIO34 R0: "); Serial.print(MQ135_2_R0); Serial.println(" kOhm");
    Serial.println("Allow 3 minutes warm-up before trusting values.");
    Serial.println("Output is CO2-equivalent ppm (not certified CO2).");
}

void loop() {
    if (millis() - lastRead < READ_INTERVAL_MS) return;
    lastRead = millis();

    float rs1, mv1, rs2, mv2;
    float ppm1 = readAirPPM(MQ135_1_PIN, &adcChars1, MQ135_1_R0, rs1, mv1, smoothPpm1);
    float ppm2 = readAirPPM(MQ135_2_PIN, &adcChars2, MQ135_2_R0, rs2, mv2, smoothPpm2);

    Serial.println();
    Serial.println("========== MQ135 ==========");

    Serial.print("[MQ135 GPIO33] ");
    if (ppm1 >= 0.0f) {
        Serial.print("Rs="); Serial.print(rs1, 2);
        Serial.print(" kOhm | mV="); Serial.print(mv1, 0);
        Serial.print(" | ppm="); Serial.print(ppm1, 0);
        Serial.print(" | "); Serial.println(airCategory(ppm1));
    } else {
        Serial.print("Sinyal tidak valid (pin="); Serial.print(mv1, 0);
        Serial.println(" mV). Cek wiring.");
    }

    Serial.print("[MQ135 GPIO34] ");
    if (ppm2 >= 0.0f) {
        Serial.print("Rs="); Serial.print(rs2, 2);
        Serial.print(" kOhm | mV="); Serial.print(mv2, 0);
        Serial.print(" | ppm="); Serial.print(ppm2, 0);
        Serial.print(" | "); Serial.println(airCategory(ppm2));
    } else {
        Serial.print("Sinyal tidak valid (pin="); Serial.print(mv2, 0);
        Serial.println(" mV). Cek wiring.");
    }

    if (ppm1 >= 0.0f && ppm2 >= 0.0f) {
        float avg = (ppm1 + ppm2) / 2.0f;
        Serial.print("[COMBINED AVERAGE] ppm="); Serial.print(avg, 0);
        Serial.print(" | "); Serial.println(airCategory(avg));
    }

    Serial.println("===========================");
}
