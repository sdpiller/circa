/** The source text each cited ref of a frozen story input stands for. */
import type { StoryInput } from "./types.ts";

/** The text a cited ref supports. Throws on an unknown ref. */
export function sourceText(input: StoryInput, ref: string): string {
  if (ref === input.context.ref) return input.context.text;
  const item = input.items.find((i) => i.ref === ref);
  if (!item) throw new Error(`Unknown ref ${ref}`);
  return [item.label, item.description, item.years, item.loc_confidence === "inherited" ? "approximate location" : null, item.extract]
    .filter((p): p is string => !!p && p.length > 0)
    .join("\n");
}
