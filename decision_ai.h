
#pragma once
#include <Arduino.h>
#include "config.h"
#include "sensors.h"
#include "vision.h"

struct AIResult {
    bool pump = false;
    bool fan = false;
    bool led = false;

    int fanPWM = 0;
    int ledPWM = 0;

    bool soilDry = false;
    bool airDirty = false;
};

// =====================================
// REVISION AI - DECISION ENGINE
// =====================================

AIResult revisionAI() {
    AIResult result;

    // 1. Analyze soil condition
    result.soilDry =
        sensors.soilPercent < SOIL_DRY_LIMIT;

    // 2. Analyze air quality
    bool pmHigh =
        sensors.pmsValid &&
        sensors.pm25 > PM25_LIMIT;

    bool gasHigh =
        sensors.mq135Raw > MQ135_RAW_LIMIT;

    result.airDirty = pmHigh || gasHigh;

    // 3. Initial actuator decisions
    if (result.soilDry) {
        result.pump = true;
    }

    if (result.airDirty) {
        result.fan = true;
        result.fanPWM = FAN_PWM_LEVEL;
    }

    // 4. Analyze plant condition
    if (vision.available) {

        if (vision.status == 3) {
            result.led = true;
            result.ledPWM = LED_CRITICAL_PWM;
        }
        else if (vision.status == 2) {
            result.led = true;
            result.ledPWM = LED_STRESSED_PWM;
        }
    }

    // 5. Limit simultaneous actuators
    // Priority: Pump > Fan > LED

    uint8_t activeCount = 0;

    if (result.pump) {
        activeCount++;
    }

    if (result.fan) {
        if (activeCount < MAX_ACTIVE_ACTUATORS) {
            activeCount++;
        }
        else {
            result.fan = false;
            result.fanPWM = 0;
        }
    }

    if (result.led) {
        if (activeCount < MAX_ACTIVE_ACTUATORS) {
            activeCount++;
        }
        else {
            result.led = false;
            result.ledPWM = 0;
        }
    }

    return result;
}
