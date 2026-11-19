
#pragma once
#include <Arduino.h>
#include "config.h"

HardwareSerial PMS(2);

struct SensorData {
    int soilRaw = 0;
    float soilPercent = 0;

    int mq135Raw = 0;

    uint16_t pm1 = 0;
    uint16_t pm25 = 0;
    uint16_t pm10 = 0;

    bool pmsValid = false;
    uint32_t pmsLastUpdate = 0;
};

SensorData sensors;

// PMS5003 frame
uint8_t pmsBuffer[32];
uint8_t pmsIndex = 0;

// =====================================
// SENSOR INITIALIZATION
// =====================================

void beginSensors() {
    analogReadResolution(12);

    analogSetPinAttenuation(
        SOIL_SENSOR_PIN, ADC_11db
    );

    analogSetPinAttenuation(
        MQ135_SENSOR_PIN, ADC_11db
    );

    PMS.begin(
        PMS_BAUD,
        SERIAL_8N1,
        PMS_RX_PIN,
        PMS_TX_PIN
    );
}

// =====================================
// SOIL MOISTURE
// =====================================

void readSoilSensor() {
    sensors.soilRaw = analogRead(SOIL_SENSOR_PIN);

    sensors.soilPercent = constrain(
        map(
            sensors.soilRaw,
            SOIL_DRY_RAW,
            SOIL_WET_RAW,
            0,
            100
        ),
        0,
        100
    );
}

// =====================================
// MQ135
// =====================================

void readMQ135() {
    sensors.mq135Raw = analogRead(MQ135_SENSOR_PIN);
}

// =====================================
// PMS5003
// =====================================

void readPMS5003() {
    while (PMS.available()) {
        uint8_t data = PMS.read();

        if (pmsIndex == 0 && data != 0x42) {
            continue;
        }

        if (pmsIndex == 1 && data != 0x4D) {
            pmsIndex = 0;
            continue;
        }

        pmsBuffer[pmsIndex++] = data;

        if (pmsIndex == 32) {
            pmsIndex = 0;

            uint16_t frameLength =
                (uint16_t(pmsBuffer[2]) << 8) |
                pmsBuffer[3];

            uint16_t checksum = 0;

            for (int i = 0; i < 30; i++) {
                checksum += pmsBuffer[i];
            }

            uint16_t receivedChecksum =
                (uint16_t(pmsBuffer[30]) << 8) |
                pmsBuffer[31];

            if (frameLength != 28 ||
                checksum != receivedChecksum) {
                continue;
            }

            // Atmospheric environment values
            sensors.pm1 =
                (uint16_t(pmsBuffer[10]) << 8) |
                pmsBuffer[11];

            sensors.pm25 =
                (uint16_t(pmsBuffer[12]) << 8) |
                pmsBuffer[13];

            sensors.pm10 =
                (uint16_t(pmsBuffer[14]) << 8) |
                pmsBuffer[15];

            sensors.pmsValid = true;
            sensors.pmsLastUpdate = millis();
        }
    }

    // Detect stale PMS data
    if (sensors.pmsValid &&
        millis() - sensors.pmsLastUpdate > PMS_TIMEOUT_MS) {

        sensors.pmsValid = false;
    }
}

// =====================================
// READ ALL SENSORS
// =====================================

void readAllSensors() {
    readSoilSensor();
    readMQ135();
    readPMS5003();
}
