import type { RunStatus } from "../types.js";

export interface RunRow {
  id: string;
  user_id: string;
  thesis_id: string;
  status: RunStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
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
