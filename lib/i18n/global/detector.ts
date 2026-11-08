import { headers } from "next/headers";

export type LanguageCode =
  | "en-US" | "en-GB" | "en-AU" | "en-CA"
  | "de" | "fr" | "es" | "it"
  | "nl" | "sv" | "da" | "no"
  | "pt-BR" | "pt-PT" | "pl" | "cs" | "hu"
  | "ru" | "uk" | "ar" | "he"
  | "zh-CN" | "zh-TW" | "ja" | "ko"
  | "th" | "vi" | "id" | "tr" | "el";

export type RegionCode =
  | "US" | "CA" | "GB" | "EU" | "AU" | "NZ"
  | "SG" | "JP" | "BR" | "MX" | "IN" | "AE" | "SA" | "IL"
  | "ZA" | "NG" | "KE";

const LANGUAGE_REGIONS: Record<LanguageCode, RegionCode[]> = {
  "en-US": ["US", "CA"],
  "en-GB": ["GB", "EU"],
  "en-AU": ["AU", "NZ"],
  "en-CA": ["CA"],
  "de": ["EU"],
  "fr": ["EU"],
  "es": ["EU", "MX"],
  "it": ["EU"],
  "nl": ["EU"],
  "sv": ["EU"],
  "da": ["EU"],
  "no": ["EU"],
  "pt-BR": ["BR"],
  "pt-PT": ["EU"],
  "pl": ["EU"],
  "cs": ["EU"],
  "hu": ["EU"],
  "ru": ["EU"],
  "uk": ["EU"],
  "ar": ["AE", "SA"],
  "he": ["IL"],
  "zh-CN": ["SG"],
  "zh-TW": ["SG"],
  "ja": ["JP"],
  "ko": ["SG"],
  "th": ["SG"],
  "vi": ["SG"],
  "id": ["SG"],
  "tr": ["EU"],
  "el": ["EU"],
};

export async function detectLanguage(): Promise<LanguageCode> {
  try {
    const headersList = await headers();
    const acceptLanguage = headersList.get("accept-language") || "";
    const firstLang = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();

    if (firstLang && isValidLanguage(firstLang as LanguageCode)) {
      return firstLang as LanguageCode;
    }
  } catch {
    // fallback to en-US
  }
  return "en-US";
}

export async function detectRegion(): Promise<RegionCode> {
  try {
    const headersList = await headers();
    const cloudflareCountry = headersList.get("cf-ipcountry");
    const xForwardedCountry = headersList.get("x-vercel-ip-country");

    const country = cloudflareCountry || xForwardedCountry || "US";
    return mapCountryToRegion(country);
  } catch {
    return "US";
  }
}

function isValidLanguage(lang: string): lang is LanguageCode {
  return Object.keys(LANGUAGE_REGIONS).includes(lang);
}

function mapCountryToRegion(countryCode: string): RegionCode {
  const countryMap: Record<string, RegionCode> = {
    US: "US", CA: "CA", GB: "GB", DE: "EU", FR: "EU", IT: "EU", ES: "EU", NL: "EU",
    SE: "EU", DK: "EU", NO: "EU", PL: "EU", CZ: "EU", HU: "EU", RU: "EU", UA: "EU",
    AU: "AU", NZ: "NZ", SG: "SG", JP: "JP", BR: "BR", MX: "MX", IN: "IN",
    AE: "AE", SA: "SA", IL: "IL", ZA: "ZA", NG: "NG", KE: "KE",
  };
  return countryMap[countryCode] || "US";
}

export async function getLocaleContext() {
  const language = await detectLanguage();
  const region = await detectRegion();

  return { language, region };
}
