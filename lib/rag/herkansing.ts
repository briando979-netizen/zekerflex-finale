// ---------------------------------------------------------------------------
// Herkansing voor de RAG-index (13 nov 2026, 86). De cron rag/reindex (0 0,12) viel om 00:01 precies in een uitrol: de
// build en het eigen model namen alles, en drie indexers liepen tegen een time-out ("rag indexer failed", error). Nu: ziet
// de run dat er een uitrol loopt (bouwer:live:status, uitrolHoudtModelStil), of begint die halverwege, dan geen fout maar
// een herkansing over ±30 min (KV "rag:herkansing", opgehaald door de cron "*/15 …?herkansing=1"). Faalt ook de
// herkansing, dan één waarschuwing. Puur bestand: de route beslist met deze regels.
// ---------------------------------------------------------------------------

export const HERKANSING_KV = "rag:herkansing";
export const HERKANSING_NA_MS = 30 * 60_000;
/** hooguit zo vaak uitstellen omdat er weer een uitrol loopt; daarna gewoon draaien */
export const MAX_UITSTEL = 4;

export interface Herkansing {
  /** ISO: vanaf wanneer de herkansing mag */
  vanaf: string;
  reden: "uitrol";
  /** hoe vaak al uitgesteld */
  uitstel: number;
}

export const nieuweHerkansing = (nu: number, uitstel = 0): Herkansing => ({ vanaf: new Date(nu + HERKANSING_NA_MS).toISOString(), reden: "uitrol", uitstel });

/**
 * Wat de route doet. Gewone run: tijdens een uitrol overslaan (en een herkansing zetten), anders draaien. Herkansing:
 * alleen als er een staat en hij aan de beurt is; loopt er dan weer een uitrol, nog eens uitstellen (hooguit MAX_UITSTEL).
 */
export function besluit(i: { herkansingRun: boolean; uitrolBezig: boolean; herkansing: Herkansing | null; nu: number }): "draai" | "uitstellen" | "niets" {
  if (!i.herkansingRun) return i.uitrolBezig ? "uitstellen" : "draai";
  if (!i.herkansing) return "niets";
  if (Date.parse(i.herkansing.vanaf) > i.nu) return "niets";
  if (i.uitrolBezig && i.herkansing.uitstel < MAX_UITSTEL) return "uitstellen";
  return "draai";
}
