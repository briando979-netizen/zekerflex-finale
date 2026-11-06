"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tintVanApp as tintVan, type OsApp, type OsKaart, type OsRol, type OsTint } from "@/lib/os/apps";
import { OS_ACHTERGRONDEN, MAX_VASTGEZET, type OsAchtergrond, type OsInstellingen } from "@/lib/os/instellingen";
import { Tegel } from "@/components/os/Tegel";
import { Start } from "@/components/os/Start";
import { Taakbalk } from "@/components/os/Taakbalk";
import { Venster, MIN_BREEDTE, MIN_HOOGTE, TAAKBALK, type VensterStaat } from "@/components/os/Venster";

// ---------------------------------------------------------------------------
// ZekerFlex OS: het bureaublad. Alle schermen van het platform zijn hier apps
// die in een venster openen; de taakbalk toont wat open staat. Wat je vastzet
// en welke achtergrond je kiest, bewaart de server per gebruiker; welke
// vensters open staan onthoudt alleen deze browser.
// ---------------------------------------------------------------------------

const VENSTERS_SLEUTEL = "zf-os-vensters";
const SMAL = 820;

function nieuwVenster(app: OsApp, aantal: number, laag: number, breedScherm: boolean): VensterStaat {
  const breedte = Math.min(app.groot ? 1180 : 920, Math.max(MIN_BREEDTE, breedScherm ? window.innerWidth - 120 : window.innerWidth - 24));
  const hoogte = Math.min(app.groot ? 820 : 660, Math.max(MIN_HOOGTE, window.innerHeight - TAAKBALK - 60));
  const trap = (aantal % 6) * 28;
  return {
    id: app.id,
    x: Math.max(12, Math.round((window.innerWidth - breedte) / 2) - 60 + trap),
    y: Math.max(12, 40 + trap),
    breedte,
    hoogte,
    laag,
    minimaal: false,
    maximaal: !breedScherm,
  };
}

const KAART_TINT: Record<OsTint, string> = {
  groen: "text-brand-mint",
  blauw: "text-sky-200",
  goud: "text-amber-200",
  violet: "text-violet-200",
  leisteen: "text-white/80",
};

export function Bureaublad({ apps, start, rol, naam, tijd, vandaag = [] }: { apps: OsApp[]; start: OsInstellingen; rol: OsRol; naam: string; tijd: string; vandaag?: OsKaart[] }) {
  const [instellingen, setInstellingen] = useState(start);
  const [vensters, setVensters] = useState<VensterStaat[]>([]);
  const [actief, setActief] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [paneelOpen, setPaneelOpen] = useState(false);
  const [smal, setSmal] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const hoogste = useRef(10);
  const appVan = useCallback((id: string) => apps.find((a) => a.id === id), [apps]);

  useEffect(() => {
    const meet = () => setSmal(window.innerWidth < SMAL);
    meet();
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
  }, []);

  // Vangnet: kom je hier via een interne link (zonder de pagina te laden), dan
  // geldt nog de CSP van het vorige scherm. Die staat geen frames van de eigen
  // site toe, dus de browser blokkeert elk app-venster. Dan laden we /os één keer
  // zelf; open vensters komen terug uit sessionStorage. De markering ?opnieuw=1
  // voorkomt een lus als het daarna nog steeds niet mag.
  useEffect(() => {
    const geblokkeerd = (e: SecurityPolicyViolationEvent) => {
      if (!/^(frame|child)-src/.test(e.effectiveDirective)) return;
      if (!e.blockedURI.startsWith(window.location.origin)) return;
      const url = new URL(window.location.href);
      if (url.searchParams.has("opnieuw")) {
        setMelding("Deze app kon niet openen. Laad de pagina opnieuw of open de app in een eigen tabblad.");
        return;
      }
      url.searchParams.set("opnieuw", "1");
      window.location.replace(url.toString());
    };
    document.addEventListener("securitypolicyviolation", geblokkeerd);
    return () => document.removeEventListener("securitypolicyviolation", geblokkeerd);
  }, []);

  // open vensters terughalen (alleen deze browser; kan ontbreken of geblokkeerd zijn)
  useEffect(() => {
    if (!start.herstelVensters) return;
    try {
      const ruw: unknown = JSON.parse(window.sessionStorage.getItem(VENSTERS_SLEUTEL) ?? "[]");
      if (!Array.isArray(ruw)) return;
      const geldig = ruw.filter((v): v is VensterStaat => Boolean(v && typeof v === "object" && typeof (v as VensterStaat).id === "string" && apps.some((a) => a.id === (v as VensterStaat).id)));
      if (!geldig.length) return;
      hoogste.current = Math.max(10, ...geldig.map((v) => v.laag));
      setVensters(geldig);
      setActief(geldig[geldig.length - 1]?.id ?? null);
    } catch {
      /* opslag niet beschikbaar */
    }
  }, [apps, start.herstelVensters]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(VENSTERS_SLEUTEL, JSON.stringify(instellingen.herstelVensters ? vensters : []));
    } catch {
      /* opslag niet beschikbaar */
    }
  }, [vensters, instellingen.herstelVensters]);

  const bewaar = useCallback(async (nieuw: OsInstellingen) => {
    setInstellingen(nieuw);
    try {
      await fetch("/api/os/instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nieuw) });
    } catch {
      setMelding("Je voorkeur kon niet worden bewaard.");
    }
  }, []);

  const openApp = useCallback(
    (app: OsApp) => {
      if (app.nieuwTabblad) {
        window.open(app.href, "_blank", "noopener");
        return;
      }
      hoogste.current += 1;
      const laag = hoogste.current;
      setVensters((cur) => {
        const bestaat = cur.find((v) => v.id === app.id);
        if (bestaat) return cur.map((v) => (v.id === app.id ? { ...v, minimaal: false, laag } : v));
        return [...cur, nieuwVenster(app, cur.length, laag, window.innerWidth >= SMAL)];
      });
      setActief(app.id);
    },
    [],
  );

  const acties = useMemo(
    () => ({
      naarVoren: (id: string) => {
        hoogste.current += 1;
        const laag = hoogste.current;
        setVensters((cur) => cur.map((v) => (v.id === id ? { ...v, laag } : v)));
        setActief(id);
      },
      verplaats: (id: string, x: number, y: number) => setVensters((cur) => cur.map((v) => (v.id === id ? { ...v, x, y } : v))),
      formaat: (id: string, breedte: number, hoogte: number) => setVensters((cur) => cur.map((v) => (v.id === id ? { ...v, breedte, hoogte } : v))),
      minimaliseer: (id: string) => {
        setVensters((cur) => cur.map((v) => (v.id === id ? { ...v, minimaal: true } : v)));
        setActief((a) => (a === id ? null : a));
      },
      maximaliseer: (id: string) => setVensters((cur) => cur.map((v) => (v.id === id ? { ...v, maximaal: !v.maximaal } : v))),
      sluit: (id: string) => {
        setVensters((cur) => cur.filter((v) => v.id !== id));
        setActief((a) => (a === id ? null : a));
      },
    }),
    [],
  );

  // Ctrl/Cmd + K opent het startmenu, Escape sluit wat open staat
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setStartOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setStartOpen(false);
        setPaneelOpen(false);
      }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, []);

  function vastzetten(id: string) {
    const vast = instellingen.vastgezet.includes(id);
    if (!vast && instellingen.vastgezet.length >= MAX_VASTGEZET) {
      setMelding(`Je bureaublad is vol (${MAX_VASTGEZET} apps). Haal er eerst een af.`);
      return;
    }
    setMelding(null);
    void bewaar({ ...instellingen, vastgezet: vast ? instellingen.vastgezet.filter((x) => x !== id) : [...instellingen.vastgezet, id] });
  }

  /** een app een plek naar voren of naar achteren op het bureaublad */
  function verplaatsTegel(id: string, richting: -1 | 1) {
    const lijst = [...instellingen.vastgezet];
    const i = lijst.indexOf(id);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= lijst.length) return;
    const [x] = lijst.splice(i, 1);
    if (x) lijst.splice(j, 0, x);
    void bewaar({ ...instellingen, vastgezet: lijst });
  }

  const tegels = instellingen.vastgezet.map(appVan).filter((a): a is OsApp => Boolean(a));
  const achtergrond = OS_ACHTERGRONDEN[instellingen.achtergrond];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden" style={{ background: achtergrond.css }}>
      {/* main: het bureaublad is het hoofdgebied, zodat een schermlezer alles in een herkenbaar deel vindt */}
      <main className="absolute inset-0 overflow-y-auto px-5 pb-20 pt-7">
        <header className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">ZekerFlex OS</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Hallo {naam}</h1>
          <p className="mt-1 text-sm text-white/55">
            {rol === "admin" ? "Je beheert het hele platform." : rol === "werkgever" ? "Alles voor je bedrijf op één plek." : "Alles voor je werk op één plek."}{" "}
            {/* de sneltoets alleen noemen waar een toetsenbord is */}
            {smal ? "Tik op een app om te beginnen." : "Klik op een app, of druk op Ctrl + K."}
          </p>
        </header>

        {melding ? (
          <p role="alert" className="mb-4 inline-block rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-100">
            {melding}
          </p>
        ) : null}

        {vandaag.length ? (
          <section aria-label="Vandaag" className="mb-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {vandaag.map((k) => {
              const app = k.app ? appVan(k.app) : undefined;
              const inhoud = (
                <>
                  <span className={`block font-display text-2xl font-bold ${k.actie ? "text-amber-200" : KAART_TINT[k.tint]}`}>{k.waarde}</span>
                  <span className="mt-0.5 block text-xs text-white/60">{k.label}</span>
                </>
              );
              return (
                <div key={k.label} className={`rounded-2xl border px-4 py-3 ${k.actie ? "border-amber-300/30 bg-amber-400/[0.08]" : "border-white/10 bg-white/[0.05]"}`}>
                  {app ? (
                    <button type="button" onClick={() => openApp(app)} className="w-full text-left">
                      {inhoud}
                      <span className="mt-1 block text-[11px] text-white/40">{app.naam} openen →</span>
                    </button>
                  ) : (
                    inhoud
                  )}
                </div>
              );
            })}
          </section>
        ) : null}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(118px,1fr))]">
          {tegels.map((app, i) => (
            <li key={app.id}>
              <Tegel
                app={app}
                eerste={i === 0}
                laatste={i === tegels.length - 1}
                onOpen={() => openApp(app)}
                onVerplaats={(richting) => verplaatsTegel(app.id, richting)}
                onAfhalen={() => vastzetten(app.id)}
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center text-white/60 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-mint"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-dashed border-white/25 text-2xl font-light">+</span>
              <span className="text-xs font-semibold">Meer apps</span>
            </button>
          </li>
        </ul>
      </main>

      {vensters.map((v) => {
        const app = appVan(v.id);
        return app ? <Venster key={v.id} app={app} tint={tintVan(app)} staat={v} acties={acties} smal={smal} actief={actief === v.id} /> : null;
      })}

      {paneelOpen ? (
        <>
          <button type="button" aria-label="Instellingen sluiten" onClick={() => setPaneelOpen(false)} className="fixed inset-0 z-[60] cursor-default" />
          <div role="dialog" aria-label="Instellingen van het bureaublad" className="fixed bottom-[64px] right-3 z-[61] w-[min(330px,92vw)] space-y-3 rounded-2xl border border-white/15 bg-[#0C0E12]/95 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            <h2 className="text-sm font-semibold text-white">Achtergrond</h2>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(OS_ACHTERGRONDEN) as OsAchtergrond[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => void bewaar({ ...instellingen, achtergrond: k })}
                  aria-label={OS_ACHTERGRONDEN[k].naam}
                  aria-pressed={instellingen.achtergrond === k}
                  title={OS_ACHTERGRONDEN[k].naam}
                  style={{ background: OS_ACHTERGRONDEN[k].css }}
                  className={`h-10 rounded-lg ring-2 transition ${instellingen.achtergrond === k ? "ring-brand-mint" : "ring-white/10 hover:ring-white/30"}`}
                />
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={instellingen.herstelVensters} onChange={(e) => void bewaar({ ...instellingen, herstelVensters: e.target.checked })} className="mt-1" />
              Open vensters onthouden tot ik dit tabblad sluit
            </label>
            <p className="text-[11px] text-white/45">Je bureaublad en achtergrond zijn van jou en gelden op elk apparaat waarop je inlogt.</p>
          </div>
        </>
      ) : null}

      <Start apps={apps} vastgezet={instellingen.vastgezet} open={startOpen} onSluit={() => setStartOpen(false)} onOpenApp={openApp} onVastzetten={vastzetten} />

      <Taakbalk
        apps={apps}
        vensters={vensters}
        actief={actief}
        startOpen={startOpen}
        tijd={tijd}
        naam={naam}
        onStart={() => setStartOpen((o) => !o)}
        onKies={(id) => {
          const v = vensters.find((x) => x.id === id);
          if (v?.minimaal === false && actief === id) acties.minimaliseer(id);
          else acties.naarVoren(id);
          setVensters((cur) => cur.map((x) => (x.id === id ? { ...x, minimaal: false } : x)));
        }}
        onInstellingen={() => setPaneelOpen((o) => !o)}
      />
    </div>
  );
}
