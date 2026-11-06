"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { Card, Empty, IExternal, IImage, ITag, IX, PageHead, Pill, btn, input } from "@/components/studio/ui";
import { slugify, type Media, type SiteProduct } from "@/lib/sites/types";
import { MAX_OPTIES, categorieen, euro, leesBedrag, productSlug } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Websitestudio → één product: titel en omschrijving, foto's (slepen, kiezen,
// hoofdfoto, volgorde), prijs met "was"-prijs, hoe het in Google staat, status,
// voorraad en categorie. Een balk bovenaan bewaart of verwerpt; opslaan zet het
// meteen live. "nieuw" maakt een nieuw product.
// ---------------------------------------------------------------------------

const MAX_FOTOS = 8;

const nieuwId = () => `p${Math.random().toString(36).slice(2, 12).padEnd(10, "0")}`;

const bedragTekst = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

const leeg = (): SiteProduct => ({ id: nieuwId(), naam: "", slug: "", prijsCents: 0, oudePrijsCents: null, korteTekst: "", omschrijving: "", fotos: [], categorie: "", zichtbaar: true, uitverkocht: false });

export default function ProductEditor({ id }: { id: string }) {
  const { data, winkel, saveWinkel } = useStudio();
  const site = data!.site!;
  const router = useRouter();
  const nieuw = id === "nieuw";
  const bestaand = winkel.producten.find((p) => p.id === id) ?? null;
  const [basis, setBasis] = useState<SiteProduct>(() => bestaand ?? leeg());
  const [p, setP] = useState<SiteProduct>(basis);
  const [prijs, setPrijs] = useState(() => (nieuw ? "" : bedragTekst(basis.prijsCents)));
  const [was, setWas] = useState(() => bedragTekst(basis.oudePrijsCents));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);

  const prijsCents = leesBedrag(prijs);
  const wasCents = was.trim() ? leesBedrag(was) : null;
  const gewijzigd = JSON.stringify(p) !== JSON.stringify(basis) || prijs !== (nieuw ? "" : bedragTekst(basis.prijsCents)) || was !== bedragTekst(basis.oudePrijsCents);

  // niet per ongeluk weg met onopgeslagen wijzigingen
  useEffect(() => {
    if (!gewijzigd) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [gewijzigd]);

  if (!nieuw && !bestaand) {
    return (
      <Card>
        <Empty icon={<ITag />} title="Dit product bestaat niet (meer)" text="Misschien is het verwijderd.">
          <Link href="/studio/webshop/producten" className={btn.primary}>Naar alle producten</Link>
        </Empty>
      </Card>
    );
  }

  const zet = (patch: Partial<SiteProduct>) => {
    setP((x) => ({ ...x, ...patch }));
    setOpgeslagen(false);
  };
  const anderen = winkel.producten.filter((x) => x.id !== p.id);

  const opslaan = async () => {
    setFout(null);
    if (!p.naam.trim()) return setFout("Geef het product een naam.");
    if (prijsCents == null) return setFout("Vul een geldige prijs in, bijvoorbeeld 12,50.");
    if (was.trim() && wasCents == null) return setFout("Vul bij 'was' een geldig bedrag in, of laat het leeg.");
    const halveKeuze = (p.opties ?? []).find((o) => !o.naam.trim() || o.waarden.length === 0);
    if (halveKeuze) return setFout(`Geef de keuze "${halveKeuze.naam || "zonder naam"}" een naam en minstens één mogelijkheid, of haal hem weg.`);
    const slug = productSlug(p.slug || p.naam, anderen.map((x) => x.slug));
    const opties = (p.opties ?? []).map((o) => ({ naam: o.naam.trim(), waarden: o.waarden }));
    const klaar: SiteProduct = { ...p, naam: p.naam.trim(), slug, prijsCents, oudePrijsCents: wasCents && wasCents > prijsCents ? wasCents : null, opties };
    setBezig(true);
    const err = await saveWinkel({ ...winkel, producten: nieuw ? [...winkel.producten, klaar] : winkel.producten.map((x) => (x.id === klaar.id ? klaar : x)) });
    setBezig(false);
    if (err) return setFout(err);
    setBasis(klaar);
    setP(klaar);
    setPrijs(bedragTekst(klaar.prijsCents));
    setWas(bedragTekst(klaar.oudePrijsCents));
    setOpgeslagen(true);
    if (nieuw) router.replace(`/studio/webshop/producten/${klaar.id}`);
  };
  const verwerp = () => {
    setP(basis);
    setPrijs(nieuw ? "" : bedragTekst(basis.prijsCents));
    setWas(bedragTekst(basis.oudePrijsCents));
    setFout(null);
  };
  const verwijder = async () => {
    if (!window.confirm(`${basis.naam} verwijderen? Het verdwijnt meteen van je website.`)) return;
    setBezig(true);
    const err = await saveWinkel({ ...winkel, producten: anderen });
    setBezig(false);
    if (err) return setFout(err);
    router.push("/studio/webshop/producten");
  };

  const korting = prijsCents != null && wasCents != null && wasCents > prijsCents ? Math.round((1 - prijsCents / wasCents) * 100) : null;
  const adres = data?.address ?? "";
  const live = Boolean(site.liveBuild) && !nieuw && basis.zichtbaar;

  return (
    <>
      {(gewijzigd || fout) && (
        <div className="sticky top-14 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-3 bg-[#1a1a1a] px-4 py-2.5 text-white shadow-lg sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <p className="flex-1 text-sm font-semibold" role={fout ? "alert" : "status"}>{fout ?? "Niet-opgeslagen wijzigingen"}</p>
          {gewijzigd && <button type="button" onClick={verwerp} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-white/10">Verwerpen</button>}
          <button type="button" disabled={bezig || !gewijzigd} onClick={() => void opslaan()} className="rounded-xl bg-white px-3.5 py-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-white/90 disabled:opacity-50">
            {bezig ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      )}

      <PageHead
        back={{ href: "/studio/webshop/producten", label: "Terug naar producten" }}
        title={nieuw && !p.naam ? "Nieuw product" : p.naam || "Naamloos product"}
        sub={opgeslagen ? <span role="status" className="font-medium text-[#0c5132]">Opgeslagen en meteen online.</span> : undefined}
        actions={
          <>
            {!nieuw && (basis.zichtbaar ? <Pill tone="ok">Online</Pill> : <Pill>Verborgen</Pill>)}
            {live && adres && (
              <a href={`${adres}/p/${basis.slug}`} target="_blank" rel="noopener" className={btn.secondary}>
                Bekijken <IExternal width={15} height={15} />
              </a>
            )}
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Titel</span>
              <input className={input} value={p.naam} maxLength={120} placeholder="Bijvoorbeeld: Desembrood volkoren" onChange={(e) => zet({ naam: e.target.value })} />
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Omschrijving</span>
              <textarea className={`${input} min-h-[180px] leading-relaxed`} value={p.omschrijving} maxLength={4000} placeholder="Vertel wat het is, waarom het goed is en wat de klant krijgt. Een lege regel begint een nieuwe alinea." onChange={(e) => zet({ omschrijving: e.target.value })} />
            </label>
          </Card>

          <Card title="Foto's" actions={<span className="text-xs text-[#707070]">{p.fotos.length} van {MAX_FOTOS}</span>}>
            <FotoBeheer naam={p.naam} fotos={p.fotos} onFotos={(fotos) => zet({ fotos })} />
          </Card>

          <Card
            title="Varianten"
            actions={
              (p.opties?.length ?? 0) < MAX_OPTIES && (
                <button type="button" onClick={() => zet({ opties: [...(p.opties ?? []), { naam: (p.opties?.length ?? 0) === 0 ? "Maat" : "Kleur", waarden: [] }] })} className={btn.quiet}>
                  + Keuze toevoegen
                </button>
              )
            }
          >
            {!p.opties?.length ? (
              <p className="text-sm text-[#616161]">Heeft dit product maten of kleuren? Voeg een keuze toe, bijvoorbeeld Maat met S, M, L. De klant kiest die op de productpagina en ziet zijn keuze in de bestelling.</p>
            ) : (
              <div className="space-y-3">
                {p.opties.map((o, i) => (
                  <OptieRij
                    key={i}
                    naam={o.naam}
                    waarden={o.waarden}
                    onNaam={(naam) => zet({ opties: (p.opties ?? []).map((x, j) => (j === i ? { ...x, naam } : x)) })}
                    onWaarden={(waarden) => zet({ opties: (p.opties ?? []).map((x, j) => (j === i ? { ...x, waarden } : x)) })}
                    onWeg={() => zet({ opties: (p.opties ?? []).filter((_, j) => j !== i) })}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Prijs">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#303030]">Prijs (incl. btw)</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#707070]">€</span>
                  <input className={`${input} pl-7`} inputMode="decimal" value={prijs} placeholder="0,00" onChange={(e) => { setPrijs(e.target.value); setOpgeslagen(false); }} aria-invalid={prijs !== "" && prijsCents == null} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#303030]">Was-prijs (voor een aanbieding)</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#707070]">€</span>
                  <input className={`${input} pl-7`} inputMode="decimal" value={was} placeholder="leeg = geen aanbieding" onChange={(e) => { setWas(e.target.value); setOpgeslagen(false); }} aria-invalid={was.trim() !== "" && wasCents == null} />
                </span>
              </label>
            </div>
            {korting != null && <p className="mt-3 text-sm text-[#0c5132]">Klanten zien <s className="text-[#707070]">{euro(wasCents ?? 0)}</s> <strong>{euro(prijsCents ?? 0)}</strong>: {korting}% korting.</p>}
          </Card>

          <Card title="Zo staat het in Google">
            <div className="rounded-xl border border-[#ebebeb] p-4">
              <p className="truncate text-xs text-[#202124]">{(adres || "jouwwebsite.nl").replace(/^https?:\/\//, "")} › p › {p.slug || slugify(p.naam) || "product"}</p>
              <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{`${p.naam || "Productnaam"} | ${site.bedrijf.naam}`.slice(0, 70)}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156]">{(p.korteTekst || p.omschrijving || "De korte zin of het begin van de omschrijving komt hier.").replace(/\s+/g, " ").slice(0, 160)}</p>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Webadres</span>
              <span className="flex items-center overflow-hidden rounded-xl border border-[#c9c9c9] focus-within:border-[#1a1a1a] focus-within:ring-2 focus-within:ring-black/10">
                <span className="whitespace-nowrap bg-[#f7f7f7] px-3 py-2 text-sm text-[#616161]">/p/</span>
                <input className="w-full px-2 py-2 text-sm outline-none" value={p.slug} placeholder={slugify(p.naam) || "productnaam"} maxLength={60} onChange={(e) => zet({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} onBlur={(e) => zet({ slug: slugify(e.target.value) })} />
              </span>
            </label>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Status">
            <select aria-label="Status" className={input} value={p.zichtbaar ? "online" : "verborgen"} onChange={(e) => zet({ zichtbaar: e.target.value === "online" })}>
              <option value="online">Online: zichtbaar op je website</option>
              <option value="verborgen">Verborgen</option>
            </select>
          </Card>

          <Card title="Voorraad">
            <label className="flex items-center gap-2 text-sm text-[#303030]">
              <input type="checkbox" checked={p.voorraad != null} onChange={(e) => zet({ voorraad: e.target.checked ? (basis.voorraad ?? 10) : null })} className="h-4 w-4 accent-[#1a1a1a]" />
              Voorraad bijhouden
            </label>
            {p.voorraad != null && (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-[#303030]">Aantal op voorraad</span>
                <input className={input} type="number" inputMode="numeric" min={0} max={1_000_000} value={p.voorraad} onChange={(e) => zet({ voorraad: Math.max(0, Math.min(1_000_000, Math.floor(Number(e.target.value)) || 0)) })} />
                <span className="mt-1 block text-xs text-[#707070]">Elke bestelling haalt het aantal eraf. Bij 0 staat het product vanzelf op uitverkocht; bij 5 of minder ziet de klant &quot;Nog 3 op voorraad&quot;.</span>
              </label>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-[#303030]">
              <input type="checkbox" checked={p.uitverkocht} onChange={(e) => zet({ uitverkocht: e.target.checked })} className="h-4 w-4 accent-[#1a1a1a]" />
              Uitverkocht (wel zichtbaar, niet te bestellen)
            </label>
          </Card>

          <Card title="Indeling">
            <Categorie waarde={p.categorie} opties={categorieen(winkel.producten)} onKies={(categorie) => zet({ categorie })} />
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Korte zin op de productkaart</span>
              <input className={input} value={p.korteTekst} maxLength={200} placeholder="Bijvoorbeeld: Met een krokante korst" onChange={(e) => zet({ korteTekst: e.target.value })} />
            </label>
          </Card>

          {p.bron && (
            <Card>
              <p className="text-sm text-[#616161]">Overgenomen uit de ZekerFlex-webshop. Je kunt alles aanpassen; dat verandert niets in die webshop.</p>
            </Card>
          )}

          {!nieuw && (
            <button type="button" disabled={bezig} onClick={() => void verwijder()} className={`${btn.danger} w-full`}>
              Product verwijderen
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Eén keuze (Maat, Kleur): de naam en de waarden, met komma's gescheiden; eronder de knoppen zoals de klant ze ziet. */
function OptieRij({ naam, waarden, onNaam, onWaarden, onWeg }: { naam: string; waarden: string[]; onNaam: (n: string) => void; onWaarden: (w: string[]) => void; onWeg: () => void }) {
  const [tekst, setTekst] = useState(waarden.join(", "));
  return (
    <div className="rounded-xl border border-[#ebebeb] p-3">
      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#616161]">Keuze</span>
          <input className={input} value={naam} maxLength={30} placeholder="Maat" onChange={(e) => onNaam(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#616161]">Mogelijkheden, met komma&apos;s</span>
          <input
            className={input}
            value={tekst}
            placeholder="S, M, L, XL"
            onChange={(e) => {
              setTekst(e.target.value);
              onWaarden([...new Set(e.target.value.split(",").map((s) => s.trim().slice(0, 40)).filter(Boolean))].slice(0, 20));
            }}
          />
        </label>
        <button type="button" onClick={onWeg} aria-label={`Keuze ${naam || ""} weghalen`} className="grid h-9 w-9 place-items-center rounded-lg text-[#b42318] hover:bg-[#fff5f5]">
          <IX width={16} height={16} />
        </button>
      </div>
      {waarden.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${naam || "Keuze"}: zo ziet de klant het`}>
          {waarden.map((w) => (
            <li key={w} className="rounded-lg border border-[#d4d4d4] bg-white px-2.5 py-1 text-xs font-medium text-[#303030]">{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Categorie({ waarde, opties, onKies }: { waarde: string; opties: string[]; onKies: (c: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#303030]">Categorie</span>
      <input className={input} list="studio-categorieen" value={waarde} maxLength={60} placeholder="Bijvoorbeeld: Brood" onChange={(e) => onKies(e.target.value)} />
      <datalist id="studio-categorieen">
        {opties.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <span className="mt-1 block text-xs text-[#707070]">Kies een bestaande of typ een nieuwe. Op je website komen producten per categorie bij elkaar.</span>
    </label>
  );
}

/** De foto's van een product: uploaden (ook slepen), kiezen uit eerdere foto's, hoofdfoto en volgorde. */
function FotoBeheer({ naam, fotos, onFotos }: { naam: string; fotos: string[]; onFotos: (f: string[]) => void }) {
  const { data, addMedia, api } = useStudio();
  const media = data!.site!.media;
  const opId = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const [bezig, setBezig] = useState(0);
  const [fout, setFout] = useState<string | null>(null);
  const [kiezen, setKiezen] = useState(false);
  const [sleep, setSleep] = useState(false);
  const bestand = useRef<HTMLInputElement>(null);
  const vrij = MAX_FOTOS - fotos.length;

  const upload = async (files: File[]) => {
    const lijst = files.filter((f) => f.type.startsWith("image/")).slice(0, vrij);
    if (!lijst.length) return;
    setFout(null);
    setBezig(lijst.length);
    let erbij = [...fotos];
    for (const f of lijst) {
      const form = new FormData();
      form.set("file", f);
      form.set("alt", naam || f.name.replace(/\.[a-z0-9]+$/i, ""));
      const res = await fetch(api("/media"), { method: "POST", body: form }).catch(() => null);
      setBezig((n) => n - 1);
      if (!res?.ok) {
        setFout(await foutVan(res, `${f.name} kon niet worden toegevoegd.`));
        continue;
      }
      const m = ((await res.json()) as { media: Media }).media;
      addMedia(m);
      erbij = [...erbij, m.id].slice(0, MAX_FOTOS);
      onFotos(erbij);
    }
  };
  const verplaats = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fotos.length) return;
    const n = [...fotos];
    [n[i], n[j]] = [n[j]!, n[i]!];
    onFotos(n);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setSleep(false);
    void upload([...e.dataTransfer.files]);
  };

  return (
    <div>
      {fotos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Foto's van dit product">
          {fotos.map((id, i) => {
            const m = opId.get(id);
            if (!m) return null;
            return (
              <li key={id} className={`group relative overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#f7f7f7] ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/werkgever/sites/media/${m.file}`} alt={m.alt} className="aspect-square h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded-lg bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a] shadow">Hoofdfoto</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {i > 0 && <button type="button" onClick={() => onFotos([id, ...fotos.filter((f) => f !== id)])} className="rounded-md bg-white/95 px-1.5 text-[11px] font-semibold text-[#1a1a1a]">Hoofdfoto</button>}
                  <button type="button" aria-label="Eerder" disabled={i === 0} onClick={() => verplaats(i, -1)} className="rounded-md bg-white/95 px-1.5 text-xs text-[#1a1a1a] disabled:opacity-40">←</button>
                  <button type="button" aria-label="Later" disabled={i === fotos.length - 1} onClick={() => verplaats(i, 1)} className="rounded-md bg-white/95 px-1.5 text-xs text-[#1a1a1a] disabled:opacity-40">→</button>
                  <button type="button" aria-label={`Foto ${i + 1} weghalen`} onClick={() => onFotos(fotos.filter((f) => f !== id))} className="rounded-md bg-white/95 px-1 text-[#b42318]"><IX width={14} height={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {vrij > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSleep(true);
          }}
          onDragLeave={() => setSleep(false)}
          onDrop={drop}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center ${sleep ? "border-[#1a1a1a] bg-[#f7f7f7]" : "border-[#d4d4d4]"}`}
        >
          <IImage className="text-[#707070]" />
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => bestand.current?.click()} className={btn.secondary}>Foto&apos;s uploaden</button>
            {media.length > 0 && <button type="button" onClick={() => setKiezen((k) => !k)} aria-expanded={kiezen} className={btn.quiet}>Kies uit je foto&apos;s</button>}
          </div>
          <p className="text-xs text-[#707070]">Of sleep ze hierheen. JPG, PNG of WebP, tot 15 MB. Scherp tot 2400 pixels.</p>
          <input ref={bestand} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
          {bezig > 0 && <p role="status" className="text-xs font-semibold text-[#303030]">Bezig met {bezig} foto{bezig === 1 ? "" : "'s"}…</p>}
        </div>
      )}
      {fout && <p role="alert" className="mt-2 text-sm text-[#b42318]">{fout}</p>}

      {kiezen && (
        <div className="mt-3 rounded-xl border border-[#ebebeb] p-3">
          <p className="mb-2 text-xs font-medium text-[#616161]">Klik een foto aan om hem toe te voegen of weg te halen.</p>
          <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {media.map((m) => {
              const aan = fotos.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={aan} aria-label={m.alt || "Foto"} disabled={!aan && vrij <= 0} onClick={() => onFotos(aan ? fotos.filter((f) => f !== m.id) : [...fotos, m.id].slice(0, MAX_FOTOS))} className={`overflow-hidden rounded-lg border-2 ${aan ? "border-[#1a1a1a]" : "border-transparent opacity-80 hover:opacity-100"} disabled:opacity-30`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/werkgever/sites/media/${m.file}`} alt="" className="aspect-square w-full object-cover" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
