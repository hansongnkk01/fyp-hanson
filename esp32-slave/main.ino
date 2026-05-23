/*
 * FYP Slave ESP32 - Hardware control & measurement
 * Controls: 8ch relay, 3 LED zones, buzzer, LCD1602 I2C
 * Sensors: 0-25V voltage (ADC), INA219 current
 * UART to Master ESP32 @ 115200 baud
 *
 * Libraries (Arduino Library Manager):
 *   - ArduinoJson by Benoit Blanchon (v7+)
 *   - LiquidCrystal I2C by Frank de Brabander
 *   - Adafruit INA219
 *   - Adafruit BusIO (dependency)
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_INA219.h>
#include <ArduinoJson.h>
#include <math.h>

// ======================== CONFIGURATION ========================
#define UART_BAUD         115200
#define UART_PORT         Serial2
#define UART_RX_PIN       16
#define UART_TX_PIN       17

#define RELAY_COUNT       8
#define RELAY_ON          LOW    // Most 8ch modules are active-LOW
#define RELAY_OFF         HIGH

const int RELAY_PINS[RELAY_COUNT] = {23, 22, 21, 19, 18, 5, 4, 2};

#define LED_ZONE1_PIN     25
#define LED_ZONE2_PIN     26
#define LED_ZONE3_PIN     27
#define BUZZER_PIN        14

#define I2C_SDA_PIN       32
#define I2C_SCL_PIN       33
#define LCD_ADDR          0x27
#define LCD_COLS          16
#define LCD_ROWS          2

#define VOLTAGE_ADC_PIN   34
#define ADC_MAX           4095.0f
#define ADC_VREF          3.3f
#define CAL_V             7.576f   // 0-25V module scale; calibrate per docs/calibration.md
#define LOAD_RESISTOR_OHM 10000.0f // 10 kOhm for P = V^2/R

#define SAMPLE_COUNT      200
#define SAMPLE_INTERVAL_MS 10

// Relay 6 drives 12 V vibration motor (external supply via relay module)
#define VIBRATION_RELAY   6
#define CIRCUIT_RELAY_MAX 5

// Circuit names by relay number (1-based)
const char* CIRCUIT_NAMES[6] = {
  "", "Full-Wave Bridge", "Half-Wave", "2-Stage CWVM", "3-Stage CWVM", "4-Stage CWVM"
};

// ======================== GLOBALS ========================
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
Adafruit_INA219 ina219;

float vSamples[SAMPLE_COUNT];
float iSamples[SAMPLE_COUNT];

String uartLine = "";
bool ina219Ok = false;
int activeLedZone = 0;
String currentStage = "idle";

// ======================== RELAY CONTROL ========================
void initRelays() {
  for (int i = 0; i < RELAY_COUNT; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
  }
}

void allRelaysOff() {
  for (int i = 0; i < RELAY_COUNT; i++) {
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
  }
}

/** Turn off circuit relays 1–5 only; leave vibration (6) unchanged. */
void circuitRelaysOff() {
  for (int i = 0; i < CIRCUIT_RELAY_MAX; i++) {
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
  }
}

void setRelay(int relayNum, bool on) {
  if (relayNum < 1 || relayNum > RELAY_COUNT) return;
  digitalWrite(RELAY_PINS[relayNum - 1], on ? RELAY_ON : RELAY_OFF);
}

void setVibration(bool on) {
  setRelay(VIBRATION_RELAY, on);
}

int getRelayMask() {
  int mask = 0;
  for (int i = 0; i < RELAY_COUNT; i++) {
    if (digitalRead(RELAY_PINS[i]) == RELAY_ON) {
      mask |= (1 << i);
    }
  }
  return mask;
}

// ======================== LED / BUZZER / LCD ========================
void initOutputs() {
  pinMode(LED_ZONE1_PIN, OUTPUT);
  pinMode(LED_ZONE2_PIN, OUTPUT);
  pinMode(LED_ZONE3_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_ZONE1_PIN, LOW);
  digitalWrite(LED_ZONE2_PIN, LOW);
  digitalWrite(LED_ZONE3_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

void setLedZone(int zone) {
  activeLedZone = zone;
  digitalWrite(LED_ZONE1_PIN, zone == 1 ? HIGH : LOW);
  digitalWrite(LED_ZONE2_PIN, zone == 2 ? HIGH : LOW);
  digitalWrite(LED_ZONE3_PIN, zone == 3 ? HIGH : LOW);
}

void buzzerOn()  { digitalWrite(BUZZER_PIN, HIGH); }
void buzzerOff() { digitalWrite(BUZZER_PIN, LOW); }

void buzzerTwoSeconds() {
  buzzerOn();
  delay(2000);
  buzzerOff();
}

void buzzerTitTitTit() {
  for (int i = 0; i < 3; i++) {
    buzzerOn();
    delay(150);
    buzzerOff();
    delay(150);
  }
}

void lcdShow(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

// ======================== SENSORS ========================
float readVoltage() {
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(VOLTAGE_ADC_PIN);
    delayMicroseconds(100);
  }
  float adc = sum / 8.0f;
  return (adc / ADC_MAX) * ADC_VREF * CAL_V;
}

float readCurrent() {
  if (!ina219Ok) return 0.0f;
  return ina219.getCurrent_mA() / 1000.0f;
}

float calcMean(const float* arr, int n) {
  if (n <= 0) return 0;
  float s = 0;
  for (int i = 0; i < n; i++) s += arr[i];
  return s / n;
}

float calcStdev(const float* arr, int n, float mean) {
  if (n <= 1) return 0;
  float s = 0;
  for (int i = 0; i < n; i++) {
    float d = arr[i] - mean;
    s += d * d;
  }
  return sqrtf(s / n);
}

float calcMax(const float* arr, int n) {
  float m = arr[0];
  for (int i = 1; i < n; i++) if (arr[i] > m) m = arr[i];
  return m;
}

float calcMin(const float* arr, int n) {
  float m = arr[0];
  for (int i = 1; i < n; i++) if (arr[i] < m) m = arr[i];
  return m;
}

float calcStability(float vavg, float vripple, const float* arr, int n) {
  if (vavg < 0.01f) return 0;
  float cov = calcStdev(arr, n, vavg) / vavg;
  float rippleRatio = vripple / (vavg + 0.01f);
  float score = 100.0f * (1.0f - fminf(rippleRatio, 1.0f)) * (1.0f - fminf(cov, 1.0f));
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return score;
}

// ======================== UART TX ========================
void sendUartJson(JsonDocument& doc) {
  serializeJson(doc, UART_PORT);
  UART_PORT.println();
}

void sendStatus(const char* stage, int relay, const char* lcdMsg) {
  StaticJsonDocument<256> doc;
  doc["type"] = "STATUS";
  doc["stage"] = stage;
  doc["relay"] = relay;
  doc["lcd"] = lcdMsg;
  doc["led_zone"] = activeLedZone;
  doc["relay_mask"] = getRelayMask();
  sendUartJson(doc);
}

void sendError(const char* msg) {
  StaticJsonDocument<128> doc;
  doc["type"] = "ERROR";
  doc["message"] = msg;
  sendUartJson(doc);
}

void sendCircuitResult(const char* stage, int relay, const char* name) {
  float vavg = calcMean(vSamples, SAMPLE_COUNT);
  float vmax = calcMax(vSamples, SAMPLE_COUNT);
  float vmin = calcMin(vSamples, SAMPLE_COUNT);
  float vripple = vmax - vmin;
  float iavg = calcMean(iSamples, SAMPLE_COUNT);
  float pout = vavg * iavg;
  float poutV2r = (vavg * vavg) / LOAD_RESISTOR_OHM;
  float poutDisplay = (pout > poutV2r) ? pout : poutV2r;
  float stability = calcStability(vavg, vripple, vSamples, SAMPLE_COUNT);

  // Use DynamicJsonDocument for sample arrays
  DynamicJsonDocument doc(16384);
  doc["type"] = "CIRCUIT_RESULT";
  doc["stage"] = stage;
  doc["relay"] = relay;
  doc["circuit_name"] = name;
  doc["vavg"] = vavg;
  doc["vmax"] = vmax;
  doc["vmin"] = vmin;
  doc["vripple"] = vripple;
  doc["iavg"] = iavg;
  doc["pout"] = poutDisplay;
  doc["pout_v2r"] = poutV2r;
  doc["stability"] = stability;

  JsonArray vArr = doc.createNestedArray("v_samples");
  JsonArray iArr = doc.createNestedArray("i_samples");
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    vArr.add(vSamples[i]);
    iArr.add(iSamples[i]);
  }
  sendUartJson(doc);
}

void sendStageDone(const char* stage) {
  StaticJsonDocument<128> doc;
  doc["type"] = "STAGE_DONE";
  doc["stage"] = stage;
  sendUartJson(doc);
}

// ======================== MEASUREMENT ========================
void measureCircuit(int relayNum, const char* stage, const char* circuitName) {
  circuitRelaysOff();
  delay(50);
  setRelay(relayNum, true);
  sendStatus(stage, relayNum, "Measuring...");

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    vSamples[i] = readVoltage();
    iSamples[i] = readCurrent();
    delay(SAMPLE_INTERVAL_MS);
  }

  setRelay(relayNum, false);
  sendCircuitResult(stage, relayNum, circuitName);
}

void finishStage(const char* stage) {
  setVibration(false);
  allRelaysOff();
  lcdShow("Finished", "");
  setLedZone(0);
  buzzerTitTitTit();
  sendStatus("idle", 0, "Finished");
  sendStageDone(stage);
  currentStage = "idle";
}

void beginStage(int ledZone, const char* stage, const char* lcdLine2) {
  currentStage = stage;
  setLedZone(ledZone);
  lcdShow("Comparing...", lcdLine2);
  setVibration(true);
  sendStatus(stage, 0, "Comparing...");
  buzzerTwoSeconds();
}

// ======================== STAGE RUNNERS ========================
void runBridgeComparison() {
  beginStage(1, "bridge", "Bridge Rect");
  measureCircuit(1, "bridge", CIRCUIT_NAMES[1]);
  measureCircuit(2, "bridge", CIRCUIT_NAMES[2]);
  finishStage("bridge");
}

void runCwvmComparison() {
  beginStage(2, "cwvm", "CWVM");
  measureCircuit(3, "cwvm", CIRCUIT_NAMES[3]);
  measureCircuit(4, "cwvm", CIRCUIT_NAMES[4]);
  measureCircuit(5, "cwvm", CIRCUIT_NAMES[5]);
  finishStage("cwvm");
}

void runFinalComparison(int bridgeRelay, int cwvmRelay) {
  if (bridgeRelay < 1 || bridgeRelay > 2 || cwvmRelay < 3 || cwvmRelay > 5) {
    sendError("Invalid finalist relays for final comparison");
    return;
  }
  beginStage(3, "final", "Champions");
  measureCircuit(bridgeRelay, "final", CIRCUIT_NAMES[bridgeRelay]);
  measureCircuit(cwvmRelay, "final", CIRCUIT_NAMES[cwvmRelay]);
  finishStage("final");
}

void stopAll() {
  setVibration(false);
  allRelaysOff();
  setLedZone(0);
  buzzerOff();
  lcdShow("Ready", "Await Master");
  currentStage = "idle";
  sendStatus("idle", 0, "Ready");
}

// ======================== UART RX / COMMANDS ========================
void handleCommand(JsonDocument& doc) {
  const char* cmd = doc["cmd"];
  if (!cmd) return;

  if (strcmp(cmd, "START_BRIDGE") == 0) {
    runBridgeComparison();
  } else if (strcmp(cmd, "START_CWVM") == 0) {
    runCwvmComparison();
  } else if (strcmp(cmd, "START_FINAL") == 0) {
    int bridgeR = doc["bridge"] | 1;
    int cwvmR = doc["cwvm"] | 3;
    runFinalComparison(bridgeR, cwvmR);
  } else if (strcmp(cmd, "STOP_ALL") == 0) {
    stopAll();
  } else if (strcmp(cmd, "PING") == 0) {
    StaticJsonDocument<64> resp;
    resp["type"] = "PONG";
    sendUartJson(resp);
  }
}

void processUartLine() {
  if (uartLine.length() == 0) return;
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, uartLine);
  uartLine = "";
  if (err) return;
  handleCommand(doc);
}

void uartTask() {
  while (UART_PORT.available()) {
    char c = UART_PORT.read();
    if (c == '\n' || c == '\r') {
      if (uartLine.length() > 0) processUartLine();
    } else if (uartLine.length() < 512) {
      uartLine += c;
    }
  }
}

// ======================== SETUP / LOOP ========================
void setup() {
  Serial.begin(115200);
  UART_PORT.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  initRelays();
  initOutputs();

  pinMode(VOLTAGE_ADC_PIN, INPUT);
  analogSetAttenuation(ADC_11db);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcdShow("FYP Slave", "Initializing");

  ina219Ok = ina219.begin();
  if (!ina219Ok) {
    lcdShow("INA219 Error", "Check I2C");
    sendError("INA219 not found on I2C bus");
  } else {
    ina219.setCalibration_32V_2A();
  }

  delay(500);
  lcdShow("Ready", "Await Master");
  sendStatus("idle", 0, "Ready");
}

void loop() {
  uartTask();
  delay(1);
}
