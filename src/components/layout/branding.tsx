"use client";

const LINKS = [
  { label: "GitHub", href: "https://github.com/sunguraa/StrinoBans" },
  { label: "X", href: "https://x.com/sunguraa_" },
  { label: "Linktree", href: "https://linktr.ee/sunguraa" },
  { label: "Strinova Wiki", href: "https://strinova.org/wiki/" },
];

export function Branding() {
  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs backdrop-blur"
      role="contentinfo"
      aria-label="Credits"
    >
      <span className="text-muted-foreground">
        made by <span className="font-medium text-foreground">sunguraa</span>
      </span>
      <span className="text-border" aria-hidden="true">
        |
      </span>
      <nav className="flex items-center gap-2" aria-label="Links">
        {LINKS.map((link, i) => (
          <span key={link.href} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-border" aria-hidden="true">
                ·
              </span>
            )}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          </span>
        ))}
      </nav>
    </div>
  );
}
