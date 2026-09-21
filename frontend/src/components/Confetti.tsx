"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

/**
 * A short burst of gold, for the one moment in this app that deserves one.
 *
 * No canvas and no dependency: twenty-eight absolutely positioned divs that
 * animate once and unmount. It respects `prefers-reduced-motion` by rendering
 * nothing at all rather than by animating more slowly — a burst of confetti is
 * exactly the kind of thing somebody turns that setting on to avoid.
 */
const COLOURS = ["#FFD700", "#D4A847", "#F5EFE0", "#10B981", "#E8A838"];

export function Confetti({ count = 28, duration = 1.7 }: { count?: number; duration?: number }) {
  const [reduced, setReduced] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setGone(true), duration * 1000 + 400);
    return () => clearTimeout(id);
  }, [duration]);

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 340,
        y: -140 - Math.random() * 190,
        rotate: (Math.random() - 0.5) * 540,
        size: 5 + Math.random() * 7,
        colour: COLOURS[i % COLOURS.length],
        delay: Math.random() * 0.18,
      })),
    [count],
  );

  if (reduced || gone) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "50%",
        top: "40%",
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 300], opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration, delay: p.delay, ease: [0.18, 0.8, 0.4, 1] }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size * 1.6,
            borderRadius: 2,
            background: p.colour,
          }}
        />
      ))}
    </div>
  );
}
