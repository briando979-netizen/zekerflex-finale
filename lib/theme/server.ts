import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "@/lib/theme/config";

/**
 * Current theme from the cookie (server components / layouts). `standaard` is what a user without cookie gets: de
 * werker-app is sinds 20 nov donker (naar de app van YoungOnes, eigenaar), de werkgeversomgeving blijft licht.
 */
export async function getTheme(standaard: Theme = DEFAULT_THEME): Promise<Theme> {
  const raw = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(raw) ? raw : standaard;
}
