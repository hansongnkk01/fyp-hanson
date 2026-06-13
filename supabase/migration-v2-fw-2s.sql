-- Migration from old 3-stage winner workflow to FW vs 2S measurement
-- Run once in Supabase SQL Editor (drops old result tables)

DROP TABLE IF EXISTS circuit_results CASCADE;
DROP TABLE IF EXISTS comparison_summary CASCADE;

-- Remove old command rows before tightening CHECK (avoids 23514 violation)
ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_command_check;

DELETE FROM commands
WHERE command NOT IN (
  'MEASURE_FW_CIRCUIT',
  'MEASURE_2S_CIRCUIT',
  'RESET_SYSTEM'
);

ALTER TABLE commands ADD CONSTRAINT commands_command_check CHECK (command IN (
  'MEASURE_FW_CIRCUIT',
  'MEASURE_2S_CIRCUIT',
  'RESET_SYSTEM'
));

-- Recreate system_state with new columns (simplest: drop single row table columns via recreate)
DROP TABLE IF EXISTS system_state CASCADE;

CREATE TABLE system_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stage TEXT NOT NULL DEFAULT 'idle' CHECK (stage IN (
    'idle', 'measuring_fw', 'fw_measured', 'measuring_2s', 'twos_measured'
  )),
  connection TEXT NOT NULL DEFAULT 'offline' CHECK (connection IN ('online', 'offline')),
  last_seen TIMESTAMPTZ,
  active_circuit TEXT NOT NULL DEFAULT 'none' CHECK (active_circuit IN (
    'none', 'full_wave', 'two_stage_cwvm'
  )),
  fw_measured BOOLEAN NOT NULL DEFAULT FALSE,
  twos_measured BOOLEAN NOT NULL DEFAULT FALSE,
  active_relays JSONB NOT NULL DEFAULT '[]'::jsonb,
  led_fw BOOLEAN NOT NULL DEFAULT FALSE,
  led_2s BOOLEAN NOT NULL DEFAULT FALSE,
  lcd_message TEXT NOT NULL DEFAULT 'Ready',
  relay_mask INT NOT NULL DEFAULT 0,
  is_measuring BOOLEAN NOT NULL DEFAULT FALSE,
  current_measurement_id UUID,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS measurement_samples (
  id BIGSERIAL PRIMARY KEY,
  measurement_id UUID NOT NULL,
  circuit_key TEXT NOT NULL CHECK (circuit_key IN ('full_wave', 'two_stage_cwvm')),
  circuit_name TEXT NOT NULL,
  time_s INT NOT NULL CHECK (time_s BETWEEN 0 AND 9),
  voltage REAL NOT NULL DEFAULT 0,
  current REAL NOT NULL DEFAULT 0,
  power REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurement_samples_run
  ON measurement_samples (measurement_id, circuit_key, time_s);

CREATE TABLE IF NOT EXISTS measurement_summary (
  id BIGSERIAL PRIMARY KEY,
  measurement_id UUID NOT NULL,
  circuit_key TEXT NOT NULL CHECK (circuit_key IN ('full_wave', 'two_stage_cwvm')),
  circuit_name TEXT NOT NULL,
  vavg REAL NOT NULL DEFAULT 0,
  iavg REAL NOT NULL DEFAULT 0,
  pavg REAL NOT NULL DEFAULT 0,
  vmax REAL NOT NULL DEFAULT 0,
  vmin REAL NOT NULL DEFAULT 0,
  vripple REAL NOT NULL DEFAULT 0,
  stabilization_time REAL,
  stabilization_ok BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurement_summary_circuit
  ON measurement_summary (circuit_key, created_at DESC);

ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_state_select" ON system_state;
DROP POLICY IF EXISTS "system_state_update" ON system_state;
DROP POLICY IF EXISTS "system_state_insert" ON system_state;
DROP POLICY IF EXISTS "measurement_samples_select" ON measurement_samples;
DROP POLICY IF EXISTS "measurement_samples_insert" ON measurement_samples;
DROP POLICY IF EXISTS "measurement_summary_select" ON measurement_summary;
DROP POLICY IF EXISTS "measurement_summary_insert" ON measurement_summary;

CREATE POLICY "system_state_select" ON system_state FOR SELECT USING (true);
CREATE POLICY "system_state_update" ON system_state FOR UPDATE USING (true);
CREATE POLICY "system_state_insert" ON system_state FOR INSERT WITH CHECK (true);
CREATE POLICY "measurement_samples_select" ON measurement_samples FOR SELECT USING (true);
CREATE POLICY "measurement_samples_insert" ON measurement_samples FOR INSERT WITH CHECK (true);
CREATE POLICY "measurement_summary_select" ON measurement_summary FOR SELECT USING (true);
CREATE POLICY "measurement_summary_insert" ON measurement_summary FOR INSERT WITH CHECK (true);

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE measurement_samples;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE measurement_summary;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
