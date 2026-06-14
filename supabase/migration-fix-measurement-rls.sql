-- Run if measurement upload returns HTTP 401/403
-- Ensures anon key can INSERT into measurement tables

ALTER TABLE measurement_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "measurement_samples_insert" ON measurement_samples;
DROP POLICY IF EXISTS "measurement_samples_select" ON measurement_samples;
DROP POLICY IF EXISTS "measurement_summary_insert" ON measurement_summary;
DROP POLICY IF EXISTS "measurement_summary_select" ON measurement_summary;

CREATE POLICY "measurement_samples_select" ON measurement_samples FOR SELECT USING (true);
CREATE POLICY "measurement_samples_insert" ON measurement_samples FOR INSERT WITH CHECK (true);
CREATE POLICY "measurement_summary_select" ON measurement_summary FOR SELECT USING (true);
CREATE POLICY "measurement_summary_insert" ON measurement_summary FOR INSERT WITH CHECK (true);
