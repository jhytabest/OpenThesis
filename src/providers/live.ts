import { zodToJsonSchema } from "zod-to-json-schema";
import {
  queryPlanSchema,
  seedSelectionSchema,
  triageOutputSchema
} from "../lib/zod-schemas.js";
import type {
  CandidatePaper,
  CanonicalPaper,
  Env,
  GraphEdge,
  Providers,
  QueryPlan,
  SeedSelection,
  TriageOutput
} from "../lib/types.js";
import type { ZodTypeAny } from "zod";

const openAiStrictSchema = (schema: ZodTypeAny, name: string): Record<string, unknown> => {
  const generated = zodToJsonSchema(schema, name) as {
    definitions?: Record<string, unknown>;
  };
  const fromDefinitions = generated.definitions?.[name];
  if (fromDefinitions && typeof fromDefinitions === "object") {
    return fromDefinitions as Record<string, unknown>;
  }
  return generated as unknown as Record<string, unknown>;
};

const fetchJson = async <T>(
  url: string,
  options: RequestInit,
  timeoutMs = 45_000
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${url} failed (${response.status}): ${body.slice(0, 500)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
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

const mapOpenAlexWork = (
  work: {
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
  },
  semanticScholarId?: string
): CanonicalPaper => ({
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

const extractOutputText = (payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") {
        continue;
      }
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI response did not return JSON text");
};

const buildLiveReasoningProvider = (env: Env) => {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in live mode");
  }

  const model = env.OPENAI_MODEL ?? "gpt-5-nano";

  const runStructuredPrompt = async <T>(input: {
    name: string;
    schema: Record<string, unknown>;
    system: string;
    user: string;
    parse: (value: unknown) => T;
  }): Promise<T> => {
    const payload = await fetchJson<{
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    }>(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: input.system }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: input.user }]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              strict: true,
              name: input.name,
              schema: input.schema
            }
          }
        })
      }
    );

    const parsed = JSON.parse(extractOutputText(payload));
    return input.parse(parsed);
  };

  return {
    async generateQueryPlan(thesisText: string): Promise<QueryPlan> {
      return runStructuredPrompt({
        name: "query_plan",
        schema: openAiStrictSchema(queryPlanSchema, "query_plan"),
        system:
          "You generate one broad Semantic Scholar query plus fields-of-study constraints for a thesis. Keep the query concise (about 8-18 terms), avoid long boolean chains, and return strict JSON.",
        user: `Thesis text:\n${thesisText}`,
        parse: (value) => queryPlanSchema.parse(value)
      });
    },

    async triageCandidates(
      thesisText: string,
      candidates: CandidatePaper[]
    ): Promise<TriageOutput> {
      return runStructuredPrompt({
        name: "triage_output",
        schema: openAiStrictSchema(triageOutputSchema, "triage_output"),
        system:
          "You classify candidate papers for thesis relevance. Use on_topic, off_topic, or uncertain. Return strict JSON.",
        user: `Thesis text:\n${thesisText}\n\nCandidates:\n${JSON.stringify(candidates)}`,
        parse: (value) => triageOutputSchema.parse(value)
      });
    },

    async selectSeeds(
      thesisText: string,
      candidates: CandidatePaper[],
      triage: TriageOutput
    ): Promise<SeedSelection> {
      return runStructuredPrompt({
        name: "seed_selection",
        schema: openAiStrictSchema(seedSelectionSchema, "seed_selection"),
        system:
          "Select final seed papers for graph expansion with broad coverage and high thesis relevance. Return strict JSON.",
        user: `Thesis text:\n${thesisText}\n\nCandidates:\n${JSON.stringify(
          candidates
        )}\n\nTriage:\n${JSON.stringify(triage)}`,
        parse: (value) => seedSelectionSchema.parse(value)
      });
    }
  };
};

const buildLiveSemanticScholarProvider = (env: Env) => {
  const apiKey = env.SEMANTIC_SCHOLAR_API_KEY;
  const baseUrl = "https://api.semanticscholar.org";

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

  const mapResponse = (payload: {
    data?: Array<{
      paperId?: string;
      title?: string;
      abstract?: string;
      year?: number;
      citationCount?: number;
      externalIds?: { DOI?: string };
      fieldsOfStudy?: string[];
      authors?: Array<{ authorId?: string; name?: string }>;
    }>;
  }): CandidatePaper[] =>
    (payload.data ?? [])
      .filter((paper): paper is Required<Pick<typeof paper, "paperId" | "title">> & typeof paper =>
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

  return {
    async search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]> {
      const url = new URL(`${baseUrl}/graph/v1/paper/search`);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("fields", fields);
      if (fieldsOfStudy.length > 0) {
        url.searchParams.set("fieldsOfStudy", fieldsOfStudy.join(","));
      }

      const payload = await fetchJson<{
        data?: Array<{
          paperId?: string;
          title?: string;
          abstract?: string;
          year?: number;
          citationCount?: number;
          externalIds?: { DOI?: string };
          fieldsOfStudy?: string[];
          authors?: Array<{ authorId?: string; name?: string }>;
        }>;
      }>(
        url.toString(),
        {
          method: "GET",
          headers: withHeaders()
        }
      );

      return mapResponse(payload);
    },

    async recommend(
      positivePaperIds: string[],
      negativePaperIds: string[],
      limit: number
    ): Promise<CandidatePaper[]> {
      if (positivePaperIds.length === 0) {
        throw new Error("semantic_recommendations requires at least one positivePaperId");
      }

      const payload = await fetchJson<{
        recommendedPapers?: Array<{
          paperId?: string;
          title?: string;
          abstract?: string;
          year?: number;
          citationCount?: number;
          externalIds?: { DOI?: string };
          fieldsOfStudy?: string[];
          authors?: Array<{ authorId?: string; name?: string }>;
        }>;
      }>(
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

      return mapResponse({ data: payload.recommendedPapers });
    }
  };
};

const buildLiveOpenAlexProvider = (env: Env) => {
  const baseUrl = "https://api.openalex.org";

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

  const withAuth = (url: URL): URL => {
    if (env.OPENALEX_API_KEY) {
      url.searchParams.set("api_key", env.OPENALEX_API_KEY);
    }
    return url;
  };

  const fetchWorks = async (filter: string, perPage: number): Promise<Array<{
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
  }>> => {
    const url = withAuth(new URL(`${baseUrl}/works`));
    url.searchParams.set("filter", filter);
    url.searchParams.set("per-page", String(perPage));
    const payload = await fetchJson<{
      results?: Array<{
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
      }>;
    }>(url.toString(), { method: "GET" });
    return payload.results ?? [];
  };

  const fetchWorkById = async (openalexId: string): Promise<{
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
  } | null> => {
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
        let work: {
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
        } | undefined;

        if (seed.doi) {
          const byDoi = await fetchWorks(`doi:${normalizeDoi(seed.doi)}`, 1);
          work = byDoi[0];
        }

        if (!work) {
          const url = withAuth(new URL(`${baseUrl}/works`));
          url.searchParams.set("search", seed.title);
          url.searchParams.set("per-page", "1");
          const searchPayload = await fetchJson<{ results?: Array<any> }>(url.toString(), {
            method: "GET"
          });
          work = searchPayload.results?.[0];
        }

        if (work?.id) {
          resolved.push(mapOpenAlexWork(work, seed.paperId));
        }
      }

      return resolved;
    },

    async expandGraph(seedWorks: CanonicalPaper[]): Promise<{
      papers: CanonicalPaper[];
      edges: GraphEdge[];
    }> {
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

const buildLiveUnpaywallProvider = (env: Env) => {
  if (!env.UNPAYWALL_EMAIL) {
    return {
      async lookupByDoi(): Promise<{
        pdfUrl?: string;
        oaStatus?: string;
        license?: string;
      } | null> {
        return null;
      }
    };
  }

  return {
    async lookupByDoi(doi: string): Promise<{
      pdfUrl?: string;
      oaStatus?: string;
      license?: string;
    } | null> {
      const url = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}`);
      url.searchParams.set("email", env.UNPAYWALL_EMAIL!);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" }
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Unpaywall error (${response.status}): ${body.slice(0, 300)}`);
      }

      const payload = (await response.json()) as {
        best_oa_location?: { url_for_pdf?: string };
        oa_status?: string;
        license?: string;
      };

      return {
        pdfUrl: payload.best_oa_location?.url_for_pdf,
        oaStatus: payload.oa_status,
        license: payload.license
      };
    }
  };
};

export function buildLiveProviders(env: Env): Providers {
  return {
    reasoning: buildLiveReasoningProvider(env),
    semanticScholar: buildLiveSemanticScholarProvider(env),
    openAlex: buildLiveOpenAlexProvider(env),
    unpaywall: buildLiveUnpaywallProvider(env)
  };
}
