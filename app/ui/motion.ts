/** Shared by everything that moves (spec 3.4). Call in effects and handlers only: it needs window. */
export const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
