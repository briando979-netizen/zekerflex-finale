"use client";

import { useEffect, useState } from "react";
import { MAX_KOLOMMEN, MAX_LINKS, normalizeVoettekst, type MenuLink, type Voettekst, type VoettekstKolom } from "@/lib/ontwerp/menu";
import type { Hoofdmenu } from "@/lib/ontwerp/hoofdmenu";
import { HoofdmenuPaneel } from "@/components/admin/ontwerper/HoofdmenuPaneel";
import { BalkPaneel } from "@/components/admin/ontwerper/BalkPaneel";
import { SleepGreep, useSleep } from "@/components/admin/ontwerper/Sleep";
import { verplaatsNaar } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Tabblad Menu: het hoofdmenu bovenaan (HoofdmenuPaneel) en de voettekst
// van de site. Voettekst: kolommen met een kop en links,
// verplaatsen, toevoegen en weghalen; eigen pagina's (Pagina's) met één klik
// erbij. Opslaan zet hem meteen live; "Standaard" zet de oorspronkelijke terug.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";

function verplaats<T>(lijst: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= lijst.length) return lijst;
  const n = [...lijst];
  const [x] = n.splice(i, 1);
  if (x !== undefined) n.splice(j, 0, x);
  return n;
}

function LinkRij({ link, onZet, onOmhoog, onOmlaag, onWeg, eerste, laatste, nummer }: { link: MenuLink; onZet: (l: MenuLink) => void; onOmhoog: () => void; onOmlaag: () => void; onWeg: () => void; eerste: boolean; laatste: boolean; nummer: number }) {
  return (
    <li data-sleep-rij="" className="flex items-center gap-1.5">
      <SleepGreep naam={`Link ${nummer}`} />
      <input aria-label={`Link ${nummer}: tekst`} value={link.label} onChange={(e) => onZet({ ...link, label: e.target.value })} maxLength={60} placeholder="Tekst" className="min-w-0 flex-1 rounded-lg px-2 py-1 text-xs" style={veld} />
      <input aria-label={`Link ${nummer}: adres`} value={link.href} onChange={(e) => onZet({ ...link, href: e.target.value })} maxLength={500} placeholder="/pagina of https://…" className="min-w-0 flex-1 rounded-lg px-2 py-1 font-mono text-[11px]" style={veld} />
      <button type="button" onClick={onOmhoog} disabled={eerste} aria-label="Omhoog" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
        ↑
      </button>
      <button type="button" onClick={onOmlaag} disabled={laatste} aria-label="Omlaag" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
        ↓
      </button>
      <button type="button" onClick={onWeg} aria-label="Link weghalen" className={klein} style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
        ✕
      </button>
    </li>
  );
}

function KolomKaart({ kolom, index, aantal, eigenPaginas, onZet, onWeg, onVerplaats }: { kolom: VoettekstKolom; index: number; aantal: number; eigenPaginas: MenuLink[]; onZet: (k: VoettekstKolom) => void; onWeg: () => void; onVerplaats: (d: number) => void }) {
  const zetLinks = (links: MenuLink[]) => onZet({ ...kolom, links });
  const sleep = useSleep((van, naar) => zetLinks(verplaatsNaar(kolom.links, van, naar)));
  return (
    <section className="space-y-2 rounded-xl p-3" style={paneel}>
      <div className="flex items-center gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Kop van kolom {index + 1}</span>
          <input value={kolom.titel} onChange={(e) => onZet({ ...kolom, titel: e.target.value })} maxLength={40} placeholder="Kop van de kolom" className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold" style={veld} />
        </label>
        <button type="button" onClick={() => onVerplaats(-1)} disabled={index === 0} aria-label="Kolom naar links" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
          ←
        </button>
        <button type="button" onClick={() => onVerplaats(1)} disabled={index === aantal - 1} aria-label="Kolom naar rechts" className={klein} style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
          →
        </button>
        <button type="button" onClick={onWeg} aria-label="Kolom weghalen" className={klein} style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
          ✕
        </button>
      </div>
      <ul className="space-y-1.5" {...sleep.lijst}>
        {kolom.links.map((l, i) => (
          <LinkRij
            key={i}
            nummer={i + 1}
            link={l}
            onZet={(nl) => zetLinks(kolom.links.map((x, j) => (j === i ? nl : x)))}
            onOmhoog={() => zetLinks(verplaats(kolom.links, i, -1))}
            onOmlaag={() => zetLinks(verplaats(kolom.links, i, 1))}
            onWeg={() => zetLinks(kolom.links.filter((_, j) => j !== i))}
            eerste={i === 0}
            laatste={i === kolom.links.length - 1}
          />
        ))}
      </ul>
      {kolom.links.length < MAX_LINKS ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => zetLinks([...kolom.links, { label: "", href: "" }])} className="a-button text-xs">
            + Link
          </button>
          {eigenPaginas.length ? (
            <label className="flex items-center gap-1 text-[11px]" style={mute}>
              <span>Eigen pagina:</span>
              <select
                value=""
                onChange={(e) => {
                  const p = eigenPaginas.find((x) => x.href === e.target.value);
                  if (p) zetLinks([...kolom.links, p]);
                }}
                className="rounded-md px-1.5 py-1 text-[11px]"
                style={veld}
              >
                <option value="">kies…</option>
                {eigenPaginas.map((p) => (
                  <option key={p.href} value={p.href}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function MenuPaneel({ onVernieuw }: { onVernieuw: () => void }) {
  const [voettekst, setVoettekst] = useState<Voettekst | null>(null);
  const [standaard, setStandaard] = useState<Voettekst | null>(null);
  const [eigen, setEigen] = useState(false);
  const [eigenPaginas, setEigenPaginas] = useState<MenuLink[]>([]);
  const [hoofdmenu, setHoofdmenu] = useState<{ begin: Hoofdmenu; eigen: boolean } | null>(null);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/ontwerp/menu", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { voettekst: Voettekst; eigen: boolean; standaard: Voettekst; hoofdmenu: Hoofdmenu; hoofdmenuEigen: boolean } | null) => {
        if (!d) return;
        setVoettekst(d.voettekst);
        setStandaard(d.standaard);
        setEigen(d.eigen);
        setHoofdmenu({ begin: d.hoofdmenu, eigen: d.hoofdmenuEigen });
      })
      .catch(() => undefined);
    fetch("/api/admin/ontwerp/paginas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { paginas?: { slug: string; live: { titel: string } | null }[] } | null) =>
        setEigenPaginas((d?.paginas ?? []).flatMap((p) => (p.live ? [{ label: p.live.titel, href: `/p/${p.slug}` }] : []))),
      )
      .catch(() => undefined);
  }, []);

  if (!voettekst) {
    return (
      <p className="text-sm" style={mute}>
        Laden…
      </p>
    );
  }

  const zet = (v: Voettekst) => {
    setVoettekst(v);
    setGewijzigd(true);
    setMelding(null);
  };
  const kolommen = voettekst.kolommen;
  const zetKolommen = (k: VoettekstKolom[]) => zet({ ...voettekst, kolommen: k });

  async function bewaar(terugNaarStandaard = false) {
    if (terugNaarStandaard && !window.confirm("De voettekst terugzetten naar de oorspronkelijke ZekerFlex-voettekst?")) return;
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/ontwerp/menu", terugNaarStandaard ? { method: "DELETE" } : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voettekst }) });
      const d = (await r.json().catch(() => null)) as { voettekst?: Voettekst; eigen?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !d?.voettekst) throw new Error(d?.error?.message ?? "Opslaan lukte niet.");
      setVoettekst(d.voettekst);
      setEigen(Boolean(d.eigen));
      setGewijzigd(false);
      const weg = !terugNaarStandaard && voettekst ? JSON.stringify(normalizeVoettekst(voettekst)) !== JSON.stringify(d.voettekst) : false;
      setMelding({ tekst: terugNaarStandaard ? "De oorspronkelijke voettekst staat weer live." : weg ? "Live. Links zonder tekst of zonder geldig adres zijn weggelaten." : "Live. Scrol in het voorbeeld naar beneden om hem te zien." });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Opslaan lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3">
      <BalkPaneel onVernieuw={onVernieuw} />
      {hoofdmenu ? <HoofdmenuPaneel begin={hoofdmenu.begin} beginEigen={hoofdmenu.eigen} eigenPaginas={eigenPaginas} onVernieuw={onVernieuw} /> : null}
      <section className="space-y-3 rounded-xl p-4" style={paneel}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Voettekst
        </h2>
        <p className="text-xs" style={mute}>
          Onderaan elke pagina. Adressen: een pagina van de site (/prijzen), een eigen pagina (/p/…), https://, mailto: of tel:. {eigen ? "Je eigen versie staat live." : "Nu staat de standaard live."}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Tekst onder het logo
          </span>
          <textarea value={voettekst.slogan} onChange={(e) => zet({ ...voettekst, slogan: e.target.value })} maxLength={400} rows={3} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => bewaar()} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
            {bezig ? "Bezig…" : "Opslaan (meteen live)"}
          </button>
          {gewijzigd ? (
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="a-button text-xs"
            >
              Wijzigingen weggooien
            </button>
          ) : null}
          {eigen ? (
            <button type="button" onClick={() => bewaar(true)} disabled={bezig} className="a-button text-xs">
              Terug naar de standaard
            </button>
          ) : null}
        </div>
        {melding ? (
          <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
            {melding.tekst}
          </p>
        ) : null}
      </section>

      {kolommen.map((k, i) => (
        <KolomKaart
          key={i}
          kolom={k}
          index={i}
          aantal={kolommen.length}
          eigenPaginas={eigenPaginas}
          onZet={(nk) => zetKolommen(kolommen.map((x, j) => (j === i ? nk : x)))}
          onWeg={() => {
            if (window.confirm(`Kolom "${k.titel || i + 1}" met ${k.links.length} links weghalen?`)) zetKolommen(kolommen.filter((_, j) => j !== i));
          }}
          onVerplaats={(d) => zetKolommen(verplaats(kolommen, i, d))}
        />
      ))}
      {kolommen.length < MAX_KOLOMMEN ? (
        <button type="button" onClick={() => zetKolommen([...kolommen, { titel: "Nieuwe kolom", links: [] }])} className="a-button w-full text-xs">
          + Kolom toevoegen
        </button>
      ) : null}
    </div>
  );
}
