"use client";

import { useEffect } from "react";

/**
 * Takes a notification to the thing it is about.
 *
 * A notification links to `/app/cases/<id>#panel-finance`. The browser's own
 * hash jump is unreliable here: the case page streams, so the panel often does
 * not exist yet when the hash is read, and the jump silently does nothing —
 * which is exactly the complaint, a notification that lands you at the top of
 * a long page to go hunting.
 *
 * So it waits for the element, scrolls to it, and rings it briefly. The ring
 * matters: on a page of similar-looking cards, arriving somewhere in the
 * middle with no indication of why leaves you no better off than arriving at
 * the top.
 */
export function ScrollToPanel() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;

    let cancelled = false;
    let attempts = 0;

    function tryScroll() {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (!el) {
        // The panel may still be streaming in. Give up after a couple of
        // seconds rather than polling a page it was never on — a notification
        // can outlive the stage it was about.
        if (attempts++ > 40) return;
        window.setTimeout(tryScroll, 50);
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-brand", "ring-offset-2", "rounded-xl");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-brand", "ring-offset-2");
      }, 2200);
    }

    tryScroll();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
