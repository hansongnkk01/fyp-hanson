# Testing Guide

## Pre-flight checklist

- [ ] Supabase schema applied (`supabase/schema.sql`)
- [ ] Realtime enabled for `system_state`, `circuit_results`, `comparison_summary`, `commands`
- [ ] `website/config.js` has valid URL + anon key
- [ ] `esp32-master/config.h` has WiFi + Supabase credentials
- [ ] Master and Slave UART wired (cross TX/RX, common GND)
- [ ] Slave powered, LCD shows "Ready"
- [ ] Master connected to WiFi (Serial shows IP)

---

## Test 1 — Supabase connectivity (no hardware)

1. Open dashboard URL (local `index.html` or Vercel).
2. Power Master ESP32 only.
3. Within 15 s, status bar should show **ESP32 Online**.
4. `last_seen` in Supabase `system_state` should update every ~2 s.

---

## Test 2 — UART / Slave only

1. Upload Slave firmware.
2. Upload Master firmware.
3. From Supabase, insert command manually:
   ```sql
   INSERT INTO commands (command, status) VALUES ('START_BRIDGE_COMPARISON', 'pending');
   ```
4. Observe: LED Zone 1, buzzer, LCD "Comparing...", relays click **one at a time** (R1 then R2).
5. Rows appear in `circuit_results`; `comparison_summary` shows bridge winner.

---

## Test 3 — Website button (bridge)

1. Open live dashboard.
2. Scroll to Bridge section → **Start 1st Comparison**.
3. Confirm measuring state disables buttons.
4. Charts populate with ~200-point waveforms.
5. Winner text appears; **To 2nd Comparison** visible.

---

## Test 4 — CWVM comparison

1. Click **Start 2nd Comparison**.
2. LED Zone 2 active during run.
3. Three result sets (relays 3, 4, 5).
4. CWVM winner stored in `system_state.cwvm_winner_relay`.

---

## Test 5 — Final comparison

1. Verify finalist cards show correct relay names.
2. **Start Final Comparison** — only two relays energize (sequentially).
3. Final winner in `comparison_summary` and UI.

---

## Test 6 — End-to-end demo script (panel)

1. Start vibration motor (12 V external).
2. Open Vercel URL on laptop/phone (same WiFi as ESP32).
3. Run Bridge → CWVM → Final → scroll to End.
4. Total time ≈ 3–5 minutes per full run.

---

## Integration verification matrix

| Step | Pass criteria |
|------|----------------|
| GitHub push | All folders present, no secrets in repo |
| Vercel deploy | `*.vercel.app` loads, no console 401 |
| Supabase Realtime | Status updates without refresh |
| Master poll | `commands` row moves pending → done |
| Slave sequential | Never two relays ON together |
| Charts | Voltage green trace animates |
| NVS | Final uses prior winners after Master reset |

---

## DEMO_MODE (website-only test)

In `esp32-master/config.h` set `#define DEMO_MODE 1`.  
Master generates synthetic waveforms without Slave — useful for UI rehearsal.
