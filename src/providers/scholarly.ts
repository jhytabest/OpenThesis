import { semanticScholarFieldsOfStudy } from "../lib/zod-schemas.js";
import type {
  CandidatePaper,
  CanonicalPaper,
  Env,
  GraphEdge,
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
  primary_topic?: { field?: { display_name?: string } };
  authorships?: Array<{ author?: { id?: string; display_name?: string; orcid?: string } }>;
  referenced_works?: string[];
};

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
    }))
    .slice(0, 8)
});

const sanitizePlainSearchQuery = (value: string): string =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildSearchQuery = (query: string, mustTerms?: string[]): string => {
  const tokenize = (value: string): string[] =>
    sanitizePlainSearchQuery(value)
      .split(" ")
      .filter((token) => token.length > 1);

  const tokens: string[] = [];
  for (const term of mustTerms ?? []) {
    tokens.push(...tokenize(term));
  }
  tokens.push(...tokenize(query));

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

const toYearFilter = (timeHorizon?: {
  start_year: number | null;
  end_year: number | null;
}): string | null => {
  if (!timeHorizon) {
    return null;
  }
  const start = timeHorizon.start_year;
  const end = timeHorizon.end_year;
  if (start && end) {
    return `${start}-${end}`;
  }
  if (start && !end) {
    return `${start}-`;
  }
  if (!start && end) {
    return `-${end}`;
  }
  return null;
};

const mapSemanticScholarResponse = (payload: {
  data?: SemanticScholarPaper[];
}): CandidatePaper[] =>
  (payload.data ?? [])
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
  const apiKey = env.SEMANTIC_SCHOLAR_API_KEY;
  const baseUrl = "https://api.semanticscholar.org";
  const allowedFields = new Set<string>(semanticScholarFieldsOfStudy);

  const withHeaders = (headers?: HeadersInit): HeadersInit => {
    const merged: Record<string, string> = {
      accept: "application/json"
    };
    if (headers && !(headers instanceof Headers)) {
      Object.assign(merged, headers as Record<string, string>);
    }
    if (apiKey) {
      merged["x-api-key"] = apiKey;
    }
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
    async search(
      query: string,
      fieldsOfStudy: string[],
      limit: number,
      timeHorizon?: { start_year: number | null; end_year: number | null },
      mustTerms?: string[]
    ): Promise<CandidatePaper[]> {
      const searchQuery = buildSearchQuery(query, mustTerms);
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
      const yearFilter = toYearFilter(timeHorizon);
      if (yearFilter) {
        url.searchParams.set("year", yearFilter);
      }

      const payload = await fetchJson<{ data?: SemanticScholarPaper[] }>(url.toString(), {
        method: "GET",
        headers: withHeaders()
      });

      return mapSemanticScholarResponse(payload);
    },

    async recommend(
      positivePaperIds: string[],
      negativePaperIds: string[],
      limit: number
    ): Promise<CandidatePaper[]> {
      if (positivePaperIds.length === 0) {
        throw new Error("semantic_recommendations requires at least one positivePaperId");
      }

      const payload = await fetchJson<{ recommendedPapers?: SemanticScholarPaper[] }>(
        `${baseUrl}/recommendations/v1/papers`,
        {
          method: "POST",
          headers: withHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            positivePaperIds,
            negativePaperIds,
            limit,
            fields
          })
        }
      );

      return mapSemanticScholarResponse({ data: payload.recommendedPapers });
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

const isRelatedToSeed = (seed: CanonicalPaper, candidate: CanonicalPaper): boolean => {
  const seedFields = new Set(seed.fieldsOfStudy.map((field) => field.toLowerCase()));
  const candidateFields = new Set(candidate.fieldsOfStudy.map((field) => field.toLowerCase()));
  for (const field of seedFields) {
    if (candidateFields.has(field)) {
      return true;
    }
  }

  const seedTokens = tokenizeTitle(seed.title);
  const candidateTokens = tokenizeTitle(candidate.title);
  let overlap = 0;
  for (const token of seedTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
    if (overlap >= 2) {
      return true;
    }
  }
  return false;
};

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

  const withAuth = (url: URL): URL => {
    url.searchParams.set("api_key", env.OPENALEX_API_KEY!);
    return url;
  };

  const fetchWorks = async (filter: string, perPage: number): Promise<OpenAlexWork[]> => {
    const url = withAuth(new URL(`${baseUrl}/works`));
    url.searchParams.set("filter", filter);
    url.searchParams.set("per-page", String(perPage));
    const payload = await fetchJson<{ results?: OpenAlexWork[] }>(url.toString(), { method: "GET" });
    return payload.results ?? [];
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
      return await fetchJson(url.toString(), { method: "GET" });
    } catch {
      return null;
    }
  };

  return {
    async resolveSeeds(seeds: CandidatePaper[]): Promise<CanonicalPaper[]> {
      const resolved: CanonicalPaper[] = [];

      for (const seed of seeds) {
        let work: OpenAlexWork | undefined;

        if (seed.doi) {
          const byDoi = await fetchWorks(`doi:${normalizeDoi(seed.doi)}`, 1);
          work = byDoi[0];
        }

        if (!work) {
          const url = withAuth(new URL(`${baseUrl}/works`));
          url.searchParams.set("search", seed.title);
          url.searchParams.set("per-page", "10");
          const searchPayload = await fetchJson<{ results?: OpenAlexWork[] }>(url.toString(), {
            method: "GET"
          });
          work = pickBestTitleMatch(seed, searchPayload.results ?? []);
        }

        if (work?.id) {
          resolved.push(mapOpenAlexWork(work, seed.paperId));
        }
      }

      return resolved;
    },

    async expandGraph(seedWorks: CanonicalPaper[]): Promise<{ papers: CanonicalPaper[]; edges: GraphEdge[] }> {
      const papers: CanonicalPaper[] = [];
      const edges: GraphEdge[] = [];

      for (const seed of seedWorks) {
        const seedWork = await fetchWorkById(seed.openalexId);
        if (!seedWork?.id) {
          continue;
        }

        const references = (seedWork.referenced_works ?? []).slice(0, 10);
        for (const referenceId of references) {
          const ref = await fetchWorkById(referenceId);
          if (!ref?.id) {
            continue;
          }
          const mapped = mapOpenAlexWork(ref);
          if (!isRelatedToSeed(seed, mapped)) {
            continue;
          }
          papers.push(mapped);
          edges.push({
            sourceOpenalexId: seed.openalexId,
            targetOpenalexId: ref.id,
            type: "REFERENCE",
            weight: 0.9,
            evidence: "openalex:referenced_works"
          });
        }

        const citing = await fetchWorks(`cites:${seed.openalexId}`, 10);
        for (const citedBy of citing) {
          if (!citedBy.id) {
            continue;
          }
          const mapped = mapOpenAlexWork(citedBy);
          if (!isRelatedToSeed(seed, mapped)) {
            continue;
          }
          papers.push(mapped);
          edges.push({
            sourceOpenalexId: citedBy.id,
            targetOpenalexId: seed.openalexId,
            type: "CITATION",
            weight: 0.8,
            evidence: "openalex:cites"
          });
        }

        const authorId = seedWork.authorships?.[0]?.author?.id;
        if (authorId) {
          const shared = await fetchWorks(`authorships.author.id:${authorId}`, 8);
          for (const work of shared) {
            if (!work.id || work.id === seed.openalexId) {
              continue;
            }
            const mapped = mapOpenAlexWork(work);
            if (!isRelatedToSeed(seed, mapped)) {
              continue;
            }
            papers.push(mapped);
            edges.push({
              sourceOpenalexId: seed.openalexId,
              targetOpenalexId: work.id,
              type: "SHARED_AUTHOR",
              weight: 0.7,
              evidence: "openalex:shared_author"
            });
          }
        }
      }

      return { papers, edges };
    }
  };
};
