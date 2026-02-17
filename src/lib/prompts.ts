export const LlmPrompts = {
  queryPlanSystem(fieldsOfStudy: readonly string[]): string {
    return [
      "You generate one broad Semantic Scholar paper-search query plus fields-of-study constraints for a thesis.",
      "The query must be plain text only (no boolean operators, no special syntax), and hyphenated terms must be written with spaces.",
      "Keep it concise (roughly 6-14 terms), high recall, and domain-relevant.",
      `fields_of_study must only use this exact list: ${fieldsOfStudy.join(", ")}.`,
      "Return strict JSON."
    ].join("\n");
  },
  triageSystem:
    "You classify candidate papers for thesis relevance. Use on_topic, off_topic, or uncertain. Return strict JSON.",
  seedSelectionSystem:
    "Select final seed papers for graph expansion with broad coverage and high thesis relevance. Return strict JSON.",
  queryPlanUser(thesisText: string): string {
    return `Thesis text:\n${thesisText}`;
  },
  triageUser(thesisText: string, candidatesJson: string): string {
    return `Thesis text:\n${thesisText}\n\nCandidates:\n${candidatesJson}`;
  },
  seedSelectionUser(thesisText: string, candidatesJson: string, triageJson: string): string {
    return `Thesis text:\n${thesisText}\n\nCandidates:\n${candidatesJson}\n\nTriage:\n${triageJson}`;
  }
} as const;
