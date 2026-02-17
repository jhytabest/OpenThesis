import { zodToJsonSchema } from "zod-to-json-schema";
import {
  queryPlanSchema,
  semanticScholarFieldsOfStudy,
  seedSelectionSchema,
  triageOutputSchema
} from "../lib/zod-schemas.js";
import { LlmPrompts } from "../lib/prompts.js";
import type {
  CandidatePaper,
  Env,
  Providers,
  QueryPlan,
  SeedSelection,
  TriageOutput
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
        system: LlmPrompts.queryPlanSystem(semanticScholarFieldsOfStudy),
        user: LlmPrompts.queryPlanUser(thesisText),
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
        system: LlmPrompts.triageSystem,
        user: LlmPrompts.triageUser(thesisText, JSON.stringify(candidates)),
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
        system: LlmPrompts.seedSelectionSystem,
        user: LlmPrompts.seedSelectionUser(
          thesisText,
          JSON.stringify(candidates),
          JSON.stringify(triage)
        ),
        parse: (value) => seedSelectionSchema.parse(value)
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
