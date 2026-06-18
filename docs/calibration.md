# Sensor Calibration Guide

## Voltage sensor (0–25 V module on GPIO 34)

### Theory
`V_raw = (ADC / 4095) × 3.3 × CAL_V`

Default `CAL_V = 7.576`. Each measurement run auto-subtracts a **zero baseline**
(read with circuit relays ON, vibration OFF) so idle circuit reports ~0 V.

Serial: `rawV` = formula only, `adjV` = after baseline (uploaded to website).

### Scale calibration (if adjV still wrong vs multimeter *with real voltage*)
1. Apply known DC (e.g. 5.00 V) to circuit while measuring.
2. Note `rawV` from Serial after baseline step.
3. `CAL_V_new = CAL_V × (V_multimeter / adjV)`.

### Zero offset
If `rawV` is ~12 V with no input, the module has DC offset — firmware handles via
`calibrateSensorZero()` in `main.ino`. Optional manual trim in `config.h`:
`#define V_ZERO_OFFSET 0.0f` (not added yet — auto only).

---

## INA219 current sensor

### Wiring for low current (piezo harvesting)
- Connect **V+** to circuit output positive.
- Connect **V−** to load side (series with 10 kΩ load).
- Common ground with ESP32.

### Zero-offset calibration
1. Disconnect piezo input (0 A expected).
2. Read `getCurrent_mA()` in a test sketch.
3. If offset is +5 mA, subtract in software: `I = (ina219.getCurrent_mA() - 5.0) / 1000.0`

### Shunt / range
Firmware uses `setCalibration_32V_2A()`. For currents below 1 mA, readings may be noisy — dashboard uses `max(P = V×I, P = V²/R)` with **R = 10 kΩ**.

---

## Sanity checks

| Check | Expected |
|-------|----------|
| No input, relay OFF | V ≈ 0, I ≈ 0 |
| Relay ON, motor running | V > 0, ripple visible on chart |
| Full-wave vs half-wave | Full-wave usually higher Vavg |
| Higher CWVM stages | Often higher Vavg but possibly more ripple |

---

## Load resistor (10 kΩ)

Used for alternative power: `P = V² / 10000` watts.  
Ensure resistor power rating: at 10 V, P = 0.01 W (fine for 1/4 W resistor).
