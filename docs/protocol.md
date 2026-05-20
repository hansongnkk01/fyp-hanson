# UART Communication Protocol (Master ↔ Slave)

## Physical layer
| Parameter | Value |
|-----------|-------|
| Interface | UART2 on both ESP32 boards |
| Master TX | GPIO 17 → Slave RX (GPIO 16) |
| Master RX | GPIO 16 ← Slave TX (GPIO 17) |
| Baud rate | 115200 |
| Format | 8N1 |
| Framing | Newline-delimited JSON (`\n`) |

## Master → Slave commands

```json
{"cmd":"START_BRIDGE"}
{"cmd":"START_CWVM"}
{"cmd":"START_FINAL","bridge":1,"cwvm":4}
{"cmd":"STOP_ALL"}
{"cmd":"PING"}
```

| Command | Action |
|---------|--------|
| `START_BRIDGE` | Sequential measure relay 1, then relay 2 |
| `START_CWVM` | Sequential measure relays 3, 4, 5 |
| `START_FINAL` | Measure `bridge` relay only, then `cwvm` relay only |
| `STOP_ALL` | All relays off, LEDs off, LCD "Stopped" |
| `PING` | Slave replies `{"type":"PONG"}` |

## Slave → Master messages

### STATUS
```json
{"type":"STATUS","stage":"bridge","relay":1,"lcd":"Measuring...","led_zone":1,"relay_mask":1}
```

### CIRCUIT_RESULT
```json
{
  "type":"CIRCUIT_RESULT",
  "stage":"bridge",
  "relay":1,
  "circuit_name":"Full-Wave Bridge",
  "vavg":4.2,"vmax":4.5,"vmin":3.9,"vripple":0.6,
  "iavg":0.00042,"pout":0.00176,"pout_v2r":0.00176,
  "stability":78.5,
  "v_samples":[...200 floats...],
  "i_samples":[...200 floats...]
}
```

### STAGE_DONE
```json
{"type":"STAGE_DONE","stage":"bridge"}
```

### ERROR
```json
{"type":"ERROR","message":"INA219 not found on I2C bus"}
```

## Measurement sequence (bridge example)

1. LED Zone 1 ON, LCD "Comparing...", buzzer 2 s
2. Relay 1 ON only → 200 samples → Relay 1 OFF → send `CIRCUIT_RESULT`
3. Relay 2 ON only → 200 samples → Relay 2 OFF → send `CIRCUIT_RESULT`
4. LCD "Finished", LED Zone 1 OFF, buzzer tit-tit-tit, all relays OFF
5. Send `STAGE_DONE`

## Website ↔ Cloud (Supabase)

Website inserts into `commands`. Master polls `commands?status=eq.pending`. Master writes `circuit_results`, `comparison_summary`, and patches `system_state`. Website subscribes via Supabase Realtime.

| Website command | Master UART |
|-----------------|-------------|
| `START_BRIDGE_COMPARISON` | `START_BRIDGE` |
| `START_CWVM_COMPARISON` | `START_CWVM` |
| `START_FINAL_COMPARISON` | `START_FINAL` with NVS winners |
