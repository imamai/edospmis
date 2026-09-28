"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts from zero to `to` once, on mount.
 *
 * It renders the final figure on the server and for anyone with reduced
 * motion, so the number is correct in the first frame and in a screenshot —
 * the animation is decoration on top of a page that already reads.
 */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1100,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [value, setValue] = useState(to);
  const frame = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // The first frame sets the value, rather than a setState in the effect
    // body — which is both a lint error and a wasted render.
    const started = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // easeOutCubic: quick off the mark, settling rather than stopping.
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to, duration]);

  return (
    <>
      {prefix}
      {value.toLocaleString("en-KE", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}
