# Cloud Protocol (Supabase)

## Tables

### `commands`

Website inserts rows; ESP32 polls `status=pending`, sets `processing`, then `done` or `error`.

| command | Description |
|---------|-------------|
| `MEASURE_FW_CIRCUIT` | Measure Full-Wave Bridge (10 s, 1 Hz) |
| `MEASURE_2S_CIRCUIT` | Measure 2-Stage CWVM |
| `RESET_SYSTEM` | Emergency stop — all relays off |

### `system_state` (single row `id=1`)

| Field | Purpose |
|-------|---------|
| `stage` | `idle`, `measuring_fw`, `fw_measured`, `measuring_2s`, `twos_measured` |
| `connection` | `online` / `offline` (heartbeat) |
| `active_circuit` | `none`, `full_wave`, `two_stage_cwvm` |
| `is_measuring` | Mutex for website buttons |
| `fw_measured`, `twos_measured` | Flags after successful uploads |
| `active_relays` | JSON array of human labels, e.g. `["R1 Voltage FW","R7 Vibration"]` |
| `led_fw`, `led_2s` | Mirror GPIO 25 / 26 |
| `lcd_message` | Last LCD line |
| `relay_mask` | Bitmask of active relays |
| `current_measurement_id` | UUID for in-flight run |

### `measurement_samples`

One row per second per run:

`measurement_id`, `circuit_key` (`full_wave` | `two_stage_cwvm`), `time_s` (0–9), `voltage`, `current`, `power`.

### `measurement_summary`

Aggregates per run: `vavg`, `iavg`, `pavg`, `vmax`, `vmin`, `vripple`, `stabilization_time`, `stabilization_ok`.

## Stabilization time (firmware)

Scan voltage samples from t=0:

1. First chain of **≥3** consecutive samples within ±0.05 V or ±2% → time of **3rd** sample.
2. Else first **≥2** consecutive → time of **2nd** sample.
3. Else `stabilization_ok=false`, UI shows "—".

## Measurement sequence (FW example)

1. All relays OFF  
2. R1, R3, R5 ON  
3. LCD "Measuring FW", LED GPIO25 ON  
4. Buzzer 2 s  
5. R7 ON → sample 10× @ 1 s  
6. R7 OFF, R1/R3/R5 OFF  
7. Buzzer tit×3, LCD "FW Measured"  
8. POST samples + summary  

2S uses R2, R4, R6 and LED GPIO26.

## Realtime

Enable replication for `system_state`, `commands`, `measurement_summary` (and optionally `measurement_samples`).
