# Deployment Guide — GitHub, Supabase, Vercel

## 1. Supabase setup

1. Create project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste entire [`supabase/schema.sql`](../supabase/schema.sql) → Run.
3. If Realtime errors on `ALTER PUBLICATION`, enable manually:
   - **Database → Replication** → enable for:
     - `system_state`
     - `circuit_results`
     - `comparison_summary`
     - `commands`
4. Copy **Project URL** and **anon public** key from **Settings → API**.

---

## 2. Website configuration

```bash
cd website
copy config.example.js config.js   # Windows
# cp config.example.js config.js  # Mac/Linux
```

Edit `config.js`:
```javascript
window.FYP_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

---

## 3. ESP32 Master configuration

```bash
cd esp32-master
copy config.example.h config.h
```

Edit `config.h` with same Supabase URL/key and your WiFi SSID/password.

### Arduino IDE libraries
- ArduinoJson (7.x)
- ESP32 board package 2.x

### Upload order
1. Flash **Slave** (`esp32-slave/main.ino`) first.
2. Wire UART.
3. Flash **Master** (`esp32-master/main.ino`).

---

## 4. GitHub

```bash
cd "FYP HANSON"
git init
git add .
git commit -m "Initial FYP: ESP32 master-slave + Supabase dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

**Do not commit** `website/config.js` or `esp32-master/config.h` (gitignored).

---

## 5. Vercel (live website)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import your GitHub repository.
3. Framework: **Other** (static).
4. Root Directory: leave as repo root (uses `vercel.json` → `website/`).
5. Deploy — URL will be `https://your-project.vercel.app`.
6. **No custom domain required** (use default Vercel domain).

### Vercel + config.js note
`config.js` is gitignored. For production either:
- Commit a `config.js` with only the **anon** key (safe with RLS), or
- Add `config.js` in Vercel build step from environment variables.

Recommended for FYP: add `config.js` locally before deploy with anon key only, or remove `config.js` from `.gitignore` and use placeholder until deploy.

---

## 6. Go-live checklist

| Item | Done |
|------|------|
| Schema applied | ☐ |
| Realtime on 4 tables | ☐ |
| config.js on deployed site | ☐ |
| Master online (green dot) | ☐ |
| Bridge comparison works | ☐ |
| Vercel URL shared with panel | ☐ |

---

## Live demo URL

After deploy, your site is:
`https://<project-name>.vercel.app`

ESP32 must be on WiFi reachable to internet (for Supabase HTTPS).
