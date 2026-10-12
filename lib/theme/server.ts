import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "@/lib/theme/config";

/** Current theme from the cookie (server components / layouts). */
export async function getTheme(): Promise<Theme> {
  const raw = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(raw) ? raw : DEFAULT_THEME;
}
