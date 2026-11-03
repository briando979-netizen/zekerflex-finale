"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { Card, PageHead, btn, input } from "@/components/studio/ui";
import { renderPage } from "@/lib/sites/render";
import { isHexColor, type Theme } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Websitestudio → Ontwerp: stijl, kleuren, letters, hoeken en logo, met de
// homepagina ernaast precies zoals bezoekers hem straks zien (dezelfde code als
// de echte site, lib/sites/render.ts). Opslaan bewaart; Publiceren zet het live.
// ---------------------------------------------------------------------------

const STIJLEN: { id: NonNullable<Theme["stijl"]>; naam: string; uitleg: string }[] = [
  { id: "premium", naam: "Premium", uitleg: "Donker en groot, met ronde knoppen en een volle voettekst. Zoals schwarzwald.zekerflex.com." },
  { id: "luxe", naam: "Luxe", uitleg: "Veel ruimte, fijne lijnen en verfijnde koppen. Rustig en chic." },
  { id: "standaard", naam: "Eenvoudig", uitleg: "Licht en overzichtelijk. Snel en duidelijk." },
];

const LETTERS: { id: Theme["lettertype"]; naam: string }[] = [
  { id: "modern", naam: "Modern" },
  { id: "klassiek", naam: "Klassiek" },
  { id: "vriendelijk", naam: "Vriendelijk" },
];

export default function Ontwerp({ origin }: { origin: string }) {
  const { data, saveSite } = useStudio();
  const site = data!.site!;
  const [theme, setTheme] = useState<Theme>(site.theme);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const gewijzigd = JSON.stringify(theme) !== JSON.stringify(site.theme);
  const zet = (patch: Partial<Theme>) => {
    setTheme((t) => ({ ...t, ...patch }));
    setMelding(null);
  };

  const home = site.pages.find((p) => p.slug === "") ?? site.pages[0];
  const html = useMemo(
    () => (home ? renderPage({ ...site, theme }, home, { root: "/", origin, preview: { mediaUrl: (file) => `/api/werkgever/sites/media/${file}` } }) : ""),
    [site, theme, home, origin],
  );

  const opslaan = async () => {
    setBezig(true);
    const fout = await saveSite({ theme });
    setBezig(false);
    setMelding(fout ? { ok: false, text: fout } : { ok: true, text: "Opgeslagen. Klik bovenaan op Publiceren om het op je website te zetten." });
  };

  return (
    <>
      <PageHead
        title="Ontwerp"
        sub="Hoe je website eruitziet. Rechts zie je het meteen."
        actions={
          <>
            {gewijzigd && <button type="button" onClick={() => setTheme(site.theme)} className={btn.secondary}>Verwerpen</button>}
            <button type="button" disabled={!gewijzigd || bezig} onClick={() => void opslaan()} className={btn.primary}>{bezig ? "Opslaan…" : "Opslaan"}</button>
          </>
        }
      />
      {melding && <p role={melding.ok ? "status" : "alert"} className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>{melding.text}</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Stijl">
            <div className="space-y-2" role="radiogroup" aria-label="Stijl">
              {STIJLEN.map((s) => {
                const aan = (theme.stijl ?? "standaard") === s.id;
                return (
                  <button key={s.id} type="button" role="radio" aria-checked={aan} onClick={() => zet({ stijl: s.id })} className={`block w-full rounded-xl border-2 p-3 text-left ${aan ? "border-[#1a1a1a] bg-[#fafafa]" : "border-[#ebebeb] hover:border-[#c9c9c9]"}`}>
                    <span className="block text-sm font-semibold text-[#1a1a1a]">{s.naam}</span>
                    <span className="mt-0.5 block text-xs text-[#616161]">{s.uitleg}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Kleuren">
            <div className="grid grid-cols-3 gap-2">
              {(data?.presets ?? []).map((pr) => {
                const aan = theme.kleur.toLowerCase() === pr.kleur.toLowerCase() && theme.accent.toLowerCase() === pr.accent.toLowerCase();
                return (
                  <button key={pr.naam} type="button" aria-pressed={aan} onClick={() => zet({ kleur: pr.kleur, accent: pr.accent })} className={`rounded-xl border-2 p-2 text-left ${aan ? "border-[#1a1a1a]" : "border-[#ebebeb] hover:border-[#c9c9c9]"}`}>
                    <span className="flex h-7 overflow-hidden rounded-lg">
                      <span className="flex-[2]" style={{ background: pr.kleur }} />
                      <span className="flex-1" style={{ background: pr.accent }} />
                    </span>
                    <span className="mt-1 block text-xs font-medium text-[#303030]">{pr.naam}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Kleur label="Hoofdkleur" waarde={theme.kleur} onKies={(kleur) => zet({ kleur })} />
              <Kleur label="Accentkleur" waarde={theme.accent} onKies={(accent) => zet({ accent })} />
            </div>
          </Card>

          <Card title="Letters en vormen">
            <span className="mb-1 block text-sm font-medium text-[#303030]">Lettertype</span>
            <div className="grid grid-cols-3 gap-2">
              {LETTERS.map((l) => (
                <button key={l.id} type="button" aria-pressed={theme.lettertype === l.id} onClick={() => zet({ lettertype: l.id })} className={`rounded-xl border-2 px-2 py-2 text-sm font-semibold ${theme.lettertype === l.id ? "border-[#1a1a1a]" : "border-[#ebebeb] text-[#616161] hover:border-[#c9c9c9]"}`}>
                  {l.naam}
                </button>
              ))}
            </div>
            <span className="mb-1 mt-4 block text-sm font-medium text-[#303030]">Hoeken</span>
            <div className="grid grid-cols-2 gap-2">
              {(["rond", "strak"] as const).map((h) => (
                <button key={h} type="button" aria-pressed={theme.hoeken === h} onClick={() => zet({ hoeken: h })} className={`border-2 px-2 py-2 text-sm font-semibold ${h === "rond" ? "rounded-2xl" : "rounded-md"} ${theme.hoeken === h ? "border-[#1a1a1a]" : "border-[#ebebeb] text-[#616161] hover:border-[#c9c9c9]"}`}>
                  {h === "rond" ? "Rond" : "Strak"}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Logo">
            <div className="grid grid-cols-4 gap-2">
              <button type="button" aria-pressed={!theme.logo} onClick={() => zet({ logo: null })} className={`aspect-square rounded-xl border-2 text-xs font-medium text-[#616161] ${!theme.logo ? "border-[#1a1a1a]" : "border-[#ebebeb]"}`}>Naam als tekst</button>
              {site.media.map((m) => (
                <button key={m.id} type="button" aria-pressed={theme.logo === m.id} aria-label={m.alt || "Foto"} onClick={() => zet({ logo: m.id })} className={`overflow-hidden rounded-xl border-2 bg-[#f7f7f7] ${theme.logo === m.id ? "border-[#1a1a1a]" : "border-[#ebebeb]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/werkgever/sites/media/${m.file}`} alt="" className="aspect-square w-full object-contain" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#707070]">Een nieuw logo upload je bij een product of in de paginabouwer onder Foto&apos;s.</p>
          </Card>
        </div>

        <Card title={home ? `Voorbeeld: ${home.titel}` : "Voorbeeld"} pad={false} className="xl:sticky xl:top-20">
          <Voorbeeld html={html} />
        </Card>
      </div>
    </>
  );
}

function Kleur({ label, waarde, onKies }: { label: string; waarde: string; onKies: (v: string) => void }) {
  const [tekst, setTekst] = useState(waarde);
  const [vorige, setVorige] = useState(waarde);
  // een preset of de kleurkiezer zet een nieuwe waarde: het tekstvak volgt
  if (waarde !== vorige) {
    setVorige(waarde);
    setTekst(waarde);
  }
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#303030]">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={isHexColor(waarde) ? waarde : "#000000"} onChange={(e) => onKies(e.target.value)} className="h-9 w-10 flex-shrink-0 cursor-pointer rounded-lg border border-[#c9c9c9] bg-white p-0.5" aria-label={`${label} kiezen`} />
        <input
          className={`${input} font-mono uppercase`}
          value={tekst}
          maxLength={7}
          onChange={(e) => {
            setTekst(e.target.value);
            if (isHexColor(e.target.value)) onKies(e.target.value);
          }}
        />
      </span>
    </label>
  );
}

/** De pagina op computerbreedte (1280 px), verkleind tot de kaart; afgeschermd zonder scripts. */
function Voorbeeld({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [breedte, setBreedte] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setBreedte(e[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const schaal = breedte ? Math.min(1, breedte / 1280) : 0.5;
  return (
    <div ref={box} className="overflow-hidden rounded-b-2xl" style={{ height: 820 * schaal }}>
      {/* allow-same-origin zonder allow-scripts (zoals de paginabouwer): foto's laden met de sessie, geen script draait */}
      <iframe title="Voorbeeld van je homepagina" sandbox="allow-same-origin" srcDoc={html} style={{ width: 1280, height: 820, transform: `scale(${schaal})`, transformOrigin: "0 0", border: 0 }} />
    </div>
  );
}
