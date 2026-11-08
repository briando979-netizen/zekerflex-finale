import { readFile } from "fs/promises";
import { join } from "path";

const CACHE: Record<string, Record<string, string>> = {};

export async function loadTranslations(lang: string): Promise<Record<string, string>> {
  if (CACHE[lang]) return CACHE[lang];

  try {
    const path = join(process.cwd(), "messages", `${lang}.json`);
    const data = await readFile(path, "utf-8");
    CACHE[lang] = JSON.parse(data);
    return CACHE[lang];
  } catch {
    console.error(`Translation file not found: ${lang}`);
    return CACHE["nl"] || {};
  }
}

export function t(key: string, translations: Record<string, string>, fallback?: string): string {
  return translations[key] ?? fallback ?? key;
}

export async function translateObject<T extends Record<string, any>>(
  obj: T,
  keys: (keyof T)[],
  lang: string
): Promise<T> {
  const translations = await loadTranslations(lang);
  const result = { ...obj };

  for (const key of keys) {
    if (typeof result[key] === "string") {
      result[key] = t(result[key] as string, translations) as T[Extract<keyof T, string>];
    }
  }

  return result;
}
