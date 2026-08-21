-- Add GIN index for full-text search on tickets
CREATE INDEX IF NOT EXISTS tickets_fts_idx
ON tickets
USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
