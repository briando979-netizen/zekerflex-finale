// GEGENEREERD door scripts/talen-motor.mjs: niet met de hand aanpassen. Verbeteringen horen in lib/i18n/overrides/<taal>.ts.
// inhoud-hash: 626d38267f328636dc7af4030f4c865d480ace49282114568aab6674dec5a196
import type { SiteVertaling } from "@/lib/i18n/site";

export type SiteLader = () => Promise<{ vertaling: SiteVertaling }>;

/** Per taal een eigen stuk; alleen de server laadt ze (lib/i18n/site-lader.ts). */
export const SITE_LADERS: Readonly<Record<string, SiteLader>> = {
  "bg": () => import("./site.bg"),
  "cs": () => import("./site.cs"),
  "de": () => import("./site.de"),
  "el": () => import("./site.el"),
  "en": () => import("./site.en"),
  "es": () => import("./site.es"),
  "fr": () => import("./site.fr"),
  "hr": () => import("./site.hr"),
  "hu": () => import("./site.hu"),
  "it": () => import("./site.it"),
  "lt": () => import("./site.lt"),
  "lv": () => import("./site.lv"),
  "pl": () => import("./site.pl"),
  "pt": () => import("./site.pt"),
  "ro": () => import("./site.ro"),
  "ru": () => import("./site.ru"),
  "sk": () => import("./site.sk"),
  "tr": () => import("./site.tr"),
  "uk": () => import("./site.uk"),
};
