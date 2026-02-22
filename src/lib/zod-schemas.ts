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
const queryTermPattern = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,3}$/;
const queryTermsSchema = z
  .array(
    z
      .string()
      .trim()
      .regex(queryTermPattern, "must be 1 to 4 words with alphanumeric tokens and optional hyphens")
  )
  .min(6)
  .max(10)
  .refine(
    (terms) => new Set(terms.map((term) => term.toLowerCase())).size === terms.length,
    "terms must be unique"
  );

export const thesisSummarySchema = z.object({
  thesis_title: z.string().min(5),
  thesis_summary: z.string().min(30)
});

export const queryGenerationSchema = z.object({
  terms: queryTermsSchema,
  fields_of_study: z.array(semanticScholarFieldSchema).min(1).max(6)
});

export const seedSelectionSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("selected"),
    paper_ids: z.array(z.string().min(1)).min(1).max(5)
  }),
  z.object({
    outcome: z.literal("empty")
  })
]);

export const seedSelectionLlmSchema = z.object({
  outcome: z.enum(["selected", "empty"]),
  candidate_indices: z.array(z.number().int().min(0))
});
