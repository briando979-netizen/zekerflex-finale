type CurrencyConfig = {
  code: string;
  symbol: string;
  decimals: number;
  locale: string;
};

const CURRENCY_MAP: Record<string, CurrencyConfig> = {
  nl: { code: "EUR", symbol: "€", decimals: 2, locale: "nl-NL" },
  en: { code: "EUR", symbol: "€", decimals: 2, locale: "en-GB" },
  pl: { code: "PLN", symbol: "zł", decimals: 2, locale: "pl-PL" },
  ro: { code: "RON", symbol: "lei", decimals: 2, locale: "ro-RO" },
  uk: { code: "UAH", symbol: "₴", decimals: 2, locale: "uk-UA" },
  de: { code: "EUR", symbol: "€", decimals: 2, locale: "de-DE" },
  fr: { code: "EUR", symbol: "€", decimals: 2, locale: "fr-FR" },
  es: { code: "EUR", symbol: "€", decimals: 2, locale: "es-ES" },
  it: { code: "EUR", symbol: "€", decimals: 2, locale: "it-IT" },
};

const TIMEZONE_MAP: Record<string, string> = {
  nl: "Europe/Amsterdam",
  en: "Europe/London",
  pl: "Europe/Warsaw",
  ro: "Europe/Bucharest",
  uk: "Europe/Kyiv",
  de: "Europe/Berlin",
  fr: "Europe/Paris",
  es: "Europe/Madrid",
  it: "Europe/Rome",
};

export function getCurrency(lang: string): CurrencyConfig {
  return CURRENCY_MAP[lang] || CURRENCY_MAP["nl"];
}

export function getTimezone(lang: string): string {
  return TIMEZONE_MAP[lang] || TIMEZONE_MAP["nl"];
}

export function formatCurrency(amount: number, lang: string): string {
  const cfg = getCurrency(lang);
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: cfg.code,
    minimumFractionDigits: cfg.decimals,
  }).format(amount);
}

export function formatDate(date: Date, lang: string): string {
  const tz = getTimezone(lang);
  const cfg = getCurrency(lang);
  return new Intl.DateTimeFormat(cfg.locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
