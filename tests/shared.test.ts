import test from "node:test";
import assert from "node:assert/strict";
import {
  mapProjectPaperResponse,
  normalizeStringArray,
  queryBool,
  safeJsonParse
} from "../src/routes/shared.js";
import type { ProjectPaperRow } from "../src/lib/hub-db.js";

test("safeJsonParse returns parsed JSON and fallback when invalid", () => {
  assert.deepEqual(safeJsonParse("[\"a\",\"b\"]", [] as string[]), ["a", "b"]);
  assert.deepEqual(safeJsonParse<string[]>("not json", ["fallback"]), ["fallback"]);
  assert.deepEqual(safeJsonParse<string[]>(null, ["fallback"]), ["fallback"]);
});

test("queryBool parses common boolean string forms", () => {
  assert.equal(queryBool("true"), true);
  assert.equal(queryBool(" YES "), true);
  assert.equal(queryBool("0"), false);
  assert.equal(queryBool("No"), false);
  assert.equal(queryBool("maybe"), undefined);
  assert.equal(queryBool(undefined), undefined);
});

test("normalizeStringArray trims, deduplicates case-insensitively, and enforces max", () => {
  const result = normalizeStringArray(["  Alpha  ", "beta", "ALPHA", "", 123, "gamma", "delta"], 3);
  assert.deepEqual(result, ["Alpha", "beta", "gamma"]);
});

test("mapProjectPaperResponse maps paper row and parses JSON fields", () => {
  const row: ProjectPaperRow = {
    id: "pp_1",
    source: "pipeline",
    paper_id: "paper_1",
    openalex_id: "W123",
    semantic_scholar_id: "S123",
    doi: "10.1000/test",
    title: "Paper",
    abstract: "Abstract",
    year: 2024,
    citation_count: 42,
    fields_of_study_json: "[\"Computer Science\",\"Mathematics\"]",
    score_lexical: 0.7,
    score_graph: 0.6,
    score_citation: 0.5,
    score_total: 0.62,
    pdf_url: "https://example.com/paper.pdf",
    oa_status: "gold",
    license: "cc-by",
    bookmarked: 1,
    in_reading_list: 0,
    tags_json: "[\"methodology\"]",
    note_text: "note",
    is_deleted: 0,
    created_at: "2026-02-22T10:00:00.000Z",
    updated_at: "2026-02-22T12:00:00.000Z",
    comment_count: 3
  };

  const mapped = mapProjectPaperResponse(row);

  assert.equal(mapped.id, row.id);
  assert.equal(mapped.paperId, row.paper_id);
  assert.deepEqual(mapped.fieldsOfStudy, ["Computer Science", "Mathematics"]);
  assert.deepEqual(mapped.tags, ["methodology"]);
  assert.equal(mapped.bookmarked, true);
  assert.equal(mapped.inReadingList, false);
  assert.equal(mapped.comment, "note");
  assert.equal(mapped.note, "note");
  assert.equal(mapped.commentCount, 3);
  assert.equal(mapped.score.total, 0.62);
});
