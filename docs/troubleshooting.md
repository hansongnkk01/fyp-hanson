# Troubleshooting Guide

## ESP32 shows Offline on dashboard

| Cause | Fix |
|-------|-----|
| Wrong WiFi credentials | Edit `esp32-master/config.h`, re-flash |
| Master not powered | Power USB, check Serial |
| Supabase URL/key wrong | Match Project Settings → API |
| `last_seen` not updating | Check Serial for HTTP errors; verify RLS policies |
| NTP not synced | Wait 30 s after boot; heartbeat still sends timestamp |

---

## Supabase HTTP 401 / 403

- Use **anon** key, not service role in firmware/website.
- Re-run `schema.sql` RLS policies.
- Ensure `apikey` and `Authorization: Bearer` headers (handled in Master firmware).

---

## Commands stay `pending`

- Master must be online and not stuck in `waitingForSlave`.
- Check only one pending command at a time.
- Verify Master Serial: WiFi connected, no SSL errors.
- Insert test command via SQL to isolate website issue.

---

## Slave timeout

- UART wires crossed? Master TX → Slave RX.
- Common GND connected?
- Baud 115200 on both.
- Slave must not block in `delay()` before UART init — upload Slave first.

---

## INA219 not found

- I2C address 0x40 (default).
- SDA=32, SCL=33 on Slave.
- LCD at 0x27 — different address, same bus OK.
- Check 3.3 V and pull-ups (module usually includes them).

---

## Flat / zero waveform

- Piezo/motor not running during sample window.
- Voltage sensor not on active relay output.
- Calibrate `CAL_V` — see [calibration.md](calibration.md).
- Relay inverted? Toggle `RELAY_ON` / `RELAY_OFF` in Slave if clicks but no output.

---

## Wrong relay activates

- Verify IN1–IN8 wiring matches GPIO order in `main.ino`.
- Relay module may be active-HIGH — change `#define RELAY_ON HIGH`.

---

## Charts empty but hardware finished

- Enable Realtime on `circuit_results` and `comparison_summary`.
- Check browser console for Supabase errors.
- Payload size: if POST fails, reduce `SAMPLE_COUNT` to 100 in Slave.

---

## HTTPS / memory errors on ESP32

- Master uses `setInsecure()` for Supabase — required for many ESP32 setups.
- Close other WiFi connections; use DevKit with PSRAM if available.
- Reduce JSON buffer if OOM during POST.

---

## Website config not loaded

- `config.js` must load **before** `script.js` in `index.html`.
- On Vercel, ensure `config.js` exists in deployed `website/` folder.

---

## Final comparison wrong circuits

- Run Bridge and CWVM first to set NVS winners.
- Check `system_state.bridge_winner_relay` and `cwvm_winner_relay` in Supabase.
- Master loads NVS on boot via `loadWinners()`.
