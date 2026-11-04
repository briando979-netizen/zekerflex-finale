"use client";

import { useState } from "react";
import Link from "next/link";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding } from "@/components/rijschool/ui";
import { euro } from "@/lib/horeca/weergave";
import { MOMENT_LABEL, type Moment } from "@/lib/horeca/taken";
import { LET_OP_MIN, STAAT_LABEL, TE_LANG_MIN, type TafelLive } from "@/lib/horeca/zaal";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { useLive } from "@/components/horeca/live/useLive";
import { ZaalTegels } from "@/components/horeca/live/ZaalTegels";
import { OPROEP_LANG, tijdTot } from "@/components/horeca/live/teksten";
import { minTekst } from "@/components/horeca/live/stijl";
import { isAan, type DashboardData } from "@/components/horeca/live/types";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// ---------------------------------------------------------------------------
// Het live-dashboard van de zaak (tabblad Live): de kerncijfers van vandaag,
// de zaal per tafel, oproepen van gasten, wie er nog komt, de keuken, de
// takenlijsten, uitverkochte gerechten en de gekoppelde schermen. Ververst elke
// 15 seconden. Vanaf hier kun je meteen handelen: serveren, tafel vrijgeven,
// oproep afhandelen, gerecht weer beschikbaar.
// ---------------------------------------------------------------------------

const API = "/api/horeca/beheer";
export type BeheerTab = "overzicht" | "reserveringen" | "bestellingen" | "tafels" | "kassa" | "taken" | "cijfers" | "menukaart" | "schermen" | "modules" | "gegevens";

function Kpi({ label, waarde, uitleg, toon = "neutraal" }: { label: string; waarde: string; uitleg?: string; toon?: "neutraal" | "geld" | "let-op" | "probleem" | "goed" }) {
  const kleur = { neutraal: "text-ink", geld: "text-money-ink", "let-op": "text-warn", probleem: "text-crit", goed: "text-ok" }[toon];
  return (
    <div className="card min-w-0 p-4">
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-neutralx-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${kleur}`}>{waarde}</p>
      {uitleg && <p className="mt-0.5 truncate text-xs text-neutralx-600">{uitleg}</p>}
    </div>
  );
}

export function LiveTab({ data, doe, naar }: { data: BeheerData; doe: Doe; naar: (t: BeheerTab) => void }) {
  const live = useLive<DashboardData>(`${API}?alleen=live`, 15);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const z = data.zaak;
  const d = live.data;

  async function actie(body: Record<string, unknown>, okTekst: string) {
    setOk(null);
    try {
      live.setData(await stuur<DashboardData>(API, "POST", body));
      live.setFout(null);
      setOk(okTekst);
    } catch (e) {
      live.setFout(foutVan(e));
    }
  }

  const stappen: { klaar: boolean; tekst: string; tab: BeheerTab }[] = [
    { klaar: data.items.length > 0, tekst: "Menukaart vullen (de voorbeelden mag je aanpassen of weghalen)", tab: "menukaart" },
    { klaar: Boolean(z.adres && z.telefoon), tekst: "Adres, telefoon en openingstijden invullen", tab: "gegevens" },
    { klaar: z.modules.length > 0, tekst: "Modules kiezen die jullie willen gebruiken", tab: "modules" },
    { klaar: data.tafels.length > 0 || !z.modules.includes("bestellen"), tekst: "Tafels aanmaken en de QR-codes printen", tab: "tafels" },
    { klaar: (d?.apparaten.length ?? 0) > 0, tekst: "Een scherm koppelen (keuken, bar of handheld)", tab: "schermen" },
    { klaar: z.online, tekst: "De site online zetten (bovenaan)", tab: "overzicht" },
  ];
  const open = stappen.filter((s) => !s.klaar);

  if (!d) {
    return live.fout ? <Melding fout={live.fout} /> : <p className="text-sm text-neutralx-500">Live gegevens laden…</p>;
  }
  const c = d.cijfers;
  const tafel = d.zaal.find((t) => t.id === gekozen) ?? null;
  const nuAan = Date.now();
  const schermenAan = d.apparaten.filter((a) => isAan(a, nuAan)).length;
  const heeft = (m: string) => z.modules.includes(m);

  return (
    <div className="space-y-5">
      {/* snelle acties + live-stip */}
      <section className="flex flex-wrap items-center gap-2" aria-label="Snel naar">
        <span className="mr-auto inline-flex items-center gap-2 text-sm text-neutralx-600" role="status">
          <span className={`h-2.5 w-2.5 rounded-full ${live.verbonden ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
          {live.verbonden ? `Live · bijgewerkt ${live.laatst ? amsterdamClock(live.laatst) : ""}` : "Geen verbinding, we proberen het opnieuw"}
        </span>
        {heeft("bestellen") && (
          <button type="button" className="btn-ghost" onClick={() => naar("bestellingen")}>
            + Bestelling
          </button>
        )}
        {heeft("reserveren") && (
          <button type="button" className="btn-ghost" onClick={() => naar("reserveringen")}>
            + Reservering
          </button>
        )}
        {heeft("bestellen") && (
          <a href="/scherm/keuken" target="_blank" rel="noopener" className="btn-ghost">
            Keukenscherm
          </a>
        )}
        <button type="button" className="btn-primary" onClick={() => naar("schermen")}>
          Schermen koppelen
        </button>
      </section>

      <Melding fout={live.fout} ok={ok} />

      {/* kerncijfers van vandaag */}
      <section aria-label="Vandaag" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Omzet vandaag" waarde={euro(c.omzetCent)} uitleg={`${c.bestellingen} ${c.bestellingen === 1 ? "bestelling" : "bestellingen"}`} toon="geld" />
        <Kpi
          label="In de keuken"
          waarde={String(c.inBereiding)}
          uitleg={c.langsteWachtMin !== null ? `langst ${minTekst(c.langsteWachtMin)}` : "niets wacht"}
          toon={c.langsteWachtMin !== null && c.langsteWachtMin >= TE_LANG_MIN ? "probleem" : c.langsteWachtMin !== null && c.langsteWachtMin >= LET_OP_MIN ? "let-op" : "neutraal"}
        />
        <Kpi label="Klaar om te serveren" waarde={String(c.klaar)} uitleg={c.klaar ? "breng het weg" : "niets klaar"} toon={c.klaar ? "goed" : "neutraal"} />
        <Kpi label="Gasten" waarde={`${c.gastenBinnen} / ${c.gastenVerwacht}`} uitleg={`binnen / verwacht${c.noShows ? ` · ${c.noShows} niet gekomen` : ""}`} />
        <Kpi label="Tafels bezet" waarde={`${c.tafelsBezet} / ${c.tafelsActief}`} uitleg={c.openRekeningCent ? `${euro(c.openRekeningCent)} nog af te rekenen` : "geen open rekeningen"} />
        <Kpi label="Bereidingstijd" waarde={c.bereidingMin === null ? "–" : `${c.bereidingMin} min`} uitleg="van bestellen tot klaar (mediaan)" />
      </section>

      {/* oproepen van gasten: altijd bovenaan als er een is */}
      {d.oproepen.length > 0 && (
        <section className="card border-2 border-amber-500 p-4" aria-labelledby="oproepen-kop">
          <h2 id="oproepen-kop" className="font-display text-lg font-bold text-ink">
            <span aria-hidden>🔔 </span>Gasten vragen om aandacht
          </h2>
          <ul className="mt-2 divide-y divide-hair">
            {d.oproepen.map((o) => (
              <li key={`${o.tafelId}-${o.soort}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink">
                  <strong>{o.tafelNaam || "Tafel"}</strong> {OPROEP_LANG[o.soort]} · {minTekst(Math.max(0, Math.floor((nuAan - Date.parse(o.op)) / 60000)))} geleden
                </span>
                <button type="button" className="btn-ghost" onClick={() => void actie({ actie: "oproep-af", tafelId: o.tafelId, soort: o.soort }, "Afgehandeld.")}>
                  Afgehandeld<span className="sr-only"> ({o.tafelNaam})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2" aria-labelledby="zaal-kop">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="zaal-kop" className="font-display text-lg font-bold text-ink">
              De zaal nu
            </h2>
            <p className="text-xs text-neutralx-500">Tik een tafel voor acties</p>
          </div>
          <div className="mt-3">
            <ZaalTegels zaal={d.zaal} onKies={(t) => setGekozen((x) => (x === t.id ? null : t.id))} />
          </div>
          {tafel && <TafelPaneel t={tafel} kassa={heeft("kassa")} actie={actie} sluit={() => setGekozen(null)} naarBestellen={() => naar("bestellingen")} />}
        </section>

        <div className="space-y-5">
          {heeft("reserveren") && (
            <section className="card p-5" aria-labelledby="komend-kop">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="komend-kop" className="font-display text-lg font-bold text-ink">
                  Nog te komen
                </h2>
                <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => naar("reserveringen")}>
                  Reserveringsboek
                </button>
              </div>
              {d.komend.length === 0 ? (
                <p className="mt-2 text-sm text-neutralx-500">Niemand meer verwacht vandaag.</p>
              ) : (
                <ul className="mt-2 divide-y divide-hair">
                  {d.komend.map((r) => {
                    const tafelNaam = d.tafels.find((t) => t.id === r.tafelId)?.naam;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-semibold text-ink">{r.tijd}</span> <span className="text-ink">{r.naam}</span>
                          <span className="block text-xs text-neutralx-600">
                            {r.personen} pers.{tafelNaam ? ` · ${tafelNaam}` : " · nog geen tafel"}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-xs font-semibold text-plan-ink">{tijdTot(r.tijd, d.nu.minuten)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="card p-5" aria-labelledby="schermen-kop">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="schermen-kop" className="font-display text-lg font-bold text-ink">
                Schermen
              </h2>
              <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => naar("schermen")}>
                Beheren
              </button>
            </div>
            {d.apparaten.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-600">Nog geen apparaten gekoppeld. Koppel een tablet voor de keuken of een telefoon voor de bediening.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-neutralx-600">
                  {schermenAan} van {d.apparaten.length} nu aan
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.apparaten.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isAan(a, nuAan) ? "bg-emerald-500" : "bg-neutralx-300"}`} aria-hidden />
                      <span className="truncate text-ink">{a.naam}</span>
                      <span className="ml-auto flex-shrink-0 text-xs text-neutralx-500">{isAan(a, nuAan) ? "aan" : "uit"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {heeft("taken") && (
          <section className="card p-5" aria-labelledby="taken-kop">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="taken-kop" className="font-display text-lg font-bold text-ink">
                Takenlijsten vandaag
              </h2>
              <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => naar("taken")}>
                Afvinken
              </button>
            </div>
            {d.taken.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-500">Nog geen lijsten.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {d.taken.map((l) => (
                  <li key={l.id} className="text-sm">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink">
                        {l.naam} <span className="text-xs text-neutralx-500">· {MOMENT_LABEL[l.moment as Moment] ?? l.moment}</span>
                      </span>
                      <span className={`flex-shrink-0 font-semibold tabular-nums ${l.gedaan >= l.totaal ? "text-ok" : "text-neutralx-600"}`}>
                        {l.gedaan}/{l.totaal}
                      </span>
                    </span>
                    {l.buitenGrens.map((b, i) => (
                      <span key={i} className="mt-1 block rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-crit">
                        Buiten de grens: {b.taak} ({b.waarde})
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card p-5" aria-labelledby="uitverkocht-kop">
          <h2 id="uitverkocht-kop" className="font-display text-lg font-bold text-ink">
            Uitverkocht
          </h2>
          {d.uitverkocht.length === 0 ? (
            <p className="mt-2 text-sm text-neutralx-500">Alles op de kaart is te bestellen.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hair">
              {d.uitverkocht.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="truncate text-ink">{i.naam}</span>
                  <button
                    type="button"
                    className="flex-shrink-0 text-sm font-semibold text-brand-600 hover:underline"
                    onClick={() => void doe({ actie: "beschikbaar", id: i.id, beschikbaar: true }, `${i.naam} is weer te bestellen.`).then(() => live.ververs())}
                  >
                    Weer beschikbaar<span className="sr-only"> ({i.naam})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {open.length > 0 ? (
          <section className="card p-5" aria-labelledby="horeca-stappen">
            <h2 id="horeca-stappen" className="font-display text-lg font-bold text-ink">
              Aan de slag
            </h2>
            <p className="mt-1 text-xs text-neutralx-500">
              {stappen.length - open.length} van {stappen.length} gedaan
            </p>
            <ol className="mt-2 space-y-1">
              {stappen.map((s) => (
                <li key={s.tekst}>
                  <button type="button" onClick={() => naar(s.tab)} className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-paper-soft">
                    <span className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${s.klaar ? "pill-ok" : "pill-neutral"}`} aria-hidden>
                      {s.klaar ? "✓" : "•"}
                    </span>
                    <span className="text-sm text-ink">
                      {s.tekst}
                      <span className="sr-only">{s.klaar ? " (gedaan)" : " (nog te doen)"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="card p-5" aria-labelledby="horeca-abonnement">
            <h2 id="horeca-abonnement" className="font-display text-lg font-bold text-ink">
              Abonnement
            </h2>
            <p className="mt-2 font-display text-2xl font-bold text-ink">
              {euro(data.maand.totaalCent)}
              <span className="text-sm font-semibold text-neutralx-500"> per maand</span>
            </p>
            <p className="mt-1 text-xs text-neutralx-500">Voorbeeldprijzen; je betaalt nog niets zolang het abonnement niet is gestart.</p>
            <button type="button" className="btn-ghost mt-3" onClick={() => naar("modules")}>
              Modules bekijken
            </button>
          </section>
        )}
      </div>

      <p className="text-xs text-neutralx-500">
        Tip: zet het live-overzicht op een tv of monitor via <Link href="/scherm/overzicht" className="font-semibold text-brand-600 hover:underline" target="_blank">/scherm/overzicht</Link>, of koppel een apparaat onder Schermen.
      </p>
    </div>
  );
}

function TafelPaneel({ t, kassa, actie, sluit, naarBestellen }: { t: TafelLive; kassa: boolean; actie: (b: Record<string, unknown>, ok: string) => Promise<void>; sluit: () => void; naarBestellen: () => void }) {
  return (
    <section className="mt-4 rounded-xl border border-hairstrong bg-paper-soft p-4" aria-labelledby="tafel-paneel-kop" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="tafel-paneel-kop" className="font-display text-lg font-bold text-ink">
            {t.naam}
          </h3>
          <p className="text-sm text-neutralx-600">
            {STAAT_LABEL[t.staat]}
            {t.openCent > 0 && ` · ${euro(t.openCent)} open`}
            {t.sindsMin !== null && ` · ${minTekst(t.sindsMin)} aan tafel`}
            {t.reservering && ` · ${t.reservering.tijd} ${t.reservering.naam} (${t.reservering.personen} p.)`}
          </p>
        </div>
        <button type="button" className="text-sm font-semibold text-neutralx-600 hover:text-ink" onClick={sluit}>
          Sluiten
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {t.serveren > 0 && (
          <button type="button" className="btn-primary" onClick={() => void actie({ actie: "serveer", tafelId: t.id }, `${t.naam}: alles wat klaar stond is geserveerd.`)}>
            Geserveerd ({t.serveren})
          </button>
        )}
        {t.oproep && (
          <button type="button" className="btn-ghost" onClick={() => void actie({ actie: "oproep-af", tafelId: t.id }, "Oproep afgehandeld.")}>
            Oproep afgehandeld
          </button>
        )}
        {t.openCent > 0 &&
          kassa &&
          (["pin", "contant"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (window.confirm(`${t.naam}: ${euro(t.openCent)} afrekenen met ${m}?`)) void actie({ actie: "afrekenen", tafelId: t.id, methode: m }, `${t.naam} is afgerekend (${m}) en weer vrij. De bon staat onder Kassa.`);
              }}
            >
              Afrekenen: {m === "pin" ? "pin" : "contant"}
            </button>
          ))}
        {t.openCent > 0 && !kassa && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (window.confirm(`Is ${t.naam} afgerekend (${euro(t.openCent)})? De tafel wordt dan weer vrij.`)) void actie({ actie: "tafel-vrij", tafelId: t.id }, `${t.naam} is afgerekend en weer vrij.`);
            }}
          >
            Afgerekend, tafel vrij
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={naarBestellen}>
          Bestelling invoeren
        </button>
      </div>
    </section>
  );
}
