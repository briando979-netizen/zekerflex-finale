// GEGENEREERD door scripts/talen-motor.mjs: niet met de hand aanpassen. Verbeteringen horen in lib/i18n/overrides/<taal>.ts.
// inhoud-hash: f970d6c82b8ce82b428b14ec11dac1e6d85ccef07b0553a166c17e85fc138b77
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import type { DiepDeels } from "@/lib/i18n/talen-motor";

export type GenLader = () => Promise<{ dict: DiepDeels<FreelancerDict> }>;

/** Per taal een eigen lazy chunk. */
export const GEN_LADERS: Readonly<Record<string, GenLader>> = {
  "bg": () => import("./freelancer.bg"),
  "cs": () => import("./freelancer.cs"),
  "de": () => import("./freelancer.de"),
  "el": () => import("./freelancer.el"),
  "es": () => import("./freelancer.es"),
  "fr": () => import("./freelancer.fr"),
  "hr": () => import("./freelancer.hr"),
  "hu": () => import("./freelancer.hu"),
  "it": () => import("./freelancer.it"),
  "lt": () => import("./freelancer.lt"),
  "lv": () => import("./freelancer.lv"),
  "pt": () => import("./freelancer.pt"),
  "ru": () => import("./freelancer.ru"),
  "sk": () => import("./freelancer.sk"),
  "tr": () => import("./freelancer.tr"),
};
