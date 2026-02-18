export const LlmPrompts = {
  queryPlanUser(thesisText: string): string {
    return thesisText;
  },
  seedSelectionUser(input: {
    thesisTitle: string;
    thesisSummary: string;
    candidatesJson: string;
    queryHistoryJson: string;
    previousAttemptsJson: string;
  }): string {
    const {
      thesisTitle,
      thesisSummary,
      candidatesJson,
      queryHistoryJson,
      previousAttemptsJson
    } = input;
    return `Thesis title:\n${thesisTitle}\n\nThesis summary:\n${thesisSummary}\n\nQuery history (oldest to newest; newest is current query run):\n${queryHistoryJson}\n\nPrevious selection attempts:\n${previousAttemptsJson}\n\nCandidates (current run):\n${candidatesJson}`;
  }
} as const;
