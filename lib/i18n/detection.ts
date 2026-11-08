import { headers } from "next/headers";

const SUPPORTED_LANGS = ["nl", "en", "pl", "ro", "uk", "de", "fr", "es", "it"];

export async function detectLanguage(): Promise<string> {
  const headersList = await headers();

  // 1. Accept-Language header
  const acceptLang = headersList.get("accept-language");
  if (acceptLang) {
    const primary = acceptLang.split(",")[0].split("-")[0].toLowerCase();
    if (SUPPORTED_LANGS.includes(primary)) return primary;
  }

  // 2. User preference cookie (set on client)
  const cookieHeader = headersList.get("cookie") || "";
  const langCookie = cookieHeader.split("; ").find(c => c.startsWith("i18n_lang="));
  if (langCookie) {
    const lang = langCookie.split("=")[1];
    if (SUPPORTED_LANGS.includes(lang)) return lang;
  }

  // 3. IP-based geolocation (optional, requires geo-service)
  // const geoLang = await geoLocate(headers().get("x-forwarded-for"));
  // if (geoLang) return geoLang;

  return "nl"; // default
}

export function getLanguageFromPath(pathname: string): string {
  const segments = pathname.split("/");
  if (segments[1] && SUPPORTED_LANGS.includes(segments[1])) {
    return segments[1];
  }
  return "nl";
}
