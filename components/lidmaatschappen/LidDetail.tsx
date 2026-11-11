"use client";

import { useCallback, useEffect, useState } from "react";
import { SOORT_NAAM, bezoekBlokkade, effectieveStatus, euroTekst, nlDag, tegoed, type Bezoek, type EffectieveStatus, type Lid, type Lidmaatschap, type Vorm } from "@/lib/lidmaatschappen/model";
import { LidFormulier } from "@/components/lidmaatschappen/LidFormulier";
import { leesFout } from "@/components/voorraad/fout";

// Alles van één lid: gegevens, lidmaatschappen (pauzeren, hervatten, beëindigen), bezoek registreren, het logboek en
// het wissen van de persoonsgegevens.

const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";
const STATUS_TEKST: Record<EffectieveStatus, string> = { actief: "Actief", gepauzeerd: "Gepauzeerd", beeindigd: "Beëindigd", afgelopen: "Afgelopen" };
const STATUS_PIL: Record<EffectieveStatus, string> = { actief: "pill-ok", gepauzeerd: "pill-warn", beeindigd: "pill-neutral", afgelopen: "pill-neutral" };

/** Een tijdstip als "12 nov 2026, 07:05" in Nederlandse tijd (dezelfde tekst op server en telefoon). */
const tijdTekst = (iso: string): string => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

async function stuur(method: "POST" | "PATCH", body: unknown, standaard: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; fout: string }> {
  try {
    const res = await fetch("/api/werkgever/lidmaatschappen", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, fout: await leesFout(res, standaard) };
    return { ok: true, data: (await res.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, fout: `${standaard} Controleer je verbinding.` };
  }
}

export function LidDetail({
  lid,
  lidmaatschappen,
  vormen,
  vandaag,
  vervangLid,
  vervangLm,
}: {
  lid: Lid;
  lidmaatschappen: Lidmaatschap[];
  vormen: Vorm[];
  vandaag: string;
  vervangLid: (l: Lid) => void;
  vervangLm: (m: Lidmaatschap) => void;
}) {
  const [bezoeken, setBezoeken] = useState<Bezoek[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState(false);
  const [nieuwLm, setNieuwLm] = useState(false);
  const [vormId, setVormId] = useState("");
  const [start, setStart] = useState(vandaag);
  const [kies, setKies] = useState("");
  const [eindeVoor, setEindeVoor] = useState<string | null>(null);
  const [eindReden, setEindReden] = useState("");
  const [wisVraag, setWisVraag] = useState(false);
  const [bezig, setBezig] = useState(false);

  const laadLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/werkgever/lidmaatschappen?lid=${lid.id}`, { cache: "no-store" });
      if (res.ok) setBezoeken(((await res.json()) as { bezoeken: Bezoek[] }).bezoeken);
      else setFout(await leesFout(res, "Het logboek kon niet worden geladen."));
    } catch {
      setFout("Het logboek kon niet worden geladen. Controleer je verbinding.");
    }
  }, [lid.id]);

  useEffect(() => {
    void laadLog();
  }, [laadLog]);

  const lmNaam = (id: string | null) => lidmaatschappen.find((l) => l.id === id)?.vormNaam ?? "";
  const bruikbaar = lidmaatschappen.filter((l) => bezoekBlokkade(l, vandaag) === null);
  const actieveVormen = vormen.filter((v) => !v.gearchiveerd);

  async function bezoek() {
    setFout(null);
    setMelding(null);
    setBezig(true);
    const r = await stuur("POST", { type: "bezoek", lidId: lid.id, ...(kies ? { lidmaatschapId: kies } : {}) }, "Het bezoek is niet geregistreerd.");
    setBezig(false);
    if (!r.ok) return setFout(r.fout);
    vervangLid(r.data.lid as Lid);
    vervangLm(r.data.lidmaatschap as Lidmaatschap);
    setBezoeken((b) => [r.data.bezoek as Bezoek, ...(b ?? [])].slice(0, 100));
    const t = tegoed(r.data.lidmaatschap as Lidmaatschap);
    setMelding(t === null ? "Bezoek geregistreerd." : `Bezoek geregistreerd. Er ${t === 1 ? "staat nog 1 bezoek" : `staan nog ${t} bezoeken`} op de kaart.`);
  }

  async function wijzig(lm: Lidmaatschap, actie: "pauzeren" | "hervatten" | "beeindigen") {
    setFout(null);
    setMelding(null);
    const r = await stuur("PATCH", { type: "lidmaatschap", id: lm.id, actie, ...(actie === "beeindigen" ? { reden: eindReden } : {}) }, "De wijziging is niet gelukt.");
    if (!r.ok) return setFout(r.fout);
    vervangLm(r.data.lidmaatschap as Lidmaatschap);
    if (actie === "beeindigen") {
      setEindeVoor(null);
      setEindReden("");
    }
  }

  async function sluitAf(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setBezig(true);
    const r = await stuur("POST", { type: "lidmaatschap", lidId: lid.id, vormId, startdatum: start }, "Het lidmaatschap kon niet worden afgesloten.");
    setBezig(false);
    if (!r.ok) return setFout(r.fout);
    vervangLm(r.data.lidmaatschap as Lidmaatschap);
    setNieuwLm(false);
  }

  async function wis() {
    setFout(null);
    const r = await stuur("PATCH", { type: "lid", id: lid.id, actie: "wissen" }, "Het wissen is niet gelukt.");
    if (!r.ok) return setFout(r.fout);
    vervangLid(r.data.lid as Lid);
    setWisVraag(false);
  }

  return (
    <div className="mt-3 space-y-4 border-t border-hair pt-3">
      {fout && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
          {fout}
        </p>
      )}
      {melding && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {melding}
        </p>
      )}

      {!lid.gewist && (
        <section aria-label="Gegevens" className="space-y-2">
          {bewerk ? (
            <LidFormulier
              begin={lid}
              opgeslagen={(l) => {
                vervangLid(l);
                setBewerk(false);
              }}
              annuleer={() => setBewerk(false)}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-2 text-sm text-neutralx-600">
              <div>
                {lid.telefoon && <p>Telefoon: {lid.telefoon}</p>}
                {lid.email && <p>E-mail: {lid.email}</p>}
                {lid.notitie && <p>Notitie: {lid.notitie}</p>}
                <p className="text-xs text-neutralx-500">Laatst gezien: {lid.laatstGezien ? tijdTekst(lid.laatstGezien) : "nog niet"}</p>
              </div>
              <button type="button" className={knopKlein} onClick={() => setBewerk(true)}>
                Gegevens bewerken
              </button>
            </div>
          )}
        </section>
      )}
      {lid.gewist && <p className="text-sm text-neutralx-600">De persoonsgegevens van dit lid zijn gewist{lid.gewistOp ? ` op ${tijdTekst(lid.gewistOp)}` : ""}. De lidmaatschappen en bezoeken blijven als anonieme regels staan voor de cijfers.</p>}

      <section aria-label="Lidmaatschappen" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-ink">Lidmaatschappen</h3>
          {!lid.gewist && (
            <button type="button" className={knopKlein} onClick={() => setNieuwLm((v) => !v)}>
              {nieuwLm ? "Sluiten" : "Lidmaatschap toevoegen"}
            </button>
          )}
        </div>
        {nieuwLm && (
          <form onSubmit={(e) => void sluitAf(e)} className="grid gap-3 rounded-lg border border-hair p-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`lm-vorm-${lid.id}`} className="field-label">
                Vorm
              </label>
              <select id={`lm-vorm-${lid.id}`} className="field-input" value={vormId} required onChange={(e) => setVormId(e.target.value)}>
                <option value="">Kies een vorm</option>
                {actieveVormen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.naam} ({SOORT_NAAM[v.soort]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`lm-start-${lid.id}`} className="field-label">
                Startdatum
              </label>
              <input id={`lm-start-${lid.id}`} type="date" className="field-input" value={start} max={vandaag} required onChange={(e) => setStart(e.target.value)} />
            </div>
            <p className="text-xs text-neutralx-500 sm:col-span-2">Prijs en voorwaarden staan vast op het moment van afsluiten. Inschrijfgeld en betaling regel je zelf buiten ZekerFlex.</p>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={bezig}>
                Sluit lidmaatschap af
              </button>
            </div>
          </form>
        )}
        {lidmaatschappen.length === 0 ? (
          <p className="text-sm text-neutralx-600">Dit lid heeft nog geen lidmaatschap.</p>
        ) : (
          <ul className="space-y-2">
            {[...lidmaatschappen]
              .sort((a, b) => b.startdatum.localeCompare(a.startdatum) || b.id.localeCompare(a.id))
              .map((lm) => {
                const s = effectieveStatus(lm, vandaag);
                const t = tegoed(lm);
                return (
                  <li key={lm.id} className="rounded-lg border border-hair p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{lm.vormNaam}</span>
                      <span className={STATUS_PIL[s]}>{STATUS_TEKST[s]}</span>
                      {t !== null && <span className="text-neutralx-600">{t === 1 ? "1 bezoek over" : `${t} van ${lm.strippenBegin ?? 0} bezoeken over`}</span>}
                    </div>
                    <p className="mt-1 text-xs text-neutralx-500">
                      Vanaf {nlDag(lm.startdatum)}
                      {lm.einddatum ? (lm.status === "beeindigd" ? `, beëindigd op ${nlDag(lm.einddatum)}` : t !== null ? `, geldig t/m ${nlDag(lm.einddatum)}` : `, t/m ${nlDag(lm.einddatum)}`) : ", doorlopend"}
                      {t === null && lm.prijsCent > 0 ? `, ${euroTekst(lm.prijsCent)} per ${lm.soort}` : ""}
                      {lm.status === "gepauzeerd" && lm.pauzeSinds ? `, gepauzeerd sinds ${nlDag(lm.pauzeSinds)}` : ""}
                      {lm.status === "beeindigd" && lm.eindReden ? `, reden: ${lm.eindReden}` : ""}
                    </p>
                    {lm.status !== "beeindigd" && !lid.gewist && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {lm.status === "actief" ? (
                          <button type="button" className={knopKlein} onClick={() => void wijzig(lm, "pauzeren")}>
                            Pauzeren
                          </button>
                        ) : (
                          <button type="button" className={knopKlein} onClick={() => void wijzig(lm, "hervatten")}>
                            Hervatten
                          </button>
                        )}
                        <button type="button" className={knopKlein} onClick={() => setEindeVoor(eindeVoor === lm.id ? null : lm.id)}>
                          Beëindigen
                        </button>
                      </div>
                    )}
                    {eindeVoor === lm.id && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="min-w-48 flex-1">
                          <label htmlFor={`lm-reden-${lm.id}`} className="field-label">
                            Reden van het einde
                          </label>
                          <input id={`lm-reden-${lm.id}`} className="field-input" value={eindReden} maxLength={200} onChange={(e) => setEindReden(e.target.value)} />
                        </div>
                        <button type="button" className="btn-primary" onClick={() => void wijzig(lm, "beeindigen")}>
                          Beëindig vandaag
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {!lid.gewist && (
        <section aria-label="Bezoek registreren" className="space-y-2">
          <h3 className="font-display text-sm font-bold text-ink">Bezoek registreren</h3>
          <div className="flex flex-wrap items-end gap-2">
            {bruikbaar.length > 1 && (
              <div>
                <label htmlFor={`bz-lm-${lid.id}`} className="field-label">
                  Telt voor
                </label>
                <select id={`bz-lm-${lid.id}`} className="field-input" value={kies} onChange={(e) => setKies(e.target.value)}>
                  <option value="">Automatisch (abonnement gaat voor)</option>
                  {bruikbaar.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.vormNaam}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" className="btn-primary" disabled={bezig} onClick={() => void bezoek()}>
              Lid is er
            </button>
          </div>
          <p className="text-xs text-neutralx-500">Het tijdstip is dat van de server. Bij een strippenkaart gaat er één bezoek af; is de kaart op, dan wordt het bezoek geweigerd.</p>
        </section>
      )}

      <section aria-label="Logboek" className="space-y-1">
        <h3 className="font-display text-sm font-bold text-ink">Laatste bezoeken</h3>
        {bezoeken === null ? (
          <p className="text-sm text-neutralx-500">Laden…</p>
        ) : bezoeken.length === 0 ? (
          <p className="text-sm text-neutralx-600">Nog geen bezoeken.</p>
        ) : (
          <ul className="max-h-60 space-y-0.5 overflow-y-auto text-sm text-neutralx-600">
            {bezoeken.map((b) => (
              <li key={b.id}>
                {tijdTekst(b.op)}
                {lmNaam(b.lidmaatschapId) ? `, ${lmNaam(b.lidmaatschapId)}` : ""}
                {b.strip ? ", 1 strip af" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!lid.gewist && (
        <section aria-label="Gegevens wissen" className="rounded-lg border border-hair p-3">
          <h3 className="font-display text-sm font-bold text-ink">Gegevens wissen</h3>
          <p className="mt-1 text-xs text-neutralx-600">
            De gegevens van een lid zijn gegevens van een derde. Wissen haalt naam, telefoonnummer, e-mailadres en notitie definitief weg. Het lidnummer, de lidmaatschappen en de bezoekregels blijven als anonieme regels bestaan, zodat je cijfers kloppen. Dit kun je niet ongedaan maken. Beëindigde leden worden na twee jaar zonder activiteit ook gewist.
          </p>
          {wisVraag ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void wis()}>
                Ja, wis de gegevens
              </button>
              <button type="button" className={knopKlein} onClick={() => setWisVraag(false)}>
                Toch niet
              </button>
            </div>
          ) : (
            <button type="button" className={`${knopKlein} mt-2`} onClick={() => setWisVraag(true)}>
              Gegevens wissen
            </button>
          )}
        </section>
      )}
    </div>
  );
}
