import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveOpenAlexProvider,
  buildLiveSemanticScholarProvider
} from "../src/providers/scholarly.js";

test("semantic scholar provider sanitizes query and filters fields of study", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const provider = buildLiveSemanticScholarProvider(
    {
      SEMANTIC_SCHOLAR_API_KEY: "ss-key"
    } as any,
    async <T>(url: string, options: RequestInit): Promise<T> => {
      capturedUrl = url;
      capturedHeaders = (options.headers ?? {}) as Record<string, string>;
      return {
        data: [
          {
            paperId: "p1",
            title: "Relevant",
            citationCount: 15,
            fieldsOfStudy: ["Computer Science"],
            authors: [{ authorId: "a1", name: "Alice" }]
          },
          {
            paperId: "p2",
            title: "Too low",
            citationCount: 5,
            authors: [{ authorId: "a2", name: "Bob" }]
          }
        ]
      } as T;
    }
  );

  const papers = await provider.search(
    "AI-AND ai!! ethics OR ethics",
    ["Computer Science", "Unknown", "Computer Science"],
    20
  );

  const parsedUrl = new URL(capturedUrl);
  assert.equal(parsedUrl.searchParams.get("query"), "AI ethics");
  assert.equal(parsedUrl.searchParams.get("fieldsOfStudy"), "Computer Science");
  assert.equal(capturedHeaders["x-api-key"], "ss-key");
  assert.equal(papers.length, 1);
  assert.equal(papers[0]?.paperId, "p1");
});

test("semantic scholar provider throws when query is empty after sanitization", async () => {
  const provider = buildLiveSemanticScholarProvider(
    { SEMANTIC_SCHOLAR_API_KEY: "ss-key" } as any,
    async <T>(): Promise<T> => ({ data: [] } as T)
  );

  await assert.rejects(
    () => provider.search("AND OR NOT", [], 10),
    /query is empty after sanitization/
  );
});

test("semantic scholar provider requires API key in live mode", () => {
  assert.throws(
    () => buildLiveSemanticScholarProvider({} as any, async <T>(): Promise<T> => ({} as T)),
    /SEMANTIC_SCHOLAR_API_KEY is required/
  );
});

test("openalex provider requires API key in live mode", () => {
  assert.throws(
    () => buildLiveOpenAlexProvider({} as any, async <T>(): Promise<T> => ({} as T)),
    /OPENALEX_API_KEY is required/
  );
});

test("openalex provider sanitizes query and maps search results", async () => {
  let capturedUrl = "";

  const provider = buildLiveOpenAlexProvider(
    {
      OPENALEX_API_KEY: "oa-key"
    } as any,
    async <T>(url: string): Promise<T> => {
      capturedUrl = url;
      return {
        results: [
          {
            id: "https://openalex.org/W1",
            title: "Accepted",
            publication_year: 2023,
            cited_by_count: 25,
            doi: "https://doi.org/10.1000/xyz"
          },
          {
            id: "https://openalex.org/W2",
            title: "Filtered",
            publication_year: 2023,
            cited_by_count: 8
          }
        ]
      } as T;
    }
  );

  const papers = await provider.search("Graph-AND graph reliability!!", [], 3);

  const parsedUrl = new URL(capturedUrl);
  assert.equal(parsedUrl.searchParams.get("search.semantic"), "Graph reliability");
  assert.equal(parsedUrl.searchParams.get("api_key"), "oa-key");
  assert.equal(papers.length, 1);
  assert.equal(papers[0]?.paperId, "https://openalex.org/W1");
  assert.equal(papers[0]?.doi, "10.1000/xyz");
});

test("openalex provider resolveSeeds resolves an explicit OpenAlex id", async () => {
  const provider = buildLiveOpenAlexProvider(
    {
      OPENALEX_API_KEY: "oa-key"
    } as any,
    async <T>(): Promise<T> => ({
      id: "https://openalex.org/W123",
      title: "Resolved title",
      publication_year: 2021,
      cited_by_count: 30,
      referenced_works: ["https://openalex.org/W9"],
      authorships: [
        {
          author: {
            id: "https://openalex.org/A1",
            display_name: "Alice"
          }
        }
      ]
    } as T)
  );

  const resolved = await provider.resolveSeeds([
    {
      paperId: "W123",
      title: "Seed",
      fieldsOfStudy: [],
      authors: []
    }
  ]);

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.openalexId, "https://openalex.org/W123");
  assert.equal(resolved[0]?.title, "Resolved title");
  assert.deepEqual(resolved[0]?.referencedOpenalexIds, ["https://openalex.org/W9"]);
});
