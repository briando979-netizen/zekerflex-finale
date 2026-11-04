"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { themaCss, type Thema } from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// Het live voorbeeld van de Site-ontwerper: de echte site (zelfde herkomst) in
// een venster op computer-, tablet- of telefoonbreedte. Het concept komt er als
// stijl overheen (themaCss met alles: true legt het over wat er live staat), en
// teksten die je typt staan er meteen in. Met "klik op een tekst" opent een tik
// op een gemarkeerde tekst (data-cms-key) dat veld in de ontwerper. Alleen in
// dit voorbeeld: op de publieke site staat geen bewerkknop.
// ---------------------------------------------------------------------------

export const APPARATEN = {
  computer: { label: "Computer", breedte: 1366 },
  tablet: { label: "Tablet", breedte: 820 },
  telefoon: { label: "Telefoon", breedte: 390 },
} as const;
export type Apparaat = keyof typeof APPARATEN;

export const PAGINAS: { pad: string; label: string }[] = [
  { pad: "/", label: "Homepage" },
  { pad: "/voor-bedrijven", label: "Voor bedrijven" },
  { pad: "/voor-freelancers", label: "Voor freelancers" },
  { pad: "/klus-plaatsen", label: "Klus plaatsen" },
  { pad: "/prijzen", label: "Prijzen" },
  { pad: "/aanbod", label: "Aanbod" },
  { pad: "/over-ons", label: "Over ons" },
  { pad: "/contact", label: "Contact" },
  { pad: "/website-check", label: "Website-check" },
];

const MARKEER_CSS =
  "[data-cms-key]{outline:2px dashed rgba(79,224,160,.9)!important;outline-offset:3px;cursor:pointer!important}[data-cms-key]:hover{outline-style:solid!important;background:rgba(79,224,160,.12)}";

/** Alleen de tekst vervangen, niet een pijltje of icoon ernaast. */
function zetTekst(el: Element, waarde: string) {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.nodeValue ?? "").trim()) {
      if (n.nodeValue !== waarde) n.nodeValue = waarde;
      return;
    }
  }
  el.textContent = waarde;
}

export function Voorbeeld({
  thema,
  teksten,
  tekstModus,
  onKiesTekst,
  vastPad = null,
  vernieuw = 0,
}: {
  thema: Thema;
  /** sleutel → tekst zoals hij nu in de ontwerper staat */
  teksten: Record<string, string>;
  tekstModus: boolean;
  onKiesTekst: (key: string) => void;
  /** een eigen pagina die je bewerkt (/p/<slug>?concept=1): het voorbeeld springt erheen */
  vastPad?: string | null;
  /** telt op na elke bewaarde wijziging van een pagina: het voorbeeld laadt opnieuw */
  vernieuw?: number;
}) {
  const [pad, setPad] = useState("/");
  const [apparaat, setApparaat] = useState<Apparaat>("computer");
  const [laden, setLaden] = useState(true);
  const [maat, setMaat] = useState({ w: 900, h: 640 });
  const vak = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const modus = useRef(tekstModus);
  const kies = useRef(onKiesTekst);
  modus.current = tekstModus;
  kies.current = onKiesTekst;

  useEffect(() => {
    if (vastPad) {
      setLaden(true);
      setPad(vastPad);
    }
  }, [vastPad]);

  useEffect(() => {
    if (!vernieuw) return;
    try {
      frame.current?.contentWindow?.location.reload();
    } catch {
      /* andere herkomst */
    }
  }, [vernieuw]);

  useEffect(() => {
    const el = vak.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setMaat({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pasToe = useCallback(() => {
    let doc: Document | null = null;
    try {
      doc = frame.current?.contentDocument ?? null;
    } catch {
      return; // een andere herkomst (een link naar buiten): niets aan te passen
    }
    if (!doc?.body) return;
    let stijl = doc.getElementById("zf-ontwerp-voorbeeld");
    if (!stijl) {
      stijl = doc.createElement("style");
      stijl.id = "zf-ontwerp-voorbeeld";
    }
    // achteraan de body: na de live stijl, dus het concept wint
    doc.body.appendChild(stijl);
    stijl.textContent = `${themaCss(thema, { alles: true }) ?? ""}\n${tekstModus ? MARKEER_CSS : ""}`;
    for (const [key, waarde] of Object.entries(teksten)) {
      doc.querySelectorAll(`[data-cms-key="${key.replace(/"/g, "")}"]`).forEach((el) => {
        // een punt van een lijsttekst (één per regel, lege regels tellen niet; zoals lijstRegels in lib/content/store.ts)
        const regel = el.getAttribute("data-cms-regel");
        if (regel === null) return zetTekst(el, waarde);
        const regels = waarde.split("\n").map((r) => r.trim()).filter(Boolean);
        zetTekst(el, regels[Number(regel)] ?? "");
      });
    }
  }, [thema, teksten, tekstModus]);

  useEffect(() => {
    pasToe();
  }, [pasToe]);

  const geladen = useCallback(() => {
    setLaden(false);
    pasToe();
    try {
      const doc = frame.current?.contentDocument;
      // één klik-luisteraar per document, ook als load en de controle hieronder allebei afgaan
      if (!doc || doc.documentElement.dataset.zfOntwerper === "1") return;
      doc.documentElement.dataset.zfOntwerper = "1";
      doc.addEventListener(
        "click",
        (e) => {
          if (!modus.current) return;
          const doel = (e.target as Element | null)?.closest?.("[data-cms-key]");
          const key = doel?.getAttribute("data-cms-key");
          if (!key) return;
          e.preventDefault();
          e.stopPropagation();
          kies.current(key);
        },
        true,
      );
    } catch {
      /* andere herkomst */
    }
  }, [pasToe]);

  // Laadt het venster sneller dan React zijn onLoad koppelt (vaak bij de eerste pagina), dan
  // komt er geen load-melding meer: kijk dan zelf of het document al klaar is.
  useEffect(() => {
    const t = window.setInterval(() => {
      try {
        if (frame.current?.contentDocument?.readyState === "complete") {
          geladen();
          window.clearInterval(t);
        }
      } catch {
        window.clearInterval(t);
      }
    }, 400);
    return () => window.clearInterval(t);
  }, [pad, geladen]);

  const breedte = APPARATEN[apparaat].breedte;
  const schaal = Math.min(1, maat.w / breedte);
  const knop = (aan: boolean) => ({
    background: aan ? "var(--a-accent)" : "var(--a-panel)",
    color: aan ? "var(--a-on-accent)" : "var(--a-text)",
    border: "1px solid var(--a-border)",
  });

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
          Pagina
          <select
            value={pad}
            onChange={(e) => {
              setLaden(true);
              setPad(e.target.value);
            }}
            className="rounded-lg px-2 py-1.5 text-sm"
            style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
          >
            {vastPad && !PAGINAS.some((p) => p.pad === vastPad) ? <option value={vastPad}>Deze pagina (concept)</option> : null}
            {PAGINAS.map((p) => (
              <option key={p.pad} value={p.pad}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label="Schermgrootte" className="flex gap-1">
          {(Object.keys(APPARATEN) as Apparaat[]).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={apparaat === a} onClick={() => setApparaat(a)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={knop(apparaat === a)}>
              {APPARATEN[a].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setLaden(true);
            frame.current?.contentWindow?.location.reload();
          }}
          className="a-button text-xs"
        >
          Vernieuwen
        </button>
        <a href={pad} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--a-accent-ink)" }}>
          Live openen ↗
        </a>
        {tekstModus ? (
          <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
            Klik op een gemarkeerde tekst om hem te bewerken
          </span>
        ) : null}
      </div>
      <div ref={vak} className="relative min-h-[560px] flex-1 overflow-hidden rounded-xl" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
        <iframe
          ref={frame}
          key={pad}
          src={pad}
          title="Voorbeeld van de site met je concept"
          onLoad={geladen}
          className="absolute left-1/2 top-0 origin-top bg-white"
          style={{ width: breedte, height: maat.h / schaal, transform: `translateX(-50%) scale(${schaal})`, border: 0 }}
        />
        {laden ? (
          <p className="absolute inset-x-0 top-4 mx-auto w-fit rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--a-panel)", color: "var(--a-mute)", boxShadow: "var(--a-shadow-md)" }}>
            Voorbeeld laden…
          </p>
        ) : null}
      </div>
      <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>
        Je ziet je concept over de echte site heen. Bezoekers zien het pas als je op Publiceren drukt.
      </p>
    </div>
  );
}
