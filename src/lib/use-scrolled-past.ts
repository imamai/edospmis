"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}

/**
 * Whether the window has scrolled past `threshold` pixels.
 *
 * useSyncExternalStore rather than an effect: the server snapshot is a
 * constant `false`, so the first client render matches the HTML and the
 * header never hydrates into a different state than it was sent in.
 */
export function useScrolledPast(threshold = 8): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.scrollY > threshold,
    () => false,
  );
}
