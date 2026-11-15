"use client";

import { useMemo, useState, type FormEvent } from "react";
import { MAX_AANTAL } from "@/lib/horeca/bestellen";
import type { Gekozen } from "@/lib/horeca/opties";
import { KeuzeVenster } from "@/components/horeca/live/KeuzeVenster";
import type { MenuGroep } from "@/components/horeca/site/BestelMenu";

// Online bestellen om af te halen of te laten bezorgen (15 nov 2026). De menukaart met plus en min, dan de
// gegevens, een tijd die vandaag echt kan, en de som met bezorgkosten. Betalen gebeurt bij het ophalen of de
// bezorging. Na het bestellen gaat de gast naar zijn eigen statuspagina (ondertekende link). Prijzen hier zijn een
// indicatie; de server rekent zelf (lib/horeca/bezorgen-server.ts).

export interface LeverKeuze {
  aan: boolean;
  slots: string[];
  zsm: boolean;
}
export interface LeverOptiesWeergave {
  afhalen: LeverKeuze;
  bezorgen: LeverKeuze;
  minimumCent: number;
  kostenCent: number;
  gratisVanafCent: number | null;
  straalKm: number;
}

interface OptieRegel {
  sleutel: string;
  itemId: string;
  aantal: number;
  opties: Gekozen[];
  tekst: string;
  prijsCent: number;
}

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
const km = (k: number) => `${k.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
const veld = "mt-1 w-full rounded-xl border border-[#0A120E]/15 bg-white px-3 py-2.5 text-[#0A120E]";

export function LeverMenu({ slug, groepen, opties }: { slug: string; groepen: MenuGroep[]; opties: LeverOptiesWeergave }) {
  const soorten = (["afhalen", "bezorgen"] as const).filter((s) => opties[s].aan && (opties[s].zsm || opties[s].slots.length > 0));
  const [soort, setSoort] = useState<"afhalen" | "bezorgen">(soorten[0] ?? "afhalen");
  const [mand, setMand] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<OptieRegel[]>([]);
  const [kiezen, setKiezen] = useState<MenuGroep["items"][number] | null>(null);
  const [klant, setKlant] = useState({ naam: "", telefoon: "", adres: "", postcode: "", plaats: "", opmerking: "", bedrijf: "" });
  const keuze = opties[soort];
  const [tijd, setTijd] = useState(keuze.zsm ? "zsm" : (keuze.slots[0] ?? "zsm"));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const items = useMemo(() => new Map(groepen.flatMap((g) => g.items.map((i) => [i.id, i] as const))), [groepen]);
  const regels = Object.entries(mand).filter(([, n]) => n > 0);
  const aantal = regels.reduce((s, [, n]) => s + n, 0) + extra.reduce((s, x) => s + x.aantal, 0);
  const subtotaal = regels.reduce((s, [id, n]) => s + (items.get(id)?.prijsCent ?? 0) * n, 0) + extra.reduce((s, x) => s + x.prijsCent * x.aantal, 0);
  const kosten = soort === "bezorgen" && !(opties.gratisVanafCent !== null && subtotaal >= opties.gratisVanafCent) ? opties.kostenCent : 0;
  const teKort = soort === "bezorgen" && subtotaal < opties.minimumCent;
  const zet = (id: string, n: number) => setMand((m) => ({ ...m, [id]: Math.max(0, Math.min(MAX_AANTAL, n)) }));
  const aantalVan = (id: string) => (mand[id] ?? 0) + extra.filter((x) => x.itemId === id).reduce((s, x) => s + x.aantal, 0);
  const minder = (id: string) => {
    const laatste = [...extra].reverse().find((x) => x.itemId === id);
    if (!laatste) return zet(id, (mand[id] ?? 0) - 1);
    setExtra((e) => (laatste.aantal > 1 ? e.map((x) => (x === laatste ? { ...x, aantal: x.aantal - 1 } : x)) : e.filter((x) => x !== laatste)));
  };
  const kiesSoort = (s: "afhalen" | "bezorgen") => {
    setSoort(s);
    setTijd(opties[s].zsm ? "zsm" : (opties[s].slots[0] ?? "zsm"));
  };
  const zetKlant = (veldNaam: keyof typeof klant, waarde: string) => setKlant((k) => ({ ...k, [veldNaam]: waarde }));

  async function bestel(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(`/api/horeca/site/${slug}/leveren`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soort,
          mand: [...regels.map(([itemId, n]) => ({ itemId, aantal: n })), ...extra.map((x) => ({ itemId: x.itemId, aantal: x.aantal, opties: x.opties }))],
          tijd,
          ...klant,
          email: "",
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { token?: string; error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Bestellen lukte niet. Probeer het opnieuw of bel ons.");
      if (d.token) window.location.assign(`/horeca/${slug}/levering/${encodeURIComponent(d.token)}`);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Bestellen lukte niet.");
      setBezig(false);
    }
  }

  if (!soorten.length) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-10">
        <p role="status" className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          Vandaag nemen we geen online bestellingen meer aan. Bel ons gerust, of kom langs.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      {soorten.length > 1 && (
        <div role="group" aria-label="Afhalen of bezorgen" className="flex gap-2">
          {soorten.map((s) => (
            <button key={s} type="button" aria-pressed={soort === s} onClick={() => kiesSoort(s)} className={`flex-1 rounded-full px-4 py-3 text-sm font-bold ${soort === s ? "bg-[var(--rs-nacht)] text-[var(--rs-creme)]" : "bg-white ring-1 ring-[#0A120E]/20"}`}>
              {s === "afhalen" ? "Afhalen" : "Bezorgen"}
            </button>
          ))}
        </div>
      )}
      {soort === "bezorgen" && (
        <p className="mt-3 text-sm text-[#0A120E]/75">
          We bezorgen tot {km(opties.straalKm)} · minimaal {euro(opties.minimumCent)} · bezorgkosten {euro(opties.kostenCent)}
          {opties.gratisVanafCent !== null && `, gratis vanaf ${euro(opties.gratisVanafCent)}`}
        </p>
      )}

      {groepen.map((g) => (
        <section key={g.id} aria-labelledby={`lg-${g.id}`} className="mt-6">
          <h2 id={`lg-${g.id}`} className="font-display text-2xl font-bold">
            {g.naam}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {g.items.map((i) => (
              <li key={i.id} className="flex min-w-0 items-center justify-between gap-3 rounded-[1.25rem] bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                <div className="min-w-0">
                  <p className="font-bold">{i.naam}</p>
                  {i.omschrijving && <p className="mt-0.5 text-sm text-[#0A120E]/70">{i.omschrijving}</p>}
                  <p className="mt-1 text-sm font-semibold">{euro(i.prijsCent)}</p>
                </div>
                {i.beschikbaar ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {aantalVan(i.id) > 0 && (
                      <>
                        <button type="button" onClick={() => minder(i.id)} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#0A120E]/20 font-bold" aria-label={`Eén ${i.naam} minder`}>
                          −
                        </button>
                        <span className="w-6 text-center font-bold" aria-live="polite">
                          {aantalVan(i.id)}
                        </span>
                      </>
                    )}
                    <button type="button" onClick={() => (i.opties.length ? setKiezen(i) : zet(i.id, (mand[i.id] ?? 0) + 1))} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--rs-nacht)] font-bold text-[var(--rs-creme)]" aria-label={`${i.naam} erbij`}>
                      +
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 text-sm text-[#0A120E]/60">Uitverkocht</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {aantal > 0 && (
        <form onSubmit={(e) => void bestel(e)} className="mt-8 space-y-3 rounded-[1.75rem] bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.06)]" aria-labelledby="lever-afronden">
          <h2 id="lever-afronden" className="font-display text-2xl font-bold">
            {soort === "bezorgen" ? "Bezorgen" : "Afhalen"}: je gegevens
          </h2>
          <label className="block text-sm font-semibold">
            Naam
            <input className={veld} value={klant.naam} onChange={(e) => zetKlant("naam", e.target.value)} maxLength={60} required autoComplete="name" />
          </label>
          <label className="block text-sm font-semibold">
            Telefoon (voor als we je moeten bellen)
            <input className={veld} type="tel" value={klant.telefoon} onChange={(e) => zetKlant("telefoon", e.target.value)} maxLength={20} required autoComplete="tel" />
          </label>
          {soort === "bezorgen" && (
            <>
              <label className="block text-sm font-semibold">
                Straat en huisnummer
                <input className={veld} value={klant.adres} onChange={(e) => zetKlant("adres", e.target.value)} maxLength={120} required autoComplete="street-address" />
              </label>
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                <label className="block text-sm font-semibold">
                  Postcode
                  <input className={veld} value={klant.postcode} onChange={(e) => zetKlant("postcode", e.target.value)} maxLength={8} required autoComplete="postal-code" />
                </label>
                <label className="block text-sm font-semibold">
                  Plaats
                  <input className={veld} value={klant.plaats} onChange={(e) => zetKlant("plaats", e.target.value)} maxLength={60} required autoComplete="address-level2" />
                </label>
              </div>
            </>
          )}
          <label className="block text-sm font-semibold">
            {soort === "bezorgen" ? "Wanneer bezorgen?" : "Wanneer ophalen?"}
            <select className={veld} value={tijd} onChange={(e) => setTijd(e.target.value)}>
              {keuze.zsm && <option value="zsm">Zo snel mogelijk</option>}
              {keuze.slots.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Opmerking (allergie, aanbellen…, mag leeg)
            <input className={veld} value={klant.opmerking} onChange={(e) => zetKlant("opmerking", e.target.value)} maxLength={300} />
          </label>
          {/* verborgen veld tegen bots: een mens ziet en vult het niet */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Bedrijf
              <input tabIndex={-1} autoComplete="off" value={klant.bedrijf} onChange={(e) => zetKlant("bedrijf", e.target.value)} />
            </label>
          </div>
          <dl className="space-y-1 border-t border-[#0A120E]/10 pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Gerechten</dt>
              <dd>{euro(subtotaal)}</dd>
            </div>
            {soort === "bezorgen" && (
              <div className="flex justify-between">
                <dt>Bezorgkosten</dt>
                <dd>{kosten ? euro(kosten) : "gratis"}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Te betalen</dt>
              <dd>{euro(subtotaal + kosten)}</dd>
            </div>
          </dl>
          <p className="text-sm text-[#0A120E]/75">
            Je betaalt bij {soort === "bezorgen" ? "de bezorging" : "het ophalen"}. De zaak bevestigt de tijd; dat zie je meteen op de volgende pagina. We gebruiken je gegevens alleen voor deze bestelling en wissen ze na een jaar.
          </p>
          {teKort && (
            <p role="alert" className="rounded-xl bg-[#FDE2E2] px-3 py-2 text-sm font-semibold text-[#B91C1C]">
              Bezorgen kan vanaf {euro(opties.minimumCent)} aan gerechten.
            </p>
          )}
          {fout && (
            <p role="alert" className="rounded-xl bg-[#FDE2E2] px-3 py-2 text-sm font-semibold text-[#B91C1C]">
              {fout}
            </p>
          )}
          <button type="submit" disabled={bezig || teKort} className="w-full rounded-full bg-[var(--rs-nacht)] px-5 py-3.5 font-bold text-[var(--rs-creme)] disabled:opacity-60">
            {bezig ? "Bezig…" : `Bestellen · ${euro(subtotaal + kosten)}`}
          </button>
        </form>
      )}

      {aantal > 0 && (
        <a href="#lever-afronden" className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-3xl items-center justify-between rounded-full bg-[var(--rs-nacht)] px-5 py-3.5 font-bold text-[var(--rs-creme)] shadow-lg">
          <span>Mandje ({aantal})</span>
          <span>{euro(subtotaal + kosten)}</span>
        </a>
      )}

      {kiezen && (
        <KeuzeVenster
          naam={kiezen.naam}
          prijsCent={kiezen.prijsCent}
          groepen={kiezen.opties}
          sluit={() => setKiezen(null)}
          kies={(gk) => {
            const item = kiezen;
            setKiezen(null);
            setExtra((ex) => {
              const zelfde = ex.find((x) => x.itemId === item.id && x.tekst === gk.tekst);
              if (zelfde) return ex.map((x) => (x === zelfde ? { ...x, aantal: Math.min(MAX_AANTAL, x.aantal + 1) } : x));
              return [...ex, { sleutel: `${item.id}-${ex.length}-${gk.tekst}`, itemId: item.id, aantal: 1, opties: gk.opties, tekst: gk.tekst, prijsCent: gk.prijsCent }];
            });
          }}
        />
      )}
    </div>
  );
}
