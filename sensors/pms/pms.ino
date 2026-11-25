#include <Arduino.h>

// MOSSIFIER - PMS5003 PM1 + PM2.5 diagnostic | ESP32 | Arduino IDE 1.8.5
// Reports only atmospheric PM1 and PM2.5 mass concentration (ug/m3).
#define PMS_RX_PIN 16
#define PMS_TX_PIN 17

const uint32_t PMS_BAUD = 9600;
const uint32_t WARMUP_MS = 30000UL;
const uint32_t FRAME_TIMEOUT_MS = 5000UL;
const uint32_t PRINT_INTERVAL_MS = 1000UL;
const uint8_t AVERAGE_WINDOW = 10;

uint8_t frame[32];
uint8_t frameIndex = 0;

bool hasValidFrame = false;
uint32_t lastValidFrameMs = 0;
uint32_t lastPrintMs = 0;
uint32_t validFrameCount = 0;
uint32_t badFrameCount = 0;

uint16_t rawPm1 = 0;
uint16_t rawPm25 = 0;
uint16_t pm1Samples[AVERAGE_WINDOW] = {};
uint16_t pm25Samples[AVERAGE_WINDOW] = {};
uint8_t sampleCount = 0;
uint8_t sampleIndex = 0;

uint16_t readU16(uint8_t highByteIndex) {
  return ((uint16_t)frame[highByteIndex] << 8) | frame[highByteIndex + 1];
}

void storeAverageSample(uint16_t pm1, uint16_t pm25) {
  pm1Samples[sampleIndex] = pm1;
  pm25Samples[sampleIndex] = pm25;
  sampleIndex = (sampleIndex + 1) % AVERAGE_WINDOW;
  if (sampleCount < AVERAGE_WINDOW) sampleCount++;
}

float averageOf(const uint16_t *values) {
  if (sampleCount == 0) return 0.0f;
  uint32_t total = 0;
  for (uint8_t i = 0; i < sampleCount; i++) total += values[i];
  return (float)total / sampleCount;
}

bool validateAndStoreFrame() {
  // Validate full frame and checksum; only extract PM1 and PM2.5 fields.
  if (readU16(2) != 28) {
    badFrameCount++;
    return false;
  }
  uint16_t calculatedChecksum = 0;
  for (uint8_t i = 0; i < 30; i++) calculatedChecksum += frame[i];
  if (calculatedChecksum != readU16(30)) {
    badFrameCount++;
    return false;
  }

  // Atmospheric environment values, in ug/m3. PM10 and particle bins ignored.
  rawPm1 = readU16(10);
  rawPm25 = readU16(12);
  storeAverageSample(rawPm1, rawPm25);
  hasValidFrame = true;
  lastValidFrameMs = millis();
  validFrameCount++;
  return true;
}

void readPMS() {
  while (Serial2.available() > 0) {
    const uint8_t value = (uint8_t)Serial2.read();

    if (frameIndex == 0) {
      if (value == 0x42) frame[frameIndex++] = value;
      continue;
    }
    if (frameIndex == 1) {
      if (value == 0x4D) {
        frame[frameIndex++] = value;
      } else if (value == 0x42) {
        frame[0] = value;
        frameIndex = 1;
      } else {
        frameIndex = 0;
      }
      continue;
    }

    frame[frameIndex++] = value;
    if (frameIndex == sizeof(frame)) {
      frameIndex = 0;
      validateAndStoreFrame();
    }
  }
}

void printReadings() {
  const uint32_t now = millis();
  const bool fresh = hasValidFrame && (now - lastValidFrameMs <= FRAME_TIMEOUT_MS);

  Serial.println();
  Serial.println("========== PMS5003 PM1 + PM2.5 ==========");
  Serial.print("Valid frames: ");
  Serial.print(validFrameCount);
  Serial.print(" | bad frames: ");
  Serial.println(badFrameCount);

  if (!fresh) {
    Serial.println("STATUS: NO FRESH VALID FRAME (check UART/power/wiring)");
    Serial.println("PM1=NULL | PM2.5=NULL");
    Serial.println("=========================================");
    return;
  }

  Serial.println("Atmospheric values (sensor-reported; ug/m3):");
  Serial.print("PM1 raw=");
  Serial.print(rawPm1);
  Serial.print(" | 10-frame average=");
  Serial.println(averageOf(pm1Samples), 1);
  Serial.print("PM2.5 raw=");
  Serial.print(rawPm25);
  Serial.print(" | 10-frame average=");
  Serial.println(averageOf(pm25Samples), 1);
  Serial.print("Warm-up: ");
  Serial.println(now >= WARMUP_MS ? "complete" : "in progress; allow 30 seconds");
  Serial.println("No software calibration, humidity correction, or AQI conversion applied.");
  Serial.println("=========================================");
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(PMS_BAUD, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  Serial.println("PMS5003 PM1 + PM2.5 test ready.");
  Serial.println("PMS TXD -> GPIO16/RX2; VCC -> 5V; GND -> common GND.");
  Serial.println("Only PM1 and PM2.5 are extracted/reported; allow 30 seconds warm-up.");
}

void loop() {
  readPMS();
  const uint32_t now = millis();
  if (now - lastPrintMs >= PRINT_INTERVAL_MS) {
    lastPrintMs = now;
    printReadings();
  }
}
