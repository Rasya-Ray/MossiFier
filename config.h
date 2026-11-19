
#pragma once
#include <Arduino.h>

// ================= WIFI =================
constexpr char WIFI_SSID[] = "NAMA_WIFI";
constexpr char WIFI_PASSWORD[] = "PASSWORD_WIFI";

// ================= THINGSPEAK =================
constexpr unsigned long TS_CHANNEL_ID = 3581652;
constexpr char TS_WRITE_KEY[] = "WRITE_API_KEY";

// ================= SENSOR PINS =================
constexpr uint8_t MQ135_PIN = 34;
constexpr uint8_t SOIL_PIN  = 35;

// PMS5003 UART2
constexpr int PMS_RX_PIN = 16; // ESP32 RX <- PMS TX
constexpr int PMS_TX_PIN = 17; // ESP32 TX -> PMS RX
constexpr uint32_t PMS_BAUD = 9600;

// ================= ACTUATOR PINS =================
constexpr uint8_t PUMP_RELAY_PIN = 26;
constexpr uint8_t FAN_MOSFET_PIN = 25;
constexpr uint8_t LED_MOSFET_PIN = 27;

// Ubah jika relay lu aktif LOW
constexpr uint8_t PUMP_ON_LEVEL  = HIGH;
constexpr uint8_t PUMP_OFF_LEVEL = LOW;

// ================= SOIL CALIBRATION =================
// Sesuaikan dengan hasil kalibrasi sensor lu.
constexpr int SOIL_DRY_RAW = 3723;
constexpr int SOIL_WET_RAW = 1489;

// ================= DECISION THRESHOLDS =================
constexpr int SOIL_DRY_LIMIT = 35;   // Persen
constexpr int PM25_LIMIT = 35;       // µg/m³, contoh threshold
constexpr int MQ135_RAW_LIMIT = 1800; // Contoh awal, wajib kalibrasi

// ================= ACTUATOR SETTINGS =================
constexpr int FAN_PWM_LEVEL = 180;
constexpr int LED_STRESSED_PWM = 140;
constexpr int LED_CRITICAL_PWM = 220;

// Maksimal 2 aktuator aktif bersamaan
constexpr uint32_t PUMP_PULSE_MS = 3000;
constexpr uint32_t PUMP_COOLDOWN_MS = 30000;

// ================= NETWORK TIMING =================
constexpr uint32_t SENSOR_INTERVAL_MS = 1000;
constexpr uint32_t THINGSPEAK_INTERVAL_MS = 20000;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t VISION_TIMEOUT_MS = 15000;
constexpr uint32_t PMS_TIMEOUT_MS = 5000;
