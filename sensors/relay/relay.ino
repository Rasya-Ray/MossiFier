#include <Arduino.h>

// MOSSIFIER - relay/pump output test | ESP32 | Arduino IDE 1.8.5
#define PUMP_RELAY_PIN 13
// Same active-LOW relay logic as the main project.
#define RELAY_ON LOW
#define RELAY_OFF HIGH

String commandLine;
bool pumpOn = false;

void setPump(bool on) {
  pumpOn = on;
  digitalWrite(PUMP_RELAY_PIN, on ? RELAY_ON : RELAY_OFF);
  Serial.println(on ? "Relay/Pump ON" : "Relay/Pump OFF");
}

void handleCommand(String command) {
  command.trim();
  command.toLowerCase();
  if (command == "pump on" || command == "relay on") setPump(true);
  else if (command == "pump off" || command == "relay off" || command == "all off") setPump(false);
  else if (command == "help") Serial.println("Commands: pump on/off, relay on/off, all off");
  else if (command.length() > 0) Serial.println("Unknown command. Type help.");
}

void setup() {
  // Preload inactive level before setting output mode (active-LOW relay).
  digitalWrite(PUMP_RELAY_PIN, RELAY_OFF);
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  Serial.begin(115200);
  commandLine.reserve(40);
  Serial.println("Relay test ready. Relay starts OFF. Type help.");
}

void loop() {
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (commandLine.length() > 0) {
        handleCommand(commandLine);
        commandLine = "";
      }
    } else if (commandLine.length() < 40) {
      commandLine += c;
    }
  }
}
