# FYP — Piezoelectric FW vs 2S CWVM

Single ESP32 controller compares **Full-Wave Bridge Rectifier** and **2-Stage Cockcroft-Walton** for piezo energy harvesting.

## Stack

| Layer | Tech |
|-------|------|
| Firmware | ESP32 38-pin (`esp32-controller/`) |
| Cloud | Supabase (commands, state, measurements) |
| Dashboard | Static site on Vercel (`website/`) |

## Quick start

1. **Supabase** — Run `supabase/schema.sql` (new project) or `supabase/migration-v2-fw-2s.sql` (upgrade from old 3-stage schema).
2. **Website** — Copy `website/config.example.js` → `website/config.js` (or use committed `config.js` for Vercel).
3. **ESP32** — Copy `esp32-controller/config.example.h` → `esp32-controller/config.h`, fill WiFi + Supabase, upload `esp32-controller/main.ino`.
4. Open the Vercel URL, measure FW, then 2S, then **Conclusion**.

## Commands

- `MEASURE_FW_CIRCUIT` — 10 s capture @ 1 Hz for Full-Wave
- `MEASURE_2S_CIRCUIT` — same for 2-Stage CWVM
- `RESET_SYSTEM` — emergency stop (all relays off)

## Docs

- [Wiring](docs/wiring.md)
- [Protocol](docs/protocol.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)

## Arduino sync (Windows)

If your sketch lives in `esp32-controller/main/main.ino`:

```powershell
.\sync-arduino-controller.ps1
```
