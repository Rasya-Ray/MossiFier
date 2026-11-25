#include <Arduino.h>

// MOSSIFIER - Soil moisture V2 test | ESP32 | Arduino IDE 1.8.5
#define SOIL_SENSOR_PIN 32

// Calibrate with your sensor: dry reading and wet-soil reading.
// Typically capacitive V2 has a higher raw value when dry.
const int SOIL_DRY_RAW = 3000;
const int SOIL_WET_RAW = 1200;
const unsigned long READ_INTERVAL_MS = 1000UL;
unsigned long lastRead = 0;

int readAverage() {
  uint32_t total = 0;
  const int sampleCount = 10;
  for (int i = 0; i < sampleCount; i++) {
    total += analogRead(SOIL_SENSOR_PIN);
    delay(5);
  }
  return total / sampleCount;
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_SENSOR_PIN, ADC_11db);
  pinMode(SOIL_SENSOR_PIN, INPUT);
  Serial.println("Soil moisture V2 test ready.");
  Serial.println("Adjust SOIL_DRY_RAW and SOIL_WET_RAW after measuring your sensor.");
}

void loop() {
  if (millis() - lastRead < READ_INTERVAL_MS) return;
  lastRead = millis();

  const int raw = readAverage();
  Serial.print("[SOIL GPIO32] raw=");
  Serial.print(raw);
  if (raw <= 10 || raw >= 4085 || SOIL_DRY_RAW == SOIL_WET_RAW) {
    Serial.println(" | moisture=NULL (check wiring/calibration)");
    return;
  }

  float moisture = (float)(SOIL_DRY_RAW - raw) * 100.0f /
                   (float)(SOIL_DRY_RAW - SOIL_WET_RAW);
  if (moisture < 0.0f) moisture = 0.0f;
  if (moisture > 100.0f) moisture = 100.0f;
  Serial.print(" | moisture=");
  Serial.print(moisture, 1);
  Serial.println("%");
}
