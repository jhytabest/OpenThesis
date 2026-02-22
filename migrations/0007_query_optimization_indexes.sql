CREATE INDEX IF NOT EXISTS idx_runs_user_thesis_created_updated
ON runs(user_id, thesis_id, created_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_steps_step_status_run_attempt
ON run_steps(step_name, status, run_id, attempt DESC);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_started
ON run_steps(run_id, started_at ASC);

CREATE INDEX IF NOT EXISTS idx_evidence_run_source
ON evidence(run_id, source);
