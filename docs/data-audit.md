# Data audit

<!-- BEGIN GENERATED (npm run audit) -->
Generated 2026-10-28 from `data/raw/`. Year window: 3500 BCE to 2026 (overlap test on effective intervals).

**Incomplete: no raw data yet for treaty, coup, revolution, assassination, earthquake, volcanic-eruption, epidemic, flood, famine, tsunami, conflagration, expedition, settlement-founding, structure, archaeological-site, birth.**

### A. Fetch and normalization, per class

| Class | Floor (sitelinks) | Fetched | Usable | no-label | no-date | bad-date | no-location | country-only | Exact loc | Queries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| battle | 1 | 15,572 | 13,211 | 199 | 1 | 0 | 1,994 | 167 | 65% | 49 |
| siege | 1 | 3,581 | 3,476 | 13 | 4 | 0 | 76 | 12 | 76% | 13 |
| war | 1 | 2,540 | 1,125 | 23 | 1 | 0 | 876 | 515 | 12% | 10 |
| military-campaign | 1 | 1,230 | 819 | 20 | 1 | 0 | 262 | 128 | 21% | 7 |
| rebellion | 1 | 1,855 | 972 | 158 | 2 | 0 | 586 | 137 | 19% | 7 |
| massacre | 1 | 3,431 | 2,198 | 755 | 0 | 0 | 437 | 41 | 57% | 13 |
| coronation | 1 | 58 | 52 | 4 | 0 | 0 | 2 | 0 | 25% | 4 |

Usable items that matched more than one class: 499 (deduped by category priority: disaster > conflict > politics > founding > science > culture > other). Total queries: 103, total server time about 7 min.

### B. Usable items by category (deduped, in year window)

| Category | Strict events | Candidates |
| --- | ---: | ---: |
| conflict | 21,289 | 0 |
| politics | 52 | 0 |
| disaster | 0 | 0 |
| science | 0 | 0 |
| founding | 0 | 0 |
| culture | 0 | 0 |

Strict events total: **21,341**. Structures and sites: 0. Births: 0.

### C. Location confidence

| Group | Usable | Exact (own P625) | Inherited P276 | Inherited P131 | Inherited P19 | Several places to pick from |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Strict events | 21,341 | 59% | 41% | 0% | 0% | 3% |
| Structures and sites (candidate) | 0 | n/a | n/a | n/a | n/a | n/a |
| Births (candidate) | 0 | n/a | n/a | n/a | n/a | n/a |

### D. Strict events by coarse region and era

Approximate lat/lon boxes, first match wins (see `region()` in `etl/audit.ts`). An event spanning two eras counts in both.

| Region | before 1000 BCE | 1000 to 501 BCE | 500 to 1 BCE | 1 to 500 | 501 to 1000 | 1001 to 1500 | 1501 to 1800 | 1801 to 1900 | 1901 to now | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Europe | 1 | 31 | 517 | 230 | 480 | 1,983 | 3,167 | 1,478 | 2,276 | 10,129 |
| North Africa | 3 | 4 | 49 | 10 | 49 | 125 | 232 | 92 | 326 | 886 |
| Anatolia and Middle East | 19 | 54 | 193 | 124 | 314 | 529 | 324 | 175 | 1,270 | 2,990 |
| Sub-Saharan Africa | 0 | 0 | 1 | 0 | 1 | 13 | 72 | 186 | 671 | 937 |
| South Asia | 0 | 2 | 17 | 6 | 22 | 73 | 353 | 98 | 356 | 920 |
| East Asia | 2 | 7 | 18 | 69 | 42 | 174 | 418 | 181 | 434 | 1,341 |
| Southeast Asia and Oceania | 0 | 0 | 0 | 0 | 4 | 21 | 117 | 222 | 584 | 941 |
| Russia, Central and North Asia | 0 | 0 | 10 | 4 | 23 | 35 | 47 | 25 | 101 | 243 |
| Americas north of 15°N | 0 | 0 | 0 | 0 | 3 | 5 | 582 | 1,258 | 224 | 2,060 |
| Americas south of 15°N | 0 | 0 | 0 | 0 | 0 | 9 | 181 | 446 | 244 | 877 |
| Other (oceans, polar) | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 5 | 5 | 17 |

### D2. Candidates by coarse region

| Region | Strict events | Structures and sites | Births |
| --- | ---: | ---: | ---: |
| Europe | 10,129 | 0 | 0 |
| North Africa | 886 | 0 | 0 |
| Anatolia and Middle East | 2,990 | 0 | 0 |
| Sub-Saharan Africa | 937 | 0 | 0 |
| South Asia | 920 | 0 | 0 |
| East Asia | 1,341 | 0 | 0 |
| Southeast Asia and Oceania | 941 | 0 | 0 |
| Russia, Central and North Asia | 243 | 0 | 0 |
| Americas north of 15°N | 2,060 | 0 | 0 |
| Americas south of 15°N | 877 | 0 | 0 |
| Other (oceans, polar) | 17 | 0 | 0 |

### E. By century (effective start year), 3500 BCE to now

| Century | Strict events | of which conflict | Structures and sites | Births |
| --- | ---: | ---: | ---: | ---: |
| 35th c. BCE | 1 | 100% | 0 | 0 |
| 34th c. BCE | 0 | n/a | 0 | 0 |
| 33rd c. BCE | 1 | 100% | 0 | 0 |
| 32nd c. BCE | 0 | n/a | 0 | 0 |
| 31st c. BCE | 0 | n/a | 0 | 0 |
| 30th c. BCE | 0 | n/a | 0 | 0 |
| 29th c. BCE | 0 | n/a | 0 | 0 |
| 28th c. BCE | 1 | 100% | 0 | 0 |
| 27th c. BCE | 1 | 100% | 0 | 0 |
| 26th c. BCE | 1 | 100% | 0 | 0 |
| 25th c. BCE | 1 | 100% | 0 | 0 |
| 24th c. BCE | 0 | n/a | 0 | 0 |
| 23rd c. BCE | 0 | n/a | 0 | 0 |
| 22nd c. BCE | 0 | n/a | 0 | 0 |
| 21st c. BCE | 0 | n/a | 0 | 0 |
| 20th c. BCE | 0 | n/a | 0 | 0 |
| 19th c. BCE | 0 | n/a | 0 | 0 |
| 18th c. BCE | 1 | 100% | 0 | 0 |
| 17th c. BCE | 0 | n/a | 0 | 0 |
| 16th c. BCE | 1 | 100% | 0 | 0 |
| 15th c. BCE | 1 | 100% | 0 | 0 |
| 14th c. BCE | 1 | 100% | 0 | 0 |
| 13th c. BCE | 8 | 100% | 0 | 0 |
| 12th c. BCE | 3 | 100% | 0 | 0 |
| 11th c. BCE | 4 | 100% | 0 | 0 |
| 10th c. BCE | 3 | 100% | 0 | 0 |
| 9th c. BCE | 4 | 100% | 0 | 0 |
| 8th c. BCE | 22 | 100% | 0 | 0 |
| 7th c. BCE | 28 | 100% | 0 | 0 |
| 6th c. BCE | 40 | 100% | 0 | 0 |
| 5th c. BCE | 118 | 100% | 0 | 0 |
| 4th c. BCE | 174 | 100% | 0 | 0 |
| 3rd c. BCE | 215 | 100% | 0 | 0 |
| 2nd c. BCE | 110 | 100% | 0 | 0 |
| 1st c. BCE | 184 | 100% | 0 | 0 |
| 1st c. | 72 | 100% | 0 | 0 |
| 2nd c. | 39 | 100% | 0 | 0 |
| 3rd c. | 108 | 100% | 0 | 0 |
| 4th c. | 87 | 100% | 0 | 0 |
| 5th c. | 131 | 100% | 0 | 0 |
| 6th c. | 148 | 100% | 0 | 0 |
| 7th c. | 220 | 100% | 0 | 0 |
| 8th c. | 172 | 100% | 0 | 0 |
| 9th c. | 195 | 100% | 0 | 0 |
| 10th c. | 194 | 100% | 0 | 0 |
| 11th c. | 342 | 100% | 0 | 0 |
| 12th c. | 486 | 100% | 0 | 0 |
| 13th c. | 618 | 100% | 0 | 0 |
| 14th c. | 682 | 100% | 0 | 0 |
| 15th c. | 829 | 100% | 0 | 0 |
| 16th c. | 1,605 | 100% | 0 | 0 |
| 17th c. | 1,619 | 100% | 0 | 0 |
| 18th c. | 2,259 | 100% | 0 | 0 |
| 19th c. | 4,140 | 100% | 0 | 0 |
| 20th c. | 4,858 | 100% | 0 | 0 |
| 21st c. | 1,614 | 100% | 0 | 0 |

Outside the window (dropped): 1 strict events end before 3500 BCE, 0 start after 2026.
| Date precision | Strict events | Structures and sites | Births |
| --- | ---: | ---: | ---: |
| day or month (10 to 11) | 76% | n/a | n/a |
| year (9) | 24% | n/a | n/a |
| decade (8) | 0% | n/a | n/a |
| century (7) | 0% | n/a | n/a |
| millennium or coarser (6 or less) | 0% | n/a | n/a |

### F. Sitelink distribution

| Group | Median | p90 | p99 | ≥1 | ≥2 | ≥3 | ≥5 | ≥10 | ≥20 | ≥50 | ≥100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Strict events | 4 | 16 | 49 | 21,341 | 16,769 | 13,411 | 9,230 | 4,323 | 1,508 | 211 | 18 |
| Structures and sites (candidate) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Births (candidate) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Candidates were fetched with a floor (structures ≥5, births ≥20), so their counts below the floor are zero by construction.

| Strict events: sitelinks ≥ t, by era | ≥1 | ≥2 | ≥3 | ≥5 | ≥10 | ≥20 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before 1000 BCE | 25 | 20 | 16 | 14 | 10 | 3 |
| 1000 to 501 BCE | 98 | 71 | 63 | 48 | 33 | 15 |
| 500 to 1 BCE | 805 | 630 | 549 | 450 | 314 | 129 |
| 1 to 500 | 443 | 357 | 307 | 230 | 129 | 37 |
| 501 to 1000 | 938 | 725 | 590 | 470 | 275 | 91 |
| 1001 to 1500 | 2,967 | 2,136 | 1,646 | 1,120 | 550 | 196 |
| 1501 to 1800 | 5,500 | 4,227 | 3,320 | 2,168 | 900 | 256 |
| 1801 to 1900 | 4,166 | 3,323 | 2,652 | 1,750 | 673 | 189 |
| 1901 to now | 6,491 | 5,357 | 4,333 | 3,032 | 1,474 | 611 |

### G. Spotlights: focus areas by era

Cells: strict events / structures and sites / births.

| Area | 1000 to 501 BCE | 500 to 300 BCE | 299 to 1 BCE | 1 to 500 | 1001 to 1500 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Greece and Aegean | 27 / 0 / 0 | 137 / 0 / 0 | 113 / 0 / 0 | 24 / 0 / 0 | 231 / 0 / 0 |
| Italy | 11 / 0 / 0 | 91 / 0 / 0 | 174 / 0 / 0 | 72 / 0 / 0 | 281 / 0 / 0 |
| Nile valley (Egypt) | 5 / 0 / 0 | 4 / 0 / 0 | 9 / 0 / 0 | 1 / 0 / 0 | 17 / 0 / 0 |
| Mesopotamia and Levant | 41 / 0 / 0 | 18 / 0 / 0 | 42 / 0 / 0 | 90 / 0 / 0 | 224 / 0 / 0 |
| Ganges plain | 0 / 0 / 0 | 5 / 0 / 0 | 2 / 0 / 0 | 2 / 0 / 0 | 21 / 0 / 0 |
| Eastern China | 7 / 0 / 0 | 4 / 0 / 0 | 12 / 0 / 0 | 62 / 0 / 0 | 27 / 0 / 0 |
| West Africa | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 0 / 0 |
| Mesoamerica | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 0 / 0 |
| Andes | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 6 / 0 / 0 |

### H. Greece and Aegean, 500 to 300 BCE: top items by sitelinks

Strict events:

| Label | QID | Years | Precision | Category | Location | Sitelinks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Battle of Thermopylae | Q131969 | 480 BCE | 11 | conflict | exact | 83 |
| Greco-Persian Wars | Q76026 | 499 BCE to 449 BCE | 9 | conflict | inherited | 79 |
| Battle of Marathon | Q31900 | 490 BCE | 11 | conflict | exact | 76 |
| Battle of Salamis | Q178850 | 480 BCE | 11 | conflict | exact | 67 |
| Battle of Plataea | Q204636 | 479 BCE | 11 | conflict | exact | 52 |
| Battle of Chaeronea | Q200716 | 338 BCE | 10 | conflict | exact | 51 |
| Battle of the Granicus | Q192938 | 334 BCE | 10 | conflict | exact | 48 |
| Corinthian War | Q651008 | 395 BCE to 387 BCE | 9 | conflict | inherited | 43 |
| Battle of Leuctra | Q461599 | 371 BCE | 11 | conflict | exact | 41 |
| Battle of Mycale | Q503982 | 479 BCE | 9 | conflict | exact | 39 |
| Battle of Artemisium | Q747679 | 480 BCE | 9 | conflict | exact | 34 |
| Battle of Aegospotami | Q866862 | 405 BCE | 9 | conflict | exact | 33 |
| Wars of Alexander the Great | Q551888 | 336 BCE to 323 BCE | 9 | conflict | inherited | 32 |
| Battle of Lade | Q427565 | 494 BCE | 9 | conflict | exact | 27 |
| Battle of Arginusae | Q389257 | 406 BCE | 10 | conflict | exact | 26 |
| Battle of Mantinea | Q233399 | 362 BCE | 11 | conflict | exact | 24 |
| Battle of Sybota | Q951932 | 433 BCE | 9 | conflict | inherited | 24 |
| Siege of Halicarnassus | Q28933 | 334 BCE | 9 | conflict | exact | 23 |
| Battle of Potidaea | Q1356189 | 432 BCE | 9 | conflict | exact | 22 |
| Battle of Delium | Q1424844 | 424 BCE | 9 | conflict | exact | 22 |
| First Persian invasion of Greece | Q2362482 | 492 BCE to 490 BCE | 9 | conflict | inherited | 22 |
| Battle of Sphacteria | Q176416 | 425 BCE | 9 | conflict | exact | 21 |
| Battle of Amphipolis | Q637544 | 422 BCE | 9 | conflict | exact | 21 |
| Battle of Cnidus | Q1151812 | 394 BCE | 9 | conflict | exact | 21 |
| Battle of Mantinea | Q1362053 | 418 BCE | 9 | conflict | exact | 20 |

Structures and sites:

| Label | QID | Years | Precision | Category | Location | Sitelinks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |

Births:

| Label | QID | Years | Precision | Category | Location | Sitelinks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |

### I. Spot checks (year convention end to end)

| Event | QID | Expected | Got | Location | Result |
| --- | ---: | ---: | ---: | ---: | ---: |
| Battle of Marathon | Q31900 | 490 BCE | 490 BCE | 38.12, 23.98 (exact, battle) | pass |
| Battle of Salamis | Q178850 | 480 BCE | 480 BCE | 37.95, 23.57 (exact, battle) | pass |
| eruption of Mount Vesuvius in 79 | Q2411998 | 79 CE | not in data |  | **MISSING** |
| Fall of Constantinople | Q160077 | 1453 CE | 1453 CE | 41.03, 28.93 (exact, siege) | pass |
<!-- END GENERATED -->
