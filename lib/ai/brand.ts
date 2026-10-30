// ---------------------------------------------------------------------------
// Merknaam-correctie op modeluitvoer. Kleine/lokale modellen verbasteren de
// Nederlandse merknaam "ZekerFlex" fonetisch tot "SeekerFlex", "Seeker Flex",
// "Zeker Flex", "ZekerFlecks", enz. Een systeemprompt-instructie houdt dat niet
// tegen bij zwakke modellen, dus normaliseren we het deterministisch in de
// uitvoer. Idempotent: de correcte "ZekerFlex" blijft "ZekerFlex".
// ---------------------------------------------------------------------------

const BRAND_DRIFT = /\b[sz]ee?ker[ \t-]?fle(?:x|cks|ck|ks)\b/gi;

/** Rewrite any drifted spelling of the brand to exactly "ZekerFlex". */
export function fixBrandName(text: string): string {
  return text ? text.replace(BRAND_DRIFT, "ZekerFlex") : text;
}
