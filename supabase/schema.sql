-- FYP: Piezoelectric Energy Harvesting Circuit Comparison
-- Run this in Supabase SQL Editor (Dashboard -> SQL -> New query)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: commands (website -> ESP32 master)
-- ============================================================
CREATE TABLE IF NOT EXISTS commands (
  id BIGSERIAL PRIMARY KEY,
  command TEXT NOT NULL CHECK (command IN (
    'START_BRIDGE_COMPARISON',
    'START_CWVM_COMPARISON',
    'START_FINAL_COMPARISON'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'done', 'error'
  )),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commands_pending ON commands (status, created_at)
  WHERE status = 'pending';

-- ============================================================
-- TABLE: system_state (single row, realtime status)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stage TEXT NOT NULL DEFAULT 'idle' CHECK (stage IN (
    'idle', 'bridge', 'cwvm', 'final', 'finished'
  )),
  connection TEXT NOT NULL DEFAULT 'offline' CHECK (connection IN ('online', 'offline')),
  last_seen TIMESTAMPTZ,
  bridge_winner_relay INT CHECK (bridge_winner_relay IN (1, 2)),
  cwvm_winner_relay INT CHECK (cwvm_winner_relay IN (3, 4, 5)),
  final_winner_relay INT CHECK (final_winner_relay IN (1, 2, 3, 4, 5)),
  active_relays JSONB NOT NULL DEFAULT '[]'::jsonb,
  led_zone INT NOT NULL DEFAULT 0 CHECK (led_zone BETWEEN 0 AND 3),
  lcd_message TEXT NOT NULL DEFAULT 'Ready',
  relay_mask INT NOT NULL DEFAULT 0,
  is_measuring BOOLEAN NOT NULL DEFAULT FALSE,
  current_comparison_id UUID,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TABLE: circuit_results (per-circuit measurements)
-- ============================================================
CREATE TABLE IF NOT EXISTS circuit_results (
  id BIGSERIAL PRIMARY KEY,
  comparison_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('bridge', 'cwvm', 'final')),
  relay INT NOT NULL CHECK (relay BETWEEN 1 AND 5),
  circuit_name TEXT NOT NULL,
  v_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  i_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  vavg REAL NOT NULL DEFAULT 0,
  vmax REAL NOT NULL DEFAULT 0,
  vmin REAL NOT NULL DEFAULT 0,
  vripple REAL NOT NULL DEFAULT 0,
  iavg REAL NOT NULL DEFAULT 0,
  pout REAL NOT NULL DEFAULT 0,
  pout_v2r REAL NOT NULL DEFAULT 0,
  stability REAL NOT NULL DEFAULT 0,
  winner BOOLEAN NOT NULL DEFAULT FALSE,
  rank INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circuit_results_comparison ON circuit_results (comparison_id, stage);

-- ============================================================
-- TABLE: comparison_summary (stage winners for UI)
-- ============================================================
CREATE TABLE IF NOT EXISTS comparison_summary (
  id BIGSERIAL PRIMARY KEY,
  comparison_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('bridge', 'cwvm', 'final')),
  winner_relay INT NOT NULL,
  winner_name TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comparison_summary_id ON comparison_summary (comparison_id, stage);

-- ============================================================
-- ROW LEVEL SECURITY (permissive for FYP demo)
-- ============================================================
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_summary ENABLE ROW LEVEL SECURITY;

-- Commands: anyone can insert (website), read/update (ESP32 + website)
CREATE POLICY "commands_select" ON commands FOR SELECT USING (true);
CREATE POLICY "commands_insert" ON commands FOR INSERT WITH CHECK (true);
CREATE POLICY "commands_update" ON commands FOR UPDATE USING (true);

-- System state
CREATE POLICY "system_state_select" ON system_state FOR SELECT USING (true);
CREATE POLICY "system_state_update" ON system_state FOR UPDATE USING (true);
CREATE POLICY "system_state_insert" ON system_state FOR INSERT WITH CHECK (true);

-- Circuit results
CREATE POLICY "circuit_results_select" ON circuit_results FOR SELECT USING (true);
CREATE POLICY "circuit_results_insert" ON circuit_results FOR INSERT WITH CHECK (true);
CREATE POLICY "circuit_results_update" ON circuit_results FOR UPDATE USING (true);

-- Comparison summary
CREATE POLICY "comparison_summary_select" ON comparison_summary FOR SELECT USING (true);
CREATE POLICY "comparison_summary_insert" ON comparison_summary FOR INSERT WITH CHECK (true);

-- Enable Realtime (run once; ignore "already member" errors)
-- Or use Dashboard: Database -> Replication -> supabase_realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE system_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE circuit_results;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE comparison_summary;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
