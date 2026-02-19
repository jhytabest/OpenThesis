export const LlmPrompts = {
  queryPlanUser(thesisText: string): string {
    return thesisText;
  },
  seedSelectionUser(input: {
    thesisTitle: string;
    thesisSummary: string;
    candidatesJson: string;
    queryHistoryJson: string;
  }): string {
    const {
      thesisTitle,
      thesisSummary,
      candidatesJson,
      queryHistoryJson
    } = input;
    return `Thesis title:\n${thesisTitle}\n\nThesis summary:\n${thesisSummary}\n\nQuery history metadata (oldest to newest; newest is current query run):\n${queryHistoryJson}\n\nCandidates (current run, titles only):\n${candidatesJson}`;
  }
} as const;
