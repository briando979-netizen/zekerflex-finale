import Link from "next/link";
import { InfoList, Panel, Pill } from "@/components/admin/kit";
import { KvkHandmatigActie } from "@/components/admin/KvkHandmatigActie";
import { handmatigRegel, kvkNlLink, paneelStand, terugdraaiRegel, type KvkHandmatig, type KvkSoort } from "@/lib/kvk/handmatig";

// Het paneel "KVK-controle" op het scherm van een bedrijf of een werker in Beheer: de stand van de KVK-controle, wie haar met
// de hand deed (zodat het verschil met een controle via KVKBase zichtbaar blijft) en de knoppen om haar goed te keuren of terug
// te draaien (lib/kvk/handmatig.ts). Alleen intern: de werker of het bedrijf ziet hier niets van.

export function KvkControlePaneel({
  soort,
  id,
  geldig,
  kvkNumber,
  naam,
  handmatig,
}: {
  soort: KvkSoort;
  id: string;
  /** de KVK-controle is geslaagd (kvkValid bij een werker, een gekoppelde inschrijving bij een bedrijf) */
  geldig: boolean;
  /** het nummer dat de werker of het bedrijf opgaf */
  kvkNumber: string | null;
  /** een voorstel voor de naam zoals op kvk.nl */
  naam: string;
  handmatig: KvkHandmatig | null;
}) {
  const stand = paneelStand({ geldig, handmatig, huidigNummer: kvkNumber });
  const eerder = handmatig?.teruggedraaid ? terugdraaiRegel(handmatig.teruggedraaid) : null;

  return (
    <Panel
      title="KVK-controle"
      subtitle={soort === "bedrijf" ? "Zoek het nummer zelf op kvk.nl en keur het bedrijf hier goed" : "Zoek het nummer zelf op kvk.nl en keur de werker hier goed"}
      actions={
        <Link href="/admin/kvk-controle" className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>
          Alle wachtende controles →
        </Link>
      }
    >
      {stand === "handmatig" && handmatig ? (
        <div className="space-y-3">
          <Pill tone="trust">Handmatig gecontroleerd</Pill>
          <p className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>{handmatigRegel(handmatig)}</p>
          <InfoList
            rows={[
              { label: "KVK-nummer", value: handmatig.kvkNumber },
              { label: "Naam op kvk.nl", value: handmatig.naam },
              { label: "Reden", value: handmatig.notitie },
            ]}
          />
          <KvkHandmatigActie soort={soort} id={id} actie="terugdraaien" />
        </div>
      ) : stand === "automatisch" ? (
        <div className="space-y-2">
          <Pill tone="ok">KVK gecontroleerd</Pill>
          <p className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            De controle bij de KVK is geslaagd; er hoeft niets met de hand.
            {soort === "bedrijf" ? " Hoort de aanmelder aantoonbaar bij het bedrijf? Zo niet, gebruik dan “Bedrijf goedkeuren” bovenaan." : ""}
          </p>
          {eerder && <p className="text-xs" style={{ color: "var(--a-mute)" }}>Eerder met de hand goedgekeurd. {eerder}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <Pill tone="warn">Nog niet gecontroleerd</Pill>
          <p className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            {kvkNumber ? (
              <>
                Opgegeven nummer: <span className="font-mono">{kvkNumber}</span>.{" "}
                <a href={kvkNlLink(kvkNumber)} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--a-accent-ink)" }}>
                  Zoek het op kvk.nl
                </a>
                .
              </>
            ) : soort === "werker" ? (
              "Deze werker heeft nog geen KVK-nummer van 8 cijfers ingevuld. Laat het eerst invullen (Verificatie in de werker-app); dan kun je het hier goedkeuren."
            ) : (
              "Er is nog geen KVK-nummer opgegeven. Heb je het nummer van het bedrijf zelf gekregen? Zoek het dan op kvk.nl en vul het hieronder in."
            )}
          </p>
          {eerder && <p className="text-xs" style={{ color: "var(--a-mute)" }}>Eerder met de hand goedgekeurd. {eerder}</p>}
          {(soort === "bedrijf" || kvkNumber) && <KvkHandmatigActie soort={soort} id={id} actie="goedkeuren" kvkNumber={kvkNumber} naam={naam} />}
        </div>
      )}
    </Panel>
  );
}
