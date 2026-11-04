"use client";
/** Whether the window has the narrow layout (lib/layout.ts). False on the server and in the first render, so hydration matches. */
import { useSyncExternalStore } from "react";
import { NARROW_QUERY } from "../../lib/layout.ts";

function subscribe(onChange: () => void) {
  const q = window.matchMedia(NARROW_QUERY);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}
