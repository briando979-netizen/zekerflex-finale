// ---------------------------------------------------------------------------
// Light/dark theme for the freelancer (/dashboard) and employer (/werkgever)
// workspaces — lives in a cookie exactly like lib/i18n/config.ts's locale,
// read server-side so the right theme is there on first paint (no flash).
// Scoped to those two shells via the `.app-scope` CSS block in globals.css;
// marketing/auth/admin pages are untouched (admin already has its own,
// separate dark mode in AdminShell.tsx / .admin-scope).
// ---------------------------------------------------------------------------

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "light";
export const THEME_COOKIE = "zf_theme";
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}
