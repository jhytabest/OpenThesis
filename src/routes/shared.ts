import type { Context, Hono } from "hono";
import type { AppBindings } from "./types.js";
import type { ProjectPaperRow } from "../lib/hub-db.js";

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (typeof value !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const queryBool = (value: string | undefined): boolean | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return undefined;
};

export const normalizeStringArray = (value: unknown, max = 40): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(trimmed);
    if (output.length >= max) {
      break;
    }
  }
  return output;
};

const readAuthToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice("bearer ".length).trim();
  }
  return authorizationHeader.trim();
};

export const isInternalRequestAuthorized = (c: Context<AppBindings>): boolean => {
  const expectedToken = c.env.INTERNAL_API_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }
  const headerToken = readAuthToken(c.req.header("authorization"));
  const directToken = c.req.header("x-internal-token")?.trim() ?? null;
  return headerToken === expectedToken || directToken === expectedToken;
};

export const assertInternalRequest = (c: Context<AppBindings>): Response | null =>
  isInternalRequestAuthorized(c) ? null : new Response("Not Found", { status: 404 });

export const mapProjectPaperResponse = (paper: ProjectPaperRow) => ({
  id: paper.id,
  source: paper.source,
  paperId: paper.paper_id,
  openalexId: paper.openalex_id,
  semanticScholarId: paper.semantic_scholar_id,
  doi: paper.doi,
  title: paper.title,
  abstract: paper.abstract,
  year: paper.year,
  citationCount: paper.citation_count,
  fieldsOfStudy: safeJsonParse<string[]>(paper.fields_of_study_json, []),
  score: {
    lexical: paper.score_lexical,
    graph: paper.score_graph,
    citation: paper.score_citation,
    total: paper.score_total
  },
  tier: paper.tier,
  access: {
    pdfUrl: paper.pdf_url,
    oaStatus: paper.oa_status,
    license: paper.license
  },
  bookmarked: paper.bookmarked === 1,
  inReadingList: paper.in_reading_list === 1,
  tags: safeJsonParse<string[]>(paper.tags_json, []),
  note: paper.note_text,
  isDeleted: paper.is_deleted === 1,
  commentCount: Number(paper.comment_count ?? 0),
  createdAt: paper.created_at,
  updatedAt: paper.updated_at
});

export type App = Hono<AppBindings>;
