/*
 * FYP Master ESP32 - Cloud bridge & orchestration
 * WiFi + Supabase REST, UART to Slave, winner calculation
 *
 * Libraries:
 *   - ArduinoJson v7+
 *   - WiFi, HTTPClient, WiFiClientSecure (built-in)
 *   - Preferences (built-in NVS)
 *
 * Setup: copy config.example.h to config.h and edit credentials.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <math.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Create config.h from config.example.h"
#endif

// ======================== CONSTANTS ========================
#define NVS_NAMESPACE     "fyp"
#define KEY_BRIDGE_WIN    "bridge_win"
#define KEY_CWVM_WIN      "cwvm_win"

#define UART_PORT         Serial2
#define SLAVE_TIMEOUT_MS  120000
#define MAX_CIRCUITS      5

const char* CIRCUIT_NAMES[6] = {
  "", "Full-Wave Bridge Rectifier", "Half-Wave Rectifier",
  "2-Stage Cockcroft-Walton", "3-Stage Cockcroft-Walton", "4-Stage Cockcroft-Walton"
};

// ======================== CIRCUIT RESULT BUFFER ========================
struct CircuitData {
  int relay;
  char name[48];
  float vavg, vmax, vmin, vripple, iavg, pout, pout_v2r, stability;
  bool valid;
};

CircuitData stageResults[MAX_CIRCUITS];
int stageResultCount = 0;
String currentComparisonId = "";
String currentStage = "";
String uartLine = "";
unsigned long slaveWaitStart = 0;
bool waitingForSlave = false;
int expectedCircuitCount = 0;

Preferences prefs;
WiFiClientSecure secureClient;
unsigned long lastHeartbeat = 0;
unsigned long lastPoll = 0;
int bridgeWinnerRelay = 1;
int cwvmWinnerRelay = 3;
long pendingCommandId = 0;

void markCommandDone(long commandId);
void markCommandError(long commandId, const char* message);
void performEmergencyReset(long commandId);
bool pollAndProcessOneCommand(const String& queryPath);

// ======================== NVS WINNERS ========================
void loadWinners() {
  prefs.begin(NVS_NAMESPACE, true);
  bridgeWinnerRelay = prefs.getInt(KEY_BRIDGE_WIN, 1);
  cwvmWinnerRelay = prefs.getInt(KEY_CWVM_WIN, 3);
  prefs.end();
}

void saveBridgeWinner(int relay) {
  bridgeWinnerRelay = relay;
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(KEY_BRIDGE_WIN, relay);
  prefs.end();
}

void saveCwvmWinner(int relay) {
  cwvmWinnerRelay = relay;
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(KEY_CWVM_WIN, relay);
  prefs.end();
}

// ======================== SUPABASE HTTP ========================
String supabaseUrl(const String& path) {
  String url = String(SUPABASE_URL);
  if (!url.endsWith("/")) url += "/";
  url += "rest/v1/";
  url += path;
  return url;
}

bool supabaseRequest(const char* method, const String& path, const String& body,
                     String* responseOut = nullptr) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = supabaseUrl(path);
  secureClient.setInsecure();

  if (!http.begin(secureClient, url)) return false;

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=representation");

  int code;
  if (strcmp(method, "GET") == 0) {
    code = http.GET();
  } else if (strcmp(method, "POST") == 0) {
    code = http.POST(body);
  } else if (strcmp(method, "PATCH") == 0) {
    code = http.PATCH(body);
  } else {
    http.end();
    return false;
  }

  String resp = http.getString();
  http.end();

  if (responseOut) *responseOut = resp;
  return (code >= 200 && code < 300);
}

void sendHeartbeat() {
  struct tm timeinfo;
  char buf[32];
  if (!getLocalTime(&timeinfo)) {
    strcpy(buf, "2026-01-01T00:00:00Z");
  } else {
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  }

  StaticJsonDocument<256> doc;
  doc["connection"] = "online";
  doc["last_seen"] = buf;
  doc["bridge_winner_relay"] = bridgeWinnerRelay;
  doc["cwvm_winner_relay"] = cwvmWinnerRelay;
  doc["updated_at"] = buf;

  String payload;
  serializeJson(doc, payload);
  supabaseRequest("PATCH", "system_state?id=eq.1", payload);
}

void patchSystemState(JsonDocument& doc) {
  String payload;
  serializeJson(doc, payload);
  supabaseRequest("PATCH", "system_state?id=eq.1", payload);
}

void setMeasuringState(const char* stage, bool measuring, const char* compId = nullptr) {
  StaticJsonDocument<384> doc;
  doc["stage"] = measuring ? stage : "idle";
  doc["is_measuring"] = measuring;
  doc["lcd_message"] = measuring ? "Comparing..." : "Ready";
  if (compId) doc["current_comparison_id"] = compId;
  if (measuring) {
    int zone = 0;
    if (strcmp(stage, "bridge") == 0) zone = 1;
    else if (strcmp(stage, "cwvm") == 0) zone = 2;
    else if (strcmp(stage, "final") == 0) zone = 3;
    doc["led_zone"] = zone;
  } else {
    doc["led_zone"] = 0;
    doc["relay_mask"] = 0;
  }
  patchSystemState(doc);
}

// ======================== UART ========================
void sendSlaveCmd(const char* cmd, int bridgeR = 0, int cwvmR = 0) {
  StaticJsonDocument<128> doc;
  doc["cmd"] = cmd;
  if (strcmp(cmd, "START_FINAL") == 0) {
    doc["bridge"] = bridgeR;
    doc["cwvm"] = cwvmR;
  }
  serializeJson(doc, UART_PORT);
  UART_PORT.println();
}

void clearStageResults() {
  stageResultCount = 0;
  for (int i = 0; i < MAX_CIRCUITS; i++) stageResults[i].valid = false;
}

void storeCircuitFromJson(JsonDocument& doc) {
  if (stageResultCount >= MAX_CIRCUITS) return;
  CircuitData& c = stageResults[stageResultCount++];
  c.relay = doc["relay"];
  strncpy(c.name, doc["circuit_name"] | "Unknown", sizeof(c.name) - 1);
  c.vavg = doc["vavg"];
  c.vmax = doc["vmax"];
  c.vmin = doc["vmin"];
  c.vripple = doc["vripple"];
  c.iavg = doc["iavg"];
  c.pout = doc["pout"];
  c.pout_v2r = doc["pout_v2r"];
  c.stability = doc["stability"];
  c.valid = true;
}

bool postCircuitResult(JsonDocument& doc) {
  StaticJsonDocument<16384> row;
  row["comparison_id"] = currentComparisonId;
  row["stage"] = currentStage;
  row["relay"] = doc["relay"];
  row["circuit_name"] = doc["circuit_name"];
  row["vavg"] = doc["vavg"];
  row["vmax"] = doc["vmax"];
  row["vmin"] = doc["vmin"];
  row["vripple"] = doc["vripple"];
  row["iavg"] = doc["iavg"];
  row["pout"] = doc["pout"];
  row["pout_v2r"] = doc["pout_v2r"];
  row["stability"] = doc["stability"];
  row["winner"] = false;
  row["v_samples"] = doc["v_samples"];
  row["i_samples"] = doc["i_samples"];
  String payload;
  serializeJson(row, payload);
  return supabaseRequest("POST", "circuit_results", payload);
}

// ======================== WINNER SCORING ========================
float normalize(float val, float minV, float maxV) {
  if (maxV - minV < 0.0001f) return 1.0f;
  return (val - minV) / (maxV - minV);
}

int pickWinner(CircuitData* data, int count) {
  if (count <= 0) return 1;

  float minVavg = 1e9, maxVavg = -1e9;
  float minPout = 1e9, maxPout = -1e9;
  float minRipple = 1e9, maxRipple = -1e9;
  float minStab = 1e9, maxStab = -1e9;

  for (int i = 0; i < count; i++) {
    if (!data[i].valid) continue;
    if (data[i].vavg < minVavg) minVavg = data[i].vavg;
    if (data[i].vavg > maxVavg) maxVavg = data[i].vavg;
    if (data[i].pout < minPout) minPout = data[i].pout;
    if (data[i].pout > maxPout) maxPout = data[i].pout;
    if (data[i].vripple < minRipple) minRipple = data[i].vripple;
    if (data[i].vripple > maxRipple) maxRipple = data[i].vripple;
    if (data[i].stability < minStab) minStab = data[i].stability;
    if (data[i].stability > maxStab) maxStab = data[i].stability;
  }

  int bestRelay = data[0].relay;
  float bestScore = -1;

  for (int i = 0; i < count; i++) {
    if (!data[i].valid) continue;
    float score = 0.25f * normalize(data[i].vavg, minVavg, maxVavg)
                + 0.25f * normalize(data[i].pout, minPout, maxPout)
                + 0.25f * (1.0f - normalize(data[i].vripple, minRipple, maxRipple))
                + 0.25f * normalize(data[i].stability, minStab, maxStab);
    if (score > bestScore) {
      bestScore = score;
      bestRelay = data[i].relay;
    }
  }
  return bestRelay;
}

void markCircuitWinners(int winnerRelay) {
  for (int i = 0; i < stageResultCount; i++) {
    int relay = stageResults[i].relay;
    bool isWinner = (relay == winnerRelay);
    StaticJsonDocument<64> patch;
    patch["winner"] = isWinner;
    String path = String("circuit_results?comparison_id=eq.") + currentComparisonId
                + "&stage=eq." + currentStage + "&relay=eq." + relay;
    String payload;
    serializeJson(patch, payload);
    supabaseRequest("PATCH", path, payload);
  }
}

bool postComparisonSummary(int winnerRelay, const char* winnerName) {
  StaticJsonDocument<512> doc;
  doc["comparison_id"] = currentComparisonId;
  doc["stage"] = currentStage;
  doc["winner_relay"] = winnerRelay;
  doc["winner_name"] = winnerName;

  JsonObject summary = doc.createNestedObject("summary_json");
  summary["winner_relay"] = winnerRelay;
  summary["winner_name"] = winnerName;
  JsonArray ranks = summary.createNestedArray("rankings");
  for (int i = 0; i < stageResultCount; i++) {
    JsonObject r = ranks.createNestedObject();
    r["relay"] = stageResults[i].relay;
    r["name"] = stageResults[i].name;
    r["vavg"] = stageResults[i].vavg;
    r["vripple"] = stageResults[i].vripple;
    r["pout"] = stageResults[i].pout;
    r["stability"] = stageResults[i].stability;
    r["winner"] = (stageResults[i].relay == winnerRelay);
  }

  String payload;
  serializeJson(doc, payload);
  return supabaseRequest("POST", "comparison_summary", payload);
}

void finalizeStage() {
  int winner = pickWinner(stageResults, stageResultCount);
  const char* winnerName = CIRCUIT_NAMES[winner];

  if (currentStage == "bridge") {
    saveBridgeWinner(winner);
  } else if (currentStage == "cwvm") {
    saveCwvmWinner(winner);
  }

  markCircuitWinners(winner);

  StaticJsonDocument<384> stateDoc;
  stateDoc["stage"] = "idle";
  stateDoc["is_measuring"] = false;
  stateDoc["lcd_message"] = "Finished";
  stateDoc["led_zone"] = 0;
  stateDoc["relay_mask"] = 0;
  stateDoc.createNestedArray("active_relays");
  if (currentStage == "bridge") stateDoc["bridge_winner_relay"] = winner;
  if (currentStage == "cwvm") stateDoc["cwvm_winner_relay"] = winner;
  if (currentStage == "final") stateDoc["final_winner_relay"] = winner;
  patchSystemState(stateDoc);

  postComparisonSummary(winner, winnerName);
  if (pendingCommandId > 0) {
    markCommandDone(pendingCommandId);
    pendingCommandId = 0;
  }
  waitingForSlave = false;
}

// ======================== UART MESSAGE HANDLER ========================
void handleSlaveMessage(JsonDocument& doc) {
  const char* type = doc["type"];
  if (!type) return;

  if (strcmp(type, "STATUS") == 0) {
    const char* slaveStage = doc["stage"] | "idle";
    bool measuring = (strcmp(slaveStage, "idle") != 0);

    StaticJsonDocument<384> state;
    state["stage"] = slaveStage;
    state["lcd_message"] = doc["lcd"];
    state["led_zone"] = doc["led_zone"];
    state["relay_mask"] = doc["relay_mask"];
    state["is_measuring"] = measuring;
    int r = doc["relay"] | 0;
    if (r > 0) {
      JsonArray arr = state["active_relays"].to<JsonArray>();
      arr.add(r);
    } else {
      state["active_relays"].to<JsonArray>();
    }
    patchSystemState(state);
  } else if (strcmp(type, "CIRCUIT_RESULT") == 0) {
    storeCircuitFromJson(doc);
    doc["stage"] = currentStage;
    doc["winner"] = false;
    postCircuitResult(doc);
  } else if (strcmp(type, "STAGE_DONE") == 0) {
    finalizeStage();
  } else if (strcmp(type, "ERROR") == 0) {
    waitingForSlave = false;
    StaticJsonDocument<128> err;
    err["error_message"] = doc["message"];
    err["is_measuring"] = false;
    patchSystemState(err);
  }
}

void uartTask() {
  while (UART_PORT.available()) {
    char c = UART_PORT.read();
    if (c == '\n' || c == '\r') {
      if (uartLine.length() == 0) continue;
      DynamicJsonDocument doc(16384);
      if (deserializeJson(doc, uartLine) == DeserializationError::Ok) {
        handleSlaveMessage(doc);
      }
      uartLine = "";
    } else if (uartLine.length() < 12000) {
      uartLine += c;
    }
  }

  if (waitingForSlave && (millis() - slaveWaitStart > SLAVE_TIMEOUT_MS)) {
    waitingForSlave = false;
    StaticJsonDocument<128> err;
    err["error_message"] = "Slave timeout";
    err["is_measuring"] = false;
    patchSystemState(err);
  }
}

// ======================== DEMO MODE (no slave) ========================
#if DEMO_MODE
void runDemoStage(const char* stage, int* relays, int count) {
  currentStage = stage;
  clearStageResults();
  setMeasuringState(stage, true, currentComparisonId.c_str());

  for (int i = 0; i < count; i++) {
    int r = relays[i];
    DynamicJsonDocument doc(16384);
    doc["type"] = "CIRCUIT_RESULT";
    doc["stage"] = stage;
    doc["relay"] = r;
    doc["circuit_name"] = CIRCUIT_NAMES[r];
    float base = 3.0f + r * 0.5f;
    doc["vavg"] = base;
    doc["vmax"] = base + 0.3f;
    doc["vmin"] = base - 0.3f;
    doc["vripple"] = 0.6f - i * 0.05f;
    doc["iavg"] = 0.001f * r;
    doc["pout"] = base * 0.001f * r;
    doc["pout_v2r"] = base * base / 10000.0f;
    doc["stability"] = 70.0f + i * 5;
    JsonArray vArr = doc.createNestedArray("v_samples");
    JsonArray iArr = doc.createNestedArray("i_samples");
    for (int s = 0; s < 200; s++) {
      float t = s * 0.0314f;
      vArr.add(base + 0.2f * sinf(t + r));
      iArr.add(0.001f * r);
    }
    storeCircuitFromJson(doc);
    postCircuitResult(doc);
    delay(200);
  }
  finalizeStage();
}
#endif

// ======================== EMERGENCY RESET ========================
void markCommandError(long commandId, const char* message) {
  String body = String("{\"status\":\"error\",\"error_message\":\"") + message + "\"}";
  supabaseRequest("PATCH", String("commands?id=eq.") + commandId, body);
}

void cancelActiveCommands(long exceptCommandId) {
  String procPath = "commands?status=eq.processing";
  String pendPath = "commands?status=eq.pending";
  if (exceptCommandId > 0) {
    procPath += "&id=neq." + String(exceptCommandId);
    pendPath += "&id=neq." + String(exceptCommandId);
  }
  supabaseRequest("PATCH", procPath,
    "{\"status\":\"error\",\"error_message\":\"emergency reset\"}");
  supabaseRequest("PATCH", pendPath,
    "{\"status\":\"error\",\"error_message\":\"emergency reset\"}");
}

void performEmergencyReset(long commandId) {
  waitingForSlave = false;
  pendingCommandId = 0;
  currentStage = "idle";
  stageResultCount = 0;

#if !DEMO_MODE
  sendSlaveCmd("STOP_ALL");
#endif

  StaticJsonDocument<512> doc;
  doc["stage"] = "idle";
  doc["is_measuring"] = false;
  doc["lcd_message"] = "Ready";
  doc["led_zone"] = 0;
  doc["relay_mask"] = 0;
  doc["error_message"] = "Emergency stop";
  doc.createNestedArray("active_relays");
  patchSystemState(doc);

  cancelActiveCommands(commandId);
  markCommandDone(commandId);
}

bool pollAndProcessOneCommand(const String& queryPath) {
  String resp;
  if (!supabaseRequest("GET", queryPath, "", &resp)) return false;
  if (resp == "[]" || resp.length() < 3) return false;

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return false;
  if (!doc.is<JsonArray>() || doc.size() == 0) return false;

  JsonObject cmd = doc[0];
  long id = cmd["id"];
  const char* command = cmd["command"];
  if (!command) return false;

  processCommand(command, id);
  return true;
}

// ======================== COMMAND PROCESSING ========================
String generateComparisonId() {
  // Simple UUID v4-like from random
  char uuid[40];
  sprintf(uuid, "%08lx-%04x-%04x-%04x-%08lx%04x",
    random(0xFFFFFFFF), random(0xFFFF), random(0xFFFF),
    random(0xFFFF), random(0xFFFFFFFF), random(0xFFFF));
  return String(uuid);
}

void processCommand(const char* command, long commandId) {
  if (strcmp(command, "RESET_SYSTEM") == 0) {
    performEmergencyReset(commandId);
    return;
  }

  if (waitingForSlave) return;

  if (strcmp(command, "START_FINAL_COMPARISON") == 0) {
    loadWinners();
    if (bridgeWinnerRelay < 1 || bridgeWinnerRelay > 2
        || cwvmWinnerRelay < 3 || cwvmWinnerRelay > 5) {
      supabaseRequest("PATCH", String("commands?id=eq.") + commandId,
        "{\"status\":\"error\",\"error_message\":\"Run bridge and CWVM comparisons first\"}");
      return;
    }
  }

  currentComparisonId = generateComparisonId();
  pendingCommandId = commandId;
  clearStageResults();
  waitingForSlave = true;
  slaveWaitStart = millis();

  supabaseRequest("PATCH", String("commands?id=eq.") + commandId, "{\"status\":\"processing\"}");

  if (strcmp(command, "START_BRIDGE_COMPARISON") == 0) {
    currentStage = "bridge";
    expectedCircuitCount = 2;
    setMeasuringState("bridge", true, currentComparisonId.c_str());
#if DEMO_MODE
    int relays[] = {1, 2};
    waitingForSlave = false;
    runDemoStage("bridge", relays, 2);
#else
    sendSlaveCmd("START_BRIDGE");
#endif
  } else if (strcmp(command, "START_CWVM_COMPARISON") == 0) {
    currentStage = "cwvm";
    expectedCircuitCount = 3;
    setMeasuringState("cwvm", true, currentComparisonId.c_str());
#if DEMO_MODE
    int relays[] = {3, 4, 5};
    waitingForSlave = false;
    runDemoStage("cwvm", relays, 3);
#else
    sendSlaveCmd("START_CWVM");
#endif
  } else if (strcmp(command, "START_FINAL_COMPARISON") == 0) {
    currentStage = "final";
    expectedCircuitCount = 2;
    setMeasuringState("final", true, currentComparisonId.c_str());
#if DEMO_MODE
    int relays[] = {bridgeWinnerRelay, cwvmWinnerRelay};
    waitingForSlave = false;
    runDemoStage("final", relays, 2);
#else
    sendSlaveCmd("START_FINAL", bridgeWinnerRelay, cwvmWinnerRelay);
#endif
  }

  // Wait handled in loop via waitingForSlave flag
}

void pollCommands() {
  // Emergency reset is polled even while waitingForSlave
  if (pollAndProcessOneCommand("commands?status=eq.pending&command=eq.RESET_SYSTEM&order=created_at.asc&limit=1")) {
    return;
  }
  if (waitingForSlave) return;
  pollAndProcessOneCommand("commands?status=eq.pending&order=created_at.asc&limit=1");
}

void markCommandDone(long commandId) {
  supabaseRequest("PATCH", String("commands?id=eq.") + commandId, "{\"status\":\"done\"}");
}

// ======================== WIFI ========================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    configTime(0, 0, "pool.ntp.org");
  }
}

// ======================== SETUP / LOOP ========================
void setup() {
  Serial.begin(115200);
  randomSeed(esp_random());
  loadWinners();

  UART_PORT.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  pinMode(2, OUTPUT);
  connectWiFi();

  sendHeartbeat();
  Serial.println("Master ESP32 ready");
}

void loop() {
  uartTask();

  if (millis() - lastHeartbeat > HEARTBEAT_MS) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  if (millis() - lastPoll > COMMAND_POLL_MS) {
    lastPoll = millis();
    pollCommands();
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  delay(10);
}
