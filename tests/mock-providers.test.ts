import test from "node:test";
import assert from "node:assert/strict";
import { buildMockProviders } from "../src/providers/mock.js";

test("mock providers return deterministic query/triage/seed pipeline", async () => {
  const providers = buildMockProviders();
  const thesisText = [
    "This thesis builds a alexclaw with evidence-grounded retrieval.",
    "The system uses citation graph expansion and ranks papers by relevance."
  ].join(" ");

  const query = await providers.reasoning.generateQueryPlan(thesisText);
  assert.ok(query.query.length > 5);
  assert.ok(query.fields_of_study.length >= 1);

  const search = await providers.semanticScholar.search(
    query.query,
    query.fields_of_study,
    8
  );
  assert.equal(search.length, 8);

  const triage = await providers.reasoning.triageCandidates(thesisText, search);
  assert.equal(triage.decisions.length, 8);
  assert.ok(triage.decisions.some((d) => d.decision === "on_topic"));

  const seeds = await providers.reasoning.selectSeeds(thesisText, search, triage);
  assert.ok(seeds.seeds.length >= 1);

  const seedCandidates = search.filter((paper) =>
    seeds.seeds.some((seed) => seed.paper_id === paper.paperId)
  );

  const canonical = await providers.openAlex.resolveSeeds(seedCandidates);
  assert.ok(canonical.length >= 1);

  const expanded = await providers.openAlex.expandGraph(canonical);
  assert.ok(expanded.papers.length >= canonical.length);
  assert.ok(expanded.edges.length >= canonical.length);
});
