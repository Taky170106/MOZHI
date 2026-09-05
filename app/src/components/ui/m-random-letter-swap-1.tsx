"use client";

import { useEffect, useState } from "react";
import { RandomLetterSwap } from "@/components/ui/random-letter-swap";

const links = [
  { label: "Counter", href: "#/counter" },
  { label: "Vocabulary", href: "#/vocabulary" },
  { label: "Archive", href: "#/archive" },
  { label: "Settings", href: "#/settings" },
];

export default function RandomLetterSwapNav() {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const current = links.find((l) => hash.startsWith(l.href))?.href;
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="pointer-events-auto mx-auto flex max-w-[82rem] items-center justify-between gap-5 px-6 py-5 sm:gap-8 sm:px-10">
        {}
        <a
          className="block shrink-0 transition-opacity hover:opacity-70"
          href="#main"
        >
          <img
            src="./brand/sanket-lockup.png"
            alt="Sanket"
            width={900}
            height={323}
            className="h-7 w-auto sm:h-10"
          />
        </a>

        {}
        <nav
          aria-label="Primary"
          className="flex min-w-0 items-center gap-4 overflow-x-auto [mask-image:linear-gradient(to_right,#000_88%,transparent)] [scrollbar-width:none] sm:gap-8 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        >
          {links.map((link) => {
            const active = current === link.href;
            return (
              <a
                aria-current={active ? "page" : undefined}
                className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                href={link.href}
                key={link.label}
              >
                <RandomLetterSwap
                  className={`cursor-pointer text-[0.8rem] transition-colors sm:text-sm ${
                    active
                      ? "font-bold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  }`}
                  label={link.label}
                  staggerDuration={0.025}
                  transition={{ duration: 0.6, type: "spring" }}
                />
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
