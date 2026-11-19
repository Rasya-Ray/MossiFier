
#pragma once
#include <Arduino.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "config.h"

WebServer server(80);

struct VisionData {
    float healthy = 0;
    float stressed = 0;
    float critical = 0;

    float confidence = 0;

    // 0 = Unknown
    // 1 = Healthy
    // 2 = Stressed
    // 3 = Critical
    uint8_t status = 0;

    bool available = false;
    uint32_t lastUpdate = 0;
};

VisionData vision;

// =====================================
// RECEIVE COMPUTER VISION JSON
// =====================================

void receiveVision() {
    if (!server.hasArg("plain")) {
        server.send(
            400,
            "application/json",
            "{\"error\":\"Missing JSON body\"}"
        );
        return;
    }

    JsonDocument doc;

    DeserializationError error =
        deserializeJson(doc, server.arg("plain"));

    if (error) {
        server.send(
            400,
            "application/json",
            "{\"error\":\"Invalid JSON\"}"
        );
        return;
    }

    if (!doc["healthy"].is<float>() ||
        !doc["stressed"].is<float>() ||
        !doc["critical"].is<float>()) {

        server.send(
            400,
            "application/json",
            "{\"error\":\"Missing percentage fields\"}"
        );
        return;
    }

    float healthy = doc["healthy"];
    float stressed = doc["stressed"];
    float critical = doc["critical"];

    if (healthy < 0 || healthy > 100 ||
        stressed < 0 || stressed > 100 ||
        critical < 0 || critical > 100) {

        server.send(
            400,
            "application/json",
            "{\"error\":\"Percentage out of range\"}"
        );
        return;
    }

    vision.healthy = healthy;
    vision.stressed = stressed;
    vision.critical = critical;

    // Find highest probability
    if (healthy >= stressed && healthy >= critical) {
        vision.status = 1;
        vision.confidence = healthy;
    }
    else if (stressed >= critical) {
        vision.status = 2;
        vision.confidence = stressed;
    }
    else {
        vision.status = 3;
        vision.confidence = critical;
    }

    vision.available = true;
    vision.lastUpdate = millis();

    server.send(
        200,
        "application/json",
        "{\"received\":true}"
    );
}

// =====================================
// VISION SERVER
// =====================================

void beginVisionServer() {
    server.on("/vision", HTTP_POST, receiveVision);

    server.on("/", HTTP_GET, []() {
        server.send(
            200,
            "text/plain",
            "ESP32 Decision System Ready"
        );
    });

    server.begin();
}

void updateVisionServer() {
    server.handleClient();

    if (vision.available &&
        millis() - vision.lastUpdate > VISION_TIMEOUT_MS) {

        vision.available = false;
        vision.status = 0;
        vision.confidence = 0;
    }
}
