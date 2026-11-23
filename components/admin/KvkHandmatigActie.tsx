"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MIN_REDEN, controleerGoedkeuring, controleerTerugdraaien, kvkNlLink, type KvkSoort } from "@/lib/kvk/handmatig";

// Beheer: een KVK-controle met de hand goedkeuren of terugdraaien (lib/kvk/handmatig.ts). De beheerder zoekt het nummer zelf
// op kvk.nl (gratis), vult nummer, naam en een reden in, en bevestigt dat hij het zag. Er wordt niets bij KVKBase opgevraagd.
// De teruggegeven versie komt van de server (router.refresh), nooit een veld dat hier lokaal wordt bijgewerkt.

interface Props {
  soort: KvkSoort;
  /** userId bij een werker, tenantId bij een bedrijf */
  id: string;
  actie: "goedkeuren" | "terugdraaien";
  /** het nummer dat de werker of het bedrijf opgaf: staat al ingevuld */
  kvkNumber?: string | null | undefined;
  /** een voorstel voor de naam; de beheerder past hem aan naar wat er op kvk.nl staat */
  naam?: string | undefined;
}

export function KvkHandmatigActie({ soort, id, actie, kvkNumber, naam }: Props) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [nummer, setNummer] = useState(kvkNumber ?? "");
  const [naamVeld, setNaamVeld] = useState(naam ?? "");
  const [reden, setReden] = useState("");
  const [bevestigd, setBevestigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur() {
    const controle = actie === "goedkeuren" ? controleerGoedkeuring({ kvkNumber: nummer, naam: naamVeld, notitie: reden, bevestigd }) : controleerTerugdraaien(reden);
    if (!controle.ok) {
      setFout(controle.fout);
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/admin/kvk-handmatig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          actie === "goedkeuren"
            ? { actie, soort, id, kvkNumber: nummer, naam: naamVeld, notitie: reden, bevestigd }
            : { actie, soort, id, reden },
        ),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFout(d?.error?.message ?? "Opslaan mislukt.");
        return;
      }
      setOpen(false);
      setReden("");
      setBevestigd(false);
      router.refresh();
    } catch {
      setFout("Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const goedkeuren = actie === "goedkeuren";

  if (!open) {
    return (
      <button type="button" className="a-button text-xs" aria-expanded={false} onClick={() => setOpen(true)}>
        {goedkeuren ? "Goedkeuren met de hand" : "Terugdraaien"}
      </button>
    );
  }

  return (
    <form
      className="w-full space-y-3 rounded-xl p-4 text-left"
      style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void verstuur();
      }}
    >
      {goedkeuren ? (
        <>
          <p className="text-xs" style={{ color: "var(--a-dim)" }}>
            Zoek het KVK-nummer zelf op{" "}
            <a href={kvkNlLink(nummer)} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--a-accent-ink)" }}>
              kvk.nl/zoeken
            </a>{" "}
            (gratis) en kijk of de inschrijving bestaat en actief is. Er wordt niets bij KVKBase opgevraagd.{" "}
            {soort === "bedrijf"
              ? "Het bedrijf kan daarna klussen plaatsen en mensen inplannen, net als na een controle via KVKBase."
              : "De KVK-controle van de werker telt daarna als geslaagd."}
          </p>
          <label className="a-label" htmlFor={`${uid}-nummer`}>
            KVK-nummer zoals op kvk.nl (8 cijfers)
            <input id={`${uid}-nummer`} className="a-input" inputMode="numeric" autoComplete="off" maxLength={20} value={nummer} onChange={(e) => setNummer(e.target.value)} />
          </label>
          <label className="a-label" htmlFor={`${uid}-naam`}>
            Bedrijfsnaam zoals op kvk.nl
            <input id={`${uid}-naam`} className="a-input" autoComplete="off" maxLength={200} value={naamVeld} onChange={(e) => setNaamVeld(e.target.value)} />
          </label>
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--a-dim)" }}>
          {soort === "bedrijf"
            ? "De goedkeuring van het bedrijf wordt ingetrokken: het kan dan niemand meer inplannen (klussen plaatsen blijft kunnen), en de KVK-controle staat weer open."
            : "De KVK-controle van de werker staat daarna weer open en komt terug in de wacht."}
        </p>
      )}
      <label className="a-label" htmlFor={`${uid}-reden`}>
        {goedkeuren ? "Reden of notitie" : "Reden van het terugdraaien"} (minimaal {MIN_REDEN} tekens)
        <textarea
          id={`${uid}-reden`}
          className="a-input"
          rows={2}
          maxLength={500}
          value={reden}
          onChange={(e) => setReden(e.target.value)}
          placeholder={goedkeuren ? "Bijvoorbeeld: op kvk.nl gecontroleerd, eenmanszaak, actief." : "Bijvoorbeeld: nummer bleek van een ander bedrijf."}
        />
      </label>
      <p className="-mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
        De reden komt in het auditspoor. Schrijf er geen persoonsgegevens in.
      </p>
      {goedkeuren && (
        <label className="flex items-start gap-2 text-[0.8125rem]" htmlFor={`${uid}-bevestigd`} style={{ color: "var(--a-text)" }}>
          <input id={`${uid}-bevestigd`} type="checkbox" className="mt-0.5" checked={bevestigd} onChange={(e) => setBevestigd(e.target.checked)} />
          <span>Ik heb op kvk.nl gezien dat de inschrijving bestaat en actief is.</span>
        </label>
      )}
      {fout && (
        <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={bezig} className="a-button a-button-primary text-xs">
          {bezig ? "Bezig…" : goedkeuren ? "Goedkeuren" : "Terugdraaien"}
        </button>
        <button
          type="button"
          disabled={bezig}
          className="a-button text-xs"
          onClick={() => {
            setOpen(false);
            setFout(null);
          }}
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}
