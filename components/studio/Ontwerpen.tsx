"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { IExternal, IX, PageHead, Pill, btn } from "@/components/studio/ui";
import { isHuidigOntwerp } from "@/lib/sites/ontwerp-wissel";
import type { OntwerpKaart } from "@/lib/sites/ontwerpen";
import type { SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Studio → Ontwerpen, zoals de thema's van Shopify en de templates van Wix: elk
// ontwerp van deze soort als kaart, met een foto en de kleuren van het ontwerp,
// "Voorbeeld bekijken" (de voorbeeldsite) en "Dit ontwerp gebruiken". Op een site
// die er al is verandert standaard alleen de stijl; met een vinkje komen ook de
// ontbrekende pagina's en blokken erbij (lib/sites/ontwerp-wissel.ts). De laatste
// wissel kan ongedaan. Zonder site begint de gewone start met dit ontwerp gekozen.
// De kaarten komen van de pagina (lib/sites/ontwerpen-server.ts).
// ---------------------------------------------------------------------------

interface Vorige {
  ontwerpId: string;
  naam: string;
  at: string;
}

const LETTERS: Record<OntwerpKaart["thema"]["lettertype"], string> = { modern: "moderne letters", klassiek: "klassieke letters", vriendelijk: "vriendelijke letters" };
const HOEKEN: Record<OntwerpKaart["thema"]["hoeken"], string> = { rond: "ronde hoeken", strak: "strakke hoeken" };
const ALLES = "alles";

const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** Waar de start begint met dit ontwerp gekozen: de webshop-start, of de start van de websitebouwer. */
const startHref = (soort: SiteSoort, base: string, id: string) => `${soort === "webshop" ? base : `${base}/bouwer`}?ontwerp=${encodeURIComponent(id)}`;

export default function Ontwerpen({ kaarten }: { kaarten: OntwerpKaart[] }) {
  const { data, soort, base, api, reload } = useStudio();
  const site = data?.site ?? null;
  const heeftSite = Boolean(site);
  const woord = soort === "webshop" ? "webshop" : "website";
  const [filter, setFilter] = useState(ALLES);
  const [kies, setKies] = useState<OntwerpKaart | null>(null);
  const [vorige, setVorige] = useState<Vorige | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const [terugBezig, setTerugBezig] = useState(false);

  // de laatste wissel die nog ongedaan kan
  useEffect(() => {
    if (!heeftSite) return;
    void fetch(api("/ontwerp"), { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ vorige: Vorige | null }>) : null))
      .then((d) => setVorige(d?.vorige ?? null))
      .catch(() => undefined);
  }, [heeftSite, api]);

  const categorieen = [...new Set(kaarten.map((k) => k.categorie))];
  const zichtbaar = filter === ALLES ? kaarten : kaarten.filter((k) => k.categorie === filter);

  const terug = async () => {
    setTerugBezig(true);
    setMelding(null);
    const res = await fetch(api("/ontwerp"), { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setTerugBezig(false);
      return setMelding({ ok: false, text: await foutVan(res, "Ongedaan maken lukte niet. Probeer het opnieuw.") });
    }
    const d = (await res.json()) as { bleven: number };
    await reload();
    setTerugBezig(false);
    setVorige(null);
    const bleven = d.bleven === 0 ? "" : d.bleven === 1 ? " Eén pagina of blok dat erbij kwam, had je daarna zelf aangepast; dat blijft staan." : ` ${d.bleven} pagina's of blokken die erbij kwamen, had je daarna zelf aangepast; die blijven staan.`;
    setMelding({ ok: true, text: `Je vorige ontwerp staat weer klaar.${bleven} Klik bovenaan op Publiceren om het ook online te zetten.` });
  };

  const klaar = (k: OntwerpKaart, d: { vorige: Vorige; erbij: { paginas: number; blokken: number } }) => {
    setKies(null);
    setVorige(d.vorige);
    const delen = [d.erbij.paginas ? `${d.erbij.paginas} ${d.erbij.paginas === 1 ? "pagina" : "pagina's"}` : "", d.erbij.blokken ? `${d.erbij.blokken} ${d.erbij.blokken === 1 ? "blok" : "blokken"}` : ""].filter(Boolean);
    setMelding({ ok: true, text: `Je ${woord} gebruikt nu het ontwerp ${k.naam}${delen.length ? `, met ${delen.join(" en ")} erbij` : ""}. Bekijk het bij Ontwerp en klik bovenaan op Publiceren om het online te zetten.` });
  };

  return (
    <>
      <PageHead
        title="Ontwerpen"
        sub={
          heeftSite
            ? `Kies een kant-en-klaar ontwerp voor je ${woord}. Bekijk eerst het voorbeeld. Je teksten${soort === "webshop" ? ", producten en bestellingen" : " en foto's"} blijven altijd staan.`
            : `Kies een ontwerp om je ${woord} mee te beginnen. Bekijk eerst het voorbeeld; je kunt later altijd wisselen.`
        }
        actions={heeftSite ? <Link href={`${base}/ontwerp`} className={btn.secondary}>Kleuren en letters aanpassen</Link> : undefined}
      />

      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>
          {melding.text}
        </p>
      )}

      {vorige && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3e3e3] bg-white px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-[#303030]">
            Laatst gekozen: <span className="font-semibold">{vorige.naam}</span>, op {wanneer(vorige.at)}. Wil je terug naar je ontwerp van daarvoor?
          </p>
          <button type="button" disabled={terugBezig} onClick={() => void terug()} className={btn.secondary}>
            {terugBezig ? "Bezig…" : "Ongedaan maken"}
          </button>
        </div>
      )}

      {categorieen.length > 1 && (
        <div role="group" aria-label="Filter op branche" className="mb-4 flex flex-wrap gap-2">
          {[ALLES, ...categorieen].map((c) => {
            const aantal = c === ALLES ? kaarten.length : kaarten.filter((k) => k.categorie === c).length;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={filter === c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a1a] ${filter === c ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#d4d4d4] bg-white text-[#303030] hover:bg-[#f7f7f7]"}`}
              >
                {c === ALLES ? "Alle ontwerpen" : c} <span className={filter === c ? "text-white/70" : "text-[#707070]"}>{aantal}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {zichtbaar.map((k) => (
          <Kaart key={k.id} k={k} soort={soort} base={base} heeftSite={heeftSite} huidig={site ? isHuidigOntwerp(site.theme, k.thema) : false} onKies={setKies} />
        ))}
      </ul>

      {kies && <KiesDialoog k={kies} soort={soort} onSluit={() => setKies(null)} onKlaar={(d) => klaar(kies, d)} />}
    </>
  );
}

/** De foto van het ontwerp met een schets van de site in zijn kleuren: de kop in de hoofdkleur, de knoppen in de accentkleur. */
function Miniatuur({ k }: { k: OntwerpKaart }) {
  const rond = k.thema.hoeken === "rond";
  const knop = { background: k.thema.accent, borderRadius: rond ? 999 : 3 };
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[#f1f1f1]" aria-hidden>
      <Image src={k.foto} alt="" fill sizes="(min-width: 1280px) 340px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
      <div className="absolute inset-x-0 top-0 flex h-8 items-center gap-2 px-3" style={{ background: k.thema.kleur }}>
        <span className="h-2 w-14 rounded-full bg-white/85" />
        <span className="ml-auto h-1.5 w-7 rounded-full bg-white/50" />
        <span className="h-1.5 w-7 rounded-full bg-white/50" />
        <span className="h-4 w-10" style={knop} />
      </div>
      <div className="absolute inset-x-3 bottom-3 p-3 shadow-lg" style={{ background: `${k.thema.kleur}eb`, borderRadius: rond ? 14 : 4 }}>
        <span className="block h-2.5 w-4/5 rounded-full bg-white/90" />
        <span className="mt-2 block h-1.5 w-3/5 rounded-full bg-white/60" />
        <span className="mt-3 block h-5 w-20" style={knop} />
      </div>
    </div>
  );
}

function Kaart({ k, soort, base, heeftSite, huidig, onKies }: { k: OntwerpKaart; soort: SiteSoort; base: string; heeftSite: boolean; huidig: boolean; onKies: (k: OntwerpKaart) => void }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-[#e3e3e3] bg-white shadow-[0_1px_0_rgba(0,0,0,.05),0_1px_3px_rgba(0,0,0,.04)]">
      <Miniatuur k={k} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#707070]">{k.categorie}</p>
            <h2 className="mt-0.5 text-base font-semibold text-[#1a1a1a]">{k.naam}</h2>
          </div>
          {huidig && <Pill tone="ok">In gebruik</Pill>}
        </div>
        <p className="mt-1 flex-1 text-sm text-[#616161]">{k.omschrijving}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-[#616161]">
          <span className="flex gap-1" aria-hidden>
            <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: k.thema.kleur }} />
            <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: k.thema.accent }} />
          </span>
          Stijl {k.stijlNaam}, {LETTERS[k.thema.lettertype]}, {HOEKEN[k.thema.hoeken]}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {k.voorbeeld && (
            // een gewone link in een nieuw venster: de voorbeeldsite is een eigen site (app/site), geen pagina van de app
            <a href={k.voorbeeld} target="_blank" rel="noopener" className={btn.secondary}>
              Voorbeeld bekijken <IExternal width={15} height={15} />
              <span className="sr-only">: {k.naam} (opent in een nieuw venster)</span>
            </a>
          )}
          {heeftSite ? (
            <button type="button" disabled={huidig} onClick={() => onKies(k)} className={btn.primary}>
              {huidig ? "Al in gebruik" : "Dit ontwerp gebruiken"}
              <span className="sr-only">: {k.naam}</span>
            </button>
          ) : (
            <Link href={startHref(soort, base, k.id)} className={btn.primary}>
              Begin met dit ontwerp<span className="sr-only">: {k.naam}</span>
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Bevestigen, met precies wat er verandert en wat blijft. */
function KiesDialoog({ k, soort, onSluit, onKlaar }: { k: OntwerpKaart; soort: SiteSoort; onSluit: () => void; onKlaar: (d: { vorige: Vorige; erbij: { paginas: number; blokken: number } }) => void }) {
  const { api, reload } = useStudio();
  const [paginas, setPaginas] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const kader = useRef<HTMLDivElement>(null);
  useEffect(() => {
    kader.current?.focus();
  }, []);
  const woord = soort === "webshop" ? "webshop" : "website";

  const gebruik = async () => {
    setBezig(true);
    setFout(null);
    const res = await fetch(api("/ontwerp"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ontwerpId: k.id, paginas }) }).catch(() => null);
    if (!res?.ok) {
      setBezig(false);
      return setFout(await foutVan(res, "Wisselen lukte niet. Probeer het opnieuw."));
    }
    const d = (await res.json()) as { vorige: Vorige; erbij: { paginas: number; blokken: number } };
    await reload();
    onKlaar(d);
  };
  const toets = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !bezig) onSluit();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ontwerp-kies-titel" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !bezig && onSluit()} onKeyDown={toets}>
      <div ref={kader} tabIndex={-1} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-[#ebebeb] px-5 py-3.5">
          <h2 id="ontwerp-kies-titel" className="flex-1 font-semibold text-[#1a1a1a]">Ontwerp {k.naam} gebruiken?</h2>
          <button type="button" onClick={onSluit} disabled={bezig} aria-label="Sluiten" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5"><IX width={16} height={16} /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm text-[#303030]">
          <div>
            <p className="font-semibold text-[#1a1a1a]">Dit verandert</p>
            <p className="mt-1 flex items-center gap-2 text-[#616161]">
              <span className="flex gap-1" aria-hidden>
                <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: k.thema.kleur }} />
                <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: k.thema.accent }} />
              </span>
              De kleuren, het lettertype, de hoeken en de stijl ({k.stijlNaam}) van je {woord}.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#1a1a1a]">Dit blijft hetzelfde</p>
            <p className="mt-1 text-[#616161]">
              {soort === "webshop"
                ? "Je producten, voorraad, bestellingen, klanten, kortingen, verzending en betalen, en je teksten, foto's, logo en pagina's."
                : "Je teksten, foto's, logo, pagina's, berichten en reserveringen."}
            </p>
          </div>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-[#e3e3e3] p-3">
            <input type="checkbox" checked={paginas} onChange={(e) => setPaginas(e.target.checked)} aria-describedby="ontwerp-kies-opzet" className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#1a1a1a]" />
            <span>
              <span className="block font-semibold text-[#1a1a1a]">Ook de pagina-opzet van dit ontwerp overnemen</span>
              <span id="ontwerp-kies-opzet" className="mt-0.5 block text-[#616161]">
                Pagina&apos;s en blokken uit dit ontwerp die je nog niet hebt, komen erbij, met algemene teksten en je eigen bedrijfsnaam. Wat je al hebt, blijft precies staan: we overschrijven en verwijderen niets. Reviews zetten we er nooit bij.
              </span>
            </span>
          </label>
          <p className="rounded-xl bg-[#f7f7f7] px-3 py-2.5 text-[#616161]">
            Dit verandert eerst alleen je concept. Bezoekers zien het pas als je bovenaan op Publiceren klikt. Spijt? Met Ongedaan maken zet je je vorige ontwerp terug.
          </p>
          {fout && <p role="alert" className="rounded-xl bg-[#fed1d7] px-3 py-2 text-[#8e0b21]">{fout}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#ebebeb] px-5 py-3.5">
          <button type="button" onClick={onSluit} disabled={bezig} className={btn.secondary}>Annuleren</button>
          <button type="button" onClick={() => void gebruik()} disabled={bezig} className={btn.primary}>{bezig ? "Bezig…" : "Ontwerp gebruiken"}</button>
        </footer>
      </div>
    </div>
  );
}
