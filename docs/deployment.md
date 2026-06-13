# Deployment Guide — GitHub, Supabase, Vercel

## 1. Supabase

1. Create project at [supabase.com](https://supabase.com).
2. **New project:** run [`supabase/schema.sql`](../supabase/schema.sql).
3. **Upgrade from old 3-stage schema:** run [`supabase/migration-v2-fw-2s.sql`](../supabase/migration-v2-fw-2s.sql).
4. Enable **Realtime** on: `system_state`, `commands`, `measurement_summary`, `measurement_samples`.
5. Copy **Project URL** and **anon public** key from **Settings → API**.

## 2. Website

Edit `website/config.js`:

```javascript
window.FYP_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
};
```

`config.js` is committed for Vercel auto-deploy (anon key only).

## 3. ESP32 controller

```powershell
copy esp32-controller\config.example.h esp32-controller\config.h
```

Fill WiFi + same Supabase credentials. Upload `esp32-controller/main.ino`.

**Libraries:** ArduinoJson 7.x, LiquidCrystal I2C, Adafruit INA219, Adafruit BusIO.

Optional: `.\sync-arduino-controller.ps1` if using Arduino `main/` subfolder.

## 4. Vercel

Import GitHub repo; `vercel.json` serves `website/`. Push to `main` triggers redeploy.

## Checklist

| Item | Done |
|------|------|
| Migration applied | ☐ |
| Realtime enabled | ☐ |
| Controller online (green dot) | ☐ |
| Measure FW + 2S + Conclusion | ☐ |
