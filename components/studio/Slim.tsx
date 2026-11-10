"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { Card, ICheck, ISparkle, PageHead, Pill, btn, input } from "@/components/studio/ui";
import { KORTE_TEKST_MAX, MAX_PER_RONDE, productTekstInvoer, teControleren, zonderGoedeTekst } from "@/lib/sites/producttekst";
import { GROEP_LABEL, WETTELIJKE_PAGINAS, metStandaardPagina, winkelCheck, type CheckActie, type CheckPunt, type WettelijkeSlug } from "@/lib/sites/winkel-check";

// ---------------------------------------------------------------------------
// Studio → Webshop → Slim: slimme hulp voor de eigenaar van de webshop.
//  - Winkelcheck (lib/sites/winkel-check.ts): wat er aan de winkel beter kan,
//    uit de echte gegevens, met per punt waarom het telt en een knop om het op
//    te lossen. Zonder AI, dus het werkt altijd.
//  - Producttekst schrijven: de AI stelt een korte zin en een omschrijving voor
//    (POST …/sites/slim/producttekst); de eigenaar leest, past aan en slaat het
//    zelf op in het product. Er wordt nooit iets vanzelf opgeslagen.
// ---------------------------------------------------------------------------

const B = "/studio/webshop";
const ZONDER = "zonder";
const nieuwId = () => `b${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

export default function Slim() {
  const [keuze, setKeuze] = useState("");
  const schrijver = useRef<HTMLDivElement>(null);
  const naarSchrijver = () => {
    setKeuze(ZONDER);
    schrijver.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <>
      <PageHead title="Slim" sub="Een check van je webshop, en hulp bij het schrijven van je productteksten." />
      <div className="space-y-4">
        <Winkelcheck onSchrijf={naarSchrijver} />
        <div ref={schrijver} className="scroll-mt-20">
          <Schrijver keuze={keuze} onKeuze={setKeuze} />
        </div>
      </div>
    </>
  );
}

// ---- winkelcheck --------------------------------------------------------------

const ZICHTBAAR = 5;

function scoreZin(score: number): string {
  if (score >= 90) return "Je webshop staat er goed voor.";
  if (score >= 70) return "Bijna klaar: nog een paar punten.";
  if (score >= 40) return "Er is nog wat te doen.";
  return "Er is nog veel te doen voordat klanten goed kunnen kopen.";
}

function Winkelcheck({ onSchrijf }: { onSchrijf: () => void }) {
  const { data, unpublished, publish, reload, api } = useStudio();
  const site = data!.site!;
  const check = useMemo(() => winkelCheck({ site, unpublished, canPublish: Boolean(data?.canPublish) }), [site, unpublished, data?.canPublish]);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const problemen = check.punten.filter((p) => p.status === "probleem").length;
  const letOp = check.punten.length - problemen;
  const kleur = check.score >= 90 ? "bg-[#29845a]" : check.score >= 60 ? "bg-[#e5a50a]" : "bg-[#d72c0d]";

  const voegPaginaToe = async (slug: WettelijkeSlug) => {
    setMelding(null);
    const pages = metStandaardPagina(site.pages, slug, site.bedrijf, nieuwId);
    if (!pages) return setMelding({ ok: false, text: site.pages.length >= 12 ? "Je webshop heeft al 12 pagina's, het maximum." : "Deze pagina heeft al tekst." });
    setBezig(slug);
    const res = await fetch(api(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: site.theme, bedrijf: site.bedrijf, pages }) }).catch(() => null);
    if (!res?.ok) {
      setBezig(null);
      return setMelding({ ok: false, text: await foutVan(res, "De pagina toevoegen lukte niet.") });
    }
    await reload();
    setBezig(null);
    setMelding({ ok: true, text: `De pagina ${WETTELIJKE_PAGINAS[slug]} staat erin, met dezelfde standaardtekst als een nieuwe webshop. Klik bovenaan op Publiceren om hem online te zetten.` });
  };
  const doePubliceren = async () => {
    setMelding(null);
    setBezig("publiceren");
    const fout = await publish();
    setBezig(null);
    setMelding(fout ? { ok: false, text: fout } : { ok: true, text: "Je webshop is bijgewerkt en staat online." });
  };
  const doe = (actie: CheckActie) => {
    if (actie.soort === "producttekst") onSchrijf();
    else if (actie.soort === "pagina") void voegPaginaToe(actie.slug);
    else if (actie.soort === "publiceren") void doePubliceren();
  };

  return (
    <Card title="Winkelcheck" actions={<span className="text-xs text-[#707070]">uit je eigen gegevens, zonder AI</span>}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-4xl font-bold tracking-tight text-[#1a1a1a]">
          {check.score}
          <span className="text-lg font-semibold text-[#707070]"> / 100</span>
        </p>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-semibold text-[#1a1a1a]">{scoreZin(check.score)}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ebebeb]" role="img" aria-label={`Score ${check.score} van de 100`}>
            <div className={`h-full rounded-full ${kleur}`} style={{ width: `${check.score}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-[#707070]">
            {problemen} {problemen === 1 ? "probleem" : "problemen"} · {letOp} om na te lopen · {check.goed.length} in orde
          </p>
        </div>
      </div>

      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>
          {melding.text}
        </p>
      )}

      {check.punten.length === 0 ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-medium text-[#0c5132]">
          <ICheck /> Alles wat we controleren, is in orde.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[#f1f1f1] border-t border-[#f1f1f1]">
          {check.punten.map((p) => (
            <Punt key={p.id} punt={p} bezig={bezig} onDoe={doe} bedrijfOnvolledig={check.punten.some((x) => x.id === "bedrijf-kvk" || x.id === "bedrijf-adres" || x.id === "bedrijf-email")} />
          ))}
        </ul>
      )}

      {check.goed.length > 0 && (
        <details className="mt-4 rounded-xl border border-[#ebebeb] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#1a1a1a]">Wat al goed is ({check.goed.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {check.goed.map((g) => (
              <li key={g} className="flex items-start gap-2 text-sm text-[#303030]">
                <ICheck width={16} height={16} className="mt-0.5 flex-shrink-0 text-[#29845a]" /> {g}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Punt({ punt, bezig, onDoe, bedrijfOnvolledig }: { punt: CheckPunt; bezig: string | null; onDoe: (a: CheckActie) => void; bedrijfOnvolledig: boolean }) {
  const [alles, setAlles] = useState(false);
  const lijst = alles ? punt.producten : punt.producten.slice(0, ZICHTBAAR);
  const rest = punt.producten.length - lijst.length;
  const a = punt.actie;
  const knopBezig = a ? (a.soort === "pagina" ? bezig === a.slug : a.soort === "publiceren" && bezig === "publiceren") : false;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        {punt.status === "probleem" ? <Pill tone="crit">Probleem</Pill> : <Pill tone="warn">Let op</Pill>}
        <span className="text-xs font-medium text-[#707070]">{GROEP_LABEL[punt.groep]}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-[#1a1a1a]">{punt.titel}</p>
      <p className="mt-0.5 text-sm text-[#616161]">{punt.waarom}</p>
      {lijst.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Producten bij: ${punt.titel}`}>
          {lijst.map((x) => (
            <li key={x.id} className="max-w-full">
              <Link href={x.href} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[#d4d4d4] bg-white px-2.5 py-1 text-xs font-semibold text-[#303030] hover:bg-[#f7f7f7]">
                <span className="truncate">{x.naam}</span>
                {x.extra && <span className="whitespace-nowrap font-normal text-[#707070]">· {x.extra}</span>}
              </Link>
            </li>
          ))}
          {rest > 0 && (
            <li>
              <button type="button" onClick={() => setAlles(true)} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#005bd3] hover:underline">
                en nog {rest}
              </button>
            </li>
          )}
        </ul>
      )}
      {a && (
        <div className="mt-3">
          {a.soort === "link" ? (
            <Link href={a.href} className={btn.secondary}>{a.label}</Link>
          ) : (
            <button type="button" disabled={bezig !== null} onClick={() => onDoe(a)} className={btn.secondary}>
              {a.soort === "producttekst" && <ISparkle width={16} height={16} />}
              {knopBezig ? "Bezig…" : a.label}
            </button>
          )}
          {a.soort === "pagina" && a.slug === "voorwaarden" && bedrijfOnvolledig && (
            <p className="mt-1.5 text-xs text-[#707070]">
              De voorwaarden nemen je bedrijfsgegevens over. Vul die eerst aan bij <Link href={`${B}/instellingen`} className="font-semibold text-[#005bd3] hover:underline">Instellingen</Link>.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ---- producttekst schrijven ---------------------------------------------------

interface Ronde {
  ids: string[];
  plek: number;
  opgeslagen: number;
  overgeslagen: number;
}

interface Voorstel {
  id: string;
  korteTekst: string;
  omschrijving: string;
}

function Schrijver({ keuze, onKeuze }: { keuze: string; onKeuze: (k: string) => void }) {
  const { data, winkel, saveWinkel } = useStudio();
  const site = data!.site!;
  const zonder = useMemo(() => zonderGoedeTekst(winkel.producten), [winkel.producten]);
  const [ronde, setRonde] = useState<Ronde | null>(null);
  const [voorstel, setVoorstel] = useState<Voorstel | null>(null);
  const [bezig, setBezig] = useState<"schrijven" | "opslaan" | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);
  // een antwoord dat binnenkomt na Stoppen of een nieuw verzoek, telt niet meer
  const verzoek = useRef(0);

  const product = voorstel ? (winkel.producten.find((p) => p.id === voorstel.id) ?? null) : null;
  const controleer = useMemo(
    () => (voorstel && product ? teControleren({ korteTekst: voorstel.korteTekst, omschrijving: voorstel.omschrijving }, productTekstInvoer(product, site.bedrijf.naam)) : []),
    [voorstel, product, site.bedrijf.naam],
  );

  const schrijf = async (r: Ronde) => {
    const id = r.ids[r.plek];
    const nr = ++verzoek.current;
    setRonde(r);
    setVoorstel(null);
    setFout(null);
    if (!id) {
      setRonde(null);
      setKlaar(r.ids.length === 1 ? (r.opgeslagen ? "Opgeslagen en meteen online." : "Niets opgeslagen.") : `Klaar: ${r.opgeslagen} opgeslagen, ${r.overgeslagen} overgeslagen.`);
      return;
    }
    setBezig("schrijven");
    const res = await fetch("/api/werkgever/sites/slim/producttekst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id }) }).catch(() => null);
    if (nr !== verzoek.current) return;
    setBezig(null);
    if (!res?.ok) return setFout(await foutVan(res, "De AI kan nu geen tekst schrijven. Probeer het over een paar minuten opnieuw."));
    const d = (await res.json().catch(() => null)) as { voorstel?: { korteTekst?: unknown; omschrijving?: unknown } } | null;
    if (nr !== verzoek.current) return;
    const v = d?.voorstel;
    if (typeof v?.korteTekst !== "string" || typeof v.omschrijving !== "string") return setFout("De AI gaf geen bruikbare tekst. Probeer het nog een keer.");
    setVoorstel({ id, korteTekst: v.korteTekst, omschrijving: v.omschrijving });
  };

  const start = () => {
    setKlaar(null);
    const ids = keuze === ZONDER ? zonder.slice(0, MAX_PER_RONDE).map((p) => p.id) : winkel.producten.some((p) => p.id === keuze) ? [keuze] : [];
    if (!ids.length) return setFout(keuze === ZONDER ? "Elk product heeft al een korte zin en een omschrijving." : "Kies eerst een product.");
    void schrijf({ ids, plek: 0, opgeslagen: 0, overgeslagen: 0 });
  };
  const verder = (opgeslagen: boolean) => {
    if (!ronde) return;
    void schrijf({ ...ronde, plek: ronde.plek + 1, opgeslagen: ronde.opgeslagen + (opgeslagen ? 1 : 0), overgeslagen: ronde.overgeslagen + (opgeslagen ? 0 : 1) });
  };
  const stop = () => {
    verzoek.current++;
    setBezig(null);
    setRonde(null);
    setVoorstel(null);
    setFout(null);
    setKlaar(ronde && ronde.opgeslagen ? `Gestopt: ${ronde.opgeslagen} opgeslagen.` : null);
  };
  const opslaan = async () => {
    if (!voorstel) return;
    if (!winkel.producten.some((p) => p.id === voorstel.id)) return setFout("Dit product bestaat niet meer.");
    setFout(null);
    setBezig("opslaan");
    const korteTekst = voorstel.korteTekst.replace(/\s+/g, " ").trim().slice(0, 200);
    const omschrijving = voorstel.omschrijving.trim().slice(0, 4000);
    const err = await saveWinkel({ ...winkel, producten: winkel.producten.map((p) => (p.id === voorstel.id ? { ...p, korteTekst, omschrijving } : p)) });
    setBezig(null);
    if (err) return setFout(err);
    verder(true);
  };
  const zet = (patch: Partial<Voorstel>) => setVoorstel((v) => (v ? { ...v, ...patch } : v));
  const kort = voorstel?.korteTekst.trim().length ?? 0;

  return (
    <Card title="Producttekst schrijven" actions={<span className="text-xs text-[#707070]">met AI, jij beslist</span>}>
      <p className="text-sm text-[#616161]">
        De AI stelt een korte zin (voor de productkaart en Google) en een omschrijving voor, alleen uit wat je zelf bij het product invulde: naam, categorie, keuzes, prijs en de tekst die er al staat. Jij leest het na, past het aan en slaat het op. Zonder jouw klik verandert er niets.
      </p>

      {winkel.producten.length === 0 ? (
        <p className="mt-4 text-sm text-[#303030]">
          Voeg eerst een product toe. <Link href={`${B}/producten/nieuw`} className="font-semibold text-[#005bd3] hover:underline">Product toevoegen</Link>
        </p>
      ) : (
        !ronde && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-0 flex-1 basis-56">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Voor welk product?</span>
              <select className={input} value={keuze} onChange={(e) => { onKeuze(e.target.value); setFout(null); }}>
                <option value="">Kies een product</option>
                {zonder.length > 0 && <option value={ZONDER}>Alle producten zonder goede tekst ({zonder.length > MAX_PER_RONDE ? `${MAX_PER_RONDE} van ${zonder.length}` : zonder.length})</option>}
                {winkel.producten.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam || "Naamloos product"}
                    {!p.omschrijving.trim() ? " (geen omschrijving)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!keuze || bezig !== null} onClick={start} className={btn.primary}>
              <ISparkle width={16} height={16} /> Schrijf een voorstel
            </button>
          </div>
        )
      )}

      {klaar && !ronde && <p role="status" className="mt-3 text-sm font-medium text-[#0c5132]">{klaar}</p>}

      {ronde && (
        <div className="mt-4 rounded-xl border border-[#ebebeb] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {ronde.ids.length > 1 && <Pill tone="info">Product {ronde.plek + 1} van {ronde.ids.length}</Pill>}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a1a1a]">{winkel.producten.find((p) => p.id === ronde.ids[ronde.plek])?.naam ?? ""}</p>
            <button type="button" disabled={bezig === "opslaan"} onClick={stop} className={btn.quiet}>Stoppen</button>
          </div>

          {bezig === "schrijven" && (
            <div role="status" className="mt-4 space-y-2">
              <p className="text-sm text-[#616161]">De AI schrijft een voorstel. Dat kan tot een minuut duren.</p>
              <div className="h-9 animate-pulse rounded-xl bg-[#f1f1f1]" />
              <div className="h-28 animate-pulse rounded-xl bg-[#f1f1f1]" />
            </div>
          )}

          {fout && (
            <div className="mt-4">
              <p role="alert" className="rounded-xl bg-[#fed1d7] px-4 py-2.5 text-sm text-[#8e0b21]">{fout}</p>
              {!voorstel && bezig === null && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void schrijf(ronde)} className={btn.secondary}>Opnieuw proberen</button>
                  {ronde.plek + 1 < ronde.ids.length && <button type="button" onClick={() => verder(false)} className={btn.quiet}>Dit product overslaan</button>}
                </div>
              )}
            </div>
          )}

          {voorstel && product && (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-[#707070]">Voorstel van de AI. Lees het na en pas aan waar nodig; het staat pas op je webshop als je op Opslaan klikt.</p>
              <div>
                <label className="block">
                  <span className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-[#303030]">
                    Korte zin (op de productkaart en in Google)
                    <span className={`text-xs font-normal ${kort > KORTE_TEKST_MAX ? "text-[#b42318]" : "text-[#707070]"}`}>{kort} van {KORTE_TEKST_MAX} tekens</span>
                  </span>
                  <input className={input} value={voorstel.korteTekst} maxLength={200} onChange={(e) => zet({ korteTekst: e.target.value })} />
                </label>
                <Huidig tekst={product.korteTekst} onHoud={() => zet({ korteTekst: product.korteTekst })} />
              </div>
              <div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#303030]">Omschrijving</span>
                  <textarea className={`${input} min-h-[160px] leading-relaxed`} value={voorstel.omschrijving} maxLength={4000} onChange={(e) => zet({ omschrijving: e.target.value })} />
                </label>
                <Huidig tekst={product.omschrijving} onHoud={() => zet({ omschrijving: product.omschrijving })} />
              </div>

              {controleer.length > 0 && (
                <div className="rounded-xl border border-[#f5d48a] bg-[#fff8e6] px-4 py-3 text-sm text-[#4f4700]">
                  <p className="font-semibold">Loop dit na voordat je opslaat</p>
                  <p className="mt-0.5">
                    De tekst noemt {controleer.map((c) => `"${c}"`).join(", ")}. Dat staat niet in je eigen gegevens van dit product. Klopt het niet, haal het dan weg: een klant mag erop rekenen.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-[#ebebeb] p-4">
                <p className="text-xs font-medium text-[#707070]">Zo staat het in Google</p>
                <p className="mt-1 truncate text-lg text-[#1a0dab]">{`${product.naam} | ${site.bedrijf.naam}`.slice(0, 70)}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156]">{(voorstel.korteTekst || voorstel.omschrijving).replace(/\s+/g, " ").slice(0, KORTE_TEKST_MAX)}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={bezig !== null} onClick={() => void opslaan()} className={btn.primary}>
                  {bezig === "opslaan" ? "Opslaan…" : ronde.plek + 1 < ronde.ids.length ? "Opslaan en volgende" : "Opslaan in product"}
                </button>
                <button type="button" disabled={bezig !== null} onClick={() => void schrijf(ronde)} className={btn.secondary}>Nieuw voorstel</button>
                {ronde.ids.length > 1 && (
                  <button type="button" disabled={bezig !== null} onClick={() => verder(false)} className={btn.quiet}>Overslaan</button>
                )}
                <Link href={`${B}/producten/${product.id}`} className="ml-auto text-sm font-semibold text-[#005bd3] hover:underline">Product openen</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Wat er nu bij het product staat, met een knop om dat te houden. */
function Huidig({ tekst, onHoud }: { tekst: string; onHoud: () => void }) {
  const t = tekst.trim();
  if (!t) return <p className="mt-1 text-xs text-[#707070]">Nu: nog leeg.</p>;
  return (
    <p className="mt-1 text-xs text-[#707070]">
      Nu: <span className="text-[#303030]">{t.length > 160 ? `${t.slice(0, 160)}…` : t}</span>{" "}
      <button type="button" onClick={onHoud} className="font-semibold text-[#005bd3] hover:underline">Huidige houden</button>
    </p>
  );
}
