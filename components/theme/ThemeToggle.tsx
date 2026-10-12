"use client";

import { THEME_COOKIE, THEME_MAX_AGE, type Theme } from "@/lib/theme/config";

function setTheme(theme: Theme): void {
  try {
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_MAX_AGE}; samesite=lax`;
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Sun/moon icon toggle — mirrors the one already proven in components/admin/AdminShell.tsx. */
export function ThemeToggle({ theme, className = "" }: { theme: Theme; className?: string }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme === "dark" ? "Zet lichte weergave aan" : "Zet donkere weergave aan"}
      title={theme === "dark" ? "Licht" : "Donker"}
      className={className}
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

/** Row-style variant for a settings list (label + current value + click to toggle). */
export function ThemeToggleRow({ theme }: { theme: Theme }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex w-full items-center justify-between gap-3 border-b border-hair px-4 py-3.5 text-left text-sm font-medium text-ink last:border-b-0 hover:bg-paper-soft"
    >
      <span>Weergave</span>
      <span className="flex items-center gap-1.5 text-neutralx-400">
        {theme === "dark" ? "Donker" : "Licht"}
        <span aria-hidden>›</span>
      </span>
    </button>
  );
}
