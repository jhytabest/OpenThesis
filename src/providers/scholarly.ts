import { semanticScholarFieldsOfStudy } from "../lib/zod-schemas.js";
import { Db } from "../lib/db.js";
import type {
  CandidatePaper,
  CanonicalPaper,
  Env,
  OpenAlexProvider,
  SemanticScholarProvider
} from "../lib/types.js";

export type JsonFetcher = <T>(
  url: string,
  options: RequestInit,
  timeoutMs?: number
) => Promise<T>;

type SemanticScholarPaper = {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  externalIds?: { DOI?: string };
  fieldsOfStudy?: string[];
  authors?: Array<{ authorId?: string; name?: string }>;
};

type OpenAlexWork = {
  id?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  abstract_inverted_index?: Record<string, number[]>;
  concepts?: Array<{ display_name?: string; score?: number }>;
  primary_topic?: { field?: { id?: string; display_name?: string } };
  authorships?: Array<{ author?: { id?: string; display_name?: string; orcid?: string } }>;
  referenced_works?: string[];
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeDoi = (value: string): string => value.replace(/^https?:\/\/doi.org\//i, "");

const parseOpenAlexAbstract = (
  invertedIndex?: Record<string, number[]>
): string | undefined => {
  if (!invertedIndex) {
    return undefined;
  }

  const tokens: Array<{ token: string; position: number }> = [];
  for (const [token, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      tokens.push({ token, position });
    }
  }

  if (tokens.length === 0) {
    return undefined;
  }

  tokens.sort((a, b) => a.position - b.position);
  return tokens.map((item) => item.token).join(" ");
};

const mapOpenAlexWork = (work: OpenAlexWork, semanticScholarId?: string): CanonicalPaper => ({
  openalexId: work.id ?? "",
  semanticScholarId,
  doi: work.doi ? normalizeDoi(work.doi) : undefined,
  title: work.title ?? work.display_name ?? "Untitled",
  abstract: parseOpenAlexAbstract(work.abstract_inverted_index),
  year: work.publication_year,
  citationCount: work.cited_by_count,
  fieldsOfStudy: [
    ...(work.primary_topic?.field?.display_name ? [work.primary_topic.field.display_name] : []),
    ...((work.concepts ?? [])
      .filter((concept) => (concept.score ?? 0) >= 0.5)
      .map((concept) => concept.display_name)
      .filter((value): value is string => Boolean(value)))
  ],
  authors: (work.authorships ?? [])
    .map((authorship) => ({
      openalexId: authorship.author?.id,
      name: authorship.author?.display_name ?? "Unknown",
      orcid: authorship.author?.orcid
    })),
  referencedOpenalexIds: [...new Set((work.referenced_works ?? []).filter(Boolean))]
});

const sanitizePlainSearchQuery = (value: string): string =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildSearchQuery = (query: string): string => {
  const tokens = sanitizePlainSearchQuery(query)
    .split(" ")
    .filter((token) => token.length > 1);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    deduped.push(token);
    if (deduped.length >= 10) {
      break;
    }
  }
  return deduped.join(" ");
};

const isOpenAlexWorkId = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return /^https?:\/\/openalex\.org\/W\d+$/i.test(value) || /^W\d+$/i.test(value);
};

const mapOpenAlexSearchResponse = (payload: {
  results?: OpenAlexWork[];
}): CandidatePaper[] =>
  (payload.results ?? [])
    .filter((work): work is Required<Pick<OpenAlexWork, "id">> & OpenAlexWork => Boolean(work.id))
    .map((work) => ({
      paperId: work.id!,
      title: work.title ?? work.display_name ?? "Untitled",
      abstract: parseOpenAlexAbstract(work.abstract_inverted_index),
      year: work.publication_year,
      citationCount: work.cited_by_count,
      doi: work.doi ? normalizeDoi(work.doi) : undefined,
      fieldsOfStudy: [
        ...(work.primary_topic?.field?.display_name ? [work.primary_topic.field.display_name] : []),
        ...((work.concepts ?? [])
          .filter((concept) => (concept.score ?? 0) >= 0.5)
          .map((concept) => concept.display_name)
          .filter((value): value is string => Boolean(value)))
      ],
      authors: (work.authorships ?? []).map((authorship) => ({
        id: authorship.author?.id,
        name: authorship.author?.display_name ?? "Unknown"
      }))
    }))
    .filter((paper) => (paper.citationCount ?? 0) > 10);

const mapSemanticScholarResponse = (payload: {
  data?: SemanticScholarPaper[];
}): CandidatePaper[] =>
  (payload.data ?? [])
    .filter((paper) => (paper.citationCount ?? 0) > 10)
    .filter((paper): paper is Required<Pick<SemanticScholarPaper, "paperId" | "title">> & SemanticScholarPaper =>
      Boolean(paper.paperId && paper.title)
    )
    .map((paper) => ({
      paperId: paper.paperId!,
      title: paper.title!,
      abstract: paper.abstract,
      year: paper.year,
      citationCount: paper.citationCount,
      doi: paper.externalIds?.DOI,
      fieldsOfStudy: paper.fieldsOfStudy ?? [],
      authors: (paper.authors ?? []).map((author) => ({
        id: author.authorId,
        name: author.name ?? "Unknown"
      }))
    }));

export const buildLiveSemanticScholarProvider = (
  env: Env,
  fetchJson: JsonFetcher
): SemanticScholarProvider => {
  const apiKey = env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SEMANTIC_SCHOLAR_API_KEY is required in live mode");
  }
  const baseUrl = "https://api.semanticscholar.org";
  const allowedFields = new Set<string>(semanticScholarFieldsOfStudy);

  const withHeaders = (headers?: HeadersInit): HeadersInit => {
    const merged: Record<string, string> = {
      accept: "application/json"
    };
    if (headers && !(headers instanceof Headers)) {
      Object.assign(merged, headers as Record<string, string>);
    }
    merged["x-api-key"] = apiKey;
    return merged;
  };

  const fields = [
    "paperId",
    "title",
    "abstract",
    "year",
    "citationCount",
    "externalIds",
    "fieldsOfStudy",
    "authors"
  ].join(",");

  return {
    async search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]> {
      const searchQuery = buildSearchQuery(query);
      if (!searchQuery) {
        throw new Error("Semantic Scholar query is empty after sanitization");
      }

      const normalizedFields = [...new Set(fieldsOfStudy)].filter((field) =>
        allowedFields.has(field)
      );

      const url = new URL(`${baseUrl}/graph/v1/paper/search`);
      url.searchParams.set("query", searchQuery);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("fields", fields);
      if (normalizedFields.length > 0) {
        url.searchParams.set("fieldsOfStudy", normalizedFields.join(","));
      }

      const payload = await fetchJson<{ data?: SemanticScholarPaper[] }>(url.toString(), {
        method: "GET",
        headers: withHeaders()
      });

      return mapSemanticScholarResponse(payload);
    }
  };
};

const tokenizeTitle = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4)
  );

const titleSimilarity = (left: string, right: string): number => {
  const leftTokens = tokenizeTitle(left);
  const rightTokens = tokenizeTitle(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

const pickBestTitleMatch = (seed: CandidatePaper, candidates: OpenAlexWork[]): OpenAlexWork | undefined =>
  candidates
    .map((candidate) => {
      const candidateTitle = candidate.title ?? candidate.display_name ?? "";
      const sim = titleSimilarity(seed.title, candidateTitle);
      const yearScore =
        seed.year && candidate.publication_year
          ? 1 / (1 + Math.abs(seed.year - candidate.publication_year))
          : 0.5;
      return {
        candidate,
        score: 0.85 * sim + 0.15 * yearScore
      };
    })
    .sort((a, b) => b.score - a.score)
    .find((entry) => entry.score >= 0.2)?.candidate;

export const buildLiveOpenAlexProvider = (
  env: Env,
  fetchJson: JsonFetcher
): OpenAlexProvider => {
  if (!env.OPENALEX_API_KEY) {
    throw new Error("OPENALEX_API_KEY is required in live mode");
  }

  const baseUrl = "https://api.openalex.org";
  const MAX_REFERENCES_PER_SEED = 100;
  const MAX_CITING_PER_SEED = 100;
  const OPENALEX_RATE_LIMIT_KEY = "openalex_api";
  const OPENALEX_MIN_INTERVAL_MS = 10;
  let processNextOpenAlexAllowedAt = 0;

  const withAuth = (url: URL): URL => {
    url.searchParams.set("api_key", env.OPENALEX_API_KEY!);
    return url;
  };

  const acquireOpenAlexSlot = async (): Promise<void> => {
    if (env.ALEXCLAW_DB) {
      await Db.ensureGlobalRateLimitKey(env.ALEXCLAW_DB, OPENALEX_RATE_LIMIT_KEY);
      while (true) {
        const now = Date.now();
        const nextAllowedAt = await Db.readGlobalRateLimitNextAllowedMs(
          env.ALEXCLAW_DB,
          OPENALEX_RATE_LIMIT_KEY
        );
        if (nextAllowedAt > now) {
          await sleep(nextAllowedAt - now);
          continue;
        }

        const claimed = await Db.compareAndSetGlobalRateLimit(
          env.ALEXCLAW_DB,
          OPENALEX_RATE_LIMIT_KEY,
          nextAllowedAt,
          now + OPENALEX_MIN_INTERVAL_MS
        );
        if (claimed) {
          return;
        }
      }
    }

    const now = Date.now();
    if (processNextOpenAlexAllowedAt > now) {
      await sleep(processNextOpenAlexAllowedAt - now);
    }
    processNextOpenAlexAllowedAt = Date.now() + OPENALEX_MIN_INTERVAL_MS;
  };

  const fetchOpenAlexJson = async <T>(url: string): Promise<T> => {
    await acquireOpenAlexSlot();
    return fetchJson<T>(url, { method: "GET" });
  };

  const fetchWorksPage = async (
    filter: string,
    perPage: number,
    cursor?: string
  ): Promise<{ results: OpenAlexWork[]; nextCursor: string | null }> => {
    const url = withAuth(new URL(`${baseUrl}/works`));
    url.searchParams.set("filter", filter);
    url.searchParams.set("per-page", String(perPage));
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const payload = await fetchOpenAlexJson<{
      results?: OpenAlexWork[];
      meta?: { next_cursor?: string | null };
    }>(url.toString());
    return {
      results: payload.results ?? [],
      nextCursor: payload.meta?.next_cursor ?? null
    };
  };

  const fetchWorks = async (filter: string, limit: number): Promise<OpenAlexWork[]> => {
    const output: OpenAlexWork[] = [];
    let cursor: string | undefined = "*";

    while (output.length < limit && cursor) {
      const pageSize = Math.min(200, limit - output.length);
      const page = await fetchWorksPage(filter, pageSize, cursor);
      if (page.results.length === 0) {
        break;
      }
      output.push(...page.results);
      cursor = page.nextCursor ?? undefined;
    }

    return output.slice(0, limit);
  };

  const fetchWorkById = async (openalexId: string): Promise<OpenAlexWork | null> => {
    const url = withAuth(
      new URL(
        `${baseUrl}/works/${encodeURIComponent(
          openalexId.startsWith("https://openalex.org/") ? openalexId : `https://openalex.org/${openalexId}`
        )}`
      )
    );
    try {
      return await fetchOpenAlexJson<OpenAlexWork>(url.toString());
    } catch {
      return null;
    }
  };

  return {
    async search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]> {
      const searchQuery = buildSearchQuery(query);
      if (!searchQuery) {
        throw new Error("OpenAlex query is empty after sanitization");
      }
      void fieldsOfStudy;

      const url = withAuth(new URL(`${baseUrl}/works`));
      url.searchParams.set("search.semantic", searchQuery);
      url.searchParams.set("per-page", String(Math.max(1, Math.min(50, limit))));
      const payload = await fetchOpenAlexJson<{ results?: OpenAlexWork[] }>(url.toString());
      return mapOpenAlexSearchResponse(payload).slice(0, limit);
    },

    async resolveSeeds(seeds: CandidatePaper[]): Promise<CanonicalPaper[]> {
      const resolved: CanonicalPaper[] = [];

      for (const seed of seeds) {
        let work: OpenAlexWork | undefined;

        if (isOpenAlexWorkId(seed.paperId)) {
          const byId = await fetchWorkById(seed.paperId);
          if (byId) {
            work = byId;
          }
        }

        if (!work && seed.doi) {
          const byDoi = await fetchWorks(`doi:${normalizeDoi(seed.doi)}`, 1);
          work = byDoi[0];
        }

        if (!work) {
          const url = withAuth(new URL(`${baseUrl}/works`));
          url.searchParams.set("search", seed.title);
          url.searchParams.set("per-page", "10");
          const searchPayload = await fetchOpenAlexJson<{ results?: OpenAlexWork[] }>(
            url.toString()
          );
          work = pickBestTitleMatch(seed, searchPayload.results ?? []);
        }

        if (work?.id) {
          resolved.push(mapOpenAlexWork(work, isOpenAlexWorkId(seed.paperId) ? undefined : seed.paperId));
        }
      }

      return resolved;
    },

    async expandGraph(seedWorks: CanonicalPaper[]): Promise<{ papers: CanonicalPaper[] }> {
      const papers: CanonicalPaper[] = [];

      for (const seed of seedWorks) {
        const seedWork = await fetchWorkById(seed.openalexId);
        if (!seedWork?.id) {
          continue;
        }
        papers.push(mapOpenAlexWork(seedWork, seed.semanticScholarId));

        const references = (seedWork.referenced_works ?? []).slice(0, MAX_REFERENCES_PER_SEED);
        for (const referenceId of references) {
          const ref = await fetchWorkById(referenceId);
          if (!ref?.id) {
            continue;
          }
          papers.push(mapOpenAlexWork(ref));
        }

        const citing = await fetchWorks(`cites:${seed.openalexId}`, MAX_CITING_PER_SEED);
        for (const citedBy of citing) {
          if (!citedBy.id) {
            continue;
          }
          papers.push(mapOpenAlexWork(citedBy));
        }
      }

      return { papers };
    }
  };
};
