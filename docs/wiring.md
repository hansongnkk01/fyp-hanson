# Wiring Guide — FYP Piezoelectric Circuit Comparison

## Hardware list

| # | Component | Qty |
|---|-----------|-----|
| 1 | ESP32 DevKit V1 (Master) | 1 |
| 2 | ESP32 38-pin (Slave) | 1 |
| 3 | 8-channel relay module (5 V coil, LOW active) | 1 |
| 4 | I2C LCD 1602 (PCF8574 backpack, addr 0x27) | 1 |
| 5 | INA219 current sensor module | 1 |
| 6 | 0–25 V voltage sensor module | 1 |
| 7 | Active buzzer (5 V) | 1 |
| 8 | LED + 220 Ω resistor (Zone 1, 2, 3) | 3 |
| 9 | 12 V vibration motor + driver (external) | 1 |
| 10 | Piezoelectric patches + rectifier/CWVM boards | 5 circuits |

## GPIO pin map — Master ESP32

| GPIO | Function |
|------|----------|
| 17 | UART2 TX → Slave GPIO 16 |
| 16 | UART2 RX ← Slave GPIO 17 |
| GND | Common ground with Slave |
| 2 | Optional status LED (onboard) |

**Master has no relay/sensor wiring.**

## GPIO pin map — Slave ESP32

| GPIO | Function | Notes |
|------|----------|-------|
| 17 | UART2 TX → Master GPIO 16 | |
| 16 | UART2 RX ← Master GPIO 17 | |
| 23 | Relay CH1 | Full-wave bridge |
| 22 | Relay CH2 | Half-wave |
| 21 | Relay CH3 | 2-stage CWVM |
| 19 | Relay CH4 | 3-stage CWVM |
| 18 | Relay CH5 | 4-stage CWVM |
| 5 | Relay CH6 | 12 V vibration motor driver |
| 4 | Relay CH7 | Unused |
| 2 | Relay CH8 | Unused |
| 25 | LED Zone 1 | Via 220 Ω to GND |
| 26 | LED Zone 2 | |
| 27 | LED Zone 3 | |
| 14 | Buzzer | Via NPN transistor if >12 mA |
| 32 | I2C SDA | LCD + INA219 |
| 33 | I2C SCL | |
| 34 | Voltage sensor signal | ADC input only |
| 3V3, GND | Sensors, relay VCC (5 V from USB/5V pin) | |

## Relay ↔ circuit mapping

| Relay | Circuit |
|-------|---------|
| 1 | Full-wave bridge rectifier |
| 2 | Half-wave rectifier |
| 3 | 2-stage Cockcroft-Walton VM |
| 4 | 3-stage Cockcroft-Walton VM |
| 5 | 4-stage Cockcroft-Walton VM |
| 6 | Vibration motor (ON during each comparison stage) |
| 7–8 | Not used (always OFF during measurements) |

## Wiring table (Slave)

| From | To | Wire |
|------|-----|------|
| Slave GND | Master GND | Black — **required** |
| Slave GPIO 17 | Master GPIO 16 | UART TX→RX |
| Slave GPIO 16 | Master GPIO 17 | UART RX←TX |
| Slave 5V / VIN | Relay VCC | Red |
| Slave GND | Relay GND | Black |
| Slave GPIO 23–18,5,4,2 | Relay IN1–IN8 | Signal |
| Slave 3V3 | LCD VCC, INA219 VCC | |
| Slave GND | LCD GND, INA219 GND, buzzer − | |
| Slave GPIO 32 | LCD SDA, INA219 SDA | |
| Slave GPIO 33 | LCD SCL, INA219 SCL | |
| Slave GPIO 34 | Voltage sensor OUT | |
| Voltage sensor GND | Slave GND | |
| Voltage sensor VCC | 3.3–5 V per module spec | |
| INA219 V+ / V− | Active circuit output (series V− for current) | |
| Relay COM/NO | Select one rectifier output at a time | See bench layout |
| 10 kΩ load | Circuit output (for P = V²/R) | |
| GPIO 25/26/27 | LED anode via 220 Ω | Cathode → GND |
| GPIO 14 | Buzzer + (via transistor base) | |

## Power domains

```
[Vibration motor 12 V] — external supply, NOT from ESP32
        ↓
[Acrylic platform + piezo patches] → AC
        ↓
[Selected rectifier/CWVM via relay] → DC output
        ↓
[Voltage divider module] → GPIO 34
[INA219] → I2C
[10 kΩ load] → GND
```

## ASCII system diagram

```
                    ┌─────────────┐
                    │   Vercel    │
                    │  Dashboard  │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │  Supabase   │
                    └──────┬──────┘
                           │ WiFi
              ┌────────────▼────────────┐
              │   ESP32 MASTER          │
              │   UART ───────────────┼──┐
              └─────────────────────────┘  │
                                           │ UART
              ┌────────────────────────────▼──┐
              │   ESP32 SLAVE               │
              │   Relay → 5 circuits        │
              │   LCD, LED×3, Buzzer        │
              │   INA219 + Voltage sensor   │
              └─────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │ Piezo + motor (external)│
              └─────────────────────────┘
```

## Safety notes

- Common GND between Master, Slave, relay module, and sensors.
- Do not drive relay coils from 3.3 V GPIO without sufficient current; use module with optoisolation.
- Piezo voltages can spike — verify divider rating before connecting to GPIO 34.
- Only one relay ON during measurement (firmware enforces sequentially).
