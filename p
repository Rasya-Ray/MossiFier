#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <math.h>
#include "esp_adc_cal.h"
#include "esp_system.h"

// ==================================================
// MOSSIFIER ESP32 - TEST VERSION
// Pin, sensor, dan aktuator sama persis dengan uji.ino (sudah teruji works)
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
// HARDCODED WIFI CONFIGURATION
// ==================================================

const char* WIFI_SSID = "Ga modal";
const char* WIFI_PASSWORD = "Atuampe8";

// ==================================================
// SUPABASE CONFIGURATION
// ==================================================

const char* SUPABASE_URL =
    "https://ujnwgtdvwguebwxnorut.supabase.co";

const char* SUPABASE_KEY =
    "sb_publishable_Z8m_9Kld6vLzO-dsVH5SHQ_ctsCVZXH";

const char* SUPABASE_TABLE = "/rest/v1/devices";

// ==================================================
// INTERVAL CONFIGURATION
// ==================================================

#define SUPABASE_INTERVAL_MS 8000UL
#define WIFI_RETRY_INTERVAL 10000UL

unsigned long lastSupabaseUpload = 0;
unsigned long lastWifiAttempt = 0;

bool firstUpload = true;
bool clockSynced = false;

// ==================================================
// GLOBAL OBJECTS
// ==================================================

WebServer server(80);

WiFiClientSecure secureClient;

// ==================================================
// ROOT CA - GTS ROOT R4
// ==================================================

const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIICCjCCAZGgAwIBAgIQbkepyIuUtui7OyrYorLBmTAKBggqhkjOPQQDAzBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQA
IgNiAATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzu
hXyiQHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/l
xKvRHYqjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1Ud
DgQWBBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNnADBkAjBqUFJ0
CMRw3J5QdCHojXohw0+WbhXRIjVhLfoIN+4Zba3bssx9BzT1YBkstTTZbyACMANx
sbqjYAuG7ZoIapVon+Kz4ZNkfF6Tpt95LY2F45TPI11xzPKwTdb+mciUqXWi4w==
-----END CERTIFICATE-----
)EOF";

// ==================================================
// DEVICE IDENTIFICATION
// ==================================================

String getDeviceID() {

    String mac = WiFi.macAddress();

    mac.replace(":", "");

    return "MOSS-" + mac;
}

// ==================================================
// VISION DATA
// ==================================================

float healthy = 0;
float stressed = 0;
float critical = 0;
float confidence = 0;

int statusCode = 0;

String status = "UNKNOWN";

bool visionReceived = false;

// ==================================================
// SOIL CALIBRATION
// ==================================================

int SOIL_DRY = 3000;
int SOIL_WET = 1200;

// ==================================================
// SENSOR DATA STRUCTURE
// ==================================================

struct SensorData {

    int soilRaw;

    float soilMoisture;

    int mq135Raw1;
    int mq135Raw2;

    int pm1;
    int pm25;
    int pm10;

    bool pmsAvailable;

    bool pumpState;
    bool fanState;
    bool ledState;
};

SensorData sensorData = {};

// ==================================================
// ACTUATOR STATE
// ==================================================

bool pumpState = false;
bool fanState = false;
bool ledState = false;

// Relay active LOW
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==================================================
// NTP TIME SYNCHRONIZATION
// ==================================================

void syncClock() {

    if (WiFi.status() != WL_CONNECTED) {

        Serial.println("[NTP] WiFi not connected!");

        clockSynced = false;

        return;
    }

    Serial.println("[NTP] Synchronizing time...");

    configTime(
        0,
        0,
        "pool.ntp.org",
        "time.google.com"
    );

    time_t now = time(nullptr);

    unsigned long start = millis();

    while (now < 1700000000 &&
           millis() - start < 15000) {

        delay(500);

        Serial.print(".");

        now = time(nullptr);
    }

    if (now >= 1700000000) {

        clockSynced = true;

        Serial.println();
        Serial.println("[NTP] Time synchronized!");

        Serial.print("[NTP] Timestamp: ");
        Serial.println((unsigned long)now);

    } else {

        clockSynced = false;

        Serial.println();
        Serial.println("[NTP] Synchronization failed!");
    }
}

// ==================================================
// WIFI CONNECTION
// ==================================================

void connectWiFi() {

    Serial.println();
    Serial.println("================================");
    Serial.println("       WIFI CONNECTION");
    Serial.println("================================");

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );

    Serial.print("Connecting to WiFi");

    unsigned long timeout = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - timeout < 20000) {

        delay(500);

        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {

        Serial.println("[SUCCESS] WiFi Connected!");

        Serial.print("[INFO] IP Address: ");
        Serial.println(WiFi.localIP());

        Serial.print("[INFO] MAC Address: ");
        Serial.println(WiFi.macAddress());

        Serial.print("[INFO] Device ID: ");
        Serial.println(getDeviceID());

        Serial.print("[INFO] Signal Strength: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

    } else {

        Serial.println("[ERROR] WiFi Connection Failed!");
    }

    Serial.println("================================");
}

// ==================================================
// WIFI RECONNECT
// ==================================================

bool ensureWiFi() {

    if (WiFi.status() == WL_CONNECTED) {

        return true;
    }

    Serial.println("[WIFI] Connection lost!");

    Serial.println("[WIFI] Reconnecting...");

    WiFi.reconnect();

    unsigned long timeout = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - timeout < 10000) {

        delay(250);
    }

    if (WiFi.status() == WL_CONNECTED) {

        Serial.println("[WIFI] Reconnected!");

        Serial.print("[WIFI] IP Address: ");
        Serial.println(WiFi.localIP());

        return true;
    }

    Serial.println("[WIFI] Reconnection failed!");

    return false;
}

// ==================================================
// ANALOG SENSOR FUNCTIONS
// ==================================================

int readAnalogAverage(int pin) {

    long total = 0;

    for (int i = 0; i < 10; i++) {

        total += analogRead(pin);

        delay(5);
    }

    return total / 10;
}

// ==================================================
// SOIL CALIBRATION
// ==================================================

float calibrateSoilMoisture(
    int rawValue,
    int dryValue,
    int wetValue
) {

    if (dryValue == wetValue) {

        return 0;
    }

    float moisture =
        ((float)(dryValue - rawValue) /
        (float)(dryValue - wetValue)) * 100.0;

    return constrain(moisture, 0.0, 100.0);
}

// ==================================================
// READ SOIL MOISTURE - ONE SENSOR
// ==================================================

float readSoilMoisture() {

    int raw = readAnalogAverage(
        SOIL_SENSOR_PIN
    );

    sensorData.soilRaw = raw;

    return calibrateSoilMoisture(
        raw,
        SOIL_DRY,
        SOIL_WET
    );
}

// ==================================================
// MQ135 FUNCTIONS
// ==================================================

int readMQ135_1() {

    return readAnalogAverage(
        MQ135_1_PIN
    );
}

int readMQ135_2() {

    return readAnalogAverage(
        MQ135_2_PIN
    );
}

// ==================================================
// PMS5003 FUNCTIONS
// ==================================================

uint8_t pmsBuffer[32];

int pmsIndex = 0;

bool readPMS5003() {

    while (Serial2.available()) {

        uint8_t data = Serial2.read();

        if (pmsIndex == 0 && data != 0x42) {

            continue;
        }

        if (pmsIndex == 1 && data != 0x4D) {

            pmsIndex = 0;

            if (data == 0x42) {

                pmsBuffer[pmsIndex++] = data;
            }

            continue;
        }

        pmsBuffer[pmsIndex++] = data;

        if (pmsIndex >= 32) {

            pmsIndex = 0;

            uint16_t checksum = 0;

            for (int i = 0; i < 30; i++) {

                checksum += pmsBuffer[i];
            }

            uint16_t receivedChecksum =
                ((uint16_t)pmsBuffer[30] << 8) |
                pmsBuffer[31];

            if (checksum != receivedChecksum) {

                return false;
            }

            sensorData.pm1 =
                ((uint16_t)pmsBuffer[10] << 8) |
                pmsBuffer[11];

            sensorData.pm25 =
                ((uint16_t)pmsBuffer[12] << 8) |
                pmsBuffer[13];

            sensorData.pm10 =
                ((uint16_t)pmsBuffer[14] << 8) |
                pmsBuffer[15];

            sensorData.pmsAvailable = true;

            return true;
        }
    }

    return false;
}

// ==================================================
// READ ALL SENSORS
// ==================================================

void readAllSensors() {

    Serial.println();
    Serial.println("========== SENSOR READING ==========");

    // SOIL MOISTURE

    sensorData.soilMoisture =
        readSoilMoisture();

    Serial.print("[SOIL] RAW: ");
    Serial.println(sensorData.soilRaw);

    Serial.print("[SOIL] Moisture: ");
    Serial.print(sensorData.soilMoisture);
    Serial.println("%");

    // MQ135

    sensorData.mq135Raw1 = readMQ135_1();

    sensorData.mq135Raw2 = readMQ135_2();

    Serial.print("[MQ135 1] RAW: ");
    Serial.println(sensorData.mq135Raw1);

    Serial.print("[MQ135 2] RAW: ");
    Serial.println(sensorData.mq135Raw2);

    // PMS5003

    readPMS5003();

    if (sensorData.pmsAvailable) {

        Serial.print("[PMS5003] PM1: ");
        Serial.println(sensorData.pm1);

        Serial.print("[PMS5003] PM2.5: ");
        Serial.println(sensorData.pm25);

        Serial.print("[PMS5003] PM10: ");
        Serial.println(sensorData.pm10);

    } else {

        Serial.println("[PMS5003] Waiting for sensor data...");
    }

    // ACTUATORS

    sensorData.pumpState = pumpState;
    sensorData.fanState = fanState;
    sensorData.ledState = ledState;

    Serial.print("[PUMP] ");
    Serial.println(pumpState ? "ON" : "OFF");

    Serial.print("[FAN] ");
    Serial.println(fanState ? "ON" : "OFF");

    Serial.print("[LED] ");
    Serial.println(ledState ? "ON" : "OFF");

    Serial.println("====================================");
}

// ==================================================
// ACTUATOR FUNCTIONS
// ==================================================

void setPump(bool state) {

    pumpState = state;

    digitalWrite(
        PUMP_RELAY_PIN,
        state ? RELAY_ON : RELAY_OFF
    );

    Serial.print("[PUMP] ");
    Serial.println(state ? "ON" : "OFF");
}

bool getPumpState() {

    return pumpState;
}

void setFan(bool state) {

    fanState = state;

    digitalWrite(
        FAN_MOSFET_PIN,
        state ? HIGH : LOW
    );

    Serial.print("[FAN] ");
    Serial.println(state ? "ON" : "OFF");
}

bool getFanState() {

    return fanState;
}

void setLED(bool state) {

    ledState = state;

    digitalWrite(
        LED_MOSFET_PIN,
        state ? HIGH : LOW
    );

    Serial.print("[LED] ");
    Serial.println(state ? "ON" : "OFF");
}

bool getLEDState() {

    return ledState;
}

// ==================================================
// VISION STATUS
// ==================================================

void updateVisionStatus() {

    if (healthy >= stressed &&
        healthy >= critical) {

        status = "HEALTHY";

        confidence = healthy;

        statusCode = 1;

    } else if (stressed >= healthy &&
               stressed >= critical) {

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
// RECEIVE VISION JSON
// ==================================================

void handleVisionPost() {

    Serial.println();
    Serial.println("========== VISION REQUEST ==========");

    String body = server.arg("plain");

    Serial.print("[VISION] Payload: ");
    Serial.println(body);

    StaticJsonDocument<256> doc;

    DeserializationError error =
        deserializeJson(doc, body);

    if (error) {

        Serial.println("[VISION] Invalid JSON!");

        server.send(
            400,
            "application/json",
            "{\"error\":\"Invalid JSON\"}"
        );

        return;
    }

    if (doc["healthy"].isNull() ||
        doc["stressed"].isNull() ||
        doc["critical"].isNull()) {

        Serial.println("[VISION] Missing data!");

        server.send(
            400,
            "application/json",
            "{\"error\":\"Missing data\"}"
        );

        return;
    }

    healthy = doc["healthy"].as<float>();

    stressed = doc["stressed"].as<float>();

    critical = doc["critical"].as<float>();

    if (healthy < 0 || healthy > 100 ||
        stressed < 0 || stressed > 100 ||
        critical < 0 || critical > 100) {

        Serial.println("[VISION] Invalid percentage!");

        server.send(
            400,
            "application/json",
            "{\"error\":\"Invalid percentage\"}"
        );

        return;
    }

    visionReceived = true;

    updateVisionStatus();

    Serial.println("[VISION] Data received!");

    Serial.print("[VISION] Healthy: ");
    Serial.println(healthy);

    Serial.print("[VISION] Stressed: ");
    Serial.println(stressed);

    Serial.print("[VISION] Critical: ");
    Serial.println(critical);

    Serial.print("[VISION] Confidence: ");
    Serial.println(confidence);

    Serial.print("[VISION] Status: ");
    Serial.println(status);

    Serial.print("[VISION] Status Code: ");
    Serial.println(statusCode);

    Serial.println("====================================");

    server.send(
        200,
        "application/json",
        "{\"received\":true}"
    );
}

// ==================================================
// SUPABASE UPLOAD
// ==================================================

void uploadSupabase() {

    Serial.println();
    Serial.println("====================================");
    Serial.println("       SUPABASE UPLOAD PROCESS");
    Serial.println("====================================");

    // WIFI CHECK

    if (!ensureWiFi()) {

        Serial.println("[ERROR] WiFi not connected!");

        return;
    }

    // NTP CHECK

    if (!clockSynced) {

        syncClock();

        if (!clockSynced) {

            Serial.println("[ERROR] NTP time unavailable!");

            return;
        }
    }

    Serial.println("[OK] WiFi connected!");

    // READ SENSORS

    readAllSensors();

    HTTPClient http;

    String url =
        String(SUPABASE_URL) + SUPABASE_TABLE;

    // BUILD JSON

    String jsonData = "{";

    jsonData += "\"device_id\":\"";
    jsonData += getDeviceID();
    jsonData += "\",";

    if (visionReceived) {

        jsonData += "\"status\":\"";
        jsonData += status;
        jsonData += "\",";

    } else {

        jsonData += "\"status\":null,";
    }

    // Other fields remain NULL for now.

    jsonData += "\"air_quality\":null,";
    jsonData += "\"co2_in\":null,";
    jsonData += "\"co2_out\":null,";
    jsonData += "\"humidity\":null,";
    jsonData += "\"brightness\":null,";
    jsonData += "\"fan_speed\":null";

    jsonData += "}";

    Serial.println();
    Serial.println("[INFO] DEVICE INFORMATION");

    Serial.print("[INFO] Device ID: ");
    Serial.println(getDeviceID());

    Serial.print("[INFO] MAC Address: ");
    Serial.println(WiFi.macAddress());

    Serial.print("[INFO] Vision Status: ");

    if (visionReceived) {

        Serial.println(status);

    } else {

        Serial.println("WAITING FOR VISION");
    }

    Serial.print("[INFO] Vision Confidence: ");
    Serial.println(confidence);

    Serial.println();
    Serial.println("[INFO] JSON PAYLOAD:");
    Serial.println(jsonData);

    // HTTPS REQUEST

    // GANTI secureClient.setInsecure DENGAN setCACert ROOT_CA SEBAGAI INSTRUKSI
    secureClient.setCACert(ROOT_CA);

    if (!http.begin(secureClient, url)) {

        Serial.println("[ERROR] HTTP begin failed!");

        return;
    }

    http.setTimeout(15000);

    http.addHeader(
        "apikey",
        SUPABASE_KEY
    );

    http.addHeader(
        "Content-Type",
        "application/json"
    );

    http.addHeader(
        "Prefer",
        "return=minimal"
    );

    Serial.println();
    Serial.println("[INFO] Sending POST request to Supabase...");

    int response = http.POST(jsonData);

    Serial.print("[HTTP] Response Code: ");
    Serial.println(response);

    if (response == 201 || response == 204) {

        Serial.println();
        Serial.println("[SUCCESS] SUPABASE UPLOAD SUCCESSFUL!");

        Serial.print("[SUCCESS] Device: ");
        Serial.println(getDeviceID());

        Serial.print("[SUCCESS] Status: ");

        if (visionReceived) {

            Serial.println(status);

        } else {

            Serial.println("NULL (Vision not received)");
        }

    } else if (response > 0) {

        String payload = http.getString();

        Serial.println();
        Serial.println("[FAILED] SUPABASE UPLOAD FAILED!");

        Serial.print("[HTTP] Error Code: ");
        Serial.println(response);

        Serial.print("[HTTP] Response Body: ");
        Serial.println(payload);

    } else {

        Serial.println();
        Serial.println("[ERROR] HTTP CONNECTION FAILED!");

        Serial.println(
            http.errorToString(response)
        );
    }

    http.end();

    Serial.println("====================================");
}

// ==================================================
// WEB SERVER
// ==================================================

void initWebServer() {

    // ROOT

    server.on("/", HTTP_GET, []() {

        String response = "MOSSIFIER ESP32 ONLINE\n";

        response += "IP: ";
        response += WiFi.localIP().toString();

        response += "\nMAC: ";
        response += WiFi.macAddress();

        response += "\nDEVICE ID: ";
        response += getDeviceID();

        server.send(
            200,
            "text/plain",
            response
        );
    });

    // VISION

    server.on(
        "/vision",
        HTTP_POST,
        handleVisionPost
    );

    // SENSOR DATA

    server.on("/sensors",  HTTP_GET, []() {

        readAllSensors();

        StaticJsonDocument<512> doc;

        doc["device_id"] = getDeviceID();

        doc["ip"] = WiFi.localIP().toString();

        doc["soil_raw"] = sensorData.soilRaw;

        doc["soil_moisture"] = sensorData.soilMoisture;

        doc["mq135_1"] = sensorData.mq135Raw1;

        doc["mq135_2"] = sensorData.mq135Raw2;

        doc["pm1"] = sensorData.pmsAvailable ?
                     sensorData.pm1 : -1;

        doc["pm25"] = sensorData.pmsAvailable ?
                      sensorData.pm25 : -1;

        doc["pm10"] = sensorData.pmsAvailable ?
                      sensorData.pm10 : -1;

        doc["pump"] = pumpState;

        doc["fan"] = fanState;

        doc["led"] = ledState;

        doc["vision_status"] = visionReceived ?
                               status : "UNKNOWN";

        String response;

        serializeJson(doc, response);

        server.send(
            200,
            "application/json",
            response
        );
    });

    // NOT FOUND

    server.onNotFound([]() {

        Serial.println("[SERVER] Unknown request!");

        Serial.print("[SERVER] URI: ");
        Serial.println(server.uri());

        server.send(
            404,
            "application/json",
            "{\"error\":\"Endpoint not found\"}"
        );
    });

    server.begin();

    Serial.println("[SERVER] WebServer Started!");
}

// ==================================================
// INITIALIZE ACTUATORS
// ==================================================

void initActuators() {

    pinMode(PUMP_RELAY_PIN, OUTPUT);

    pinMode(FAN_MOSFET_PIN, OUTPUT);

    pinMode(LED_MOSFET_PIN, OUTPUT);

    setPump(false);

    setFan(false);

    setLED(false);

    Serial.println("[ACTUATOR] Initialized!");
}

// ==================================================
// SETUP
// ==================================================

void setup() {

    Serial.begin(115200);

    delay(1000);

    Serial.println();
    Serial.println("====================================");
    Serial.println("       MOSSIFIER ESP32 SYSTEM");
    Serial.println("====================================");

    // ACTUATORS

    initActuators();

    // ADC CONFIGURATION

    analogReadResolution(12);

    analogSetPinAttenuation(
        SOIL_SENSOR_PIN,
        ADC_11db
    );

    analogSetPinAttenuation(
        MQ135_1_PIN,
        ADC_11db
    );

    analogSetPinAttenuation(
        MQ135_2_PIN,
        ADC_11db
    );

    Serial.println("[ADC] Initialized!");

    // PMS5003 UART2

    Serial2.begin(
        9600,
        SERIAL_8N1,
        PMS_RX_PIN,
        PMS_TX_PIN
    );

    Serial.println("[PMS5003] UART2 Initialized!");

    // WIFI

    connectWiFi();

    // NTP

    if (WiFi.status() == WL_CONNECTED) {

        syncClock();
    }

    // HTTPS ROOT CA
    // GANTI secureClient.setInsecure DENGAN setCACert ROOT_CA
    secureClient.setCACert(ROOT_CA);

    Serial.println("[HTTPS] Root CA configured!");

    // WEB SERVER

    initWebServer();

    Serial.println();
    Serial.println("========== SYSTEM READY ==========");

    if (WiFi.status() == WL_CONNECTED) {

        Serial.print("[SERVER] Open browser: http://");

        Serial.println(WiFi.localIP());

        Serial.print("[SERVER] Sensor endpoint: http://");

        Serial.print(WiFi.localIP());

        Serial.println("/sensors");

    } else {

        Serial.println("[SERVER] Waiting for WiFi connection...");
    }

    Serial.println("==================================");
}

// ==================================================
// LOOP
// ==================================================

void loop() {

    // Layani endpoint lokal terus-menerus.
    server.handleClient();

    // PMS5003

    readPMS5003();

    // WIFI RECONNECTION

    if (WiFi.status() != WL_CONNECTED) {

        if (millis() - lastWifiAttempt >=
            WIFI_RETRY_INTERVAL) {

            lastWifiAttempt = millis();

            ensureWiFi();
        }

    } else {

        // SUPABASE UPLOAD

        if (firstUpload ||
            millis() - lastSupabaseUpload >=
            SUPABASE_INTERVAL_MS) {

            uploadSupabase();

            lastSupabaseUpload = millis();

            firstUpload = false;
        }
    }

    // GANTI yield DENGAN delay seperlunya
    delay(2);
}