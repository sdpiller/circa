/**
 * The shape of one listed item in the area box, and the year validator for request params.
 * Task 7 puts the province query back here.
 * "Events" are kinds event and discovery; "others" (people and places) are birth, founding, structure.
 */
import { z } from "zod";
import { isQueryableYear, MAX_YEAR, MIN_YEAR } from "../time/index.ts";
import type { EventRow } from "./schema.ts";

const num = z.string().trim().min(1, "required").pipe(z.coerce.number());
export const year = num.pipe(z.number().refine(isQueryableYear, `must be a whole year from ${MIN_YEAR} to ${MAX_YEAR}, and never 0`));

export type AreaItem = Pick<
  EventRow,
  "qid" | "label" | "description" | "kind" | "category" | "start_year" | "end_year" | "loc_confidence" | "wikipedia_title" | "sitelinks"
>;
