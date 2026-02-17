import type { GraphEdge, RelevanceTier, ScoredPaper } from "./types.js";

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

export function lexicalOverlapScore(thesisText: string, paperText: string): number {
  const thesisTerms = new Set(tokenize(thesisText));
  if (thesisTerms.size === 0) {
    return 0;
  }
  const paperTerms = new Set(tokenize(paperText));
  let overlap = 0;
  for (const term of paperTerms) {
    if (thesisTerms.has(term)) {
      overlap += 1;
    }
  }
  return Math.min(1, overlap / Math.max(8, thesisTerms.size * 0.2));
}

export function citationScore(citationCount: number | undefined): number {
  if (!citationCount || citationCount < 1) {
    return 0;
  }
  return Math.min(1, Math.log10(citationCount + 1) / 3);
}

export function graphScore(
  paperId: string,
  seedIds: Set<string>,
  edges: GraphEdge[]
): number {
  if (seedIds.has(paperId)) {
    return 1;
  }
  const directTypes = new Set(
    edges
      .filter((edge) => edge.sourceOpenalexId === paperId || edge.targetOpenalexId === paperId)
      .filter((edge) => seedIds.has(edge.sourceOpenalexId) || seedIds.has(edge.targetOpenalexId))
      .map((edge) => edge.type)
  );

  if (directTypes.size > 0) {
    if (directTypes.has("SHARED_AUTHOR")) {
      return 0.75;
    }
    return 0.65;
  }

  const connected = edges.some(
    (edge) => edge.sourceOpenalexId === paperId || edge.targetOpenalexId === paperId
  );
  return connected ? 0.35 : 0.1;
}

export function tierForScore(totalScore: number, citation: number, graph: number): RelevanceTier {
  if (citation >= 0.65 && graph >= 0.6 && totalScore >= 0.6) {
    return "FOUNDATIONAL";
  }
  if (totalScore >= 0.45) {
    return "DEPTH";
  }
  return "BACKGROUND";
}

export function scorePaper(input: {
  thesisText: string;
  title: string;
  abstract?: string;
  citationCount?: number;
  paperId: string;
  seedIds: Set<string>;
  edges: GraphEdge[];
}): ScoredPaper {
  const lexical = lexicalOverlapScore(input.thesisText, `${input.title} ${input.abstract ?? ""}`);
  const graph = graphScore(input.paperId, input.seedIds, input.edges);
  const citation = citationScore(input.citationCount);
  const total = 0.45 * lexical + 0.35 * graph + 0.2 * citation;
  return {
    lexicalScore: Number(lexical.toFixed(4)),
    graphScore: Number(graph.toFixed(4)),
    citationScore: Number(citation.toFixed(4)),
    totalScore: Number(total.toFixed(4)),
    tier: tierForScore(total, citation, graph)
  };
}
