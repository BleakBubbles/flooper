import { useCallback, useSyncExternalStore } from "react";

// Small view preferences (theme, sidebar, sort, folded pages), kept in this
// browser so they survive a reload. Never anything that matters if lost:
// storage can be blocked or cleared, and every read falls back to a default.

const PREFIX = "flooper:";
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    // Kept for this visit only (below).
  }
  memory.set(key, value);
  for (const listener of listeners) listener();
}

/** This visit's values, so a pref still works where storage is blocked. */
const memory = new Map<string, string | null>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) {
      memory.delete(event.key.slice(PREFIX.length));
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The pref's raw string, from this visit if set, else from storage. */
export function readPref(key: string): string | null {
  return memory.has(key) ? (memory.get(key) ?? null) : read(key);
}

/**
 * A remembered preference, as JSON. `fallback` is used when nothing is
 * stored or what's stored doesn't parse; `valid` can reject stale shapes.
 */
export function usePref<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T = (_v): _v is T => true,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => readPref(key));
  let value = fallback;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed)) value = parsed;
    } catch {
      // Stale or hand-edited: the fallback.
    }
  }
  const set = useCallback((next: T) => write(key, JSON.stringify(next)), [key]);
  return [value, set];
}
