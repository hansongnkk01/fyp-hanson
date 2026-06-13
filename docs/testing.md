# Testing Checklist

## Supabase

- [ ] Run `migration-v2-fw-2s.sql` on existing project (or fresh `schema.sql`)
- [ ] `commands` accepts `MEASURE_FW_CIRCUIT`, `MEASURE_2S_CIRCUIT`, `RESET_SYSTEM`
- [ ] Realtime enabled on `system_state`, `measurement_summary`

## Website

- [ ] Status bar shows online when ESP32 connected
- [ ] Measure FW disabled while 2S measuring (and vice versa)
- [ ] Charts populate after each run (10 points)
- [ ] Conclusion button disabled until both circuits have summary rows
- [ ] Conclusion expands and scrolls into view
- [ ] STOP resets UI to idle immediately

## ESP32 (hardware)

- [ ] WiFi connects; heartbeat updates `connection=online`
- [ ] FW measure: R1,R3,R5 then R7 only during capture; LED25 on
- [ ] 2S measure: R2,R4,R6 then R7; LED26 on
- [ ] Never R1+R2 (or R3+R4, R5+R6) simultaneously
- [ ] STOP during measure: all relays off, measure command → error
- [ ] Buzzer 2 s at start, 3 short beeps at end

## ESP32 (`DEMO_MODE 1`)

- [ ] Upload without INA219; synthetic 10-point curves appear on dashboard

## Stabilization examples

| Samples (V) | Expected stab time |
|-------------|-------------------|
| 1.2, 2.0, 2.4, 2.5, 2.5, 2.5, … | 5 s (3rd stable 2.5 at index 5) |
| 1.0, 1.0, 2.0, 2.0, … | 1 s (2-sample fallback) |
| All drifting | "—" |
