"use client";

import { useEffect, useState } from "react";

export function useTeaserSequence(length: number, delayMs = 2600) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (length <= 1 || isPaused) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % length);
    }, delayMs);

    return () => window.clearInterval(timer);
  }, [delayMs, isPaused, length]);

  return {
    activeIndex,
    isPaused,
    setActiveIndex,
    setIsPaused,
    next: () => setActiveIndex((current) => (current + 1) % length),
    previous: () => setActiveIndex((current) => (current - 1 + length) % length),
    togglePaused: () => setIsPaused((current) => !current),
  };
}
