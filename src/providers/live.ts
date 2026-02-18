import { zodToJsonSchema } from "zod-to-json-schema";
import {
  queryPlanSchema,
  seedSelectionLlmSchema,
  seedSelectionSchema
} from "../lib/zod-schemas.js";
import { LlmPrompts } from "../lib/prompts.js";
import type {
  CandidatePaper,
  Env,
  Providers,
  QueryPlan,
  SelectSeedsInput,
  SeedSelection
} from "../lib/types.js";
import type { ZodTypeAny } from "zod";
import {
  buildLiveOpenAlexProvider,
  buildLiveSemanticScholarProvider
} from "./scholarly.js";

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

type OpenAiPromptConfig = {
  id: string;
  version?: string;
};

const formatIndexedCandidates = (candidates: CandidatePaper[]): string =>
  JSON.stringify(
    candidates.map((candidate, candidateIndex) => ({
      candidate_index: candidateIndex,
      paper_id: candidate.paperId,
      title: candidate.title,
      abstract: candidate.abstract ?? null,
      year: candidate.year ?? null,
      citation_count: candidate.citationCount ?? null,
      fields_of_study: candidate.fieldsOfStudy
    }))
  );

const mapSeedSelectionByIndexToPaperIds = (
  llmOutput: {
    outcome: "selected" | "retry_query";
    candidate_indices: number[];
    revised_query: string | null;
  },
  candidates: CandidatePaper[]
): SeedSelection => {
  if (llmOutput.outcome === "retry_query") {
    if (llmOutput.candidate_indices.length > 0) {
      throw new Error("seed_selection retry_query must set candidate_indices to an empty array");
    }
    const revisedQuery = llmOutput.revised_query?.trim() ?? "";
    if (revisedQuery.length < 5) {
      throw new Error("seed_selection retry_query must include revised_query (min length 5)");
    }
    return seedSelectionSchema.parse({
      outcome: "retry_query",
      revised_query: revisedQuery
    });
  }

  if (llmOutput.revised_query !== null) {
    throw new Error("seed_selection selected outcome must set revised_query to null");
  }
  const indices = llmOutput.candidate_indices;
  if (indices.length < 3 || indices.length > 10) {
    throw new Error("seed_selection selected outcome must include 3 to 10 candidate_indices");
  }
  const seen = new Set<number>();
  const paperIds = indices.map((candidateIndex) => {
    if (candidateIndex < 0 || candidateIndex >= candidates.length) {
      throw new Error(
        `seed_selection candidate_index ${candidateIndex} is out of range for ${candidates.length} candidates`
      );
    }
    if (seen.has(candidateIndex)) {
      throw new Error(`seed_selection duplicated candidate_index ${candidateIndex}`);
    }
    seen.add(candidateIndex);
    return candidates[candidateIndex].paperId;
  });

  return seedSelectionSchema.parse({
    outcome: "selected",
    paper_ids: paperIds
  });
};

const resolvePromptConfig = (
  id: string | undefined,
  version: string | undefined,
  idEnvVar: string
): OpenAiPromptConfig => {
  const normalizedId = id?.trim();
  if (!normalizedId) {
    throw new Error(`${idEnvVar} is required in live mode`);
  }
  const normalizedVersion = version?.trim();
  return normalizedVersion
    ? { id: normalizedId, version: normalizedVersion }
    : { id: normalizedId };
};

const buildLiveReasoningProvider = (env: Env) => {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in live mode");
  }

  const queryPlanPrompt = resolvePromptConfig(
    env.OPENAI_PROMPT_ID_QUERY_PLAN,
    env.OPENAI_PROMPT_VERSION_QUERY_PLAN,
    "OPENAI_PROMPT_ID_QUERY_PLAN"
  );
  const seedSelectionPrompt = resolvePromptConfig(
    env.OPENAI_PROMPT_ID_SEED_SELECTION,
    env.OPENAI_PROMPT_VERSION_SEED_SELECTION,
    "OPENAI_PROMPT_ID_SEED_SELECTION"
  );

  const runStructuredPrompt = async <T>(input: {
    name: string;
    schema: Record<string, unknown>;
    user: string;
    prompt: OpenAiPromptConfig;
    parse: (value: unknown) => T;
  }): Promise<T> => {
    const requestBody: Record<string, unknown> = {
      prompt: input.prompt.version
        ? { id: input.prompt.id, version: input.prompt.version }
        : { id: input.prompt.id },
      input: input.user
    };

    requestBody.text = {
      format: {
        type: "json_schema",
        strict: true,
        name: input.name,
        schema: input.schema
      }
    };

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
        body: JSON.stringify(requestBody)
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
        user: LlmPrompts.queryPlanUser(thesisText),
        prompt: queryPlanPrompt,
        parse: (value) => queryPlanSchema.parse(value)
      });
    },

    async selectSeeds(input: SelectSeedsInput): Promise<SeedSelection> {
      return runStructuredPrompt({
        name: "seed_selection",
        schema: openAiStrictSchema(seedSelectionLlmSchema, "seed_selection"),
        user: LlmPrompts.seedSelectionUser({
          thesisTitle: input.thesisTitle,
          thesisSummary: input.thesisSummary,
          candidatesJson: formatIndexedCandidates(input.candidates),
          queryHistoryJson: JSON.stringify(input.queryHistory, null, 2),
          previousAttemptsJson: JSON.stringify(input.previousAttempts, null, 2),
        }),
        prompt: seedSelectionPrompt,
        parse: (value) => {
          const parsed = seedSelectionLlmSchema.parse(value);
          return mapSeedSelectionByIndexToPaperIds(parsed, input.candidates);
        }
      });
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
    semanticScholar: buildLiveSemanticScholarProvider(env, fetchJson),
    openAlex: buildLiveOpenAlexProvider(env, fetchJson),
    unpaywall: buildLiveUnpaywallProvider(env)
  };
}
