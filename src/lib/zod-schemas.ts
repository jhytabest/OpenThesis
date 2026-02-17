import { z } from "zod";

export const queryPlanSchema = z.object({
  query: z.string().min(5),
  fields_of_study: z.array(z.string()).min(1),
  must_terms: z.array(z.string()),
  must_not_terms: z.array(z.string()),
  time_horizon: z.object({
    start_year: z.number().int().min(1900).max(2100).nullable(),
    end_year: z.number().int().min(1900).max(2100).nullable()
  })
});

export const triageDecisionSchema = z.object({
  paper_id: z.string().min(1),
  decision: z.enum(["on_topic", "off_topic", "uncertain"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1)
});

export const triageOutputSchema = z.object({
  decisions: z.array(triageDecisionSchema)
});

export const seedSelectionSchema = z.object({
  seeds: z.array(
    z.object({
      paper_id: z.string().min(1),
      selection_reason: z.string().min(3)
    })
  ),
  coverage_notes: z.string().min(3)
});
