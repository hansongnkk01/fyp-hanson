# Wiring — Single ESP32 38-pin Controller

## Relay module (8 channels, active-LOW)

| Relay | GPIO | Function |
|-------|------|----------|
| R1 | 23 | Route voltage sensor → Full-Wave |
| R2 | 22 | Route voltage sensor → 2-Stage CWVM |
| R3 | 21 | Route current sensor (INA219) → FW |
| R4 | 19 | Route current sensor → 2S |
| R5 | 18 | Power / gate piezo output → FW |
| R6 | 5 | Power / gate piezo output → 2S |
| R7 | 4 | 12 V vibration motor (ON only during 10 s measure) |
| R8 | 2 | Unused — always OFF |

**Safety:** Never energize R1+R2, R3+R4, or R5+R6 together. Firmware enforces one circuit at a time.

## Indicators

| Device | GPIO |
|--------|------|
| LED Full-Wave | 25 |
| LED 2-Stage CWVM | 26 |
| Buzzer | 14 |

## I2C (LCD + INA219)

| Signal | GPIO |
|--------|------|
| SDA | 32 |
| SCL | 33 |

LCD1602 I2C address: `0x27` (change in firmware if needed).

## Analog

| Sensor | GPIO |
|--------|------|
| 0–25 V module | 34 (input only) |

## Power

- ESP32: USB or 5 V regulated
- Relay module: 5 V (JD-VCC jumper per module docs)
- Vibration motor: 12 V via R7 — **never** from ESP32 3.3 V pin

## Flashing

Disconnect vibration load and avoid holding GPIO2 low during boot if R8 wiring causes boot issues.
