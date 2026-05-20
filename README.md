# Interactive IoT-Based Comparative Study of Bridge Rectifier and Cockcroft-Walton Voltage Multiplier Circuits for Piezoelectric Energy Harvesting

Final Year Project — complete hardware + cloud dashboard package.

## System overview

| Layer | Technology |
|-------|------------|
| Website | HTML/CSS/JS, Chart.js, hosted on **Vercel** |
| Cloud | **Supabase** (commands, realtime state, results) |
| Master ESP32 | WiFi, Supabase REST, UART orchestration, winner scoring |
| Slave ESP32 | Relays, sensors, LCD, LEDs, buzzer, sequential measurement |

## Repository structure

```
esp32-master/main.ino    Master firmware + config.h
esp32-slave/main.ino     Slave firmware
website/                 Dashboard (index.html, style.css, script.js)
supabase/schema.sql      Database schema
docs/                    Wiring, testing, deployment, calibration
vercel.json              Static site config
```

## Quick start

### 1. Supabase
Run [`supabase/schema.sql`](supabase/schema.sql) in SQL Editor. Copy URL + anon key.

### 2. Website
```bash
cd website
copy config.example.js config.js
# Edit config.js with Supabase credentials
```
Open `index.html` locally or deploy to Vercel (see [`docs/deployment.md`](docs/deployment.md)).

### 3. ESP32
```bash
cd esp32-master
copy config.example.h config.h
# Edit WiFi + Supabase in config.h
```

**Arduino libraries:** ArduinoJson 7, LiquidCrystal_I2C, Adafruit INA219 (Slave only).

Upload **Slave** first, wire UART, then upload **Master**.

### 4. Wiring
See [`docs/wiring.md`](docs/wiring.md) for full GPIO table and diagrams.

## Comparison flow

1. **Bridge** — Relay 1 (full-wave) vs Relay 2 (half-wave), measured one at a time.
2. **CWVM** — Relays 3, 4, 5 (2/3/4-stage), measured sequentially.
3. **Final** — Bridge winner vs CWVM winner (from NVS + Supabase).

Metrics: Vavg, Vripple, Iavg, Pout, Stability. Winner = composite score (25% each metric).

## Communication

- **Website ↔ ESP32:** Supabase (`commands` table + Realtime).
- **Master ↔ Slave:** UART JSON ([`docs/protocol.md`](docs/protocol.md)).

## Deploy live website

1. Push to GitHub.
2. Import repo in Vercel (uses `vercel.json` → `website/` folder).
3. Ensure `website/config.js` is present on deploy (anon key only).

## Panel demo script

1. Power motor + both ESP32s.
2. Open `https://your-app.vercel.app`.
3. Confirm **ESP32 Online**.
4. Start 1st → 2nd → Final comparison.
5. Scroll to **End** slide.

## Documentation

| Doc | Purpose |
|-----|---------|
| [wiring.md](docs/wiring.md) | Pin map and connections |
| [testing.md](docs/testing.md) | Bench tests + integration matrix |
| [deployment.md](docs/deployment.md) | GitHub, Vercel, Supabase |
| [calibration.md](docs/calibration.md) | Voltage + INA219 calibration |
| [troubleshooting.md](docs/troubleshooting.md) | Common fixes |
| [protocol.md](docs/protocol.md) | UART + cloud message formats |

## Hardware summary

- 1× buzzer, 3× LEDs, 1× I2C LCD 1602  
- 1× 12 V vibration motor (external)  
- 2× ESP32 (Master DevKit V1 + Slave 38-pin)  
- 5 rectifier/CWVM circuits via 8-channel relay  
- 1× 0–25 V sensor, 1× INA219  
- 10 kΩ load (P = V²/R)

## Student / supervisor

Edit names in `website/index.html` End section (placeholders provided).

## License

Academic use — FYP demonstration.
