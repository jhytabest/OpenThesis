CREATE TABLE IF NOT EXISTS run_enrichment_stats (
  run_id TEXT PRIMARY KEY,
  enqueued_count INTEGER NOT NULL DEFAULT 0,
  lookup_completed_count INTEGER NOT NULL DEFAULT 0,
  lookup_found_count INTEGER NOT NULL DEFAULT 0,
  lookup_not_found_count INTEGER NOT NULL DEFAULT 0,
  lookup_failed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

INSERT INTO run_enrichment_stats (
  run_id,
  enqueued_count,
  lookup_completed_count,
  lookup_found_count,
  lookup_not_found_count,
  lookup_failed_count,
  updated_at
)
SELECT
  r.id AS run_id,
  COALESCE(CAST(json_extract(le.payload_json, '$.enqueuedCount') AS INTEGER), 0) AS enqueued_count,
  COALESCE(ec.lookup_completed_count, 0) AS lookup_completed_count,
  COALESCE(ec.lookup_found_count, 0) AS lookup_found_count,
  COALESCE(ec.lookup_not_found_count, 0) AS lookup_not_found_count,
  COALESCE(ec.lookup_failed_count, 0) AS lookup_failed_count,
  COALESCE(r.updated_at, r.created_at) AS updated_at
FROM runs r
LEFT JOIN (
  SELECT rs.run_id, rs.payload_json
  FROM run_steps rs
  INNER JOIN (
    SELECT run_id, MAX(attempt) AS max_attempt
    FROM run_steps
    WHERE step_name = 'enqueue_unpaywall_enrichment' AND status = 'COMPLETED'
    GROUP BY run_id
  ) latest ON latest.run_id = rs.run_id AND latest.max_attempt = rs.attempt
  WHERE rs.step_name = 'enqueue_unpaywall_enrichment' AND rs.status = 'COMPLETED'
) le ON le.run_id = r.id
LEFT JOIN (
  SELECT
    e.run_id,
    SUM(CASE WHEN e.source = 'unpaywall.lookup' THEN 1 ELSE 0 END) AS lookup_completed_count,
    SUM(
      CASE
        WHEN e.source = 'unpaywall.lookup'
          AND COALESCE(CAST(json_extract(e.detail_json, '$.found') AS INTEGER), 0) = 1
        THEN 1
        ELSE 0
      END
    ) AS lookup_found_count,
    SUM(
      CASE
        WHEN e.source = 'unpaywall.lookup'
          AND COALESCE(CAST(json_extract(e.detail_json, '$.found') AS INTEGER), 0) = 0
        THEN 1
        ELSE 0
      END
    ) AS lookup_not_found_count,
    SUM(CASE WHEN e.source = 'unpaywall.lookup_failed' THEN 1 ELSE 0 END) AS lookup_failed_count
  FROM evidence e
  WHERE e.source IN ('unpaywall.lookup', 'unpaywall.lookup_failed')
  GROUP BY e.run_id
) ec ON ec.run_id = r.id
ON CONFLICT(run_id) DO UPDATE SET
  enqueued_count = excluded.enqueued_count,
  lookup_completed_count = excluded.lookup_completed_count,
  lookup_found_count = excluded.lookup_found_count,
  lookup_not_found_count = excluded.lookup_not_found_count,
  lookup_failed_count = excluded.lookup_failed_count,
  updated_at = excluded.updated_at;

CREATE TRIGGER IF NOT EXISTS trg_run_enrichment_stats_run_insert
AFTER INSERT ON runs
BEGIN
  INSERT OR IGNORE INTO run_enrichment_stats (
    run_id,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.updated_at, NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_run_enrichment_stats_enqueue_completed
AFTER UPDATE OF status, payload_json ON run_steps
WHEN NEW.step_name = 'enqueue_unpaywall_enrichment' AND NEW.status = 'COMPLETED'
BEGIN
  INSERT OR IGNORE INTO run_enrichment_stats (run_id, updated_at)
  VALUES (NEW.run_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE run_enrichment_stats
  SET
    enqueued_count = MAX(
      enqueued_count,
      COALESCE(CAST(json_extract(NEW.payload_json, '$.enqueuedCount') AS INTEGER), 0)
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE run_id = NEW.run_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_run_enrichment_stats_evidence_insert
AFTER INSERT ON evidence
WHEN NEW.source IN ('unpaywall.lookup', 'unpaywall.lookup_failed')
BEGIN
  INSERT OR IGNORE INTO run_enrichment_stats (run_id, updated_at)
  VALUES (NEW.run_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE run_enrichment_stats
  SET
    lookup_completed_count = lookup_completed_count + CASE WHEN NEW.source = 'unpaywall.lookup' THEN 1 ELSE 0 END,
    lookup_found_count = lookup_found_count + CASE
      WHEN NEW.source = 'unpaywall.lookup'
        AND COALESCE(CAST(json_extract(NEW.detail_json, '$.found') AS INTEGER), 0) = 1
      THEN 1
      ELSE 0
    END,
    lookup_not_found_count = lookup_not_found_count + CASE
      WHEN NEW.source = 'unpaywall.lookup'
        AND COALESCE(CAST(json_extract(NEW.detail_json, '$.found') AS INTEGER), 0) = 0
      THEN 1
      ELSE 0
    END,
    lookup_failed_count = lookup_failed_count + CASE WHEN NEW.source = 'unpaywall.lookup_failed' THEN 1 ELSE 0 END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE run_id = NEW.run_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_run_enrichment_stats_evidence_delete
AFTER DELETE ON evidence
WHEN OLD.source IN ('unpaywall.lookup', 'unpaywall.lookup_failed')
BEGIN
  INSERT OR IGNORE INTO run_enrichment_stats (run_id, updated_at)
  VALUES (OLD.run_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE run_enrichment_stats
  SET
    lookup_completed_count = MAX(0, lookup_completed_count - CASE WHEN OLD.source = 'unpaywall.lookup' THEN 1 ELSE 0 END),
    lookup_found_count = MAX(0, lookup_found_count - CASE
      WHEN OLD.source = 'unpaywall.lookup'
        AND COALESCE(CAST(json_extract(OLD.detail_json, '$.found') AS INTEGER), 0) = 1
      THEN 1
      ELSE 0
    END),
    lookup_not_found_count = MAX(0, lookup_not_found_count - CASE
      WHEN OLD.source = 'unpaywall.lookup'
        AND COALESCE(CAST(json_extract(OLD.detail_json, '$.found') AS INTEGER), 0) = 0
      THEN 1
      ELSE 0
    END),
    lookup_failed_count = MAX(0, lookup_failed_count - CASE WHEN OLD.source = 'unpaywall.lookup_failed' THEN 1 ELSE 0 END),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE run_id = OLD.run_id;
END;
