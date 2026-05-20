# Sensor Calibration Guide

## Voltage sensor (0–25 V module on GPIO 34)

### Theory
Most modules output 0–3.3 V proportional to 0–25 V input:
`V_real = (ADC / 4095) × 3.3 × CAL_V`

Default in firmware: `CAL_V = 7.576` (because 3.3 × 7.576 ≈ 25).

### Procedure
1. Connect a known DC voltage from a bench supply (e.g. 5.00 V, 10.00 V) to the sensor input.
2. Open Arduino Serial Monitor on Slave (or read values Master logs).
3. Note raw ADC average over 100 readings.
4. Compute: `CAL_V = V_known / ((ADC/4095) × 3.3)`
5. Update `CAL_V` in `esp32-slave/main.ino` and re-upload Slave.

### Example
- Known voltage: 12.0 V  
- ADC average: 1500  
- `(1500/4095)×3.3 = 1.208 V` at ADC  
- `CAL_V = 12.0 / 1.208 = 9.93` → set `#define CAL_V 9.93f`

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
