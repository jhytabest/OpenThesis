import type { ContextStatus, RunStatus, RunType } from "../types.js";

export interface RunRow {
  id: string;
  user_id: string;
  thesis_id: string;
  status: RunStatus;
  run_type: RunType;
  context_status: ContextStatus;
  input_snapshot_hash: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunAuditEventRow {
  id: string;
  run_id: string;
  event_type: string;
  detail_json: string;
  created_at: string;
}

export interface RunArtifactRow {
  id: string;
  run_id: string;
  artifact_type: string;
  title: string;
  storage_key: string;
  metadata_json: string | null;
  created_at: string;
}

export interface RunEnrichmentProgress {
  run_id: string;
  enqueued_count: number;
  lookup_completed_count: number;
  lookup_found_count: number;
  lookup_not_found_count: number;
  lookup_failed_count: number;
  pending_count: number;
}
