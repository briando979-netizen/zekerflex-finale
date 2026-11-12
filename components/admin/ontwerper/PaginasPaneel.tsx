"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ACHTERGRONDEN, BLOK_SOORTEN, PAGINA_SJABLONEN, TALEN, leegBlok, nieuwId, videoBron, type Taal, type Achtergrond, type Blok, type BlokSoort, type Knop, type Pagina, type PaginaInhoud } from "@/lib/ontwerp/paginas";
import { MediaKiezer, MediaVoorbeeld } from "@/components/admin/ontwerper/Media";

// ---------------------------------------------------------------------------
// Tabblad Pagina's: eigen pagina's bouwen uit blokken. Elke wijziging wordt na
// een tel als concept bewaard en het voorbeeld laat het concept zien
// (/p/<slug>?concept=1, alleen voor beheerders). Publiceren zet hem live.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veldStijl = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/admin/ontwerp/paginas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !d) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

function Veld({ label, waarde, onChange, max = 160, placeholder }: { label: string; waarde: string; onChange: (v: string) => void; max?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={mute}>
        {label}
      </span>
      <input value={waarde} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veldStijl} />
    </label>
  );
}

function Tekstvak({ label, waarde, onChange, max = 2000, rijen = 4 }: { label: string; waarde: string; onChange: (v: string) => void; max?: number; rijen?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={mute}>
        {label}
      </span>
      <textarea value={waarde} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rijen} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veldStijl} />
    </label>
  );
}

function KnopVeld({ label, knop, onChange }: { label: string; knop: Knop; onChange: (k: Knop) => void }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 text-xs" style={mute}>
        {label}
      </legend>
      <input aria-label={`${label}: tekst`} value={knop.tekst} onChange={(e) => onChange({ ...knop, tekst: e.target.value })} maxLength={60} placeholder="Tekst op de knop" className="rounded-lg px-2.5 py-1.5 text-sm" style={veldStijl} />
      <input aria-label={`${label}: link`} value={knop.link} onChange={(e) => onChange({ ...knop, link: e.target.value })} maxLength={500} placeholder="/register of https://…" className="rounded-lg px-2.5 py-1.5 font-mono text-xs" style={veldStijl} />
    </fieldset>
  );
}

function Keuzeknoppen<T extends string>({ label, waarde, opties, onChange }: { label: string; waarde: T; opties: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs" style={mute}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(opties) as T[]).map((k) => (
          <label key={k} className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold focus-within:ring-2" style={{ background: k === waarde ? "var(--a-accent)" : "var(--a-elev)", color: k === waarde ? "var(--a-on-accent)" : "var(--a-text)" }}>
            <input type="radio" name={label} className="sr-only" checked={k === waarde} onChange={() => onChange(k)} />
            {opties[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MediaVeld({ label, soort, waarde, onChange }: { label: string; soort: "foto" | "video"; waarde: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs" style={mute}>
        {label}
      </p>
      <div className="flex items-center gap-2">
        <MediaVoorbeeld id={waarde} soort={soort} />
        <button type="button" onClick={() => setOpen((o) => !o)} className="a-button text-xs">
          {waarde ? "Andere kiezen" : soort === "foto" ? "Foto kiezen" : "Video kiezen"}
        </button>
      </div>
      {open ? (
        <div className="mt-2">
          <MediaKiezer
            soort={soort}
            gekozen={waarde}
            onKies={(id) => {
              onChange(id);
              setOpen(false);
            }}
            onSluit={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function Lijst<T>({ items, onChange, nieuw, max, render, label }: { items: T[]; onChange: (v: T[]) => void; nieuw: () => T; max: number; render: (item: T, zet: (v: T) => void) => ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg p-2" style={{ background: "var(--a-elev)" }}>
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-[11px] font-semibold hover:underline" style={{ color: "var(--a-crit)" }}>
            {label} weghalen
          </button>
        </div>
      ))}
      {items.length < max ? (
        <button type="button" onClick={() => onChange([...items, nieuw()])} className="a-button text-xs">
          + {label} toevoegen
        </button>
      ) : null}
    </div>
  );
}

function YouTubeOfEigen({ bron, onChange }: { bron: string; onChange: (v: string) => void }) {
  const isYt = bron.startsWith("yt:");
  const [link, setLink] = useState(isYt ? `https://youtu.be/${bron.slice(3)}` : "");
  const herkend = videoBron(link);
  return (
    <div className="space-y-2">
      <Veld
        label="YouTube-link (of laat leeg en kies hieronder een eigen video)"
        waarde={link}
        onChange={(v) => {
          setLink(v);
          const b = videoBron(v);
          if (b.startsWith("yt:") || !v.trim()) onChange(b);
        }}
        max={300}
        placeholder="https://www.youtube.com/watch?v=…"
      />
      {link.trim() && !herkend.startsWith("yt:") ? (
        <p className="text-[11px]" style={{ color: "var(--a-warn-ink)" }}>
          Dit is (nog) geen YouTube-link die we herkennen.
        </p>
      ) : null}
      <MediaVeld
        label="Eigen video"
        soort="video"
        waarde={isYt ? "" : bron}
        onChange={(v) => {
          setLink("");
          onChange(v);
        }}
      />
    </div>
  );
}

function BlokVelden({ blok, zet }: { blok: Blok; zet: (b: Blok) => void }) {
  switch (blok.soort) {
    case "hero":
      return (
        <>
          <Veld label="Bovenregel" waarde={blok.bovenregel} onChange={(v) => zet({ ...blok, bovenregel: v })} max={80} />
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Tekstvak label="Tekst" waarde={blok.tekst} onChange={(v) => zet({ ...blok, tekst: v })} max={600} rijen={3} />
          <KnopVeld label="Knop 1" knop={blok.knop} onChange={(k) => zet({ ...blok, knop: k })} />
          <KnopVeld label="Knop 2 (mag leeg)" knop={blok.knop2} onChange={(k) => zet({ ...blok, knop2: k })} />
          <Keuzeknoppen label="Uitlijning" waarde={blok.uitlijning} opties={{ links: "Links, met foto", midden: "Midden" }} onChange={(v) => zet({ ...blok, uitlijning: v })} />
          {blok.uitlijning === "links" ? <MediaVeld label="Foto naast de kop" soort="foto" waarde={blok.beeld} onChange={(v) => zet({ ...blok, beeld: v })} /> : null}
        </>
      );
    case "tekst":
      return (
        <>
          <Veld label="Kop (mag leeg)" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Tekstvak label="Tekst (een lege regel begint een nieuwe alinea)" waarde={blok.tekst} onChange={(v) => zet({ ...blok, tekst: v })} max={6000} rijen={8} />
        </>
      );
    case "beeldTekst":
      return (
        <>
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Tekstvak label="Tekst" waarde={blok.tekst} onChange={(v) => zet({ ...blok, tekst: v })} />
          <MediaVeld label="Foto" soort="foto" waarde={blok.beeld} onChange={(v) => zet({ ...blok, beeld: v })} />
          <Keuzeknoppen label="Foto staat" waarde={blok.kant} opties={{ links: "Links", rechts: "Rechts" }} onChange={(v) => zet({ ...blok, kant: v })} />
          <KnopVeld label="Knop (mag leeg)" knop={blok.knop} onChange={(k) => zet({ ...blok, knop: k })} />
        </>
      );
    case "kolommen":
      return (
        <>
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Lijst
            label="Kolom"
            items={blok.items}
            max={6}
            nieuw={() => ({ kop: "Nieuw voordeel", tekst: "" })}
            onChange={(items) => zet({ ...blok, items })}
            render={(item, z) => (
              <>
                <Veld label="Kop" waarde={item.kop} onChange={(v) => z({ ...item, kop: v })} max={100} />
                <Tekstvak label="Tekst" waarde={item.tekst} onChange={(v) => z({ ...item, tekst: v })} max={400} rijen={2} />
              </>
            )}
          />
        </>
      );
    case "cijfers":
      return (
        <>
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Lijst
            label="Cijfer"
            items={blok.items}
            max={6}
            nieuw={() => ({ getal: "", label: "" })}
            onChange={(items) => zet({ ...blok, items })}
            render={(item, z) => (
              <div className="grid grid-cols-2 gap-2">
                <Veld label="Getal" waarde={item.getal} onChange={(v) => z({ ...item, getal: v })} max={20} />
                <Veld label="Uitleg" waarde={item.label} onChange={(v) => z({ ...item, label: v })} max={100} />
              </div>
            )}
          />
        </>
      );
    case "faq":
      return (
        <>
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Lijst
            label="Vraag"
            items={blok.items}
            max={20}
            nieuw={() => ({ vraag: "", antwoord: "" })}
            onChange={(items) => zet({ ...blok, items })}
            render={(item, z) => (
              <>
                <Veld label="Vraag" waarde={item.vraag} onChange={(v) => z({ ...item, vraag: v })} max={200} />
                <Tekstvak label="Antwoord" waarde={item.antwoord} onChange={(v) => z({ ...item, antwoord: v })} max={1500} rijen={3} />
              </>
            )}
          />
        </>
      );
    case "citaat":
      return (
        <>
          <Tekstvak label="Citaat" waarde={blok.tekst} onChange={(v) => zet({ ...blok, tekst: v })} max={600} rijen={3} />
          <Veld label="Naam en functie" waarde={blok.naam} onChange={(v) => zet({ ...blok, naam: v })} max={120} />
        </>
      );
    case "video":
      return (
        <>
          <Veld label="Kop (mag leeg)" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <YouTubeOfEigen bron={blok.bron} onChange={(v) => zet({ ...blok, bron: v })} />
        </>
      );
    case "galerij":
      return (
        <>
          <Veld label="Kop (mag leeg)" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <div className="flex flex-wrap gap-2">
            {blok.beelden.map((id) => (
              <span key={id} className="relative">
                <MediaVoorbeeld id={id} soort="foto" />
                <button type="button" onClick={() => zet({ ...blok, beelden: blok.beelden.filter((b) => b !== id) })} aria-label="Foto weghalen" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-black/80 text-[11px] text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
          {blok.beelden.length < 12 ? <MediaVeld label="Foto toevoegen" soort="foto" waarde="" onChange={(v) => v && !blok.beelden.includes(v) && zet({ ...blok, beelden: [...blok.beelden, v] })} /> : null}
        </>
      );
    case "oproep":
      return (
        <>
          <Veld label="Kop" waarde={blok.kop} onChange={(v) => zet({ ...blok, kop: v })} />
          <Tekstvak label="Tekst" waarde={blok.tekst} onChange={(v) => zet({ ...blok, tekst: v })} max={400} rijen={2} />
          <KnopVeld label="Knop" knop={blok.knop} onChange={(k) => zet({ ...blok, knop: k })} />
        </>
      );
    case "ruimte":
      return <Keuzeknoppen label="Hoeveel ruimte" waarde={blok.grootte} opties={{ klein: "Klein", middel: "Middel", groot: "Groot" }} onChange={(v) => zet({ ...blok, grootte: v })} />;
  }
}

const samenvatting = (b: Blok) => ("kop" in b && b.kop) || ("tekst" in b && b.tekst.slice(0, 50)) || "";

/** Eén blok in de editor (ook gebruikt in het tabblad Homepage voor eigen blokken). */
export function BlokKaart({ blok, open, onOpen, onZet, onOmhoog, onOmlaag, onDupliceer, onWeg, eerste, laatste, vast = false }: { blok: Blok; open: boolean; onOpen: () => void; onZet: (b: Blok) => void; onOmhoog: () => void; onOmlaag: () => void; onDupliceer: () => void; onWeg: () => void; eerste: boolean; laatste: boolean; /** in een vertaling: alleen teksten, geen volgorde of blokken */ vast?: boolean }) {
  const soort = BLOK_SOORTEN.find((s) => s.soort === blok.soort);
  const klein = "grid h-7 w-7 place-items-center rounded-md text-xs disabled:opacity-30";
  return (
    <li className="rounded-xl" style={{ ...paneel, outline: open ? "2px solid var(--a-accent)" : "none" }}>
      <div className="flex items-center gap-2 p-2">
        <button type="button" onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
            {soort?.label ?? blok.soort}
          </span>
          <span className="block truncate text-[11px]" style={mute}>
            {samenvatting(blok) || soort?.uitleg}
          </span>
        </button>
        {vast ? null : (
          <>
            <button type="button" onClick={onOmhoog} disabled={eerste} aria-label="Omhoog" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              ↑
            </button>
            <button type="button" onClick={onOmlaag} disabled={laatste} aria-label="Omlaag" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              ↓
            </button>
            <button type="button" onClick={onDupliceer} aria-label="Dupliceren" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              ⧉
            </button>
            <button type="button" onClick={onWeg} aria-label="Blok verwijderen" className={klein} style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
              ✕
            </button>
          </>
        )}
      </div>
      {open ? (
        <div className="space-y-3 border-t p-3" style={{ borderColor: "var(--a-border)" }}>
          <BlokVelden blok={blok} zet={onZet} />
          {vast ? null : <Keuzeknoppen<Achtergrond> label="Achtergrond" waarde={blok.achtergrond} opties={ACHTERGRONDEN} onChange={(v) => onZet({ ...blok, achtergrond: v })} />}
        </div>
      ) : null}
    </li>
  );
}

/** Een vertaling bijwerken: dezelfde velden, maar volgorde, foto's en links volgen het Nederlands. */
function VertalingEditor({ pagina, taal, onBijgewerkt, onVoorbeeld }: { pagina: Pagina; taal: Taal; onBijgewerkt: (p: Pagina) => void; onVoorbeeld: () => void }) {
  const [inhoud, setInhoud] = useState<PaginaInhoud | null>(pagina.vertalingen?.[taal] ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState("Vertaling bewaard");
  const eerste = useRef(true);

  useEffect(() => {
    if (eerste.current) {
      eerste.current = false;
      return;
    }
    if (!inhoud) return;
    setStatus("Wijzigingen…");
    const t = window.setTimeout(async () => {
      try {
        const d = await post<{ pagina: Pagina }>({ actie: "vertaling", id: pagina.id, taal, inhoud });
        onBijgewerkt(d.pagina);
        setStatus("Vertaling bewaard");
        onVoorbeeld();
      } catch {
        setStatus("Bewaren lukte niet, we proberen het bij de volgende wijziging opnieuw");
      }
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inhoud]);

  if (!inhoud) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px]" style={mute}>
        {TALEN[taal].naam}: je past hier alleen de teksten aan. Volgorde, foto&apos;s, video&apos;s en links volgen de Nederlandse versie. <span role="status">{status}</span>
      </p>
      <Veld label={`Titel (${TALEN[taal].naam})`} waarde={inhoud.titel} onChange={(v) => setInhoud({ ...inhoud, titel: v })} max={120} />
      <Tekstvak label={`Omschrijving voor Google (${inhoud.omschrijving.length}/155)`} waarde={inhoud.omschrijving} onChange={(v) => setInhoud({ ...inhoud, omschrijving: v })} max={300} rijen={2} />
      <ol className="space-y-2">
        {inhoud.blokken.map((b, i) => (
          <BlokKaart
            key={b.id}
            blok={b}
            open={open === b.id}
            onOpen={() => setOpen((o) => (o === b.id ? null : b.id))}
            onZet={(nb) => setInhoud({ ...inhoud, blokken: inhoud.blokken.map((x) => (x.id === b.id ? nb : x)) })}
            onOmhoog={() => undefined}
            onOmlaag={() => undefined}
            onDupliceer={() => undefined}
            onWeg={() => undefined}
            eerste={i === 0}
            laatste={i === inhoud.blokken.length - 1}
            vast
          />
        ))}
      </ol>
    </div>
  );
}

function Talenbalk({ pagina, taal, onKies, onBijgewerkt, bewaarEerst }: { pagina: Pagina; taal: Taal | null; onKies: (t: Taal | null) => void; onBijgewerkt: (p: Pagina) => void; bewaarEerst: () => Promise<void> }) {
  const bestaand = (Object.keys(pagina.vertalingen ?? {}) as Taal[]).filter((t) => Object.hasOwn(TALEN, t));
  const vrij = (Object.keys(TALEN) as Taal[]).filter((t) => !bestaand.includes(t));
  const [nieuw, setNieuw] = useState<Taal | "">("");
  const [bezig, setBezig] = useState<Taal | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function vertaal(t: Taal) {
    setBezig(t);
    setFout(null);
    try {
      await bewaarEerst();
      const d = await post<{ pagina: Pagina }>({ actie: "vertaal", id: pagina.id, taal: t });
      onBijgewerkt(d.pagina);
      onKies(t);
      setNieuw("");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Vertalen lukte niet.");
    } finally {
      setBezig(null);
    }
  }

  async function weg(t: Taal) {
    if (!window.confirm(`De ${TALEN[t].naam.toLowerCase()}e vertaling weghalen? Na Publiceren is hij ook live weg.`)) return;
    try {
      const d = await post<{ pagina: Pagina }>({ actie: "vertaling-weg", id: pagina.id, taal: t });
      onBijgewerkt(d.pagina);
      onKies(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Weghalen lukte niet.");
    }
  }

  const chip = (aan: boolean) => ({ background: aan ? "var(--a-accent)" : "var(--a-elev)", color: aan ? "var(--a-on-accent)" : "var(--a-text)" });
  return (
    <section className="space-y-2 rounded-xl p-3" style={paneel}>
      <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
        Talen
      </p>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bewerk in taal">
        <button type="button" onClick={() => onKies(null)} aria-pressed={taal === null} className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={chip(taal === null)}>
          Nederlands
        </button>
        {bestaand.map((t) => (
          <button key={t} type="button" onClick={() => onKies(t)} aria-pressed={taal === t} className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={chip(taal === t)}>
            {TALEN[t].naam}
          </button>
        ))}
      </div>
      {taal ? (
        <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
          <button type="button" disabled={bezig !== null} onClick={() => window.confirm("Opnieuw vertalen vanuit de Nederlandse versie? Je eigen aanpassingen in deze taal gaan dan verloren.") && vertaal(taal)} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>
            {bezig === taal ? "Bezig met vertalen…" : "Opnieuw vertalen met AI"}
          </button>
          <button type="button" onClick={() => weg(taal)} className="hover:underline" style={{ color: "var(--a-crit)" }}>
            Deze vertaling weghalen
          </button>
        </div>
      ) : null}
      {vrij.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-[11px]" style={mute} htmlFor={`nieuwe-taal-${pagina.id}`}>
            Vertaal naar
          </label>
          <select id={`nieuwe-taal-${pagina.id}`} value={nieuw} onChange={(e) => setNieuw(e.target.value as Taal | "")} className="rounded-md px-1.5 py-1 text-xs" style={veldStijl}>
            <option value="">kies een taal…</option>
            {vrij.map((t) => (
              <option key={t} value={t}>
                {TALEN[t].naam} ({TALEN[t].eigen})
              </option>
            ))}
          </select>
          <button type="button" disabled={!nieuw || bezig !== null} onClick={() => nieuw && vertaal(nieuw)} className="a-button text-xs disabled:opacity-50">
            {bezig && bezig === nieuw ? "Bezig met vertalen…" : "Vertaal met AI"}
          </button>
        </div>
      ) : null}
      {fout ? (
        <p role="alert" className="text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      ) : null}
      <p className="text-[11px]" style={mute}>
        Vertalingen gaan live samen met de pagina (Publiceren), op /p/{pagina.slug}/en enzovoort, met een taalkeuze bovenaan.
      </p>
    </section>
  );
}

function PaginaEditor({ start, onTerug, onBijgewerkt, onVoorbeeld, onPad }: { start: Pagina; onTerug: () => void; onBijgewerkt: (p: Pagina | null) => void; onVoorbeeld: () => void; onPad: (pad: string) => void }) {
  const [taal, setTaal] = useState<Taal | null>(null);
  const [versie, setVersie] = useState(0);
  const [pagina, setPagina] = useState(start);
  const [inhoud, setInhoud] = useState<PaginaInhoud>(start.concept);
  const [open, setOpen] = useState<string | null>(start.concept.blokken[0]?.id ?? null);
  const [status, setStatus] = useState("Concept bewaard");
  const [slug, setSlug] = useState(start.slug);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);
  const eerste = useRef(true);

  // concept automatisch bewaren; daarna het voorbeeld vernieuwen
  useEffect(() => {
    if (eerste.current) {
      eerste.current = false;
      return;
    }
    setStatus("Wijzigingen…");
    const t = window.setTimeout(async () => {
      try {
        const d = await post<{ pagina: Pagina }>({ actie: "concept", id: pagina.id, inhoud });
        setPagina(d.pagina);
        onBijgewerkt(d.pagina);
        setStatus("Concept bewaard");
        onVoorbeeld();
      } catch {
        setStatus("Bewaren lukte niet, we proberen het bij de volgende wijziging opnieuw");
      }
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inhoud]);

  const zetBlokken = (blokken: Blok[]) => setInhoud((c) => ({ ...c, blokken }));
  const blokken = inhoud.blokken;
  const verplaats = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= blokken.length) return;
    const n = [...blokken];
    const [b] = n.splice(i, 1);
    if (b) n.splice(j, 0, b);
    zetBlokken(n);
  };
  const voegToe = (soort: BlokSoort) => {
    const b = leegBlok(soort);
    zetBlokken([...blokken, b]);
    setOpen(b.id);
  };

  async function actie(a: "publiceer" | "offline" | "verwijder") {
    if (a === "verwijder" && !window.confirm(`"${inhoud.titel}" helemaal verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setMelding(null);
    try {
      if (a === "publiceer") await post({ actie: "concept", id: pagina.id, inhoud });
      const d = await post<{ pagina?: Pagina }>({ actie: a, id: pagina.id });
      if (a === "verwijder") {
        onBijgewerkt(null);
        onTerug();
        return;
      }
      if (d.pagina) {
        setPagina(d.pagina);
        onBijgewerkt(d.pagina);
      }
      setMelding({ tekst: a === "publiceer" ? `Live op /p/${pagina.slug}.` : "Offline gehaald: bezoekers zien hem niet meer." });
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Dat lukte niet.", fout: true });
    }
  }

  async function bewaarSlug() {
    if (slug.trim() === pagina.slug) return;
    try {
      const d = await post<{ pagina: Pagina }>({ actie: "slug", id: pagina.id, slug });
      setPagina(d.pagina);
      setSlug(d.pagina.slug);
      onBijgewerkt(d.pagina);
      onPad(`/p/${d.pagina.slug}${taal ? `/${taal}` : ""}?concept=1`);
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Het adres wijzigen lukte niet.", fout: true });
    }
  }

  const wijktAf = pagina.live !== null && JSON.stringify(pagina.live) !== JSON.stringify(inhoud);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onTerug} className="text-xs font-semibold hover:underline" style={{ color: "var(--a-accent-ink)" }}>
          ← Alle pagina&apos;s
        </button>
        <span role="status" className="text-[11px]" style={mute}>
          {status}
        </span>
      </div>
      <section className="space-y-3 rounded-xl p-4" style={paneel}>
        <Veld label="Titel van de pagina" waarde={inhoud.titel} onChange={(v) => setInhoud((c) => ({ ...c, titel: v }))} max={120} />
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Adres
          </span>
          <span className="flex items-center gap-1 text-sm" style={{ color: "var(--a-text)" }}>
            <span style={mute}>zekerflex.com/p/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={bewaarSlug} maxLength={80} className="min-w-0 flex-1 rounded-lg px-2 py-1 font-mono text-xs" style={veldStijl} />
          </span>
        </label>
        <Tekstvak label={`Omschrijving voor Google (${inhoud.omschrijving.length}/155)`} waarde={inhoud.omschrijving} onChange={(v) => setInhoud((c) => ({ ...c, omschrijving: v }))} max={300} rijen={2} />
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-text)" }}>
          <input type="checkbox" checked={inhoud.noindex} onChange={(e) => setInhoud((c) => ({ ...c, noindex: e.target.checked }))} />
          Niet in Google (bijvoorbeeld voor een advertentiepagina)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => actie("publiceer")} className="a-button a-button-primary text-xs">
            {pagina.live ? "Wijzigingen publiceren" : "Publiceren"}
          </button>
          {pagina.live ? (
            <>
              <a href={`/p/${pagina.slug}`} target="_blank" rel="noreferrer" className="a-button text-xs">
                Live bekijken ↗
              </a>
              <button type="button" onClick={() => actie("offline")} className="a-button text-xs">
                Offline halen
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => actie("verwijder")} className="text-xs font-semibold hover:underline" style={{ color: "var(--a-crit)" }}>
            Verwijderen
          </button>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={pagina.live ? (wijktAf ? { background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" } : { background: "var(--a-ok-soft)", color: "var(--a-ok-ink)" }) : { background: "var(--a-elev)", color: "var(--a-text)" }}>
            {pagina.live ? (wijktAf ? "Live, met wijzigingen in concept" : "Live") : "Alleen concept"}
          </span>
        </div>
        {melding ? (
          <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
            {melding.tekst}
          </p>
        ) : null}
      </section>

      <Talenbalk
        pagina={pagina}
        taal={taal}
        onKies={(t) => {
          setTaal(t);
          onPad(`/p/${pagina.slug}${t ? `/${t}` : ""}?concept=1`);
        }}
        onBijgewerkt={(p) => {
          setPagina(p);
          onBijgewerkt(p);
          // nieuwe of weggehaalde vertaling: de vertaal-editor begint opnieuw met wat de server heeft
          setVersie((v) => v + 1);
        }}
        bewaarEerst={async () => {
          await post({ actie: "concept", id: pagina.id, inhoud });
        }}
      />

      {taal ? (
        <VertalingEditor
          key={`${taal}-${versie}`}
          pagina={pagina}
          taal={taal}
          onBijgewerkt={(p) => {
            setPagina(p);
            onBijgewerkt(p);
          }}
          onVoorbeeld={onVoorbeeld}
        />
      ) : (
      <>
      <ol className="space-y-2">
        {blokken.map((b, i) => (
          <BlokKaart
            key={b.id}
            blok={b}
            open={open === b.id}
            onOpen={() => setOpen((o) => (o === b.id ? null : b.id))}
            onZet={(nb) => zetBlokken(blokken.map((x) => (x.id === b.id ? nb : x)))}
            onOmhoog={() => verplaats(i, -1)}
            onOmlaag={() => verplaats(i, 1)}
            onDupliceer={() => {
              const kopie = { ...structuredClone(b), id: nieuwId() };
              const n = [...blokken];
              n.splice(i + 1, 0, kopie);
              zetBlokken(n);
              setOpen(kopie.id);
            }}
            onWeg={() => zetBlokken(blokken.filter((x) => x.id !== b.id))}
            eerste={i === 0}
            laatste={i === blokken.length - 1}
          />
        ))}
      </ol>

      <section className="space-y-2 rounded-xl p-3" style={paneel}>
        <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
          Blok toevoegen
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {BLOK_SOORTEN.map((s) => (
            <button key={s.soort} type="button" onClick={() => voegToe(s.soort)} title={s.uitleg} className="rounded-lg px-2 py-1.5 text-left text-xs font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              + {s.label}
            </button>
          ))}
        </div>
      </section>
      </>
      )}
    </div>
  );
}

export function PaginasPaneel({ onVoorbeeldPad, onVernieuw }: { onVoorbeeldPad: (pad: string | null) => void; onVernieuw: () => void }) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [bewerk, setBewerk] = useState<Pagina | null>(null);
  const [titel, setTitel] = useState("");
  const [sjabloon, setSjabloon] = useState("dienst");
  const [onderwerp, setOnderwerp] = useState("");
  const [bezig, setBezig] = useState<"nieuw" | "ai" | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ontwerp/paginas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { paginas?: Pagina[] } | null) => setPaginas(d?.paginas ?? []))
      .catch(() => setPaginas([]));
  }, []);

  const open = useCallback(
    (p: Pagina) => {
      setBewerk(p);
      onVoorbeeldPad(`/p/${p.slug}?concept=1`);
    },
    [onVoorbeeldPad],
  );

  async function maak(soort: "nieuw" | "ai") {
    setBezig(soort);
    setFout(null);
    try {
      const d = await post<{ pagina: Pagina }>(soort === "ai" ? { actie: "ai", onderwerp } : { actie: "nieuw", titel, sjabloon });
      setPaginas((c) => [d.pagina, ...(c ?? [])]);
      setTitel("");
      setOnderwerp("");
      open(d.pagina);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(null);
    }
  }

  if (bewerk) {
    return (
      <PaginaEditor
        key={bewerk.id}
        start={bewerk}
        onTerug={() => {
          setBewerk(null);
          onVoorbeeldPad(null);
        }}
        onBijgewerkt={(p) => {
          setPaginas((c) => (p ? (c ?? []).map((x) => (x.id === p.id ? p : x)) : (c ?? []).filter((x) => x.id !== bewerk.id)));
        }}
        onVoorbeeld={onVernieuw}
        onPad={onVoorbeeldPad}
      />
    );
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-xl p-4" style={paneel}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Nieuwe pagina
        </h2>
        <Veld label="Titel" waarde={titel} onChange={setTitel} max={120} placeholder="Bijvoorbeeld: Personeel voor festivals" />
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Beginnen met
          </span>
          <select value={sjabloon} onChange={(e) => setSjabloon(e.target.value)} className="w-full rounded-lg px-2 py-2 text-sm" style={veldStijl}>
            {PAGINA_SJABLONEN.map((s) => (
              <option key={s.id} value={s.id}>
                {s.naam}: {s.uitleg}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => maak("nieuw")} disabled={bezig !== null} className="a-button a-button-primary w-full text-sm disabled:opacity-50">
          {bezig === "nieuw" ? "Bezig…" : "Pagina maken"}
        </button>
        <div className="border-t pt-3" style={{ borderColor: "var(--a-border)" }}>
          <Tekstvak label="Of laat de AI een opzet maken: waar gaat de pagina over?" waarde={onderwerp} onChange={setOnderwerp} max={600} rijen={2} />
          <button type="button" onClick={() => maak("ai")} disabled={bezig !== null || onderwerp.trim().length < 5} className="a-button mt-2 w-full text-sm disabled:opacity-50">
            {bezig === "ai" ? "De AI schrijft je pagina…" : "Maak een opzet met AI"}
          </button>
        </div>
        {fout ? (
          <p role="alert" className="text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
            {fout}
          </p>
        ) : null}
      </section>

      {paginas === null ? (
        <p className="text-sm" style={mute}>
          Laden…
        </p>
      ) : paginas.length ? (
        <ul className="space-y-2">
          {paginas.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left" style={paneel}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {p.concept.titel}
                  </span>
                  <span className="block truncate font-mono text-[11px]" style={mute}>
                    /p/{p.slug} · {p.concept.blokken.length} blokken
                  </span>
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={p.live ? { background: "var(--a-ok-soft)", color: "var(--a-ok-ink)" } : { background: "var(--a-elev)", color: "var(--a-text)" }}>
                  {p.live ? "Live" : "Concept"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={mute}>
          Nog geen eigen pagina&apos;s. Maak er hierboven een.
        </p>
      )}
    </div>
  );
}
