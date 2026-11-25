import { useEffect, useState } from "react";

/**
 * Re-renders on an interval so “ongoing”, “free until” and countdowns follow the
 * real clock without a page refresh.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
