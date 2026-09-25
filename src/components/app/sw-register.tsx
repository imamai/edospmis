"use client";

import { useEffect } from "react";

/** Registers the offline-shell service worker (see public/sw.js) — a pure side effect, nothing to render. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/app/" }).catch(() => {});
    }
  }, []);
  return null;
}
