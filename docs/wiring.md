# Complete Wiring Guide — ESP32 38-pin (Single Controller)

Firmware reference: `esp32-controller/main.ino`  
Relay logic: **active-HIGH** (GPIO HIGH = relay ON, GPIO LOW = relay OFF at boot)

---

## 1. Components list

| # | Component | Qty | Notes |
|---|-----------|-----|-------|
| 1 | ESP32 DevKit **38-pin** | 1 | Main controller |
| 2 | 8-channel relay module | 1 | Active-HIGH, 5 V coil |
| 3 | LCD1602 + I2C backpack (PCF8574) | 1 | Address `0x27` typical |
| 4 | INA219 current sensor breakout | 1 | I2C, high-side or low-side per layout |
| 5 | 0–25 V voltage sensor module | 1 | Analog out → GPIO 34 |
| 6 | LED (Full-Wave indicator) | 1 | + 220 Ω–330 Ω resistor |
| 7 | LED (2-Stage CWVM indicator) | 1 | + 220 Ω–330 Ω resistor |
| 8 | Buzzer module (active) | 1 | Or passive + transistor driver |
| 9 | 12 V vibration motor | 1 | **Via relay R7 only** |
| 10 | 12 V DC power supply | 1 | Motor supply only |
| 11 | 5 V supply (or USB) | 1 | ESP32 + relay VCC |
| 12 | Piezo patches | 1+ | On acrylic platform |
| 13 | Full-Wave Bridge rectifier board | 1 | Circuit under test A |
| 14 | 2-Stage CWVM board | 1 | Circuit under test B |
| 15 | Load resistor 10 kΩ | 1 | For current path / P = V²/R |
| 16 | Jumper wires | many | 22–26 AWG dupont |

**Not used:** second ESP32, UART cable, master/slave link.

---

## 2. Power architecture (read first)

```
                    ┌─────────────────┐
   USB or 5V ──────►│ ESP32 38-pin    │
                    │  3V3 ───────────┼──► I2C (LCD, INA219 logic)
                    │  GND ───────────┼──► COMMON GROUND (star point)
                    └────────┬────────┘
                             │ GPIO → relay IN pins
                    ┌────────▼────────┐
   5V ─────────────►│ Relay module    │
   GND ────────────►│ VCC + GND       │
                    └────────┬────────┘
                             │ R7 COM/NO
   12V + ──────────►┌───────▼───────┐────► Vibration motor ──► 12V −
                     (through R7)         (GND to common)
```

### Rules

1. **One common GND** between ESP32, relay module, sensors, 12 V supply **negative**, piezo/rectifier grounds.
2. **Never** power vibration motor from ESP32 3.3 V or 5 V pin.
3. Relay module coils: **5 V** (set JD-VCC jumper per your module manual — usually jumper ON for 5 V).
4. ESP32 can be powered by **USB** during bench test; relay VCC from separate 5 V is OK if USB current is limited.

---

## 3. ESP32 38-pin → GPIO map (firmware)

On most 38-pin boards, silkscreen **Dxx** = **GPIO xx**.

| GPIO | Direction | Connect to | Firmware role |
|------|-----------|------------|---------------|
| **23** | Output | Relay **IN1** | R1 — voltage route → FW |
| **22** | Output | Relay **IN2** | R2 — voltage route → 2S |
| **21** | Output | Relay **IN3** | R3 — current route → FW |
| **19** | Output | Relay **IN4** | R4 — current route → 2S |
| **18** | Output | Relay **IN5** | R5 — piezo/power gate → FW |
| **5** | Output | Relay **IN6** | R6 — piezo/power gate → 2S |
| **4** | Output | Relay **IN7** | R7 — vibration motor |
| **2** | Output | Relay **IN8** | R8 — **unused, keep OFF** |
| **25** | Output | LED FW (+ resistor) | Full-Wave measuring LED |
| **26** | Output | LED 2S (+ resistor) | 2S measuring LED |
| **14** | Output | Buzzer IN / transistor base | Buzzer |
| **32** | I2C SDA | LCD SDA + INA219 SDA | Shared I2C bus |
| **33** | I2C SCL | LCD SCL + INA219 SCL | Shared I2C bus |
| **34** | Input only | 0–25 V module signal out | Voltage ADC |
| **3V3** | Power out | LCD VCC, INA219 VCC, sensor VCC | 3.3 V logic |
| **GND** | Ground | All GND pins | Common ground |
| **5V** | Power out | Relay VCC (optional) | Only if USB can supply enough current |
| **EN** | — | (on-board) | Reset |
| **GPIO0** | — | **Do not pull LOW at boot** | Boot mode |

### Pins NOT used by firmware

GPIO 0, 1, 3, 6–17, 20, 24, 27–31, 35–39 (35–39 are input-only on many boards; we only use 34).

**No UART** wiring needed (no GPIO 16/17 serial to second board).

---

## 4. 8-channel relay module

### Control side (low voltage)

| Relay module pin | Wire to |
|------------------|---------|
| **IN1** | ESP32 GPIO **23** |
| **IN2** | ESP32 GPIO **22** |
| **IN3** | ESP32 GPIO **21** |
| **IN4** | ESP32 GPIO **19** |
| **IN5** | ESP32 GPIO **18** |
| **IN6** | ESP32 GPIO **5** |
| **IN7** | ESP32 GPIO **4** |
| **IN8** | ESP32 GPIO **2** (leave relay OFF in normal use) |
| **VCC** | **5 V** |
| **GND** | **GND** (common with ESP32) |

### Relay contact side (loads)

Each channel has **COM**, **NO**, **NC**. Firmware assumes **NO** switching (energize = COM connected to NO).

| Relay | Function | Typical switching |
|-------|----------|-------------------|
| **R1** | Voltage sensor → FW path | Route divider output to FW measurement node |
| **R2** | Voltage sensor → 2S path | Route divider output to 2S measurement node |
| **R3** | INA219 / shunt → FW | Series insert current sense in FW return |
| **R4** | INA219 / shunt → 2S | Series insert current sense in 2S return |
| **R5** | Piezo harvested output → FW rectifier input | Gate AC from piezo to FW board |
| **R6** | Piezo harvested output → 2S rectifier input | Gate AC from piezo to 2S board |
| **R7** | 12 V vibration motor | COM=12V+, NO=motor+, motor−=12V− |
| **R8** | Unused | **No load wired** (GPIO2 boot caution) |

### Safety interlocks (firmware + wiring)

| Never ON together | Reason |
|-------------------|--------|
| R1 + R2 | Only one voltage route |
| R3 + R4 | Only one current route |
| R5 + R6 | Only one piezo/circuit power path |
| R1–R6 all mixed FW+2S | One circuit at a time |

During **FW measure**: R1, R3, R5 ON → then R7 ON for 10 s.  
During **2S measure**: R2, R4, R6 ON → then R7 ON for 10 s.

---

## 5. LCD1602 I2C (16×2)

| LCD backpack pin | ESP32 |
|------------------|-------|
| **VCC** | **3.3 V** (5 V only if backpack is 5 V tolerant — prefer 3.3 V) |
| **GND** | **GND** |
| **SDA** | GPIO **32** |
| **SCL** | GPIO **33** |

- Default I2C address: **0x27** (if blank screen, try **0x3F** and change `LCD_ADDR` in firmware).
- Share bus with INA219 (different addresses).

---

## 6. INA219 current sensor

| INA219 pin | Connect to |
|------------|------------|
| **VCC** | **3.3 V** |
| **GND** | **GND** |
| **SDA** | GPIO **32** (same as LCD) |
| **SCL** | GPIO **33** (same as LCD) |
| **VIN+** / **V+** | High side of shunt / load path (circuit +) |
| **VIN−** / **V−** | Load side after shunt (toward 10 kΩ / return) |

### With relay routing (concept)

- **FW test:** R3 ON routes INA219 into **FW** current loop.
- **2S test:** R4 ON routes INA219 into **2S** current loop.
- **10 kΩ load** across rectifier output gives measurable I; firmware also computes P = V×I.

Common ground between INA219 GND and ESP32 GND is **mandatory**.

---

## 7. 0–25 V voltage sensor module

| Sensor pin | Connect to |
|------------|------------|
| **VCC** | **3.3 V** |
| **GND** | **GND** |
| **S (signal / AO)** | GPIO **34** only (input-only pin) |
| **V+ / VIN** | Circuit output **after relay routing** (see R1/R2) |
| **V− / GND** | Circuit ground (common) |

### With relay routing

- **R1 ON:** module measures **Full-Wave** rectifier DC output (through your harness).
- **R2 ON:** module measures **2-Stage CWVM** DC output.

Calibrate `CAL_V` in firmware if readings disagree with multimeter — see `docs/calibration.md`.

---

## 8. LEDs (status)

| LED | ESP32 | Wiring |
|-----|-------|--------|
| **Full-Wave (FW)** | GPIO **25** | GPIO25 → **220 Ω** → LED anode (+) → LED cathode (−) → **GND** |
| **2-Stage (2S)** | GPIO **26** | GPIO26 → **220 Ω** → LED anode (+) → LED cathode (−) → **GND** |

- ON during that circuit’s 10 s measurement.
- Use different colours if possible (e.g. blue = FW, orange = 2S).

---

## 9. Buzzer

| Buzzer module | ESP32 |
|---------------|-------|
| **VCC** | **3.3 V** or **5 V** (per module rating) |
| **GND** | **GND** |
| **I / SIG** | GPIO **14** |

Firmware: **2 s continuous** at measure start, then **3× short beeps** at end.

- **Active buzzer** (recommended): direct GPIO drive.
- **Passive buzzer:** add NPN transistor; GPIO → base resistor → transistor → buzzer.

---

## 10. Vibration motor (12 V) via R7

```
12V supply (+) ──── R7 COM
                      R7 NO ──── Motor (+)
12V supply (−) ─────────────── Motor (−)
```

- Motor turns ON **only** during 10 s sampling (R7 ON).
- Flyback: use relay module with built-in opto isolation; add diode across motor terminals if module docs recommend.
- **Disconnect motor** when flashing ESP32 over USB.

---

## 11. Piezo + rectifier circuits (system level)

```
Piezo patches (AC) ──► [R5 or R6 gate] ──► FW Bridge  OR  2S CWVM
                                              │              │
                                              ▼              ▼
                                         DC output      DC output
                                              │              │
                    [R1 or R2] ◄── Voltage sensor          │
                    [R3 or R4] ◄── INA219 in series ◄───────┘
                                              │
                                         10 kΩ load to GND
```

- **Piezo:** mechanically coupled to acrylic plate; electrical output is AC.
- **R5/R6:** selects which rectifier receives piezo energy.
- **R1/R2:** selects which DC bus the voltage divider monitors.
- **R3/R4:** selects which branch INA219 measures.
- **R7:** mechanical excitation — vibration motor shakes plate during capture.

---

## 12. Full connection checklist

### Power & ground

- [ ] ESP32 GND ↔ relay GND ↔ sensor GND ↔ 12 V GND ↔ rectifier GND
- [ ] ESP32 powered (USB or 5 V)
- [ ] Relay VCC = 5 V
- [ ] LCD + INA219 + voltage module = 3.3 V
- [ ] 12 V supply **only** for motor via R7

### Control wires (ESP32 → relay IN1–IN8)

- [ ] IN1←23, IN2←22, IN3←21, IN4←19, IN5←18, IN6←5, IN7←4, IN8←2

### I2C bus

- [ ] SDA: GPIO32 → LCD SDA + INA219 SDA
- [ ] SCL: GPIO33 → LCD SCL + INA219 SCL

### Analog

- [ ] Voltage module S → GPIO34

### Indicators

- [ ] LED FW ← GPIO25 + resistor
- [ ] LED 2S ← GPIO26 + resistor
- [ ] Buzzer ← GPIO14

### Loads (relay screw terminals)

- [ ] R1–R6 wired to correct FW vs 2S circuit nodes
- [ ] R7 wired to 12 V motor
- [ ] R8 **nothing connected**

### Not connected

- [ ] No wire to GPIO16/17 for old UART
- [ ] No second ESP32

---

## 13. Boot & upload notes

| Issue | Cause | Fix |
|-------|-------|-----|
| Upload fails | GPIO **2** held LOW (R8 wiring) | Unwire R8 load; all relays OFF |
| Upload fails | Motor/back-EMF | Disconnect motor from R7 |
| Blank LCD | Wrong I2C address | Scan bus; try 0x3F |
| INA219 error on LCD | SDA/SCL swap or no power | Check 32/33 and 3.3 V |
| GPIO34 always 0 | Sensor not routed | Turn on R1 or R2 during test |

---

## 14. Quick test after wiring

1. Power on → LCD: `FYP Controller` → `WiFi` → `Ready`
2. Website **Online**
3. **Measure FW** → LED25 on, R1+R3+R5 then R7 click, 10 s, charts update
4. **Measure 2S** → LED26 on, R2+R4+R6 then R7
5. **STOP** → all relays off

---

## 15. Pin summary diagram (ASCII)

```
                    ESP32 38-pin DevKit
                 ┌─────────────────────┐
     Relay IN1 ◄─┤ GPIO23          3V3 ├─► LCD, INA219, sensors VCC
     Relay IN2 ◄─┤ GPIO22          GND ├─► COMMON GND
     Relay IN3 ◄─┤ GPIO21          32  ├─► I2C SDA
     Relay IN4 ◄─┤ GPIO19          33  ├─► I2C SCL
     Relay IN5 ◄─┤ GPIO18          34  ├─► Voltage sensor (IN only)
     Relay IN6 ◄─┤ GPIO5           25  ├─► LED FW
     Relay IN7 ◄─┤ GPIO4           26  ├─► LED 2S
     Relay IN8 ◄─┤ GPIO2 (unused)  14  ├─► Buzzer
                 │  USB / 5V           │
                 └─────────────────────┘
```

---

*Last updated for single-board `esp32-controller` firmware — FW vs 2-Stage CWVM workflow.*
