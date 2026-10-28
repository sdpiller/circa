# Data audit

<!-- BEGIN GENERATED (npm run audit) -->
Generated 2026-10-28 from `data/raw/`. Year window: 3500 BCE to 2026 (overlap test on effective intervals).

**Incomplete: no raw data yet for settlement-founding, structure, archaeological-site, birth.**

### A. Fetch and normalization, per class

| Class | Floor (sitelinks) | Fetched | Usable | no-label | no-date | bad-date | no-location | country-only | Exact loc | Queries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| battle | 1 | 15,572 | 13,211 | 199 | 1 | 0 | 1,994 | 167 | 65% | 49 |
| siege | 1 | 3,581 | 3,476 | 13 | 4 | 0 | 76 | 12 | 76% | 13 |
| war | 1 | 2,540 | 1,125 | 23 | 1 | 0 | 876 | 515 | 12% | 10 |
| military-campaign | 1 | 1,230 | 819 | 20 | 1 | 0 | 262 | 128 | 21% | 7 |
| rebellion | 1 | 1,855 | 972 | 158 | 2 | 0 | 586 | 137 | 19% | 7 |
| massacre | 1 | 3,431 | 2,198 | 755 | 0 | 0 | 437 | 41 | 57% | 13 |
| treaty | 1 | 2,897 | 1,498 | 498 | 2 | 0 | 886 | 13 | 10% | 10 |
| coronation | 1 | 58 | 52 | 4 | 0 | 0 | 2 | 0 | 25% | 4 |
| coup | 1 | 877 | 304 | 61 | 0 | 0 | 439 | 73 | 33% | 4 |
| revolution | 1 | 189 | 63 | 16 | 0 | 0 | 66 | 44 | 21% | 4 |
| assassination | 1 | 259 | 221 | 18 | 0 | 0 | 18 | 2 | 59% | 4 |
| earthquake | 1 | 2,430 | 1,704 | 637 | 0 | 0 | 89 | 0 | 96% | 10 |
| volcanic-eruption | 1 | 100 | 79 | 11 | 0 | 0 | 10 | 0 | 77% | 4 |
| epidemic | 1 | 219 | 89 | 18 | 0 | 0 | 91 | 21 | 19% | 4 |
| flood | 1 | 848 | 335 | 94 | 0 | 0 | 371 | 48 | 32% | 4 |
| famine | 1 | 90 | 23 | 4 | 0 | 0 | 58 | 5 | 43% | 4 |
| tsunami | 1 | 35 | 27 | 2 | 0 | 0 | 5 | 1 | 100% | 4 |
| conflagration | 1 | 1,602 | 1,222 | 276 | 5 | 0 | 95 | 4 | 69% | 7 |
| expedition | 1 | 1,016 | 385 | 86 | 0 | 0 | 487 | 58 | 21% | 7 |

Usable items that matched more than one class: 917 (deduped by category priority: disaster > conflict > politics > founding > science > culture > other). Total queries: 169, total server time about 11 min.

### B. Usable items by category (deduped, in year window)

| Category | Strict events | Candidates |
| --- | ---: | ---: |
| conflict | 21,275 | 0 |
| politics | 1,980 | 0 |
| disaster | 3,448 | 0 |
| science | 146 | 0 |
| founding | 0 | 0 |
| culture | 0 | 0 |

Strict events total: **26,849**. Structures and sites: 0. Births: 0.

### C. Location confidence

| Group | Usable | Exact (own P625) | Inherited P276 | Inherited P131 | Inherited P19 | Several places to pick from |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Strict events | 26,849 | 58% | 41% | 1% | 0% | 3% |
| Structures and sites (candidate) | 0 | n/a | n/a | n/a | n/a | n/a |
| Births (candidate) | 0 | n/a | n/a | n/a | n/a | n/a |

### D. Strict events by coarse region and era

Approximate lat/lon boxes, first match wins (see `region()` in `etl/audit.ts`). An event spanning two eras counts in both.

| Region | before 1000 BCE | 1000 to 501 BCE | 500 to 1 BCE | 1 to 500 | 501 to 1000 | 1001 to 1500 | 1501 to 1800 | 1801 to 1900 | 1901 to now | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Europe | 4 | 32 | 532 | 237 | 497 | 2,222 | 3,552 | 1,765 | 3,266 | 12,072 |
| North Africa | 3 | 4 | 49 | 10 | 49 | 127 | 246 | 102 | 380 | 965 |
| Anatolia and Middle East | 21 | 54 | 199 | 137 | 347 | 560 | 361 | 211 | 1,593 | 3,471 |
| Sub-Saharan Africa | 0 | 0 | 1 | 0 | 1 | 14 | 74 | 192 | 804 | 1,079 |
| South Asia | 0 | 2 | 17 | 6 | 22 | 74 | 369 | 117 | 515 | 1,114 |
| East Asia | 4 | 7 | 20 | 72 | 59 | 195 | 478 | 274 | 904 | 2,006 |
| Southeast Asia and Oceania | 0 | 0 | 0 | 1 | 4 | 23 | 133 | 275 | 1,030 | 1,458 |
| Russia, Central and North Asia | 0 | 0 | 10 | 4 | 23 | 35 | 49 | 32 | 183 | 334 |
| Americas north of 15°N | 0 | 0 | 0 | 0 | 3 | 12 | 643 | 1,427 | 966 | 3,035 |
| Americas south of 15°N | 0 | 0 | 0 | 0 | 0 | 10 | 210 | 520 | 549 | 1,286 |
| Other (oceans, polar) | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 5 | 17 | 29 |

### D2. Candidates by coarse region

| Region | Strict events | Structures and sites | Births |
| --- | ---: | ---: | ---: |
| Europe | 12,072 | 0 | 0 |
| North Africa | 965 | 0 | 0 |
| Anatolia and Middle East | 3,471 | 0 | 0 |
| Sub-Saharan Africa | 1,079 | 0 | 0 |
| South Asia | 1,114 | 0 | 0 |
| East Asia | 2,006 | 0 | 0 |
| Southeast Asia and Oceania | 1,458 | 0 | 0 |
| Russia, Central and North Asia | 334 | 0 | 0 |
| Americas north of 15°N | 3,035 | 0 | 0 |
| Americas south of 15°N | 1,286 | 0 | 0 |
| Other (oceans, polar) | 29 | 0 | 0 |

### E. By century (effective start year), 3500 BCE to now

| Century | Strict events | of which conflict | Structures and sites | Births |
| --- | ---: | ---: | ---: | ---: |
| 35th c. BCE | 3 | 33% | 0 | 0 |
| 34th c. BCE | 0 | n/a | 0 | 0 |
| 33rd c. BCE | 1 | 100% | 0 | 0 |
| 32nd c. BCE | 0 | n/a | 0 | 0 |
| 31st c. BCE | 0 | n/a | 0 | 0 |
| 30th c. BCE | 1 | 0% | 0 | 0 |
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
| 19th c. BCE | 1 | 0% | 0 | 0 |
| 18th c. BCE | 1 | 100% | 0 | 0 |
| 17th c. BCE | 1 | 0% | 0 | 0 |
| 16th c. BCE | 1 | 100% | 0 | 0 |
| 15th c. BCE | 1 | 100% | 0 | 0 |
| 14th c. BCE | 2 | 50% | 0 | 0 |
| 13th c. BCE | 9 | 89% | 0 | 0 |
| 12th c. BCE | 3 | 100% | 0 | 0 |
| 11th c. BCE | 4 | 100% | 0 | 0 |
| 10th c. BCE | 4 | 75% | 0 | 0 |
| 9th c. BCE | 4 | 100% | 0 | 0 |
| 8th c. BCE | 22 | 100% | 0 | 0 |
| 7th c. BCE | 28 | 100% | 0 | 0 |
| 6th c. BCE | 40 | 100% | 0 | 0 |
| 5th c. BCE | 125 | 94% | 0 | 0 |
| 4th c. BCE | 179 | 97% | 0 | 0 |
| 3rd c. BCE | 216 | 100% | 0 | 0 |
| 2nd c. BCE | 114 | 96% | 0 | 0 |
| 1st c. BCE | 190 | 97% | 0 | 0 |
| 1st c. | 76 | 95% | 0 | 0 |
| 2nd c. | 44 | 89% | 0 | 0 |
| 3rd c. | 112 | 96% | 0 | 0 |
| 4th c. | 91 | 96% | 0 | 0 |
| 5th c. | 138 | 95% | 0 | 0 |
| 6th c. | 159 | 93% | 0 | 0 |
| 7th c. | 228 | 96% | 0 | 0 |
| 8th c. | 187 | 92% | 0 | 0 |
| 9th c. | 220 | 89% | 0 | 0 |
| 10th c. | 202 | 96% | 0 | 0 |
| 11th c. | 361 | 95% | 0 | 0 |
| 12th c. | 526 | 92% | 0 | 0 |
| 13th c. | 688 | 90% | 0 | 0 |
| 14th c. | 762 | 90% | 0 | 0 |
| 15th c. | 925 | 89% | 0 | 0 |
| 16th c. | 1,728 | 92% | 0 | 0 |
| 17th c. | 1,856 | 87% | 0 | 0 |
| 18th c. | 2,521 | 89% | 0 | 0 |
| 19th c. | 4,892 | 84% | 0 | 0 |
| 20th c. | 6,762 | 71% | 0 | 0 |
| 21st c. | 3,417 | 47% | 0 | 0 |

Outside the window (dropped): 9 strict events end before 3500 BCE, 0 start after 2026.
| Date precision | Strict events | Structures and sites | Births |
| --- | ---: | ---: | ---: |
| day or month (10 to 11) | 78% | n/a | n/a |
| year (9) | 21% | n/a | n/a |
| decade (8) | 0% | n/a | n/a |
| century (7) | 0% | n/a | n/a |
| millennium or coarser (6 or less) | 0% | n/a | n/a |

### F. Sitelink distribution

| Group | Median | p90 | p99 | ≥1 | ≥2 | ≥3 | ≥5 | ≥10 | ≥20 | ≥50 | ≥100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Strict events | 4 | 17 | 52 | 26,849 | 21,170 | 16,996 | 11,774 | 5,726 | 2,137 | 321 | 24 |
| Structures and sites (candidate) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Births (candidate) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Candidates were fetched with a floor (structures ≥5, births ≥20), so their counts below the floor are zero by construction.

| Strict events: sitelinks ≥ t, by era | ≥1 | ≥2 | ≥3 | ≥5 | ≥10 | ≥20 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before 1000 BCE | 32 | 27 | 22 | 20 | 15 | 6 |
| 1000 to 501 BCE | 99 | 72 | 64 | 48 | 33 | 15 |
| 500 to 1 BCE | 828 | 646 | 564 | 463 | 325 | 135 |
| 1 to 500 | 467 | 377 | 326 | 247 | 140 | 41 |
| 501 to 1000 | 1,005 | 784 | 639 | 506 | 299 | 99 |
| 1001 to 1500 | 3,272 | 2,389 | 1,861 | 1,283 | 628 | 221 |
| 1501 to 1800 | 6,122 | 4,756 | 3,782 | 2,519 | 1,102 | 336 |
| 1801 to 1900 | 4,920 | 3,917 | 3,125 | 2,082 | 854 | 263 |
| 1901 to now | 10,207 | 8,288 | 6,684 | 4,663 | 2,367 | 1,041 |

### G. Spotlights: focus areas by era

Cells: strict events / structures and sites / births.

| Area | 1000 to 501 BCE | 500 to 300 BCE | 299 to 1 BCE | 1 to 500 | 1001 to 1500 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Greece and Aegean | 27 / 0 / 0 | 146 / 0 / 0 | 115 / 0 / 0 | 28 / 0 / 0 | 247 / 0 / 0 |
| Italy | 11 / 0 / 0 | 91 / 0 / 0 | 179 / 0 / 0 | 77 / 0 / 0 | 322 / 0 / 0 |
| Nile valley (Egypt) | 5 / 0 / 0 | 4 / 0 / 0 | 9 / 0 / 0 | 1 / 0 / 0 | 17 / 0 / 0 |
| Mesopotamia and Levant | 41 / 0 / 0 | 21 / 0 / 0 | 43 / 0 / 0 | 93 / 0 / 0 | 237 / 0 / 0 |
| Ganges plain | 0 / 0 / 0 | 5 / 0 / 0 | 2 / 0 / 0 | 2 / 0 / 0 | 21 / 0 / 0 |
| Eastern China | 7 / 0 / 0 | 4 / 0 / 0 | 14 / 0 / 0 | 64 / 0 / 0 | 31 / 0 / 0 |
| West Africa | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 0 / 0 |
| Mesoamerica | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 4 / 0 / 0 |
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
| Plague of Athens | Q758173 | 430 BCE to 426 BCE | 9 | disaster | inherited | 31 |
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
| eruption of Mount Vesuvius in 79 | Q2411998 | 79 CE | 79 CE | 40.82, 14.44 (exact, volcanic-eruption) | pass |
| Fall of Constantinople | Q160077 | 1453 CE | 1453 CE | 41.03, 28.93 (exact, siege) | pass |
<!-- END GENERATED -->
