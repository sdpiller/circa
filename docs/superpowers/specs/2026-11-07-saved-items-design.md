# Saved items (Phase 9)

## Why

The owner wants visitors to save events, people and places and come back to them. Accounts stay a non-goal.

## Decisions

- **Storage is the browser's localStorage, no backend.** The owner offered Supabase. Without accounts a server cannot tell that a phone and a laptop are the same person, so a backend (anonymous sign-in included) gives the same per-browser list as localStorage, plus a dependency, keys, row-level security, a publicly writable table and a running cost. Cross-device transfer, if asked for later, can be an export link, still without a server.
- **Key `circa.saved.v1`.** Under the samarchive.com rewrite Circa shares an origin with every samarchive page, so the key is namespaced. The vercel.app address keeps its own list.
- **A record is a snapshot**: the item as listed, which list it was in, and the point and range of the area it was found in, plus when it was saved. The saved list reads without the database and survives a rebuild that drops the item.
- **"Show on globe" reopens the area it was found in**, not the item's own coordinates: a different point or years can resolve to an outline whose provinces leave the item out.
- **The item is pinned.** The area query takes an optional `pin` QID and appends it when it falls outside the top N, through the same path that appends a story's cited items. A pin outside the outline or the years is simply absent.
- **Names.** The masthead link is "Saved", since people and places are included.

## UI

- "Saved" beside "Stories" in the masthead, the same dropdown pattern. Opening one closes the other.
- The list: Events, then People and places, newest first. A row expands to its Wikipedia paragraph; "Show on globe" and "Remove" sit under it. Empty: "Nothing saved yet." Footer: saved in this browser only, and the Wikipedia attribution.
- In the panel, each event row gets a save toggle beside it (a sibling, buttons cannot nest). Each person or place card gets one beside its link.
- After "Show on globe" the panel scrolls to the item and flashes it, as a citation does.

## Acceptance

(a) An event and a person, saved and the page reloaded, are both listed. (b) "Show on globe" flies to the same outline and years and flashes the row, also for an item that was past "Show more". (c) Unsaving in the panel or removing from the list updates both; a second tab follows. (d) A corrupt stored value gives an empty list and no console error. (e) On a 390 x 844 phone the toggles take a thumb and nothing overlaps. (f) Desktop otherwise unchanged; tests, typecheck and lint clean.
