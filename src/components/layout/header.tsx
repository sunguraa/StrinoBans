"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { getUserIdentity, setUserIdentity, type UserIdentity } from "@/lib/identity";
import { isNameClean, NAME_FILTER_ERROR } from "@/lib/filters";
import { randomColor } from "@/lib/utils";

interface HeaderProps {
  onOpenHistory?: () => void;
  leftSlot?: ReactNode;
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{6})$/.test(value.trim());
}

export function Header({ onOpenHistory, leftSlot }: HeaderProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("strinobans-theme") as "dark" | "light" | null;
    const current = stored ?? "dark";
    // Hydration-safe read of the persisted theme from an external store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current);
    setMounted(true);
    setIdentity(getUserIdentity());
  }, []);

  // Collapse the identity menu when clicking outside of it.
  useEffect(() => {
    if (!identityOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIdentityOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [identityOpen]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.className = next;
    localStorage.setItem("strinobans-theme", next);
  };

  const updateIdentity = (patch: Partial<UserIdentity>) => {
    if (!identity) return;
    const next = { ...identity, ...patch };
    if (next.name && !isNameClean(next.name)) return;
    setIdentity(next);
    setUserIdentity(next);
  };

  const nameInvalid = identity ? !isNameClean(identity.name) : false;

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
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Open match history"
          >
            History
          </button>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {mounted && (theme === "dark" ? "☀" : "☾")}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIdentityOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm transition-colors hover:bg-card"
            aria-label="Edit your identity"
            aria-expanded={identityOpen}
          >
            {identity && (
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: identity.color }}
                aria-hidden="true"
              />
            )}
            <span className="max-w-[120px] truncate">{identity?.name ?? "You"}</span>
          </button>
          {identityOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
              <label className="block text-xs font-medium text-muted-foreground">Name</label>
              <input
                type="text"
                value={identity?.name ?? ""}
                onChange={(e) => updateIdentity({ name: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                maxLength={24}
              />
              {nameInvalid && (
                <p className="mt-1 text-xs text-destructive" role="alert">{NAME_FILTER_ERROR}</p>
              )}
              <label className="mt-2 block text-xs font-medium text-muted-foreground">Colour (hex)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={identity?.color ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isValidHexColor(value)) {
                      updateIdentity({ color: value });
                    } else {
                      // Update local state only so the user can finish typing.
                      setIdentity((prev) => (prev ? { ...prev, color: value } : prev));
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (!isValidHexColor(value) && identity) {
                      // Revert to the last saved valid color if the entered value is invalid.
                      setIdentity({ ...identity });
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  maxLength={7}
                  placeholder="#45B7D1"
                />
                <button
                  type="button"
                  onClick={() => updateIdentity({ color: randomColor() })}
                  className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary"
                  aria-label="Random colour"
                >
                  🎲
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
