import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Multi-Currency & Localization - Currency conversion, locale-specific content, language support, timezone handling
 */

const localizationSchema = z.object({
  defaultLanguage: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default("nl"),
  supportedLanguages: z.array(z.string()).default(["nl", "en"]),
  defaultCurrency: z.string().length(3).default("EUR"),
  supportedCurrencies: z.array(z.string().length(3)).default(["EUR"]),
  defaultTimezone: z.string().default("Europe/Amsterdam"),
  dateFormat: z.string().default("dd-MM-yyyy"),
  timeFormat: z.string().default("HH:mm"),
  numberFormat: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).default("nl-NL"),
  customTranslations: z.record(z.any()).default({}),
  currencyExchangeRates: z.record(z.number()).default({}),
});

export type LocalizationConfig = z.infer<typeof localizationSchema>;

/**
 * Get localization settings for a tenant
 */
export async function getTenantLocalization(
  tenantId: string
): Promise<LocalizationConfig> {
  const localization = await prisma.tenantLocalization.findUnique({
    where: { tenantId },
  });

  if (!localization) {
    return getDefaultLocalization();
  }

  return {
    defaultLanguage: localization.defaultLanguage,
    supportedLanguages: localization.supportedLanguages,
    defaultCurrency: localization.defaultCurrency,
    supportedCurrencies: localization.supportedCurrencies,
    defaultTimezone: localization.defaultTimezone,
    dateFormat: localization.dateFormat,
    timeFormat: localization.timeFormat,
    numberFormat: localization.numberFormat,
    customTranslations: (localization.customTranslations ?? {}) as Record<string, unknown>,
    currencyExchangeRates: (localization.currencyExchangeRates ?? {}) as Record<string, number>,
  };
}

/**
 * Update localization settings for a tenant
 */
export async function updateTenantLocalization(
  tenantId: string,
  data: Partial<LocalizationConfig>
) {
  const validated = localizationSchema.partial().parse(data);

  return await prisma.tenantLocalization.upsert({
    where: { tenantId },
    update: validated,
    create: {
      tenantId,
      ...getDefaultLocalization(),
      ...validated,
    },
  });
}

/**
 * Add a supported language for a tenant
 */
export async function addSupportedLanguage(tenantId: string, language: string) {
  const localization = await getTenantLocalization(tenantId);
  const languages = new Set(localization.supportedLanguages ?? []);
  languages.add(language);

  return await updateTenantLocalization(tenantId, {
    supportedLanguages: Array.from(languages),
  });
}

/**
 * Add a supported currency for a tenant
 */
export async function addSupportedCurrency(tenantId: string, currency: string) {
  if (currency.length !== 3) {
    throw AppError.validation("Valutacode moet 3 karakters zijn (ISO 4217)");
  }

  const localization = await getTenantLocalization(tenantId);
  const currencies = new Set(localization.supportedCurrencies ?? []);
  currencies.add(currency);

  return await updateTenantLocalization(tenantId, {
    supportedCurrencies: Array.from(currencies),
  });
}

/**
 * Convert amount from one currency to another using stored exchange rates
 */
export async function convertCurrency(
  tenantId: string,
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const localization = await getTenantLocalization(tenantId);
  const rates = localization.currencyExchangeRates ?? {};

  // Get exchange rates (assumes rates[currency] = rate relative to base currency)
  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;

  if (!fromRate || !toRate) {
    throw AppError.validation(
      `Wisselkoers niet beschikbaar voor ${fromCurrency} of ${toCurrency}`
    );
  }

  return (amount / fromRate) * toRate;
}

/**
 * Update currency exchange rates for a tenant
 */
export async function updateExchangeRates(
  tenantId: string,
  rates: Record<string, number>
) {
  return await updateTenantLocalization(tenantId, {
    currencyExchangeRates: rates,
  });
}

/**
 * Set default timezone for a tenant
 */
export async function setDefaultTimezone(tenantId: string, timezone: string) {
  return await updateTenantLocalization(tenantId, {
    defaultTimezone: timezone,
  });
}

/**
 * Format a date according to tenant's locale
 */
export async function formatDate(
  tenantId: string,
  date: Date | string
): Promise<string> {
  const localization = await getTenantLocalization(tenantId);
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Use Node.js Intl API for locale-aware formatting
  const formatter = new Intl.DateTimeFormat(localization.numberFormat, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return formatter.format(dateObj);
}

/**
 * Format a time according to tenant's locale
 */
export async function formatTime(tenantId: string, date: Date | string): Promise<string> {
  const localization = await getTenantLocalization(tenantId);
  const dateObj = typeof date === "string" ? new Date(date) : date;

  const formatter = new Intl.DateTimeFormat(localization.numberFormat, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return formatter.format(dateObj);
}

/**
 * Format a number according to tenant's locale
 */
export async function formatNumber(tenantId: string, number: number): Promise<string> {
  const localization = await getTenantLocalization(tenantId);

  const formatter = new Intl.NumberFormat(localization.numberFormat);
  return formatter.format(number);
}

/**
 * Format currency amount according to tenant's locale
 */
export async function formatCurrency(
  tenantId: string,
  amount: number,
  currency?: string
): Promise<string> {
  const localization = await getTenantLocalization(tenantId);
  const currencyCode = currency ?? localization.defaultCurrency;

  const formatter = new Intl.NumberFormat(localization.numberFormat, {
    style: "currency",
    currency: currencyCode,
  });

  return formatter.format(amount);
}

/**
 * Get a custom translation for a key, with fallback to English/Dutch
 */
export async function getTranslation(
  tenantId: string,
  key: string,
  language?: string
): Promise<string> {
  const localization = await getTenantLocalization(tenantId);
  const lang = language ?? localization.defaultLanguage;
  const translations = localization.customTranslations ?? {};

  // Try to get from custom translations
  const translationsByKey = (translations[lang] ?? {}) as Record<string, unknown>;
  if (translationsByKey[key]) {
    return String(translationsByKey[key]);
  }

  // Fallback to key itself
  return key;
}

/**
 * Add or update a custom translation
 */
export async function setTranslation(
  tenantId: string,
  language: string,
  key: string,
  value: string
) {
  const localization = await getTenantLocalization(tenantId);
  const translations = (localization.customTranslations ?? {}) as Record<string, Record<string, unknown>>;

  if (!translations[language]) {
    translations[language] = {};
  }

  const langTranslations = translations[language] as Record<string, unknown>;
  langTranslations[key] = value;

  return await updateTenantLocalization(tenantId, {
    customTranslations: translations,
  });
}

/**
 * Set default language for a tenant
 */
export async function setDefaultLanguage(tenantId: string, language: string) {
  return await updateTenantLocalization(tenantId, {
    defaultLanguage: language,
  });
}

/**
 * Check if a language is supported for a tenant
 */
export async function isLanguageSupported(tenantId: string, language: string): Promise<boolean> {
  const localization = await getTenantLocalization(tenantId);
  return (localization.supportedLanguages ?? []).includes(language);
}

/**
 * Check if a currency is supported for a tenant
 */
export async function isCurrencySupported(tenantId: string, currency: string): Promise<boolean> {
  const localization = await getTenantLocalization(tenantId);
  return (localization.supportedCurrencies ?? []).includes(currency);
}

/**
 * Batch update multiple translations
 */
export async function setTranslations(
  tenantId: string,
  language: string,
  translations: Record<string, string>
) {
  const localization = await getTenantLocalization(tenantId);
  const existing = (localization.customTranslations ?? {}) as Record<string, Record<string, unknown>>;

  if (!existing[language]) {
    existing[language] = {};
  }

  const langTranslations = existing[language] as Record<string, unknown>;
  Object.assign(langTranslations, translations);

  return await updateTenantLocalization(tenantId, {
    customTranslations: existing,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultLocalization(): LocalizationConfig {
  return {
    defaultLanguage: "nl",
    supportedLanguages: ["nl", "en"],
    defaultCurrency: "EUR",
    supportedCurrencies: ["EUR"],
    defaultTimezone: "Europe/Amsterdam",
    dateFormat: "dd-MM-yyyy",
    timeFormat: "HH:mm",
    numberFormat: "nl-NL",
    customTranslations: {},
    currencyExchangeRates: {
      EUR: 1.0,
      USD: 1.1,
      GBP: 0.86,
    },
  };
}
