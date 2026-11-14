// ---------------------------------------------------------------------------
// Eigenaar-taak (14 nov 2026): twee functies draaien al, maar alleen tellend (droog), tot de eigenaar ja zegt:
//   - klussen na afloop afronden (vlag klussen-verlopen-sluiten, lib/shifts/verlopen.ts; stand in KV meting:klussen-verlopen)
//   - terugkaatsers verwerken (vlag mail-bounce-verwerken, lib/mail/bounce-ronde.ts; stand in KV meting:mail-bounces)
// De taak legt het besluit met de laatste droge telling bij de eigenaar, zegt in één zin wat aanzetten doet, en wijst naar
// Beheer → Systeem → tab Functies aan en uit. Per functie een vinkje zodra de vlag aan staat; de taak zelf is af als beide
// aan staan. Puur: alleen aantallen en data, nooit een klus, adres of naam. Een leesfout van een vlag (undefined) laat die
// functie weg; staan beide op undefined, dan geen taak (niets vals tonen).
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import type { VerlopenMeting } from "@/lib/shifts/verlopen";
import type { BounceMeting } from "@/lib/mail/bounce-ronde";

export interface FunctieStand<M> {
  /** de vlag; undefined = niet kunnen lezen */
  aan: boolean | undefined;
  /** de laatste (droge of echte) telling uit KV; null = nog nooit gemeten of niet kunnen lezen */
  meting: M | null;
}

export interface BesluitenStand {
  verlopen: FunctieStand<VerlopenMeting>;
  bounces: FunctieStand<BounceMeting>;
}

interface Regel {
  aan: boolean;
  label: string;
  tekst: string;
}

const datum = (at: string) => new Date(at).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" });
const n = (x: number, een: string, meer: string) => `${x} ${x === 1 ? een : meer}`;

function verlopenRegel(s: FunctieStand<VerlopenMeting>): Regel | null {
  if (s.aan === undefined) return null;
  const m = s.meting;
  const telling = m
    ? `Laatste telling (${datum(m.at)}${m.droog ? ", droog" : ""}): ${n(m.gevonden, "klus", "klussen")} na afloop met iemand erop ${m.droog ? "zou" : "ging"} naar Afgerond; ${n(m.zonderInschrijving, "klus", "klussen")} zonder inschrijving ${m.zonderInschrijving === 1 ? "blijft" : "blijven"} bewust open (onvervulde vraag).`
    : "Nog geen telling: de nachtelijke taak (03:20 UTC) heeft nog niet gedraaid.";
  return {
    aan: s.aan,
    label: "Klussen na afloop vanzelf afronden",
    tekst: `${telling} Aanzetten doet: elke nacht gaat een klus waarvan de eindtijd meer dan twee uur voorbij is en waar nog iemand op staat naar Afgerond, zonder mail of push. Vlag: klussen-verlopen-sluiten.`,
  };
}

function bouncesRegel(s: FunctieStand<BounceMeting>): Regel | null {
  if (s.aan === undefined) return null;
  const m = s.meting;
  const telling = m
    ? `Laatste telling (${datum(m.at)}${m.droog ? ", droog" : ""}, laatste 30 dagen): ${n(m.venster.hard, "harde terugkaatser", "harde terugkaatsers")} (adres bestaat niet), ${n(m.venster.beleid, "weigering", "weigeringen")} door een provider (SPF, DKIM, DMARC, spam), ${n(m.venster.zacht, "zachte", "zachte")} (postbus vol, tijdelijk).`
    : "Nog geen telling: de uurlijkse ronde heeft nog niet gedraaid.";
  return {
    aan: s.aan,
    label: "Terugkaatsers (bounces) verwerken",
    tekst: `${telling} Aanzetten doet: een hard adres krijgt een merk (geen outreach, nieuwsbrief of herinnering meer; verificatie en beveiliging gaan altijd door); is het van een lead, dan komt het ook op de onderdrukkingslijst en gaat de lead op teruggekaatst. Bij een weigering door een provider krijg je één melding per provider. Vlag: mail-bounce-verwerken.`,
  };
}

/** De taak bij de stand van beide functies; null als geen van beide vlaggen te lezen was. */
export function functiesWachtenTodo(s: BesluitenStand): OwnerTodo | null {
  const regels = [verlopenRegel(s.verlopen), bouncesRegel(s.bounces)].filter((r): r is Regel => r !== null);
  if (regels.length === 0) return null;
  const uit = regels.filter((r) => !r.aan);
  const klaar = uit.length === 0;
  const title =
    uit.length >= 2
      ? "Twee functies wachten op jouw ja: ze tellen al, maar veranderen nog niets"
      : uit.length === 1
        ? `Eén functie wacht op jouw ja: ${uit[0]!.label.toLowerCase()}`
        : regels.length === 1
          ? `${regels[0]!.label}: staat aan`
          : "Twee functies die op jouw ja wachtten staan aan";
  return {
    id: "functies-wachten-op-ja",
    group: "Beheer & veiligheid",
    title,
    why: "Deze functies zijn gebouwd en draaien al elke dag, maar alleen tellend: zolang de vlag uit staat veranderen ze niets. De telling hieronder laat zien wat aanzetten de eerste keer zou doen. Het is jouw besluit; uit zetten kan daarna altijd, zonder uitrol.",
    how: [
      ...regels.map((r) => `${r.aan ? "✓ aan" : "○ uit"} · ${r.label}. ${r.tekst}`),
      "Aanzetten: Beheer → Systeem → tab Functies aan en uit, de vlag met die naam aan. De eerstvolgende run doet het dan echt; de telling in deze taak laat daarna zien wat er gebeurde.",
      "Per functie staat hier een vinkje zodra de vlag aan staat; deze taak vinkt zichzelf af zodra beide aan staan.",
    ],
    auto: true,
    done: klaar,
    ...(klaar ? { doneNote: regels.length === 2 ? "beide vlaggen staan aan" : "de vlag staat aan" } : {}),
  };
}
