import { kvGet, kvSet } from "@/lib/storage/kv";
import { alertOwner } from "@/lib/ops/alert";
import { flushJournal, listErrorGroups, type ErrorGroup } from "@/lib/ops/error-journal";
import { foutOpdracht, kanBouwerOplossen } from "@/lib/bouwer/fout-opdracht";
import { bouwer, bouwerGezond, bouwerIngesteld, bouwerInstellingen, bouwerLlm, type Taak, type TaakKort } from "@/lib/bouwer/werker";

// ---------------------------------------------------------------------------
// De Bouwer neemt zelf initiatief (Bouwer → instellingen → "Automatisch
// reparaties voorstellen", standaard uit). Elke 30 minuten (cron → /api/internal/
// bouwer/auto): komt een fout uit het foutenlogboek (lib/ops/error-journal.ts)
// herhaaldelijk terug en is de Bouwer vrij, dan begint hij zelf aan een
// reparatie. Staat er een met een schone controle klaar, dan krijgt de eigenaar
// één melding (push + mail). Goedkeuren blijft altijd mensenwerk.
// Grenzen: max 3 per dag, dezelfde fout pas na 7 dagen opnieuw, nooit tekst van
// bezoekers (kanBouwerOplossen), en een mislukte eigen poging ruimt hij zelf op
// zodat hij de werkkopie niet voor de eigenaar blokkeert.
// ---------------------------------------------------------------------------

export const AUTO_DOOR = "ZekerFlex (automatisch)";
export const AUTO_MAX_PER_DAG = 3;
const K_AUTO = "bouwer:auto";
const OPNIEUW_NA_MS = 7 * 24 * 60 * 60_000;
const MIN_AANTAL = 3;
const RECENT_MS = 24 * 60 * 60_000;

interface AutoStand {
  /** fout-id → wanneer de Bouwer het laatst probeerde */
  pogingen: Record<string, string>;
  dag: string;
  aantalVandaag: number;
  /** taak-ids waarover de eigenaar al een melding kreeg */
  gemeld: string[];
  /** taak-id → fout-melding, voor de tekst van de melding */
  fouten: Record<string, string>;
}

const leeg = (): AutoStand => ({ pogingen: {}, dag: "", aantalVandaag: 0, gemeld: [], fouten: {} });

/** Welke fout de Bouwer nu oppakt: een echte, terugkerende, recente fout die hij nog niet (kort geleden) probeerde. */
export function kiesFout(groepen: ErrorGroup[], pogingen: Record<string, string>, now = Date.now()): ErrorGroup | null {
  const kandidaten = groepen.filter((g) => {
    if (g.level !== "error" || !kanBouwerOplossen(g) || g.count < MIN_AANTAL) return false;
    const laatst = Date.parse(g.lastAt);
    if (!Number.isFinite(laatst) || now - laatst > RECENT_MS) return false;
    const geprobeerd = pogingen[g.id] ? Date.parse(pogingen[g.id] ?? "") : NaN;
    return !(Number.isFinite(geprobeerd) && now - geprobeerd < OPNIEUW_NA_MS);
  });
  kandidaten.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
  return kandidaten[0] ?? null;
}

const OPEN = new Set(["bezig", "klaar", "mislukt", "conflict", "goedkeuren"]);

export type AutoUitkomst = "uit" | "niet-geinstalleerd" | "offline" | "bezig" | "limiet" | "niets" | "gestart" | "fout";

export async function bouwerAutoTick(now = Date.now()): Promise<{ uitkomst: AutoUitkomst; detail?: string }> {
  const instellingen = await bouwerInstellingen();
  if (!instellingen.autoFouten) return { uitkomst: "uit" };
  if (!bouwerIngesteld()) return { uitkomst: "niet-geinstalleerd" };
  const gezond = await bouwerGezond();
  if (!gezond?.ok) return { uitkomst: "offline" };

  const stand = { ...leeg(), ...((await kvGet<AutoStand>(K_AUTO)) ?? {}) };
  const vandaag = new Date(now).toISOString().slice(0, 10);
  if (stand.dag !== vandaag) Object.assign(stand, { dag: vandaag, aantalVandaag: 0 });

  // 1) eigen open opdrachten afhandelen: klaar → melden, mislukt → opruimen
  const { taken } = await bouwer<{ bezig: string | null; taken: TaakKort[] }>("/taken");
  for (const t of taken.filter((x) => x.door === AUTO_DOOR && OPEN.has(x.staat))) {
    if (t.staat === "bezig" || t.staat === "goedkeuren") continue;
    const taak = await bouwer<Taak>(`/taken/${t.id}`);
    if (taak.staat === "klaar" && taak.controle?.ok) {
      if (!stand.gemeld.includes(taak.id)) {
        await alertOwner({
          key: `bouwer-auto:${taak.id}`,
          severity: "warning",
          title: "De Bouwer heeft een reparatie klaarstaan",
          detail: `Voor de fout "${(stand.fouten[taak.id] ?? "").slice(0, 120)}": ${taak.samenvatting.slice(0, 400)} Bekijk het voorbeeld en keur goed (of gooi weg) in ZekerFlex AI → Bouwer.`,
          url: "/admin/zekerflex-ai",
        });
        stand.gemeld = [taak.id, ...stand.gemeld].slice(0, 50);
      }
    } else {
      // niet gelukt of controle niet schoon: niets te beoordelen, werkkopie vrijgeven
      await bouwer(`/taken/${taak.id}/weggooien`, { method: "POST", body: {} }).catch(() => undefined);
    }
  }

  // 2) eventueel een nieuwe opdracht beginnen
  let uitkomst: AutoUitkomst = "niets";
  let detail: string | undefined;
  const nogOpen = (await bouwer<{ bezig: string | null; taken: TaakKort[] }>("/taken")).taken.some((x) => OPEN.has(x.staat));
  if (gezond.bezig || nogOpen) uitkomst = "bezig";
  else if (stand.aantalVandaag >= AUTO_MAX_PER_DAG) uitkomst = "limiet";
  else {
    // eerst de wachtrij van het logboek wegschrijven, anders lezen we de vorige ronde
    await flushJournal(now).catch(() => undefined);
    const fout = kiesFout(await listErrorGroups(), stand.pogingen, now);
    if (fout) {
      try {
        const taak = await bouwer<TaakKort>("/taken", { method: "POST", body: { opdracht: foutOpdracht(fout), door: AUTO_DOOR, llm: await bouwerLlm() } });
        stand.pogingen[fout.id] = new Date(now).toISOString();
        stand.fouten[taak.id] = fout.message;
        stand.aantalVandaag += 1;
        uitkomst = "gestart";
        detail = `${taak.id} voor fout ${fout.id}`;
      } catch (err) {
        uitkomst = "fout";
        detail = (err as Error).message;
      }
    }
  }

  // oude pogingen en foutteksten niet eindeloos bewaren
  for (const [id, at] of Object.entries(stand.pogingen)) if (now - Date.parse(at) > OPNIEUW_NA_MS) delete stand.pogingen[id];
  stand.fouten = Object.fromEntries(Object.entries(stand.fouten).slice(-50));
  await kvSet(K_AUTO, stand);
  return detail ? { uitkomst, detail } : { uitkomst };
}
