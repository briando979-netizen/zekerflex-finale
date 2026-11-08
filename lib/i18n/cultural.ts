type CulturalConfig = {
  colorScheme: "light" | "dark";
  imageAssets: string;
  contentVariant: string;
  holidays: Date[];
};

const CULTURAL_MAP: Record<string, CulturalConfig> = {
  nl: {
    colorScheme: "light",
    imageAssets: "eu-light",
    contentVariant: "eu",
    holidays: [new Date("2026-12-25"), new Date("2026-01-01")],
  },
  uk: {
    colorScheme: "light",
    imageAssets: "eu-light",
    contentVariant: "ua",
    holidays: [new Date("2026-12-25"), new Date("2026-01-01"), new Date("2026-05-09")],
  },
  ro: {
    colorScheme: "light",
    imageAssets: "eu-light",
    contentVariant: "eu",
    holidays: [new Date("2026-12-25"), new Date("2026-01-01"), new Date("2026-01-02")],
  },
  pl: {
    colorScheme: "light",
    imageAssets: "eu-light",
    contentVariant: "eu",
    holidays: [new Date("2026-12-25"), new Date("2026-01-01")],
  },
};

export function getCulturalConfig(lang: string): CulturalConfig {
  return CULTURAL_MAP[lang] || CULTURAL_MAP["nl"];
}

export function getImagePath(lang: string, filename: string): string {
  const cfg = getCulturalConfig(lang);
  return `/images/${cfg.imageAssets}/${filename}`;
}

export function isHoliday(date: Date, lang: string): boolean {
  const cfg = getCulturalConfig(lang);
  return cfg.holidays.some(h => h.toDateString() === date.toDateString());
}
