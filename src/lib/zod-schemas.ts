import { z } from "zod";

export const semanticScholarFieldsOfStudy = [
  "Computer Science",
  "Medicine",
  "Chemistry",
  "Biology",
  "Materials Science",
  "Physics",
  "Geology",
  "Psychology",
  "Art",
  "History",
  "Geography",
  "Sociology",
  "Business",
  "Political Science",
  "Economics",
  "Philosophy",
  "Mathematics",
  "Engineering",
  "Environmental Science",
  "Agricultural and Food Sciences",
  "Education",
  "Law",
  "Linguistics"
] as const;

const semanticScholarFieldSchema = z.enum(semanticScholarFieldsOfStudy);

export const queryPlanSchema = z.object({
  thesis_title: z.string().min(5),
  thesis_summary: z.string().min(30),
  query: z.string().min(5),
  fields_of_study: z.array(semanticScholarFieldSchema).min(1).max(6)
});

export const seedSelectionSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("selected"),
    paper_ids: z.array(z.string().min(1)).min(1).max(10)
  }),
  z.object({
    outcome: z.literal("retry_query"),
    revised_query: z.string().min(5)
  })
]);

export const seedSelectionLlmSchema = z.object({
  outcome: z.enum(["selected", "retry_query"]),
  candidate_indices: z.array(z.number().int().min(0)),
  revised_query: z.string().nullable()
});
