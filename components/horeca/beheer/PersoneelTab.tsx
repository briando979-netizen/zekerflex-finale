"use client";

import { useCallback, useEffect, useState } from "react";
import { vulIn } from "@/lib/i18n/vul-in";
import { BLOKKEN, BLOK_KLAAR, dashboardVan, type Blok, type PersoneelData, type PersoneelsDashboard } from "@/lib/horeca-personeel/model";
import { BerichtenBeheer } from "@/components/horeca/beheer/BerichtenBeheer";
import { LoonstrokenBeheer } from "@/components/horeca/beheer/LoonstrokenBeheer";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// Het personeel van de zaak in het horeca-beheer: dashboards per rol maken, medewerkers uitnodigen (ze maken zelf een account) en
// mededelingen plaatsen. Elke wijziging is één POST naar /api/horeca/personeel, dat de hele lijst teruggeeft; die nemen we over.
// Alle tekst komt van de server (lib/horeca-personeel/teksten.ts).

const API = "/api/horeca/personeel";
type Antwoord = { data: PersoneelData; link?: string; melding?: string; mailVerstuurd?: boolean; email?: string };

const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

export function PersoneelTab({ t }: { t: PersoneelTeksten }) {
  const b = t.beheer;
  const [data, setData] = useState<PersoneelData | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bewerk, setBewerk] = useState<{ id?: string; naam: string; blokken: Blok[] } | null>(null);
  const [nieuw, setNieuw] = useState({ naam: "", email: "", functie: "", dashboardId: "" });
  const [mededeling, setMededeling] = useState({ tekst: "", dashboardIds: [] as string[] });
  const [open, setOpen] = useState<string | null>(null);

  const stuur = useCallback(
    async (body?: unknown): Promise<Antwoord | null> => {
      setBezig(true);
      setFout(null);
      try {
        const res = await fetch(API, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({}))) as Partial<Antwoord> & { error?: { message?: string } };
        if (!res.ok || !json.data) throw new Error(json.error?.message ?? b.fout);
        setData(json.data);
        return json as Antwoord;
      } catch (e) {
        setFout(e instanceof Error ? e.message : b.fout);
        return null;
      } finally {
        setBezig(false);
      }
    },
    [b.fout],
  );

  useEffect(() => {
    void stuur();
  }, [stuur]);

  if (!data) {
    return fout ? (
      <p role="alert" className="text-sm font-medium text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">{b.bezig}</p>
    );
  }

  const naamVan = (dashboardId: string) => dashboardVan(data, dashboardId)?.naam ?? "";
  const eerste = nieuw.dashboardId || data.dashboards[0]?.id || "";

  async function bewaarDashboard() {
    if (!bewerk) return;
    const r = await stuur({ actie: "dashboard", ...(bewerk.id ? { id: bewerk.id } : {}), naam: bewerk.naam, blokken: bewerk.blokken });
    if (r) setBewerk(null);
  }

  async function nodigUit() {
    const r = await stuur({ actie: "uitnodigen", naam: nieuw.naam, email: nieuw.email, functie: nieuw.functie, dashboardId: eerste });
    if (r) {
      setNieuw({ naam: "", email: "", functie: "", dashboardId: eerste });
      setLink(r.link ?? null);
      setOk(r.melding ? vulIn(r.melding, { email: r.email ?? "" }) : null);
    }
  }

  async function nieuweLink(id: string) {
    const r = await stuur({ actie: "nieuwe-link", id });
    if (r) {
      setLink(r.link ?? null);
      setOk(r.melding ? vulIn(r.melding, { email: r.email ?? "" }) : null);
    }
  }

  async function kopieer() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setOk(b.gekopieerd);
    } catch {
      // kopiëren kan geblokkeerd zijn; het veld met de link blijft zichtbaar en te selecteren
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">{b.kop}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{b.intro}</p>
      </div>

      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm font-medium text-brand-600">
          {ok}
        </p>
      )}

      {/* dashboards */}
      <section aria-labelledby="pers-dash" className="rounded-2xl border border-hair bg-white p-5">
        <h3 id="pers-dash" className="font-display text-lg font-bold text-ink">
          {b.dashboardsKop}
        </h3>
        <p className="mt-1 text-sm text-neutralx-600">{b.dashboardsUitleg}</p>
        {data.dashboards.length === 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-neutralx-500">{b.geenDashboards}</p>
            <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig} onClick={() => void stuur({ actie: "voorbeeld" })}>
              {b.voorbeeldKnop}
            </button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {data.dashboards.map((d: PersoneelsDashboard) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{d.naam}</p>
                  <p className="text-xs text-neutralx-500">{d.blokken.map((x) => t.blok[x].naam).join(", ") || "–"}</p>
                </div>
                <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setBewerk({ id: d.id, naam: d.naam, blokken: d.blokken })}>
                  {b.wijzig}
                </button>
                <button
                  type="button"
                  className="min-h-[44px] text-sm font-semibold text-crit hover:underline"
                  disabled={bezig}
                  onClick={() => {
                    if (window.confirm(b.verwijderDashboardVraag)) void stuur({ actie: "dashboard-weg", id: d.id });
                  }}
                >
                  {b.verwijder}
                </button>
              </li>
            ))}
          </ul>
        )}

        {bewerk ? (
          <div className="mt-4 space-y-3 rounded-xl border border-hair p-4">
            <div>
              <label htmlFor="pers-dnaam" className="block text-sm font-medium text-ink">
                {b.dashboardNaam}
              </label>
              <input id="pers-dnaam" className={veld} value={bewerk.naam} maxLength={60} onChange={(e) => setBewerk({ ...bewerk, naam: e.target.value })} />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-ink">{b.blokkenLabel}</legend>
              <div className="mt-2 space-y-2">
                {BLOKKEN.map((x) => (
                  <label key={x} className={`flex min-h-[44px] items-start gap-3 rounded-lg border border-hair p-3 ${BLOK_KLAAR[x] ? "cursor-pointer" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5"
                      disabled={!BLOK_KLAAR[x]}
                      checked={bewerk.blokken.includes(x)}
                      onChange={(e) => setBewerk({ ...bewerk, blokken: e.target.checked ? [...bewerk.blokken, x] : bewerk.blokken.filter((y) => y !== x) })}
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink">
                        {t.blok[x].naam}
                        {!BLOK_KLAAR[x] && <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-[11px] font-semibold text-neutralx-600">{t.binnenkort}</span>}
                      </span>
                      <span className="block text-xs text-neutralx-500">{t.blok[x].uitleg}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary min-h-[44px]" disabled={bezig || bewerk.naam.trim().length === 0} onClick={() => void bewaarDashboard()}>
                {bezig ? b.bezig : b.bewaar}
              </button>
              <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setBewerk(null)}>
                {b.annuleer}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-ghost mt-4 min-h-[44px]" onClick={() => setBewerk({ naam: "", blokken: ["taken", "mededelingen"] })}>
            {b.nieuwDashboard}
          </button>
        )}
      </section>

      {/* medewerkers */}
      <section aria-labelledby="pers-med" className="rounded-2xl border border-hair bg-white p-5">
        <h3 id="pers-med" className="font-display text-lg font-bold text-ink">
          {b.medewerkersKop}
        </h3>
        <p className="mt-1 text-sm text-neutralx-600">{b.medewerkersUitleg}</p>

        {data.medewerkers.length === 0 ? (
          <p className="mt-3 text-sm text-neutralx-500">{b.geenMedewerkers}</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {data.medewerkers.map((m) => (
              <li key={m.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{m.naam}</p>
                    <p className="text-xs text-neutralx-500">
                      {m.email}
                      {m.functie ? ` · ${m.functie}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-neutralx-600">{b.status[m.status]}</span>
                </div>
                {m.status !== "gestopt" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`pers-m-${m.id}`} className="sr-only">
                      {b.dashboard}
                    </label>
                    <select id={`pers-m-${m.id}`} className="h-11 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink" value={m.dashboardId} disabled={bezig} onChange={(e) => void stuur({ actie: "wijzig", id: m.id, dashboardId: e.target.value })}>
                      {data.dashboards.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.naam}
                        </option>
                      ))}
                    </select>
                    {m.status === "uitgenodigd" && (
                      <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig} onClick={() => void nieuweLink(m.id)}>
                        {b.nieuweLink}
                      </button>
                    )}
                    {m.status === "actief" ? (
                      <button
                        type="button"
                        className="min-h-[44px] text-sm font-semibold text-crit hover:underline"
                        disabled={bezig}
                        onClick={() => {
                          if (window.confirm(vulIn(b.stopVraag, { naam: m.naam }))) void stuur({ actie: "stop", id: m.id });
                        }}
                      >
                        {b.stop}
                      </button>
                    ) : (
                      <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void stuur({ actie: "weg", id: m.id })}>
                        {b.haalWeg}
                      </button>
                    )}
                  </div>
                )}
                {m.status === "actief" && (
                  <div>
                    <button type="button" className="min-h-[44px] text-sm font-semibold text-brand-600 hover:underline" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                      {open === m.id ? b.sluit : b.loonstroken}
                    </button>
                    {open === m.id && <LoonstrokenBeheer t={b} taal={t.taal} medewerkerId={m.id} />}
                  </div>
                )}
                {m.status === "gestopt" && (
                  <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void stuur({ actie: "weg", id: m.id })}>
                    {b.haalWeg}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {link && (
          <div className="mt-4 rounded-xl border border-hair p-3">
            <label htmlFor="pers-link" className="block text-sm font-medium text-ink">
              {b.linkLabel}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input id="pers-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-hairstrong bg-paper-soft px-3 py-2.5 text-xs text-ink" />
              <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => void kopieer()}>
                {b.kopieer}
              </button>
            </div>
          </div>
        )}

        {data.dashboards.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-500">{b.eerstDashboard}</p>
        ) : (
          <form
            className="mt-4 grid gap-3 rounded-xl border border-hair p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void nodigUit();
            }}
          >
            <h4 className="font-semibold text-ink sm:col-span-2">{b.uitnodigenKop}</h4>
            <div>
              <label htmlFor="pers-n" className="block text-sm font-medium text-ink">
                {b.naam}
              </label>
              <input id="pers-n" className={veld} required maxLength={60} value={nieuw.naam} onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pers-e" className="block text-sm font-medium text-ink">
                {b.email}
              </label>
              <input id="pers-e" type="email" className={veld} required maxLength={200} value={nieuw.email} onChange={(e) => setNieuw({ ...nieuw, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pers-f" className="block text-sm font-medium text-ink">
                {b.functie}
              </label>
              <input id="pers-f" className={veld} maxLength={60} value={nieuw.functie} onChange={(e) => setNieuw({ ...nieuw, functie: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pers-d" className="block text-sm font-medium text-ink">
                {b.dashboard}
              </label>
              <select id="pers-d" className={veld} value={eerste} onChange={(e) => setNieuw({ ...nieuw, dashboardId: e.target.value })}>
                {data.dashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.naam}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig}>
                {bezig ? b.bezig : b.uitnodigenKnop}
              </button>
            </div>
          </form>
        )}
      </section>

      <BerichtenBeheer t={t.chat} taal={t.taal} data={data} />

      {/* mededelingen */}
      <section aria-labelledby="pers-meded" className="rounded-2xl border border-hair bg-white p-5">
        <h3 id="pers-meded" className="font-display text-lg font-bold text-ink">
          {b.mededelingenKop}
        </h3>
        <p className="mt-1 text-sm text-neutralx-600">{b.mededelingenUitleg}</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void stuur({ actie: "mededeling", tekst: mededeling.tekst, dashboardIds: mededeling.dashboardIds }).then((r) => {
              if (r) setMededeling({ tekst: "", dashboardIds: [] });
            });
          }}
        >
          <div>
            <label htmlFor="pers-mt" className="block text-sm font-medium text-ink">
              {b.mededelingTekst}
            </label>
            <textarea id="pers-mt" className={veld} rows={3} maxLength={600} required value={mededeling.tekst} onChange={(e) => setMededeling({ ...mededeling, tekst: e.target.value })} />
          </div>
          {data.dashboards.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium text-ink">{b.mededelingVoor}</legend>
              <p className="text-xs text-neutralx-500">{mededeling.dashboardIds.length === 0 ? b.iedereen : mededeling.dashboardIds.map(naamVan).join(", ")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.dashboards.map((d) => (
                  <label key={d.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-hair px-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={mededeling.dashboardIds.includes(d.id)}
                      onChange={(e) => setMededeling({ ...mededeling, dashboardIds: e.target.checked ? [...mededeling.dashboardIds, d.id] : mededeling.dashboardIds.filter((x) => x !== d.id) })}
                    />
                    {d.naam}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig || mededeling.tekst.trim().length === 0}>
            {b.plaats}
          </button>
        </form>
        {data.mededelingen.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-500">{b.geenMededelingen}</p>
        ) : (
          <ul className="mt-4 divide-y divide-hair">
            {data.mededelingen.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-sm text-ink">{m.tekst}</p>
                  <p className="mt-1 text-xs text-neutralx-500">{m.dashboardIds.length === 0 ? b.iedereen : m.dashboardIds.map(naamVan).join(", ")}</p>
                </div>
                <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void stuur({ actie: "mededeling-weg", id: m.id })}>
                  {b.verwijder}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
