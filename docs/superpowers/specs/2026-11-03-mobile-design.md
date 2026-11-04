# Circa on phones (Phase 8) design

Date: 2026-11-03. Status: owner approved. As built: decisions.md entry 36.

## Why

Circa went live at samarchive.com/circa and the owner opened it on a phone. Two things failed. The reading column was unusable: its width, `min(420px, 36vw)`, is 140 px on a 390 px phone. The year slider was hard to use: the handles were too small to grab, a drag could not land the year wanted, and it was crowded. Phase 6 had made layouts below 1024 px a non-goal, so this is new scope.

## Decided by the owner

- Below 700 px wide, the reading column is a **bottom sheet**. A click opens it at half height, and the globe frames the outline in the top half. A tap on its handle expands it to full height, and another tap returns it to half.
- While the sheet is open, the **year slider lives in the sheet**. When the sheet is closed, the slider sits at the bottom of the screen, with bigger handles.
- **Step buttons** sit beside the dates on touch screens. A tap moves that end of the range by one year, and holding repeats. The first plan stepped by slider notches, but notches skip years after 1700 (1916 cannot be reached) and move 5 years at a time between 1 and 1000 CE.

## Decided by Claude (the owner can overrule)

- The breakpoint is 700 px. Tablets keep the side column, which now never shrinks below 320 px. Desktop does not change.
- A swipe on the handle also works: up expands the sheet, down collapses it, and down at half height closes the area. The sheet does not follow the finger.
- The slider sits at the top of the sheet, not under the place name. The name fades and remounts with each new answer, and dragging the slider brings new answers.
- On phones, Sources moves to the top right.

## Non-goals

A sheet that tracks the finger, a layout designed for phones held sideways, changes to globe gestures, and the `/preview` page.

## Acceptance

The criteria are in `docs/PLAN.md` under Phase 8, (a) to (h). The owner checks it on a real phone, from a Vercel preview of the branch, before it merges.
