/** Shapes of the featured list, the frozen story inputs, and the stories themselves. */
import { z } from "zod";
import { KINDS } from "../db/schema.ts";

export const FeaturedEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
  place: z.string().min(1),
  from: z.number().int(),
  to: z.number().int(),
});
export type FeaturedEntry = z.infer<typeof FeaturedEntrySchema>;

/** A frozen input records the grid cell it was written from. Nothing reads it; it stays so the approved files do not change. */
export const FrozenEntrySchema = FeaturedEntrySchema.extend({ cell: z.string() });
export type FrozenEntry = z.infer<typeof FrozenEntrySchema>;

export const FeaturedListSchema = z.array(FeaturedEntrySchema);
export type FeaturedList = z.infer<typeof FeaturedListSchema>;

export const InputItemSchema = z.object({
  ref: z.string().regex(/^[EP]\d+$/),
  qid: z.string().regex(/^Q\d+$/),
  label: z.string(),
  kind: z.enum(KINDS),
  description: z.string().nullable(),
  years: z.string(),
  start_year: z.number().int(),
  end_year: z.number().int(),
  loc_confidence: z.enum(["exact", "inherited"]),
  wikipedia_title: z.string().nullable(),
  extract: z.string().nullable(),
});
export type InputItem = z.infer<typeof InputItemSchema>;

export const StoryInputSchema = z.object({
  entry: FrozenEntrySchema,
  generatedAt: z.string(),
  dbRows: z.number().int(),
  eventsTotal: z.number().int(),
  othersTotal: z.number().int(),
  context: z.object({ ref: z.literal("C"), text: z.string() }),
  items: z.array(InputItemSchema),
});
export type StoryInput = z.infer<typeof StoryInputSchema>;

/** cites may be empty here so the checker can report the sentence as uncited. */
export const SentenceSchema = z.object({ text: z.string(), cites: z.array(z.string()) });
export type Sentence = z.infer<typeof SentenceSchema>;

export const StorySchema = z.object({
  id: z.string(),
  rulesVersion: z.number().int(),
  writtenAt: z.string(),
  writtenBy: z.string(),
  paragraphs: z.array(z.array(SentenceSchema).min(1)),
});
export type Story = z.infer<typeof StorySchema>;
