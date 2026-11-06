"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { foutVan } from "@/components/studio/context";
import { STATUS } from "@/components/studio/Overzicht";
import { Card, Empty, IReceipt, ISearch, IX, PageHead, Pill, btn, input } from "@/components/studio/ui";
import { euro } from "@/lib/sites/winkel";
import type { BestelStatus, SiteBestelling } from "@/lib/sites/bestellingen";

// ---------------------------------------------------------------------------
// Websitestudio → Bestellingen: alle bestellingen uit de eigen webshop, te
// filteren op status en te zoeken op nummer of naam. Een bestelling openen toont
// de producten, de klant en de levering, en zet de status een stap verder.
// ?open=<id> opent een bestelling meteen (het Overzicht linkt zo).
// Data: GET/PATCH /api/werkgever/sites/bestellingen (lib/sites/bestellingen.ts).
// ---------------------------------------------------------------------------

const API = "/api/werkgever/sites/bestellingen";

type Tab = "alle" | "nieuw" | "open" | "afgerond" | "geannuleerd";
const TABS: { id: Tab; label: string; past: (s: BestelStatus) => boolean }[] = [
  { id: "alle", label: "Alle", past: () => true },
  { id: "nieuw", label: "Nieuw", past: (s) => s === "nieuw" },
  { id: "open", label: "Open", past: (s) => s === "bevestigd" || s === "klaar" },
  { id: "afgerond", label: "Afgerond", past: (s) => s === "afgerond" },
  { id: "geannuleerd", label: "Geannuleerd", past: (s) => s === "geannuleerd" },
];

const STATUSSEN = Object.keys(STATUS) as BestelStatus[];

/** De logische volgende stap; afgerond en geannuleerd hebben er geen. */
const VOLGENDE: Partial<Record<BestelStatus, { naar: BestelStatus; label: string }>> = {
  nieuw: { naar: "bevestigd", label: "Bevestig bestelling" },
  bevestigd: { naar: "klaar", label: "Markeer als klaar" },
  klaar: { naar: "afgerond", label: "Rond af" },
};

const kort = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
const lang = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
const dagSleutel = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Amsterdam" });

const levering = (b: SiteBestelling) => (b.invoer.levering === "bezorgen" ? "Bezorgen" : "Afhalen");

/** Puntkomma's en een BOM, zodat Excel het Nederlands opent; geen formules uit klantinvoer. */
function naarCsv(rows: SiteBestelling[]): string {
  const cel = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const kop = ["Bestelnummer", "Datum", "Status", "Naam", "E-mail", "Telefoon", "Levering", "Adres", "Producten", "Subtotaal", "Bezorgkosten", "Totaal", "Opmerking"];
  const regels = rows.map((b) => {
    const i = b.invoer;
    return [
      b.nr,
      kort.format(new Date(b.at)),
      STATUS[b.status].label,
      i.naam,
      i.email,
      i.telefoon,
      levering(b),
      i.levering === "bezorgen" ? `${i.straat}, ${i.postcode} ${i.plaats}` : "",
      b.regels.map((r) => `${r.aantal} × ${r.naam}`).join(", "),
      bedrag(b.subtotaalCents),
      bedrag(b.bezorgkostenCents),
      bedrag(b.totaalCents),
      i.opmerking,
    ];
  });
  return "﻿" + [kop, ...regels].map((r) => r.map(cel).join(";")).join("\r\n");
}

export default function Bestellingen() {
  const [lijst, setLijst] = useState<SiteBestelling[] | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(false);
  const [tab, setTab] = useState<Tab>("alle");
  const [zoek, setZoek] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actieFout, setActieFout] = useState<string | null>(null);
  const paneelRef = useRef<HTMLDivElement>(null);
  const kopRef = useRef<HTMLHeadingElement>(null);

  const laad = useCallback(async () => {
    setLaden(true);
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    setLaden(false);
    if (!res?.ok) return setLaadFout(await foutVan(res, "De bestellingen konden niet laden. Probeer het opnieuw."));
    setLaadFout(null);
    setLijst(((await res.json()) as { bestellingen: SiteBestelling[] }).bestellingen);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) setOpenId(id);
    void laad();
    // nieuwe bestellingen komen vanzelf binnen zolang het tabblad openstaat
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void laad();
    }, 60_000);
    return () => clearInterval(t);
  }, [laad]);

  const geopend = useMemo(() => (openId ? (lijst?.find((b) => b.id === openId) ?? null) : null), [lijst, openId]);

  // op de telefoon en tablet staat het paneel onder de lijst: schuif ernaartoe
  useEffect(() => {
    if (!geopend) return;
    kopRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 1279px)").matches) paneelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [geopend?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aantallen = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, (lijst ?? []).filter((b) => t.past(b.status)).length])) as Record<Tab, number>, [lijst]);

  const zichtbaar = useMemo(() => {
    const filter = TABS.find((t) => t.id === tab)!.past;
    const q = zoek.trim().toLowerCase().replace(/^#/, "");
    return (lijst ?? []).filter((b) => filter(b.status) && (!q || b.nr.toLowerCase().includes(q) || b.invoer.naam.toLowerCase().includes(q)));
  }, [lijst, tab, zoek]);

  const zetUrl = (id: string | null) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("open", id);
    else u.searchParams.delete("open");
    window.history.replaceState(null, "", u);
  };

  const open = (id: string) => {
    setOpenId(id);
    setActieFout(null);
    zetUrl(id);
  };

  const sluit = () => {
    const id = openId;
    setOpenId(null);
    setActieFout(null);
    zetUrl(null);
    // terug naar de rij die het paneel opende (er staat er één zichtbaar: tabel of kaart)
    if (id) {
      const knop = [...document.querySelectorAll<HTMLElement>(`[data-bestelling="${id}"]`)].find((el) => el.offsetParent !== null);
      knop?.focus();
    }
  };

  const zetStatus = async (b: SiteBestelling, status: BestelStatus) => {
    if (status === b.status || busy) return;
    if (status === "geannuleerd" && !window.confirm(`Bestelling #${b.nr} annuleren? De klant krijgt hier geen automatisch bericht van.`)) return;
    setBusy(true);
    setActieFout(null);
    const res = await fetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, status }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setActieFout(await foutVan(res, "De status wijzigen lukte niet. Probeer het opnieuw."));
    // de serverversie overnemen, niet alleen het veld lokaal bijwerken
    const { bestelling } = (await res.json()) as { bestelling: SiteBestelling };
    setLijst((l) => l?.map((x) => (x.id === bestelling.id ? bestelling : x)) ?? l);
  };

  const exporteer = () => {
    const url = URL.createObjectURL(new Blob([naarCsv(zichtbaar)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bestellingen-${dagSleutel.format(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <PageHead
        title="Bestellingen"
        sub="Alles wat klanten in je webshop bestellen. Bij elke nieuwe bestelling krijg je ook een mail."
        actions={
          lijst && lijst.length > 0 ? (
            <>
              <button type="button" onClick={() => void laad()} disabled={laden} className={btn.secondary}>
                {laden ? "Bezig…" : "Vernieuwen"}
              </button>
              <button type="button" onClick={exporteer} disabled={zichtbaar.length === 0} className={btn.secondary}>
                Exporteer naar Excel
              </button>
            </>
          ) : undefined
        }
      />

      {laadFout && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#f1c4c4] bg-[#fff5f5] px-4 py-3 text-sm text-[#8e0b21]">
          <span className="min-w-0 flex-1">{laadFout}</span>
          <button type="button" onClick={() => void laad()} className={btn.secondary}>
            Opnieuw proberen
          </button>
        </div>
      )}

      {lijst === null ? (
        !laadFout && (
          <Card>
            <div className="space-y-3" aria-busy="true" aria-label="Bestellingen laden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[#f1f1f1]" />
              ))}
            </div>
          </Card>
        )
      ) : lijst.length === 0 ? (
        <Card>
          <Empty
            icon={<IReceipt />}
            title="Nog geen bestellingen"
            text="Zodra een klant iets bestelt in je webshop, staat de bestelling hier. Je krijgt dan ook een mail op het e-mailadres van je bedrijf."
          >
            <Link href="/studio/webshop/producten" className={btn.primary}>
              Producten toevoegen
            </Link>
            <Link href="/studio/webshop/instellingen" className={btn.secondary}>
              E-mailadres instellen
            </Link>
          </Empty>
        </Card>
      ) : (
        <div className={geopend ? "xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-4" : ""}>
          <Card pad={false} className="min-w-0">
            <div role="group" aria-label="Filter op status" className="flex gap-1 overflow-x-auto border-b border-[#ebebeb] px-3 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`mb-2 inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    tab === t.id ? "bg-[#ebebeb] text-[#1a1a1a]" : "text-[#616161] hover:bg-[#f7f7f7] hover:text-[#1a1a1a]"
                  }`}
                >
                  {t.label}
                  <span className={`rounded-md px-1.5 text-xs ${tab === t.id ? "bg-white text-[#1a1a1a]" : "bg-[#f1f1f1] text-[#616161]"}`}>{aantallen[t.id]}</span>
                </button>
              ))}
            </div>

            <div className="relative px-3 py-3">
              <label htmlFor="bestelling-zoek" className="sr-only">
                Zoek op bestelnummer of naam
              </label>
              <ISearch className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[#707070]" />
              <input id="bestelling-zoek" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op bestelnummer of naam" className={`${input} pl-9`} />
            </div>

            {zichtbaar.length === 0 ? (
              <div className="border-t border-[#ebebeb] px-5 py-10 text-center text-sm text-[#616161]">
                <p>{zoek.trim() ? `Geen bestellingen gevonden voor “${zoek.trim()}”.` : "Geen bestellingen met deze status."}</p>
                {(zoek || tab !== "alle") && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoek("");
                      setTab("alle");
                    }}
                    className={`${btn.quiet} mt-2`}
                  >
                    Toon alle bestellingen
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* telefoon en tablet: kaarten */}
                <ul className="divide-y divide-[#f1f1f1] border-t border-[#ebebeb] lg:hidden">
                  {zichtbaar.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        data-bestelling={b.id}
                        aria-current={b.id === openId ? "true" : undefined}
                        onClick={() => open(b.id)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${b.id === openId ? "bg-[#f1f1f1]" : "hover:bg-[#fafafa]"}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#1a1a1a]">#{b.nr}</span>
                            <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-[#303030]">
                            {b.invoer.naam} · {levering(b)}
                          </span>
                          <span className="block text-xs text-[#616161]">{kort.format(new Date(b.at))}</span>
                        </span>
                        <span className="flex-shrink-0 text-sm font-semibold text-[#1a1a1a]">{euro(b.totaalCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* computer: tabel */}
                <table className="hidden w-full text-sm lg:table">
                  <thead>
                    <tr className="border-y border-[#ebebeb] bg-[#fafafa] text-left text-xs text-[#616161]">
                      <th scope="col" className="px-4 py-2.5 font-medium">Bestelling</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Datum</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Klant</th>
                      {!geopend && <th scope="col" className="px-4 py-2.5 font-medium">Levering</th>}
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Totaal</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f1f1]">
                    {zichtbaar.map((b) => (
                      <tr key={b.id} onClick={() => open(b.id)} className={`cursor-pointer ${b.id === openId ? "bg-[#f1f1f1]" : "hover:bg-[#fafafa]"}`}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <button
                            type="button"
                            data-bestelling={b.id}
                            aria-current={b.id === openId ? "true" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              open(b.id);
                            }}
                            className="rounded font-semibold text-[#1a1a1a] hover:underline"
                          >
                            #{b.nr}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#616161]">{kort.format(new Date(b.at))}</td>
                        <td className="w-full max-w-0 truncate px-4 py-3 text-[#303030]">{b.invoer.naam}</td>
                        {!geopend && <td className="whitespace-nowrap px-4 py-3 text-[#616161]">{levering(b)}</td>}
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#1a1a1a]">{euro(b.totaalCents)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>

          {geopend && (
            <div ref={paneelRef} className="mt-4 scroll-mt-20 xl:sticky xl:top-20 xl:mt-0 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
              <Paneel b={geopend} busy={busy} fout={actieFout} kopRef={kopRef} onStatus={(s) => void zetStatus(geopend, s)} onSluit={sluit} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Paneel({
  b,
  busy,
  fout,
  kopRef,
  onStatus,
  onSluit,
}: {
  b: SiteBestelling;
  busy: boolean;
  fout: string | null;
  kopRef: RefObject<HTMLHeadingElement>;
  onStatus: (s: BestelStatus) => void;
  onSluit: () => void;
}) {
  const i = b.invoer;
  const volgende = VOLGENDE[b.status];
  const tel = i.telefoon.replace(/[^\d+]/g, "");
  return (
    <Card pad={false}>
      <div className="flex items-start gap-3 border-b border-[#ebebeb] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 ref={kopRef} tabIndex={-1} className="text-base font-bold text-[#1a1a1a] focus:outline-none">
            Bestelling #{b.nr}
          </h2>
          <p className="mt-0.5 text-xs text-[#616161] first-letter:uppercase">{lang.format(new Date(b.at))}</p>
        </div>
        <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
        <button type="button" onClick={onSluit} aria-label="Bestelling sluiten" className="-mr-2 -mt-1 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[#616161] hover:bg-black/5">
          <IX />
        </button>
      </div>

      <div className="space-y-3 border-b border-[#ebebeb] px-5 py-4">
        {volgende && (
          <button type="button" onClick={() => onStatus(volgende.naar)} disabled={busy} className={`${btn.primary} w-full`}>
            {busy ? "Bezig…" : volgende.label}
          </button>
        )}
        <div>
          <label htmlFor="bestelling-status" className="text-xs font-medium text-[#616161]">
            Status
          </label>
          <select id="bestelling-status" value={b.status} disabled={busy} onChange={(e) => onStatus(e.target.value as BestelStatus)} className={`${input} mt-1`}>
            {STATUSSEN.map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-[#616161]">De klant krijgt geen automatisch bericht als je de status wijzigt. Mail of bel de klant zelf.</p>
        {fout && (
          <p role="alert" className="rounded-lg bg-[#fed1d7] px-3 py-2 text-sm text-[#8e0b21]">
            {fout}
          </p>
        )}
      </div>

      <div className="border-b border-[#ebebeb] px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#616161]">Producten</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {b.regels.map((r, n) => (
            <li key={`${r.productId}-${n}`} className="flex gap-3">
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium text-[#1a1a1a]">
                  {r.aantal} × {r.naam}
                </span>
                <span className="block text-xs text-[#707070]">{euro(r.prijsCents)} per stuk</span>
              </span>
              <span className="flex-shrink-0 font-medium text-[#1a1a1a]">{euro(r.totaalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-[#f1f1f1] pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#616161]">Subtotaal</dt>
            <dd>{euro(b.subtotaalCents)}</dd>
          </div>
          {i.levering === "bezorgen" && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#616161]">Bezorgkosten</dt>
              <dd>{b.bezorgkostenCents ? euro(b.bezorgkostenCents) : "Gratis"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 font-semibold text-[#1a1a1a]">
            <dt>Totaal</dt>
            <dd>{euro(b.totaalCents)}</dd>
          </div>
        </dl>
      </div>

      <div className="border-b border-[#ebebeb] px-5 py-4 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#616161]">Klant</h3>
        <p className="mt-2 break-words font-medium text-[#1a1a1a]">{i.naam}</p>
        {i.email && (
          <a href={`mailto:${i.email}?subject=${encodeURIComponent(`Je bestelling ${b.nr}`)}`} className="block break-all text-[#005bd3] hover:underline">
            {i.email}
          </a>
        )}
        {tel && (
          <a href={`tel:${tel}`} className="block text-[#005bd3] hover:underline">
            {i.telefoon}
          </a>
        )}
      </div>

      <div className="px-5 py-4 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#616161]">{levering(b)}</h3>
        {i.levering === "bezorgen" ? (
          <p className="mt-2 break-words text-[#303030]">
            {i.straat}
            <br />
            {i.postcode} {i.plaats}
          </p>
        ) : (
          <p className="mt-2 text-[#616161]">De klant haalt de bestelling bij je af.</p>
        )}
        {i.opmerking && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#616161]">Opmerking van de klant</h3>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#f7f7f7] px-3 py-2 text-[#303030]">{i.opmerking}</p>
          </>
        )}
      </div>
    </Card>
  );
}
