import { amsterdamClock, amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import type { Afspraak } from "@/lib/afspraken/model";
import { afsprakenTussen, leesInstellingen } from "@/lib/afspraken/store";

// ---------------------------------------------------------------------------
// De meldingenbel van de opdrachtgever (lib/notifications/feed.ts) kent een online geboekte afspraak. Net als de rest van
// de bel is dit afgeleid uit de gegevens, zonder eigen opslag: een online boeking van de laatste 3 dagen die nog moet
// plaatsvinden en niet geannuleerd is. Wegklikken (gelezen) gaat zoals bij elke andere melding. In de tekst staan nooit
// de naam of de contactgegevens van de klant; die staan op de afsprakenpagina.
// ---------------------------------------------------------------------------

export interface AfspraakBelItem {
  id: string;
  kind: "shift";
  title: string;
  body: string;
  href: string;
  at: string;
  urgent: false;
}

/** Hoe lang een nieuwe online boeking in de bel blijft staan. */
export const BEL_DAGEN = 3;
/** Hoever vooruit er gekeken wordt naar afspraken (elke dag is één opvraging in de opslag). */
const VOORUIT_DAGEN = 14;
const MAX_ITEMS = 8;
const DAG_MS = 86_400_000;

const WEEKDAG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAAND = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "donderdag 12 november" in Nederlandse tijd, op elke server hetzelfde. */
function dagLang(d: Date): string {
  const p = amsterdamParts(d);
  return `${WEEKDAG[p.weekday] ?? ""} ${p.day} ${MAAND[p.month - 1] ?? ""}`;
}

/** Puur: de belmeldingen voor deze afspraken, de nieuwste eerst. */
export function afsprakenBelItems(afspraken: Afspraak[], nu: Date): AfspraakBelItem[] {
  return afspraken
    .filter((a) => a.bron === "online" && a.status === "bevestigd" && nu.getTime() - new Date(a.gemaaktOp).getTime() < BEL_DAGEN * DAG_MS && new Date(a.eind).getTime() > nu.getTime())
    .sort((a, b) => b.gemaaktOp.localeCompare(a.gemaaktOp))
    .slice(0, MAX_ITEMS)
    .map((a) => {
      const start = new Date(a.start);
      return {
        id: `afspraak:${a.id}`,
        kind: "shift" as const,
        title: "Nieuwe afspraak",
        body: `${a.dienstNaam} op ${dagLang(start)} om ${amsterdamClock(start)}`,
        href: "/werkgever/afspraken",
        at: a.gemaaktOp,
        urgent: false as const,
      };
    });
}

/** De nieuwe online afspraken van een organisatie voor de bel. Een organisatie zonder actieve boekpagina kost één opvraging. */
export async function afsprakenBelVoor(tenantId: string, nu: Date): Promise<AfspraakBelItem[]> {
  const instellingen = await leesInstellingen(tenantId);
  if (!instellingen?.actief) return [];
  const lijst = await afsprakenTussen(tenantId, amsterdamDayKey(nu), amsterdamDayKey(new Date(nu.getTime() + VOORUIT_DAGEN * DAG_MS)));
  return afsprakenBelItems(lijst, nu);
}
