"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A JSON value kept in the browser, read the way React 19 wants it read.
 *
 * Reading `localStorage` in an effect and calling setState causes a cascading
 * render; reading it in a `useState` initialiser breaks hydration, because the
 * server renders one value and the browser's first render produces another.
 * `useSyncExternalStore` takes a separate server snapshot, so the markup
 * matches, and subscribes rather than setting state.
 *
 * Only for conveniences — which nav groups someone folded away. Anything that
 * must survive a new device or be read back by the server belongs in the
 * database.
 *
 * Copied from edos-poa, whose sidebar folds the same way; the three apps
 * share the pattern rather than each inventing one.
 */

// localStorage fires `storage` only in OTHER tabs, so same-tab writes are
// broadcast through this set of listeners instead.
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

// getSnapshot must return a stable reference or React re-renders forever, so
// each key's parsed value is memoised against the raw string it came from.
const snapshots = new Map<string, { raw: string | null; value: unknown }>();

function readSnapshot<T extends object>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Private window, or site data blocked.
    return fallback;
  }

  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: T = fallback;
  if (raw !== null) {
    try {
      value = { ...fallback, ...JSON.parse(raw) } as T;
    } catch {
      value = fallback;
    }
  }

  snapshots.set(key, { raw, value });
  return value;
}

/**
 * `fallback` MUST be a stable reference — a module-level constant. It is
 * returned as-is when nothing is stored, so a fresh object literal on every
 * render would change the snapshot's identity and re-render forever.
 */
export function useStoredJson<T extends object>(key: string, fallback: T): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readSnapshot(key, fallback),
    () => fallback,
  );

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the in-memory snapshot so the screen still responds.
        snapshots.set(key, { raw: JSON.stringify(next), value: next });
      }
      notify();
    },
    [key],
  );

  return [value, setValue];
}
