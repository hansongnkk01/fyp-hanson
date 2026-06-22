/**
 * Supabase configuration for FYP dashboard.
 * 1. Copy this file to config.js
 * 2. Fill in your Supabase Project URL and anon public key
 * 3. config.js is gitignored - never commit real keys to public repos
 */
window.FYP_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
  /** false = live Supabase samples; true = lib/acq-templates.js with per-run jitter */
  USE_ACQ_PROFILES: false,
  ACQ_LIB: 'lib/acq-templates.js',
};
