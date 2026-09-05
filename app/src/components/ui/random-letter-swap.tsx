"use client";

import { useMemo, useState } from "react";
import { motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
interface RandomLetterSwapProps {
  label: string;

  reverse?: boolean;
  transition?: Transition;

  staggerDuration?: number;
  className?: string;
  onClick?: () => void;
}

export function RandomLetterSwap({
  label,
  reverse = true,
  transition = { type: "spring", duration: 0.6 },
  staggerDuration = 0.03,
  className,
  onClick,
}: RandomLetterSwapProps) {
  const [hovered, setHovered] = useState(false);
  const chars = useMemo(() => label.split(""), [label]);

  const delays = useMemo(() => {
    const order = chars.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const out = new Array<number>(chars.length);
    order.forEach((charIndex, position) => {
      out[charIndex] = position * staggerDuration;
    });
    return out;
  }, [chars, staggerDuration]);

  const away = reverse ? "-100%" : "100%";
  return (
    <span
      className={cn("relative inline-block whitespace-nowrap", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={onClick}
    >
      {}
      <span className="sr-only">{label}</span>

      <span aria-hidden="true" className="inline-flex">
        {chars.map((ch, i) => {
          const glyph = ch === " " ? " " : ch;
          const t = { ...transition, delay: delays[i] };
          return (
            <span key={`${ch}-${i}`} className="relative inline-block overflow-hidden">
              <motion.span
                className="inline-block"
                animate={{ y: hovered ? away : "0%" }}
                transition={t}
              >
                {glyph}
              </motion.span>
              <motion.span
                className="absolute left-0 inline-block"
                style={{ top: reverse ? "100%" : "-100%" }}
                animate={{ y: hovered ? away : "0%" }}
                transition={t}
              >
                {glyph}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default RandomLetterSwap;
