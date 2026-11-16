#include <Arduino.h>
#include "decision_model.h"

// Existing ESP32 wiring agreed in this project:
#define MQ135_PIN       34
#define SOIL_PIN        35
#define RELAY_PUMP_PIN  26
#define MOSFET_FAN_PIN  25

// Most 1-channel relay boards are active LOW. Verify your module!
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// Soil calibration placeholders: measure your own sensor.
const int SOIL_DRY_RAW = 3000;
const int SOIL_WET_RAW = 1200;

// Replace these with actual values received from your separate CV model
// and PMS5003 parser. These constants are ONLY for bench testing.
float cvHealthy  = 80.0;
float cvStressed = 15.0;
float cvCritical = 5.0;
float pm25       = 15.0;  // PMS5003 PM2.5, micrograms/m3

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PUMP_PIN, OUTPUT);
  digitalWrite(RELAY_PUMP_PIN, RELAY_OFF);

  // Arduino-ESP32 core 3.x API
  ledcAttach(MOSFET_FAN_PIN, 25000, 8);
  ledcWrite(MOSFET_FAN_PIN, 0);

  analogReadResolution(12);

  Serial.println("Decision AI demo started");
}

void loop() {
  int mqRaw = analogRead(MQ135_PIN);
  int soilRaw = analogRead(SOIL_PIN);

  float soilPct = (float)(SOIL_DRY_RAW - soilRaw) * 100.0 /
                  (float)(SOIL_DRY_RAW - SOIL_WET_RAW);
  soilPct = constrain(soilPct, 0.0, 100.0);

  // Feature order MUST match Python training:
  // [CV healthy %, CV stressed %, CV critical %,
  //  soil %, MQ135 raw ADC, PMS5003 PM2.5]
  float features[6] = {
    cvHealthy, cvStressed, cvCritical,
    soilPct, (float)mqRaw, pm25
  };

  int fanPwm = DecisionAI::predictFan(features);
  int lightPwm = DecisionAI::predictLight(features);
  int pump = DecisionAI::predictPump(features);

  fanPwm = constrain(fanPwm, 0, 255);
  lightPwm = constrain(lightPwm, 0, 255);
  pump = pump ? 1 : 0;

  // Apply outputs
  ledcWrite(MOSFET_FAN_PIN, fanPwm);
  digitalWrite(RELAY_PUMP_PIN, pump ? RELAY_ON : RELAY_OFF);

  // NOTE: Light output is predicted, but NOT connected yet.
  // Add a suitable MOSFET/driver and assign a free PWM-capable GPIO
  // before enabling the light output. Do not connect a lamp directly
  // to an ESP32 GPIO.
  // Example after hardware is installed:
  // ledcAttach(LIGHT_PIN, 5000, 8);
  // ledcWrite(LIGHT_PIN, lightPwm);

  Serial.println("===== DECISION AI =====");
  Serial.printf("MQ135 raw: %d\n", mqRaw);
  Serial.printf("Soil raw: %d | Soil: %.1f%%\n", soilRaw, soilPct);
  Serial.printf("CV H/S/C: %.1f / %.1f / %.1f\n",
                cvHealthy, cvStressed, cvCritical);
  Serial.printf("PM2.5: %.1f ug/m3\n", pm25);
  Serial.printf("Fan PWM: %d\n", fanPwm);
  Serial.printf("Light PWM recommendation: %d (not wired)\n", lightPwm);
  Serial.printf("Pump: %s\n", pump ? "ON" : "OFF");

  delay(2000);
}
