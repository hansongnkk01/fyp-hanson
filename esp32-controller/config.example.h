/*
 * Copy to config.h and fill in credentials. config.h is gitignored.
 */
#ifndef CONFIG_H
#define CONFIG_H

#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

#define SUPABASE_URL    "https://YOUR_PROJECT.supabase.co"
#define SUPABASE_KEY    "YOUR_SUPABASE_ANON_KEY"

#define COMMAND_POLL_MS 1000
#define HEARTBEAT_MS    2000

// Set to 1 for website demo without hardware
#define DEMO_MODE       0

#endif
