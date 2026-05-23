-- Run once in Supabase SQL Editor if commands table already exists
-- Adds RESET_SYSTEM for emergency stop button

ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_command_check;

ALTER TABLE commands ADD CONSTRAINT commands_command_check CHECK (command IN (
  'START_BRIDGE_COMPARISON',
  'START_CWVM_COMPARISON',
  'START_FINAL_COMPARISON',
  'RESET_SYSTEM'
));
