#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <math.h>
#include "config.h"
#include "page.h"

// GPIO13/14 are output roles despite their external boot pull-downs.
// GPIO32/33 are INPUT without internal pulls; GPIO33 has a divider lower leg.
// ADC1 works alongside WiFi. DOUT is unwired and is never read.
//
// The pin-map is canonical: keep the physical 10k/12k protective divider.
// At 5V sensor output the ADC sees about 2.73V, not 5V.
// Real ESP32 ADC raw counts are not a precision linear voltmeter; use the
// core's calibrated millivolt API for real gas voltage reconstruction.
// Registry direct-connection 372..4095 is NOT this circuit's calibration.
// Relative gas % is illustrative only: no gas identification or ppm accuracy.
// Neither this controller nor its fans constitute a safety alarm.
//
// Manual pump and demo obey sensor inhibit, pulse bounds and soak cooldown.
// Manual controls leave automatic mode; fan on stays on until a command.
// Boot begins with both outputs LOW; automation starts after a valid sample.
// HTTP controls are LAN-only convenience controls, without authentication.

WebServer server(80);

enum class ControlMode { Automatic, Manual, Demo };
ControlMode mode = ControlMode::Automatic;

bool pumpOn = false;
bool fanOn = false;
bool hasWatered = false;
bool sampled = false;
bool soilPlausible = false;
bool gasPlausible = false;
int soilRaw = 0;
int gasRaw = 0;
int soilPercent = 0;
int gasPercent = 0;
uint32_t gasAdcMv = 0;
uint32_t lastSampleMs = 0;
uint32_t lastStatusMs = 0;
uint32_t pumpStartedMs = 0;
uint32_t pumpStoppedMs = 0;
uint32_t demoStartedMs = 0;

String serialTx;
char serialLine[96];
size_t serialLength = 0;
bool serialOverflow = false;

const char *modeName() {
  switch (mode) {
    case ControlMode::Automatic: return "automatic";
    case ControlMode::Demo: return "demo";
    default: return "manual/off";
  }
}

bool soilHealthy(uint32_t now) {
  return sampled && soilPlausible &&
         uint32_t(now - lastSampleMs) <= SENSOR_STALE_MS;
}

bool gasHealthy(uint32_t now) {
  return sampled && gasPlausible &&
         uint32_t(now - lastSampleMs) <= SENSOR_STALE_MS;
}

uint32_t soakRemaining(uint32_t now) {
  if (!hasWatered || pumpOn) return 0;
  const uint32_t elapsed = now - pumpStoppedMs;
  return elapsed < SOAK_COOLDOWN_MS ? SOAK_COOLDOWN_MS - elapsed : 0;
}

void setFan(bool on) {
  fanOn = on;
  digitalWrite(SHARED_FAN_PIN, on ? HIGH : LOW);
}

void stopPump(uint32_t now) {
  digitalWrite(PUMP_RELAY_PIN, LOW);
  if (pumpOn) {
    hasWatered = true;
    pumpStoppedMs = now;  // Cooldown is measured from the END of watering.
  }
  pumpOn = false;
}

String startPump(uint32_t now) {
  if (!soilHealthy(now)) return "Pump inhibited: soil sensor fault or stale.";
  if (pumpOn) return "Pump already running; deadline is not extended.";
  if (soakRemaining(now)) return "Pump inhibited: 30-second soak cooldown.";
  pumpStartedMs = now;
  pumpOn = true;
  digitalWrite(PUMP_RELAY_PIN, HIGH);
  return "Pump on: maximum 3 seconds.";
}

void allOff(uint32_t now) {
  stopPump(now);
  setFan(false);
}

void sampleSensors(uint32_t now) {
  soilRaw = analogRead(SOIL_SENSOR_PIN);
  gasRaw = analogRead(GAS_SENSOR_PIN);
  gasAdcMv = analogReadMilliVolts(GAS_SENSOR_PIN);

  soilPlausible = soilRaw >= SOIL_VALID_MIN_RAW &&
                  soilRaw <= SOIL_VALID_MAX_RAW;
  gasPlausible = gasRaw > 10 && gasRaw < 4090;

  soilPercent = constrain(
      int(lroundf(float(soilRaw - SOIL_DRY_RAW) * 100.0f /
                  float(SOIL_WET_RAW - SOIL_DRY_RAW))), 0, 100);

  float relative;
  if (USE_DIVIDED_SIMULATOR_GAS_CALIBRATION) {
    relative = (gasRaw - GAS_SIM_CLEAN_RAW) * 100.0f /
               (GAS_SIM_HIGH_RAW - GAS_SIM_CLEAN_RAW);
  } else {
    const float sensorOutputMv = gasAdcMv / GAS_DIVIDER_RATIO;
    relative = (sensorOutputMv - GAS_CLEAN_OUTPUT_MV) * 100.0f /
               (GAS_HIGH_OUTPUT_MV - GAS_CLEAN_OUTPUT_MV);
  }
  gasPercent = constrain(int(lroundf(relative)), 0, 100);
  sampled = true;
  lastSampleMs = now;
}

void serviceController(uint32_t now) {
  if (pumpOn &&
      (uint32_t(now - pumpStartedMs) >= PUMP_PULSE_MS || !soilHealthy(now))) {
    stopPump(now);
  }

  if (mode == ControlMode::Demo) {
    if (uint32_t(now - demoStartedMs) >= FAN_DEMO_MS) {
      allOff(now);
      mode = ControlMode::Manual;  // Never resume automation after demo.
    }
    return;
  }

  if (mode != ControlMode::Automatic) return;

  if (!pumpOn && soilHealthy(now) && soilPercent < WATER_BELOW_PERCENT &&
      !soakRemaining(now)) {
    startPump(now);
  }

  // Invalid gas input inhibits automatic decisions; fans turn off.
  // This is deliberately not a fail-safe gas alarm.
  if (!gasHealthy(now)) {
    setFan(false);
  } else if (gasPercent > VENTILATE_ABOVE_PERCENT) {
    setFan(true);
  } else if (gasPercent < VENTILATE_OFF_BELOW_PERCENT) {
    setFan(false);
  }
}

const char *gasCalibrationName() {
  return USE_DIVIDED_SIMULATOR_GAS_CALIBRATION
      ? "Simulator assumption: direct raw 372..4095 attenuated by 12/22"
      : "Real ADC mV / (12/22); illustrative sensor output 0.3..4.5V";
}

String statusJson(uint32_t now) {
  String s;
  s.reserve(700);
  s = "{\"soil_raw\":";
  s += soilRaw;
  s += ",\"soil_percent\":";
  s += soilHealthy(now) ? String(soilPercent) : String("null");
  s += ",\"gas_raw\":";
  s += gasRaw;
  s += ",\"gas_adc_mv\":";
  s += gasAdcMv;
  s += ",\"gas_percent\":";
  s += gasHealthy(now) ? String(gasPercent) : String("null");
  s += ",\"mode\":\"";
  s += modeName();
  s += "\",\"pump\":";
  s += pumpOn ? "true" : "false";
  s += ",\"fan\":";
  s += fanOn ? "true" : "false";
  s += ",\"soak_seconds\":";
  s += (soakRemaining(now) + 999) / 1000;
  s += ",\"water_below\":";
  s += WATER_BELOW_PERCENT;
  s += ",\"fan_above\":";
  s += VENTILATE_ABOVE_PERCENT;
  s += ",\"fan_below\":";
  s += VENTILATE_OFF_BELOW_PERCENT;
  s += ",\"uptime\":";
  s += now / 1000;
  s += ",\"warmup\":";
  s += now < GAS_WARMUP_ADVISORY_MS ? "true" : "false";
  s += ",\"gas_calibration\":\"";
  s += gasCalibrationName();
  s += "\",\"warning\":\"Real MQ2 needs warmup and gas calibration; calibrate soil dry/wet. Demo thresholds only, not ppm, not a safety alarm.\"}";
  return s;
}

String executeCommand(String command, uint32_t now) {
  command.trim();
  command.toLowerCase();
  if (command == "help") {
    return "help | auto | off | demo | pump on | pump off | fan on | fan off. "
           "Manual commands leave auto. Pump: 3s max, 30s soak, soil fault inhibit. "
           "Demo finishes OFF. Thresholds adjustable in config.h. "
           "Real MQ2 needs warmup and calibration; not ppm or a safety alarm.";
  }
  if (command == "auto") {
    allOff(now);
    mode = ControlMode::Automatic;
    return "Automatic enabled; sensor checks and existing soak cooldown apply.";
  }
  if (command == "off") {
    allOff(now);
    mode = ControlMode::Manual;
    return "All outputs OFF; automatic disabled.";
  }
  if (command == "demo") {
    if (mode == ControlMode::Demo) return "Demo already running; not extended.";
    // Reject before touching an existing mode/output.
    if (pumpOn) return "Demo rejected: pump already running.";
    if (!soilHealthy(now)) return "Demo inhibited: soil sensor fault or stale.";
    if (soakRemaining(now)) return "Demo inhibited: soak cooldown.";
    allOff(now);
    mode = ControlMode::Demo;
    demoStartedMs = now;
    startPump(now);
    setFan(true);
    return "Demo: pump at most 3s, fans 5s, then all OFF.";
  }
  if (command == "pump on" || command == "pump off" ||
      command == "fan on" || command == "fan off") {
    if (mode == ControlMode::Demo) allOff(now); // Cancel demo safely.
    mode = ControlMode::Manual;
    if (command == "pump on") return startPump(now);
    if (command == "pump off") {
      stopPump(now);
      return "Pump OFF; automatic disabled.";
    }
    setFan(command == "fan on");
    return fanOn ? "Fans ON; automatic disabled." : "Fans OFF; automatic disabled.";
  }
  return "Unknown command. Use help.";
}

// Bounded queue and availableForWrite avoid waiting for Serial transmission.
void queueSerial(const String &text) {
  if (serialTx.length() + text.length() + 1 <= 2400) {
    serialTx += text;
    serialTx += '\n';
  }
}

void serviceSerial(uint32_t now) {
  // Limit RX work per loop so a noisy sender cannot starve output deadlines.
  for (unsigned i = 0; i < 64 && Serial.available(); ++i) {
    const char c = char(Serial.read());
    if (c == '\r' || c == '\n') {
      if (serialOverflow) {
        queueSerial("Command too long; discarded.");
      } else if (serialLength) {
        serialLine[serialLength] = '\0';
        queueSerial(executeCommand(String(serialLine), now));
      }
      serialLength = 0;
      serialOverflow = false;
    } else if (!serialOverflow) {
      if (serialLength < sizeof(serialLine) - 1) {
        serialLine[serialLength++] = c;
      } else {
        serialOverflow = true;
      }
    }
  }
  const int room = Serial.availableForWrite();
  if (room > 0 && serialTx.length()) {
    size_t n = serialTx.length();
    if (n > size_t(room)) n = size_t(room);
    if (n > 64) n = 64;
    Serial.write(reinterpret_cast<const uint8_t *>(serialTx.c_str()), n);
    serialTx.remove(0, n);
  }
}

void setup() {
  // External pull-downs hold OFF during reset; preload LOW before OUTPUT.
  digitalWrite(PUMP_RELAY_PIN, LOW);
  digitalWrite(SHARED_FAN_PIN, LOW);
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  pinMode(SHARED_FAN_PIN, OUTPUT);
  pinMode(SOIL_SENSOR_PIN, INPUT);
  pinMode(GAS_SENSOR_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(GAS_SENSOR_PIN, ADC_11db);

  Serial.begin(115200);
  serialTx.reserve(2400);
  queueSerial("Plant controller: boot outputs OFF. Type help.");
  queueSerial("Real MQ2 needs warmup/conditioning and real gas calibration; "
              "calibrate soil dry/wet. Relative demo level, not ppm, not a safety alarm.");
  queueSerial(gasCalibrationName());

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Always call begin: placeholder credentials join the simulator network.
  // On hardware replace these credentials with your real LAN credentials.
  WiFi.begin(NETWORK_SSID, NETWORK_PASSWORD);

  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html", DASHBOARD_PAGE);
  });
  server.on("/api/status", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", statusJson(millis()));
  });
  server.on("/api/control", HTTP_POST, []() {
    serviceController(millis());
    const String response = executeCommand(server.arg("cmd"), millis());
    server.send(200, "text/plain", response);
    queueSerial(response);
  });
  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });
  server.begin();
}

void loop() {
  uint32_t now = millis();
  // Check deadlines before any network processing.
  serviceController(now);
  if (!sampled || uint32_t(now - lastSampleMs) >= SENSOR_INTERVAL_MS) {
    sampleSensors(now);
    serviceController(now);
  }
  serviceSerial(now);
  server.handleClient();
  serviceController(millis());

  static bool connectedPreviously = false;
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !connectedPreviously) {
    queueSerial("Dashboard: http://" + WiFi.localIP().toString() + "/");
  } else if (!connected && connectedPreviously) {
    queueSerial("WiFi disconnected; local controller continues.");
  }
  connectedPreviously = connected;

  now = millis();
  if (uint32_t(now - lastStatusMs) >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    queueSerial(statusJson(now));
  }
}
