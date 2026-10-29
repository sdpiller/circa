/**
 * Capitalised words a story may use without finding them in its cited text (spec 6.6 item 3).
 * Global and fixed. No proper nouns or demonyms, ever. Adding a word needs the owner's sign-off.
 */
const WORDS = [
  // era and source words
  "BCE", "CE", "BC", "AD", "Wikipedia", "Wikidata",
  // months
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  // generic words that start sentences
  "A", "An", "The", "In", "On", "At", "By", "For", "From", "To", "Of",
  "After", "Before", "During", "Later", "Earlier", "Over", "Under", "Between", "Among",
  "Around", "Within", "With", "While", "When", "Although", "Here", "There",
  "This", "That", "These", "Those", "It", "Its", "They", "Their", "He", "His", "She", "Her",
  "Only", "Most", "Some", "Several", "Both", "Few", "Little", "Much", "Many",
  "No", "Nothing", "None",
];

export const ALLOWLIST: ReadonlySet<string> = new Set(WORDS.map((w) => w.toLowerCase()));
