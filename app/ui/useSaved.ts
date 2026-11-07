"use client";
/**
 * The saved list in localStorage, shared by every component that reads it, and followed across tabs by the
 * `storage` event. Empty on the server and in the first render, so hydration matches. Where the browser
 * refuses to store (storage disabled or full), the list lives in memory for this page only.
 */
import { useSyncExternalStore } from "react";
import { parseSaved, removeSaved, SAVED_KEY, serializeSaved, toggleSaved, type SavedItem } from "../../lib/saved.ts";

const EMPTY: SavedItem[] = [];
const listeners = new Set<() => void>();
let memory: string | undefined; // set once a write has failed
let cache: { raw: string | null; list: SavedItem[] } = { raw: null, list: EMPTY };

function rawNow(): string | null {
  if (memory !== undefined) return memory;
  try {
    return window.localStorage.getItem(SAVED_KEY);
  } catch {
    return null;
  }
}

/** The same array until the stored text changes, as useSyncExternalStore requires. */
function read(): SavedItem[] {
  const raw = rawNow();
  if (raw !== cache.raw) cache = { raw, list: parseSaved(raw) };
  return cache.list;
}

function write(list: SavedItem[]) {
  const raw = serializeSaved(list);
  try {
    if (memory === undefined) window.localStorage.setItem(SAVED_KEY, raw);
    else memory = raw;
  } catch {
    memory = raw;
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVED_KEY || e.key === null) onChange(); // null: another tab cleared storage
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const toggleSavedItem = (entry: SavedItem) => write(toggleSaved(read(), entry));
export const removeSavedItem = (qid: string) => write(removeSaved(read(), qid));

export function useSaved(): SavedItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
