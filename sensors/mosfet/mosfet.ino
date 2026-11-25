#include <Arduino.h>
#include <math.h>
#include <stdlib.h>

// MOSSIFIER - MOSFET output test | ESP32 | Arduino IDE 1.8.5
#define FAN_MOSFET_PIN 14
#define LED_MOSFET_PIN 26

#define FAN_PWM_CHANNEL 0
#define LED_PWM_CHANNEL 1
#define PWM_FREQUENCY 5000
#define PWM_RESOLUTION 8
#define PWM_MAX 255

String commandLine;

void setDuty(const char *name, uint8_t channel, float percentage) {
  const uint8_t pwmValue = (uint8_t)roundf(percentage * PWM_MAX / 100.0f);
  ledcWrite(channel, pwmValue);
  Serial.print(name);
  Serial.print(" duty: ");
  Serial.print(percentage, 2);
  Serial.print("% | PWM: ");
  Serial.println(pwmValue);
}

bool parsePercentage(const String &value, float &percentage) {
  if (value.length() == 0) return false;

  char *end = NULL;
  percentage = strtof(value.c_str(), &end);
  if (end == value.c_str() || *end != '\0' || !isfinite(percentage)) return false;
  return percentage >= 0.0f && percentage <= 100.0f;
}

void handleCommand(String command) {
  command.trim();
  command.toLowerCase();
  if (command.length() == 0) return;

  const int separator = command.indexOf(' ');
  const String action = separator < 0 ? command : command.substring(0, separator);
  String argument = separator < 0 ? "" : command.substring(separator + 1);
  argument.trim();

  if (action == "help" && argument.length() == 0) {
    Serial.println("Commands: fan <0..100>, led <0..100>, all 0, help");
    return;
  }

  if (action == "all" && argument == "0") {
    setDuty("Fan", FAN_PWM_CHANNEL, 0.0f);
    setDuty("LED", LED_PWM_CHANNEL, 0.0f);
    return;
  }

  float percentage;
  if (action == "fan" && parsePercentage(argument, percentage)) {
    setDuty("Fan", FAN_PWM_CHANNEL, percentage);
  } else if (action == "led" && parsePercentage(argument, percentage)) {
    setDuty("LED", LED_PWM_CHANNEL, percentage);
  } else {
    Serial.println("Invalid command/value. Type help; percentages must be 0..100.");
  }
}

void setup() {
  Serial.begin(115200);
  commandLine.reserve(40);

  // Configure 8-bit PWM and initialize both outputs to zero duty.
  ledcSetup(FAN_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcSetup(LED_PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttachPin(FAN_MOSFET_PIN, FAN_PWM_CHANNEL);
  ledcAttachPin(LED_MOSFET_PIN, LED_PWM_CHANNEL);
  ledcWrite(FAN_PWM_CHANNEL, 0);
  ledcWrite(LED_PWM_CHANNEL, 0);

  Serial.println("MOSFET PWM ready. Outputs start at 0%. Type help.");
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
