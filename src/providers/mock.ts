import type {
  CandidatePaper,
  CanonicalPaper,
  GraphEdge,
  Providers,
  QueryPlan,
  SeedSelection,
  TriageOutput
} from "../lib/types.js";

const corpus: CandidatePaper[] = [
  {
    paperId: "S2-001",
    title: "Retrieval-Augmented Generation for Scientific Knowledge Grounding",
    abstract:
      "Presents a retrieval pipeline for evidence-grounded language model answers on scholarly corpora.",
    year: 2024,
    citationCount: 124,
    doi: "10.1000/rag.001",
    fieldsOfStudy: ["Computer Science", "Information Retrieval"],
    authors: [
      { id: "S2-A1", name: "Ariana Kline" },
      { id: "S2-A2", name: "Miguel Torres" }
    ]
  },
  {
    paperId: "S2-002",
    title: "Evidence Attribution in LLM-Based Literature Review Assistants",
    abstract:
      "Defines traceability constraints for generated claims and source grounding in alexclaw.",
    year: 2023,
    citationCount: 88,
    doi: "10.1000/evidence.002",
    fieldsOfStudy: ["Computer Science", "Natural Language Processing"],
    authors: [
      { id: "S2-A3", name: "Priya Nandan" },
      { id: "S2-A2", name: "Miguel Torres" }
    ]
  },
  {
    paperId: "S2-003",
    title: "Graph-Based Literature Mapping with Citation and Authorship Signals",
    abstract: "Builds heterogeneous paper-author graphs and ranks nodes for thesis support.",
    year: 2022,
    citationCount: 175,
    doi: "10.1000/graph.003",
    fieldsOfStudy: ["Computer Science"],
    authors: [
      { id: "S2-A4", name: "Lucia Chen" },
      { id: "S2-A5", name: "Samir Gupta" }
    ]
  },
  {
    paperId: "S2-004",
    title: "Benchmarking Topic Relevance Classifiers for Academic Search",
    abstract: "Compares LLM and non-LLM classifiers for identifying on-topic scientific works.",
    year: 2021,
    citationCount: 67,
    doi: "10.1000/triage.004",
    fieldsOfStudy: ["Computer Science", "Machine Learning"],
    authors: [
      { id: "S2-A6", name: "Naomi Becker" },
      { id: "S2-A7", name: "Ali Rahman" }
    ]
  },
  {
    paperId: "S2-005",
    title: "A Survey of Operational Reliability for Data and AI Pipelines",
    abstract: "Discusses retries, idempotency, observability, and dead-letter queues for production systems.",
    year: 2020,
    citationCount: 256,
    doi: "10.1000/reliability.005",
    fieldsOfStudy: ["Computer Science", "Software Engineering"],
    authors: [
      { id: "S2-A8", name: "Evelyn Park" },
      { id: "S2-A5", name: "Samir Gupta" }
    ]
  },
  {
    paperId: "S2-006",
    title: "Advances in Marine Ecology Observations from Coastal Sensors",
    abstract: "Unrelated benchmark paper used as a negative signal in recommendation tuning.",
    year: 2018,
    citationCount: 42,
    doi: "10.1000/marine.006",
    fieldsOfStudy: ["Biology"],
    authors: [{ id: "S2-A9", name: "Marta Ibarra" }]
  },
  {
    paperId: "S2-007",
    title: "Open Scholarly Metadata Interoperability with OpenAlex",
    abstract: "Shows canonical work resolution across DOIs, identifiers, and variant metadata.",
    year: 2024,
    citationCount: 51,
    doi: "10.1000/openalex.007",
    fieldsOfStudy: ["Information Science"],
    authors: [
      { id: "S2-A10", name: "Jonas White" },
      { id: "S2-A1", name: "Ariana Kline" }
    ]
  },
  {
    paperId: "S2-008",
    title: "Open Access Discovery Workflows with Unpaywall",
    abstract: "Methods for identifying full-text availability and licensing metadata for papers.",
    year: 2019,
    citationCount: 95,
    doi: "10.1000/unpaywall.008",
    fieldsOfStudy: ["Information Science"],
    authors: [
      { id: "S2-A11", name: "Robert Klein" },
      { id: "S2-A3", name: "Priya Nandan" }
    ]
  }
];

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const overlap = (thesisText: string, candidate: CandidatePaper): number => {
  const thesis = new Set(tokenize(thesisText));
  if (thesis.size === 0) {
    return 0;
  }
  const candidateTerms = new Set(tokenize(`${candidate.title} ${candidate.abstract ?? ""}`));
  let count = 0;
  for (const token of candidateTerms) {
    if (thesis.has(token)) {
      count += 1;
    }
  }
  return count / thesis.size;
};

const reasoning = {
  async generateQueryPlan(thesisText: string): Promise<QueryPlan> {
    const counts = new Map<string, number>();
    for (const token of tokenize(thesisText)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const topTerms = ranked.slice(0, 8).map(([token]) => token);

    return {
      query: topTerms.join(" "),
      fields_of_study: ["Computer Science", "Information Science"],
      must_terms: topTerms.slice(0, 3),
      must_not_terms: ["marine", "ecology"]
    };
  },

  async triageCandidates(thesisText: string, candidates: CandidatePaper[]): Promise<TriageOutput> {
    return {
      decisions: candidates.map((candidate) => {
        const score = overlap(thesisText, candidate);
        const decision =
          score >= 0.08 ? "on_topic" : score >= 0.04 ? "uncertain" : "off_topic";
        return {
          paper_id: candidate.paperId,
          decision,
          confidence: Number(Math.min(0.99, 0.4 + score * 4).toFixed(3)),
          reasons: [
            decision === "off_topic"
              ? "Low lexical overlap with thesis framing"
              : "Strong overlap on thesis terminology"
          ]
        };
      })
    };
  },

  async selectSeeds(
    thesisText: string,
    candidates: CandidatePaper[],
    triage: TriageOutput
  ): Promise<SeedSelection> {
    const onTopic = new Set(
      triage.decisions
        .filter((decision) => decision.decision === "on_topic")
        .map((decision) => decision.paper_id)
    );

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: overlap(thesisText, candidate)
      }))
      .filter(({ candidate }) => onTopic.has(candidate.paperId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    return {
      seeds: ranked.map(({ candidate }) => ({
        paper_id: candidate.paperId,
        selection_reason: "High thesis overlap and strong citation support"
      })),
      coverage_notes: "Includes retrieval, evidence, graph, and operations angles for breadth."
    };
  }
};

const semanticScholar = {
  async search(query: string, _fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]> {
    const q = query.toLowerCase();
    return corpus
      .map((paper) => {
        const haystack = `${paper.title} ${paper.abstract ?? ""}`.toLowerCase();
        let score = 0;
        for (const token of q.split(/\s+/)) {
          if (token && haystack.includes(token)) {
            score += 1;
          }
        }
        return { paper, score };
      })
      .sort((a, b) => b.score - a.score || (b.paper.citationCount ?? 0) - (a.paper.citationCount ?? 0))
      .slice(0, limit)
      .map((entry) => entry.paper);
  },

  async recommend(
    positivePaperIds: string[],
    negativePaperIds: string[],
    limit: number
  ): Promise<CandidatePaper[]> {
    const positives = new Set(positivePaperIds);
    const negatives = new Set(negativePaperIds);
    return corpus
      .filter((paper) => !positives.has(paper.paperId) && !negatives.has(paper.paperId))
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, limit);
  }
};

const toOpenAlexId = (paperId: string): string => {
  const numeric = Math.abs(
    [...paperId].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 10000000, 17)
  );
  return `https://openalex.org/W${numeric}`;
};

const toCanonical = (paper: CandidatePaper): CanonicalPaper => ({
  openalexId: toOpenAlexId(paper.paperId),
  semanticScholarId: paper.paperId,
  doi: paper.doi,
  title: paper.title,
  abstract: paper.abstract,
  year: paper.year,
  citationCount: paper.citationCount,
  fieldsOfStudy: paper.fieldsOfStudy,
  authors: paper.authors.map((author, index) => ({
    openalexId: author.id ? `https://openalex.org/A${Math.abs(author.id.length * 1000 + index)}` : undefined,
    name: author.name
  }))
});

const openAlex = {
  async resolveSeeds(seeds: CandidatePaper[]): Promise<CanonicalPaper[]> {
    return seeds.map(toCanonical);
  },

  async expandGraph(seedWorks: CanonicalPaper[]): Promise<{
    papers: CanonicalPaper[];
    edges: GraphEdge[];
  }> {
    const papers: CanonicalPaper[] = [];
    const edges: GraphEdge[] = [];

    for (const seed of seedWorks) {
      const slug = seed.openalexId.replace(/[^0-9]/g, "").slice(-4) || "1000";
      const reference: CanonicalPaper = {
        openalexId: `https://openalex.org/W9${slug}1`,
        title: `Foundational Methods Behind ${seed.title}`,
        abstract: "Historical upstream references with strong methodological overlap.",
        year: (seed.year ?? 2023) - 5,
        citationCount: (seed.citationCount ?? 50) + 140,
        fieldsOfStudy: seed.fieldsOfStudy,
        authors: [
          { name: seed.authors[0]?.name ?? "Unknown Author" },
          { name: "Legacy Scholar" }
        ]
      };
      const citation: CanonicalPaper = {
        openalexId: `https://openalex.org/W9${slug}2`,
        title: `Follow-up Study Extending ${seed.title}`,
        abstract: "Recent downstream work that cites and extends the seed approach.",
        year: (seed.year ?? 2023) + 1,
        citationCount: Math.max(10, (seed.citationCount ?? 20) / 2),
        fieldsOfStudy: seed.fieldsOfStudy,
        authors: [
          { name: "Future Researcher" },
          { name: seed.authors[0]?.name ?? "Unknown Author" }
        ]
      };
      const sharedAuthor: CanonicalPaper = {
        openalexId: `https://openalex.org/W9${slug}3`,
        title: `${seed.authors[0]?.name ?? "Author"}: Related Work on Research Systems`,
        abstract: "Shared-author related work connected through recurring methodology.",
        year: seed.year,
        citationCount: Math.max(5, (seed.citationCount ?? 20) / 3),
        fieldsOfStudy: seed.fieldsOfStudy,
        authors: seed.authors
      };

      papers.push(reference, citation, sharedAuthor);
      edges.push(
        {
          sourceOpenalexId: seed.openalexId,
          targetOpenalexId: reference.openalexId,
          type: "REFERENCE",
          weight: 0.95,
          evidence: "openalex:referenced_works"
        },
        {
          sourceOpenalexId: citation.openalexId,
          targetOpenalexId: seed.openalexId,
          type: "CITATION",
          weight: 0.82,
          evidence: "openalex:cites"
        },
        {
          sourceOpenalexId: seed.openalexId,
          targetOpenalexId: sharedAuthor.openalexId,
          type: "SHARED_AUTHOR",
          weight: 0.72,
          evidence: "openalex:shared_author"
        }
      );
    }

    return { papers, edges };
  }
};

const unpaywall = {
  async lookupByDoi(doi: string): Promise<{ pdfUrl: string; oaStatus: string; license: string }> {
    return {
      pdfUrl: `https://example.org/pdf/${encodeURIComponent(doi)}.pdf`,
      oaStatus: "gold",
      license: "cc-by"
    };
  }
};

export function buildMockProviders(): Providers {
  return {
    reasoning,
    semanticScholar,
    openAlex,
    unpaywall
  };
}
