# Troubleshooting

## Dashboard shows Offline

- Check `esp32-controller/config.h` WiFi and Supabase URL/key.
- Serial monitor @ 115200 for HTTP errors.
- Confirm `system_state` row exists (`id=1`).

## Website empty after measure (LCD shows "FW Measured")

- Check `commands` table: if `Failed to upload measurement samples/summary`, see Serial Monitor `[HTTP]` lines.
- Re-upload latest firmware (row-by-row sample upload + `secureClient.stop()` fix).
- Confirm rows exist: `SELECT * FROM measurement_summary ORDER BY created_at DESC LIMIT 3;`

## ESP32 shows Offline (stale) during measure

- Normal during upload; website now allows **45s** grace while `is_measuring=true`.
- If persists, check WiFi RSSI and Serial `[HTTP]` errors.

## No measurement data on website

- Confirm rows in `measurement_summary` and `measurement_samples`.
- Realtime enabled on both tables.
- Re-measure after migration (old `circuit_results` table removed).

## Relay / boot issues

- GPIO2 (R8) can affect boot — keep R8 OFF when flashing.
- Disconnect vibration motor during USB flash.
- See [wiring.md](wiring.md) for relay map.

## INA219 error on LCD

- Check I2C wiring SDA=32, SCL=33.
- Or set `DEMO_MODE 1` in `config.h` for dashboard-only demo.

## Emergency STOP

- Inserts `RESET_SYSTEM`; firmware turns all relays off and clears `is_measuring`.
- Website also patches `system_state` to idle for instant UI feedback.
