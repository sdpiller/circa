/**
 * The hover web for a stack of overlapping dots: which members get a leg, and where each leg ends.
 * A web with 40 legs is unreadable, so at most WEB_MAX_LEGS members get one and the rest are counted.
 */
export const WEB_MAX_LEGS = 8;

/** The most linked members, most linked first, and how many are left over. */
export function pickLegs<T extends { sitelinks: number }>(items: T[]): { legs: T[]; more: number } {
  const legs = [...items].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, WEB_MAX_LEGS);
  return { legs, more: items.length - legs.length };
}

/** Leg ends in screen pixels from the centre: evenly spaced on a circle, the first straight up, then clockwise. */
export function webOffsets(count: number, radiusPx: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count; // 0 is up; screen y grows downward, so +sin x is clockwise
    return { x: radiusPx * Math.sin(angle), y: -radiusPx * Math.cos(angle) };
  });
}
