/**
 * The hover web for a stack of overlapping dots: which members get a leg, and where each leg ends.
 * A web with 40 legs is unreadable, so at most WEB_MAX_LEGS members get one and the rest are counted.
 */
import { latLngToCell } from "h3-js";
import type { Res } from "./cells.ts";

export const WEB_MAX_LEGS = 8;

/** The most linked members, most linked first, and how many are left over. */
export function pickLegs<T extends { sitelinks: number }>(items: T[]): { legs: T[]; more: number } {
  const legs = [...items].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, WEB_MAX_LEGS);
  return { legs, more: items.length - legs.length };
}

/**
 * The grid cell a stack stands for: the cell holding most of its members. A stack's position is its
 * members' centroid, and stacks often straddle a cell border, so the centroid's cell can miss most
 * of them. A tie goes to the cell of the most linked member among the tied cells.
 */
export function stackCell(members: { lat: number; lon: number; sitelinks: number }[], res: Res): string {
  if (members.length === 0) throw new Error("stackCell needs at least one member");
  const cells = members.map((m) => latLngToCell(m.lat, m.lon, res));
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  const top = Math.max(...counts.values());
  let best = -1;
  for (let i = 0; i < members.length; i++) {
    if (counts.get(cells[i]) === top && (best === -1 || members[i].sitelinks > members[best].sitelinks)) best = i;
  }
  return cells[best];
}

/** Leg ends in screen pixels from the centre: evenly spaced on a circle, the first straight up, then clockwise. */
export function webOffsets(count: number, radiusPx: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count; // 0 is up; screen y grows downward, so +sin x is clockwise
    return { x: radiusPx * Math.sin(angle), y: -radiusPx * Math.cos(angle) };
  });
}
