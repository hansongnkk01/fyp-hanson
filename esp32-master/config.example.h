/*
 * Copy this file to config.h and fill in your credentials.
 * config.h is gitignored - never commit secrets.
 */
#ifndef CONFIG_H
#define CONFIG_H

#define WIFI_SSID       "Hanson iPhone"
#define WIFI_PASSWORD   "00000000"

// Supabase Project Settings -> API
#define SUPABASE_URL    "https://biuvkovtmgpawgcmatam.supabase.co"
#define SUPABASE_KEY    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpdXZrb3Z0bWdwYXdnY21hdGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTM1NTcsImV4cCI6MjA5NDc4OTU1N30.feyOvvoHQ8q7mCn8f5_M7ZqO0RMxcw2v74DoXq98QQ0"

// Poll interval for commands (ms)
#define COMMAND_POLL_MS 1000
#define HEARTBEAT_MS    2000

// UART to Slave
#define UART_BAUD       115200
#define UART_RX_PIN     16
#define UART_TX_PIN     17

// Set to 1 to run without Slave (synthetic data for website demo)
#define DEMO_MODE       0

#endif
