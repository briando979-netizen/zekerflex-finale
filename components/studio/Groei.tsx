"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { Card, ICheck, IExternal, PageHead, Pill, btn, input } from "@/components/studio/ui";
import type { GroeiStand, WachtToestand } from "@/lib/sites/groei";
import type { SiteProduct } from "@/lib/sites/types";
import { zichtbareProducten } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Studio → Webshop → Groei: wat de webshop meer verkopen oplevert, allemaal
// gratis. De productfeed voor Google Shopping (lib/sites/productfeed.ts), alles
// exporteren voor Excel (lib/sites/export-csv.ts), de wachtlijsten "mail me als
// het er weer is" (alleen aantallen, lib/sites/voorraadmelding-opslag.ts) en
// per product een link en QR-code om te delen.
// Data: GET/POST /api/werkgever/sites/groei, …/export/<wat>, …/qr.
// ---------------------------------------------------------------------------

const API = "/api/werkgever/sites/groei";

const qrAdres = (productId: string, formaat: "svg" | "png", download = false) =>
  `/api/werkgever/sites/qr?${new URLSearchParams({ ...(productId ? { product: productId } : {}), formaat, ...(download ? { download: "1" } : {}) }).toString()}`;

const TOESTAND: Record<WachtToestand, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  "te-bestellen": { label: "Op voorraad", tone: "ok" },
  uitverkocht: { label: "Uitverkocht", tone: "warn" },
  verborgen: { label: "Verborgen", tone: "neutral" },
  weg: { label: "Uit de winkel", tone: "neutral" },
};

const wachtend = (n: number) => (n === 1 ? "1 persoon wacht" : `${n} mensen wachten`);

export default function Groei() {
  const { base, winkel } = useStudio();
  const [stand, setStand] = useState<GroeiStand | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFout(await foutVan(res, "De gegevens konden niet laden. Probeer het opnieuw."));
    setFout(null);
    setStand((await res.json()) as GroeiStand);
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  return (
    <>
      <PageHead title="Groei" sub="Gratis hulpmiddelen die je webshop meer verkopen opleveren: gevonden worden in Google, klanten terughalen en makkelijk delen." />
      {fout && (
        <Card className="mb-4">
          <p role="alert" className="text-sm text-[#b42318]">{fout}</p>
          <button type="button" className={`${btn.secondary} mt-3`} onClick={() => void laad()}>Opnieuw laden</button>
        </Card>
      )}
      {!stand && !fout ? (
        <div className="space-y-4" aria-busy="true" aria-label="Laden">
          <div className="h-48 animate-pulse rounded-2xl bg-white/70" />
          <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
        </div>
      ) : stand ? (
        <div className="space-y-4">
          <GoogleKaart stand={stand} base={base} />
          <div className="grid gap-4 lg:grid-cols-2">
            <WachtlijstKaart stand={stand} base={base} onStand={setStand} />
            <ExportKaart />
          </div>
          <DelenKaart stand={stand} producten={zichtbareProducten(winkel)} />
        </div>
      ) : null}
    </>
  );
}

/** Een adres om te kopiëren: alleen-lezen veld met een knop; zonder klembord een venster om zelf te kopiëren. */
function KopieerVeld({ id, label, waarde }: { id: string; label: string; waarde: string }) {
  const [klaar, setKlaar] = useState(false);
  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(waarde);
    } catch {
      window.prompt("Kopieer deze link:", waarde);
    }
    setKlaar(true);
    setTimeout(() => setKlaar(false), 2000);
  };
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-[#616161]">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <input id={id} readOnly value={waarde} onFocus={(e) => e.currentTarget.select()} className={`${input} min-w-0 font-mono text-xs`} />
        <button type="button" onClick={() => void kopieer()} className={`${btn.primary} shrink-0`}>
          {klaar && <ICheck />}
          {klaar ? "Gekopieerd" : "Kopieer"}
        </button>
      </div>
      <p role="status" className="sr-only">{klaar ? "Gekopieerd" : ""}</p>
    </div>
  );
}

function GoogleKaart({ stand, base }: { stand: GroeiStand; base: string }) {
  const f = stand.feed;
  const buiten = f.zonderFoto + f.zonderPrijs;
  return (
    <Card title="Gratis in Google Shopping">
      <p className="text-sm text-[#616161]">
        Met deze productfeed toont Google je producten gratis in Google Shopping en in de zoekresultaten. De feed werkt zichzelf bij: prijs en voorraad komen altijd uit je webshop.
      </p>
      {!stand.gepubliceerd ? (
        <p className="mt-4 rounded-xl bg-[#fff8db] px-4 py-3 text-sm text-[#4f4700]">Je webshop staat nog niet online. Publiceer hem eerst (de knop bovenaan); daarna staat hier de link voor Google.</p>
      ) : f.url ? (
        <div className="mt-4 space-y-4">
          <KopieerVeld id="groei-feed" label="Link naar je productfeed" waarde={f.url} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={f.inFeed ? "ok" : "neutral"}>{f.inFeed === 1 ? "1 product in de feed" : `${f.inFeed} producten in de feed`}</Pill>
            {f.zonderFoto > 0 && <Pill tone="warn">{f.zonderFoto === 1 ? "1 product zonder foto" : `${f.zonderFoto} producten zonder foto`}</Pill>}
            {f.zonderPrijs > 0 && <Pill tone="warn">{f.zonderPrijs === 1 ? "1 product zonder prijs" : `${f.zonderPrijs} producten zonder prijs`}</Pill>}
          </div>
          {buiten > 0 && (
            <p className="text-sm text-[#616161]">
              Google neemt alleen producten met een foto en een prijs op. <Link href={`${base}/producten`} className="font-semibold text-[#005bd3] hover:underline">Vul ze aan bij Producten</Link>.
            </p>
          )}
          {!stand.eigenDomein && (
            <p className="rounded-xl bg-[#fff8db] px-4 py-3 text-sm text-[#4f4700]">
              Google wil dat je laat zien dat het webadres van jou is. Dat kan alleen met een eigen domeinnaam (zoals jouwwinkel.nl). <Link href={`${base}/instellingen`} className="font-semibold underline">Koppel je domein bij Instellingen</Link>; de link hierboven verandert dan vanzelf mee.
            </p>
          )}
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a]">Zo zet je je producten in Google</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-[#303030]">
              <li>
                Maak een gratis account in{" "}
                <a href="https://merchants.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#005bd3] hover:underline">
                  Google Merchant Center <IExternal width={13} height={13} />
                </a>
                , vul je bedrijfsgegevens en verzendkosten in en bevestig dat je domein van jou is.
              </li>
              <li>Kies bij Producten voor producten toevoegen met een bestand via een link, en plak de link hierboven.</li>
              <li>Laat Google de feed elke dag ophalen. Na de controle van Google staan je producten gratis in Shopping.</li>
            </ol>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#616161]">Deze site heeft geen productfeed.</p>
      )}
    </Card>
  );
}

function WachtlijstKaart({ stand, base, onStand }: { stand: GroeiStand; base: string; onStand: (s: GroeiStand) => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const mail = async (productId: string) => {
    setBezig(productId);
    setMelding(null);
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "mail", productId }) }).catch(() => null);
    setBezig(null);
    if (!res?.ok) return setMelding({ ok: false, tekst: await foutVan(res, "Mailen lukte niet. Probeer het opnieuw.") });
    const d = (await res.json()) as { verstuurd: number; stand: GroeiStand };
    onStand(d.stand);
    setMelding({ ok: true, tekst: d.verstuurd === 1 ? "1 mail verstuurd." : `${d.verstuurd} mails verstuurd.` });
  };
  return (
    <Card title="Mail me als het er weer is">
      <p className="text-sm text-[#616161]">
        Op een uitverkocht product laten bezoekers hun e-mailadres achter. Zet je de voorraad weer hoger dan 0, dan krijgt iedereen op de lijst vanzelf één mail. Je ziet alleen hoeveel mensen wachten; hun adressen gebruiken we alleen voor die mail en wissen we daarna (of na een half jaar).
      </p>
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>
          {melding.tekst}
        </p>
      )}
      {stand.wachtlijst.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#f7f7f7] px-4 py-3 text-sm text-[#616161]">Nog niemand wacht op een product. Zodra iets uitverkocht is, staat het formulier vanzelf op de productpagina.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[#f1f1f1] rounded-xl border border-[#ebebeb]">
          {stand.wachtlijst.map((w) => (
            <li key={w.productId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#1a1a1a]">{w.naam}</span>
                <span className="block text-xs text-[#616161]">{wachtend(w.aantal)}</span>
              </span>
              <Pill tone={TOESTAND[w.toestand].tone}>{TOESTAND[w.toestand].label}</Pill>
              {w.toestand === "te-bestellen" ? (
                stand.gepubliceerd ? (
                  <button type="button" className={btn.secondary} disabled={bezig !== null} onClick={() => void mail(w.productId)}>
                    {bezig === w.productId ? "Bezig…" : "Mail ze nu"}
                  </button>
                ) : (
                  <span className="text-xs text-[#707070]">Na Publiceren te mailen</span>
                )
              ) : w.toestand !== "weg" ? (
                <Link href={`${base}/producten/${w.productId}`} className={btn.secondary}>{w.toestand === "verborgen" ? "Product tonen" : "Voorraad aanpassen"}</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const EXPORTS: { wat: string; label: string; uitleg: string }[] = [
  { wat: "bestellingen", label: "Bestellingen", uitleg: "met klant, levering en bedragen" },
  { wat: "klanten", label: "Klanten", uitleg: "iedereen die bestelde of reserveerde" },
  { wat: "producten", label: "Producten", uitleg: "prijs, voorraad en link per product" },
];

function ExportKaart() {
  return (
    <Card title="Exporteren">
      <p className="text-sm text-[#616161]">Download je gegevens voor Excel of je boekhouding. Het bestand opent meteen goed in Excel, met bedragen als getal.</p>
      <ul className="mt-4 space-y-2">
        {EXPORTS.map((e) => (
          <li key={e.wat} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ebebeb] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#1a1a1a]">{e.label}</span>
              <span className="block text-xs text-[#616161]">{e.uitleg}</span>
            </span>
            <a href={`/api/werkgever/sites/export/${e.wat}`} download className={btn.secondary}>
              Download CSV<span className="sr-only"> met {e.label.toLowerCase()}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[#707070]">Bestellingen en klanten bevatten namen, adressen en telefoonnummers: bewaar het bestand veilig en deel het niet zomaar.</p>
    </Card>
  );
}

function DelenKaart({ stand, producten }: { stand: GroeiStand; producten: SiteProduct[] }) {
  // "" = de hele winkel
  const [keuze, setKeuze] = useState("");
  const product = producten.find((p) => p.id === keuze) ?? null;
  const link = product ? `${stand.adres}/p/${product.slug}` : `${stand.adres}/winkel`;
  const naam = product?.naam ?? "de webshop";
  const tekst = product ? `${product.naam}: ${link}` : link;
  return (
    <Card title="Delen">
      <p className="text-sm text-[#616161]">Een link en een QR-code per product, voor social media, WhatsApp, een poster of het schap in je winkel. Wie scant of klikt, komt meteen op de productpagina.</p>
      {!stand.gepubliceerd && <p className="mt-4 rounded-xl bg-[#fff8db] px-4 py-3 text-sm text-[#4f4700]">Je webshop staat nog niet online: de links en QR-codes werken pas na Publiceren.</p>}
      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <label htmlFor="groei-product" className="text-xs font-semibold text-[#616161]">Wat wil je delen?</label>
            <select id="groei-product" className={`${input} mt-1.5`} value={keuze} onChange={(e) => setKeuze(e.target.value)}>
              <option value="">De hele webshop</option>
              {producten.map((p) => (
                <option key={p.id} value={p.id}>{p.naam}</option>
              ))}
            </select>
          </div>
          <KopieerVeld id="groei-deellink" label={`Link naar ${naam}`} waarde={link} />
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(tekst)}`} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
              Deel via WhatsApp
            </a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
              Deel op Facebook
            </a>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#ebebeb] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- een QR-code van onze eigen server, geen foto om te optimaliseren */}
          <img src={qrAdres(product?.id ?? "", "svg")} alt={`QR-code naar ${naam}`} width={168} height={168} className="h-[168px] w-[168px]" />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-semibold">
            <a href={qrAdres(product?.id ?? "", "png", true)} download className="text-[#005bd3] hover:underline">Download PNG<span className="sr-only"> van de QR-code</span></a>
            <a href={qrAdres(product?.id ?? "", "svg", true)} download className="text-[#005bd3] hover:underline">Download SVG<span className="sr-only"> van de QR-code</span></a>
          </div>
          <p className="max-w-[168px] text-center text-[11px] text-[#707070]">PNG voor drukwerk, SVG voor een ontwerpprogramma.</p>
        </div>
      </div>
    </Card>
  );
}
