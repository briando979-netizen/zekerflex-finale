"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  aandachtLijst,
  berekenCijfers,
  euroTekst,
  filterLeden,
  lidNaam,
  lidStatus,
  perLid,
  type Lid,
  type LedenFilter,
  type Lidmaatschap,
  type Vorm,
} from "@/lib/lidmaatschappen/model";
import { LidDetail } from "@/components/lidmaatschappen/LidDetail";
import { LidFormulier } from "@/components/lidmaatschappen/LidFormulier";
import { VormenBeheer } from "@/components/lidmaatschappen/VormenBeheer";
import { leesFout } from "@/components/voorraad/fout";

// Het beheer van leden en lidmaatschappen: cijfers, wat aandacht vraagt, de ledenlijst en de vormen.
// Betalingen, incasso, facturen en herinneringen horen hier niet bij; dat staat ook zo in het scherm.

const kaart = "rounded-xl border border-hair bg-white p-4";
const STATUS_TEKST = { actief: "Actief", gepauzeerd: "Gepauzeerd", beeindigd: "Beëindigd", zonder: "Geen lidmaatschap" } as const;
const STATUS_PIL = { actief: "pill-ok", gepauzeerd: "pill-warn", beeindigd: "pill-neutral", zonder: "pill-neutral" } as const;

interface Gegevens {
  vandaag: string;
  vormen: Vorm[];
  leden: Lid[];
  lidmaatschappen: Lidmaatschap[];
}

export function LidmaatschappenBeheer() {
  const [data, setData] = useState<Gegevens | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [tab, setTab] = useState<"leden" | "vormen">("leden");
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<LedenFilter>("alle");
  const [open, setOpen] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/werkgever/lidmaatschappen", { cache: "no-store" });
      if (!res.ok) {
        setFout(await leesFout(res, "De leden konden niet worden geladen. Vernieuw de pagina."));
        return;
      }
      setData((await res.json()) as Gegevens);
    } catch {
      setFout("De leden konden niet worden geladen. Controleer je verbinding.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  /** Na een wijziging nemen we de teruggegeven versie van de server over, niet een lokaal bijgewerkt veld. */
  const vervangLid = useCallback((l: Lid) => setData((d) => (d ? { ...d, leden: d.leden.some((x) => x.id === l.id) ? d.leden.map((x) => (x.id === l.id ? l : x)) : [...d.leden, l] } : d)), []);
  const vervangLm = useCallback((m: Lidmaatschap) => setData((d) => (d ? { ...d, lidmaatschappen: d.lidmaatschappen.some((x) => x.id === m.id) ? d.lidmaatschappen.map((x) => (x.id === m.id ? m : x)) : [...d.lidmaatschappen, m] } : d)), []);
  const vervangVorm = useCallback((v: Vorm) => setData((d) => (d ? { ...d, vormen: d.vormen.some((x) => x.id === v.id) ? d.vormen.map((x) => (x.id === v.id ? v : x)) : [...d.vormen, v] } : d)), []);

  const vandaag = data?.vandaag ?? "1970-01-01";
  const zichtbaar = useMemo(() => (data ? filterLeden(data.leden, data.lidmaatschappen, { zoek, filter }, vandaag) : []), [data, zoek, filter, vandaag]);
  const groepen = useMemo(() => perLid(data?.lidmaatschappen ?? []), [data]);
  const cijfers = useMemo(() => (data ? berekenCijfers(data.leden, data.lidmaatschappen, vandaag) : null), [data, vandaag]);
  const aandacht = useMemo(() => (data ? aandachtLijst(data.leden, data.lidmaatschappen, vandaag) : []), [data, vandaag]);

  if (!data || !cijfers) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  return (
    <div className="space-y-4">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Actieve leden</p>
          <p className="mt-1 text-2xl font-bold text-ink">{cijfers.actieveLeden}</p>
          {cijfers.gepauzeerdeLeden > 0 && <p className="mt-1 text-xs text-neutralx-600">Daarnaast {cijfers.gepauzeerdeLeden} gepauzeerd.</p>}
        </div>
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Verwachte omzet per maand</p>
          <p className="mt-1 text-2xl font-bold text-ink">{euroTekst(cijfers.omzetPerMaandCent)}</p>
          <p className="mt-1 text-xs text-neutralx-600">Een schatting en geen boekhouding: lopende abonnementen omgerekend naar een maand (week × 52 ÷ 12, jaar ÷ 12), incl. btw. Strippenkaarten en inschrijfgeld tellen niet mee.</p>
        </div>
        <div className={kaart}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Vraagt aandacht</p>
          <p className="mt-1 text-2xl font-bold text-ink">{aandacht.length}</p>
        </div>
      </div>

      <p className="rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-600">
        Betalingen en incasso loop je nog buiten ZekerFlex. Hier houd je alleen bij wie er lid is, van welke vorm, en wanneer iemand komt. Er worden geen facturen of herinneringen verstuurd.
      </p>

      {aandacht.length > 0 && (
        <section aria-labelledby="lm-aandacht" className="rounded-xl border border-hair bg-brand-50 p-4">
          <h2 id="lm-aandacht" className="font-display text-base font-bold text-ink">
            Dit vraagt aandacht
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-neutralx-600">
            {aandacht.map((a) => (
              <li key={`${a.lidmaatschapId}-${a.soort}`}>
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => {
                    setTab("leden");
                    setOpen(a.lidId);
                  }}
                >
                  {a.tekst}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tablist" aria-label="Onderdelen" className="flex gap-2">
        {(["leden", "vormen"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "btn-primary" : "rounded-lg border border-hairstrong px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand-500"} onClick={() => setTab(t)}>
            {t === "leden" ? `Leden (${data.leden.length})` : `Vormen (${data.vormen.length})`}
          </button>
        ))}
      </div>

      {tab === "vormen" ? (
        <VormenBeheer vormen={data.vormen} vervang={vervangVorm} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label htmlFor="lm-zoek" className="field-label">
                Zoeken
              </label>
              <input id="lm-zoek" className="field-input" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam, lidnummer, telefoon of e-mail" />
            </div>
            <div>
              <label htmlFor="lm-filter" className="field-label">
                Tonen
              </label>
              <select id="lm-filter" className="field-input" value={filter} onChange={(e) => setFilter(e.target.value as LedenFilter)}>
                <option value="alle">Alle leden</option>
                <option value="actief">Actief</option>
                <option value="gepauzeerd">Gepauzeerd</option>
                <option value="beeindigd">Beëindigd</option>
                <option value="loopt-af">Loopt af binnen 30 dagen</option>
                <option value="bijna-op">Strippenkaart bijna op</option>
              </select>
            </div>
            <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)}>
              {nieuw ? "Sluiten" : "Lid toevoegen"}
            </button>
          </div>

          {nieuw && (
            <div className={kaart}>
              <h2 className="mb-3 font-display text-base font-bold text-ink">Nieuw lid</h2>
              <LidFormulier
                opgeslagen={(l) => {
                  vervangLid(l);
                  setNieuw(false);
                  setOpen(l.id);
                }}
                annuleer={() => setNieuw(false)}
              />
            </div>
          )}

          {zichtbaar.length === 0 ? (
            <p className="rounded-xl border border-hair bg-white px-4 py-6 text-center text-sm text-neutralx-600">{data.leden.length === 0 ? "Je hebt nog geen leden. Maak eerst een vorm aan en voeg dan je eerste lid toe." : "Geen leden gevonden met deze zoekopdracht of dit filter."}</p>
          ) : (
            <ul className="space-y-2">
              {zichtbaar.map((l) => {
                const eigen = groepen.get(l.id) ?? [];
                const s = lidStatus(eigen, vandaag);
                return (
                  <li key={l.id} className={kaart}>
                    <button type="button" className="flex w-full flex-wrap items-center gap-3 text-left" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">
                          {lidNaam(l)} <span className="font-normal text-neutralx-500">{l.nummer}</span>
                        </span>
                        <span className="block truncate text-xs text-neutralx-500">{l.gewist ? "Persoonsgegevens gewist" : [l.telefoon, l.email].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={STATUS_PIL[s]}>{STATUS_TEKST[s]}</span>
                    </button>
                    {open === l.id && <LidDetail lid={l} lidmaatschappen={eigen} vormen={data.vormen} vandaag={vandaag} vervangLid={vervangLid} vervangLm={vervangLm} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
