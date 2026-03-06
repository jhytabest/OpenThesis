import { zodToJsonSchema } from "zod-to-json-schema";
import {
  semanticScholarFieldsOfStudy,
  thesisSummarySchema,
  queryGenerationSchema,
  seedSelectionLlmSchema,
  seedSelectionSchema
} from "../lib/zod-schemas.js";
import { BYOK_DEFAULT_MODELS, isByokProvider } from "../lib/byok.js";
import { LlmPrompts } from "../lib/prompts.js";
import type {
  ByokProvider,
  CandidatePaper,
  Env,
  Providers,
  ThesisSummary,
  QueryGeneration,
  SelectSeedsInput,
  SeedSelection
} from "../lib/types.js";
import type { ZodTypeAny } from "zod";
import {
  buildLiveOpenAlexProvider,
  buildLiveSemanticScholarProvider
} from "./scholarly.js";

const toJsonSchemaObject = (schema: ZodTypeAny, name: string): Record<string, unknown> => {
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

const PROVIDER_RESPONSE_TIMEOUT_MS = 180_000;

const sanitizeHttpUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const extractJsonPayload = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Provider response is empty");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error("Provider response does not contain valid JSON");
  }
};

const formatIndexedCandidates = (candidates: CandidatePaper[]): string =>
  JSON.stringify(
    candidates.map((candidate, candidateIndex) => ({
      candidate_index: candidateIndex,
      title: candidate.title
    }))
  );

const mapSeedSelectionByIndexToPaperIds = (
  llmOutput: {
    outcome: "selected" | "empty";
    candidate_indices: number[];
  },
  candidates: CandidatePaper[]
): SeedSelection => {
  if (llmOutput.outcome === "empty") {
    if (llmOutput.candidate_indices.length > 0) {
      throw new Error("candidate_decision empty must set candidate_indices to an empty array");
    }
    return seedSelectionSchema.parse({
      outcome: "empty"
    });
  }

  const indices = llmOutput.candidate_indices;
  if (indices.length < 1 || indices.length > 5) {
    throw new Error("candidate_decision selected outcome must include 1 to 5 candidate_indices");
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

const runOpenAiCompatibleChat = async (input: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  extraHeaders?: Record<string, string>;
}): Promise<string> => {
  const payload = await fetchJson<{
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  }>(
    input.url,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        ...(input.extraHeaders ?? {})
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: input.system
          },
          {
            role: "user",
            content: input.user
          }
        ]
      })
    },
    PROVIDER_RESPONSE_TIMEOUT_MS
  );

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  throw new Error("Provider did not return message content");
};

const runAnthropicChat = async (input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> => {
  const payload = await fetchJson<{
    content?: Array<{ type?: string; text?: string }>;
  }>(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        max_tokens: 2048,
        system: input.system,
        messages: [
          {
            role: "user",
            content: input.user
          }
        ]
      })
    },
    PROVIDER_RESPONSE_TIMEOUT_MS
  );
  const text = (payload.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error("Anthropic response was empty");
  }
  return text;
};

const runGeminiChat = async (input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> => {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`);
  url.searchParams.set("key", input.apiKey);
  const payload = await fetchJson<{
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  }>(
    url.toString(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${input.system}\n\n${input.user}`
              }
            ]
          }
        ]
      })
    },
    PROVIDER_RESPONSE_TIMEOUT_MS
  );
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) {
    throw new Error("Gemini response was empty");
  }
  return text;
};

const runProviderPrompt = async (input: {
  provider: ByokProvider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> => {
  if (input.provider === "openai") {
    return runOpenAiCompatibleChat({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: input.apiKey,
      model: input.model,
      system: input.system,
      user: input.user
    });
  }
  if (input.provider === "openrouter") {
    return runOpenAiCompatibleChat({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: input.apiKey,
      model: input.model,
      system: input.system,
      user: input.user
    });
  }
  if (input.provider === "claude") {
    return runAnthropicChat({
      apiKey: input.apiKey,
      model: input.model,
      system: input.system,
      user: input.user
    });
  }
  return runGeminiChat({
    apiKey: input.apiKey,
    model: input.model,
    system: input.system,
    user: input.user
  });
};

const buildTaskSystemPrompt = (input: {
  taskInstruction: string;
  schema: Record<string, unknown>;
}): string => {
  const schemaJson = JSON.stringify(input.schema);
  return [
    "You are an academic research assistant.",
    input.taskInstruction,
    "Return only valid JSON and no markdown.",
    `JSON schema: ${schemaJson}`
  ].join("\n");
};

const buildLiveReasoningProvider = (env: Env) => {
  if (!isByokProvider(env.BYOK_PROVIDER)) {
    throw new Error("BYOK_PROVIDER is required in live mode");
  }
  const provider = env.BYOK_PROVIDER;
  const apiKey = env.BYOK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BYOK_API_KEY is required in live mode");
  }
  const model = env.BYOK_MODEL?.trim() || BYOK_DEFAULT_MODELS[provider];

  const runStructuredPrompt = async <T>(input: {
    schema: Record<string, unknown>;
    user: string;
    taskInstruction: string;
    parse: (value: unknown) => T;
  }): Promise<T> => {
    const output = await runProviderPrompt({
      provider,
      apiKey,
      model,
      system: buildTaskSystemPrompt({
        taskInstruction: input.taskInstruction,
        schema: input.schema
      }),
      user: input.user
    });
    const parsed = extractJsonPayload(output);
    return input.parse(parsed);
  };

  return {
    async summarizeThesis(thesisText: string): Promise<ThesisSummary> {
      return runStructuredPrompt({
        schema: toJsonSchemaObject(thesisSummarySchema, "summary"),
        user: LlmPrompts.thesisSummaryUser(thesisText),
        taskInstruction:
          "Summarize the thesis text and output keys thesis_title and thesis_summary. Keep an academic tone and preserve business-domain context.",
        parse: (value) => thesisSummarySchema.parse(value)
      });
    },

    async generateQuery(input: {
      thesisTitle: string;
      thesisSummary: string;
    }): Promise<QueryGeneration> {
      return runStructuredPrompt({
        schema: toJsonSchemaObject(queryGenerationSchema, "query"),
        user: LlmPrompts.queryGenerationUser({
          thesisTitle: input.thesisTitle,
          thesisSummary: input.thesisSummary
        }),
        taskInstruction: [
          "Generate 6 to 10 unique search terms for academic literature discovery.",
          "Each term must be 1 to 4 words with alphanumeric tokens and optional hyphens.",
          `fields_of_study must be chosen from: ${semanticScholarFieldsOfStudy.join(", ")}.`
        ].join(" "),
        parse: (value) => queryGenerationSchema.parse(value)
      });
    },

    async selectSeeds(input: SelectSeedsInput): Promise<SeedSelection> {
      return runStructuredPrompt({
        schema: toJsonSchemaObject(seedSelectionLlmSchema, "selection"),
        user: LlmPrompts.seedSelectionUser({
          thesisTitle: input.thesisTitle,
          thesisSummary: input.thesisSummary,
          candidatesJson: formatIndexedCandidates(input.candidates)
        }),
        taskInstruction: [
          "Choose candidate_indices for the strongest foundational papers only.",
          "If none are suitable return outcome empty and candidate_indices as [].",
          "If selected, include 1 to 5 unique indices from the provided candidate list."
        ].join(" "),
        parse: (value) => {
          const parsed = seedSelectionLlmSchema.parse(value);
          return mapSeedSelectionByIndexToPaperIds(parsed, input.candidates);
        }
      });
    }
  };
};

export const buildLiveUnpaywallProvider = (env: Env) => {
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
        pdfUrl: sanitizeHttpUrl(payload.best_oa_location?.url_for_pdf),
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
