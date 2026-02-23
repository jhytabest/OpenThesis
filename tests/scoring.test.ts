import test from "node:test";
import assert from "node:assert/strict";
import { scorePaper } from "../src/lib/scoring.js";

test("scorePaper gives strong scores to high-citation seed papers", () => {
  const scored = scorePaper({
    thesisText: "alexclaw evidence graph reliability ranking",
    title: "Evidence Graph Ranking for Alexclaws",
    abstract: "traceable citations and operational reliability",
    citationCount: 1500,
    paperId: "seed-a",
    seedIds: new Set(["seed-a"]),
    citations: []
  });

  assert.ok(scored.totalScore >= 0.6);
});

test("scorePaper gives lower totals to weakly related low-citation papers", () => {
  const scored = scorePaper({
    thesisText: "alexclaw evidence ranking",
    title: "Marine Life Observations in Coastal Habitats",
    abstract: "fish species seasonal analysis",
    citationCount: 2,
    paperId: "other",
    seedIds: new Set(["seed-a"]),
    citations: []
  });

  assert.ok(scored.totalScore < 0.45);
});

test("graphScore increases when paper directly cites a seed", () => {
  const scored = scorePaper({
    thesisText: "alexclaw evidence ranking",
    title: "Reliability Signals in Knowledge Graph Pipelines",
    abstract: "citation-aware ranking strategy",
    citationCount: 25,
    paperId: "paper-a",
    seedIds: new Set(["seed-a"]),
    citations: [
      {
        sourceOpenalexId: "paper-a",
        targetOpenalexId: "seed-a"
      }
    ]
  });

  assert.ok(scored.graphScore >= 0.65);
});
