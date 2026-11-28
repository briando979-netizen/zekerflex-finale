// GEGENEREERD door scripts/talen-motor.mjs: niet met de hand aanpassen. Verbeteringen horen in lib/i18n/overrides/<taal>.ts.
// inhoud-hash: 8c5bc5fbe8212be26c87a9a2efe5cef7d8f0163d0affd1109b0481fc8113b1f2
import type { AuthDict } from "@/lib/i18n/auth";
import type { DomeinLader } from "@/lib/i18n/domein";

/** Per taal een eigen lazy chunk (lib/i18n/domein.ts). */
export const AUTH_LADERS: Readonly<Record<string, DomeinLader<AuthDict>>> = {
  "bg": () => import("./auth.bg"),
  "cs": () => import("./auth.cs"),
  "de": () => import("./auth.de"),
  "el": () => import("./auth.el"),
  "es": () => import("./auth.es"),
  "fr": () => import("./auth.fr"),
  "hr": () => import("./auth.hr"),
  "hu": () => import("./auth.hu"),
  "it": () => import("./auth.it"),
  "lt": () => import("./auth.lt"),
  "lv": () => import("./auth.lv"),
  "pt": () => import("./auth.pt"),
  "ru": () => import("./auth.ru"),
  "sk": () => import("./auth.sk"),
  "tr": () => import("./auth.tr"),
};
