export const LlmPrompts = {
  thesisSummaryUser(thesisText: string): string {
    return thesisText;
  },
  queryGenerationUser(input: { thesisTitle: string; thesisSummary: string }): string {
    const {
      thesisTitle,
      thesisSummary
    } = input;
    return `Thesis title:\n${thesisTitle}\n\nThesis summary:\n${thesisSummary}`;
  },
  seedSelectionUser(input: {
    thesisTitle: string;
    thesisSummary: string;
    candidatesJson: string;
  }): string {
    const {
      thesisTitle,
      thesisSummary,
      candidatesJson
    } = input;
    return `Thesis title:\n${thesisTitle}\n\nThesis summary:\n${thesisSummary}\n\nCandidates (titles only):\n${candidatesJson}`;
  }
} as const;
