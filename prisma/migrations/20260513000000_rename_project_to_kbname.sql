-- Rename project column to kb_name
ALTER TABLE memories RENAME COLUMN project TO kb_name;

-- Drop old index
DROP INDEX IF EXISTS memories_project_idx;

-- Create new index on kb_name
CREATE INDEX memories_kb_name_idx ON memories (kb_name);