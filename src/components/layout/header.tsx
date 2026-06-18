"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

export function Header({ leftSlot }: { leftSlot?: ReactNode } = {}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("strinobans-theme") as "dark" | "light" | null;
    const current = stored ?? "dark";
    // Hydration-safe read of the persisted theme from an external store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.className = next;
    localStorage.setItem("strinobans-theme", next);
  };

  return (
    <header
      className="flex h-15 items-center justify-between border-b border-border px-6 py-3"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="font-serif text-xl font-medium italic tracking-tight"
          aria-label="StrinoBans home"
        >
          StrinoBans
        </Link>
        {leftSlot && (
          <>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            {leftSlot}
          </>
        )}
      </div>

      <nav className="flex items-center gap-6" aria-label="Main">
        <a
          href="https://sunguraa.github.io/StrinoPlant/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          StrinoPlant
        </a>
        <a
          href="https://strinova.org/wiki/Main_Page"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Wiki
        </a>
        <button
          type="button"
          onClick={toggleTheme}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {mounted && (theme === "dark" ? "☀" : "☾")}
        </button>
      </nav>
    </header>
  );
}