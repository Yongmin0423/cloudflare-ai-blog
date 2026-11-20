ALTER TABLE ai_draft_jobs ADD COLUMN diagnostic_events_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(diagnostic_events_json) AND json_type(diagnostic_events_json) = 'array'
    AND json_array_length(diagnostic_events_json) <= 24);
