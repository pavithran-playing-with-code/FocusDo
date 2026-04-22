-- Run this once against your focusdo database
-- Adds device_id column so each browser's tasks are isolated

ALTER TABLE tasks
  ADD COLUMN device_id VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER id;

-- Optional index for faster lookups
CREATE INDEX idx_tasks_device ON tasks(device_id);
