// GEGENEREERD door scripts/talen-motor.mjs: niet met de hand aanpassen. Verbeteringen horen in lib/i18n/overrides/<taal>.ts.
// inhoud-hash: 4ce943c145e52a3bc94a2caea7c4865da175dc2ea93fe85c7ad137b189468294
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import type { DiepDeels } from "@/lib/i18n/talen-motor";

export type GenLader = () => Promise<{ dict: DiepDeels<FreelancerDict> }>;

/** Per taal een eigen lazy chunk. */
export const GEN_LADERS: Readonly<Record<string, GenLader>> = {
};
