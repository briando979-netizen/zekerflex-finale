"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { SLOGAN, beeld } from "@/lib/voorstel/smileyapp";
import { BRON_MAX, leesBron } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { demoQr } from "@/lib/voorstel/smileyapp-qr";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, LABEL, VELD } from "@/components/voorstel/smileyapp/beheer/api";
import { Poster } from "@/components/voorstel/smileyapp/beheer/Poster";

// "QR-code" in het beheer: een QR-code naar de demo-aanvraag, voor op een
// beursstand, flyer of visitekaartje. Te downloaden als SVG (drukwerk) en PNG,
// en als kaart op A5 te printen. Met een bron (bijvoorbeeld "beurs") staat bij
// elke aanvraag via die code waar hij vandaan kwam. De code wordt hier in de
// browser getekend; de bestanden komen van de server (alleen voor het team).
// Deel 6a: daaronder een poster op A4 of A5 met een eigen zin (Poster.tsx). Er
// komt altijd maar één van de twee op het papier: de knop waarop je drukt
// bepaalt welke (`druk`), de andere doet bij het printen niet mee.

export function QrCode() {
  const [invoer, setInvoer] = useState("");
  const [druk, setDruk] = useState<"kaart" | "poster">("kaart");
  /** Eerst kiezen wat er geprint wordt en dat meteen in de pagina zetten, dan pas het printvenster. */
  const print = (wat: "kaart" | "poster") => {
    flushSync(() => setDruk(wat));
    window.print();
  };
  const bron = leesBron(invoer);
  const bronFout = invoer.trim() !== "" && !bron;
  const { adres, pad, zijde } = demoQr(bron);
  const download = (vorm: "svg" | "png") => `${BEHEER_API}/qr?vorm=${vorm}${bron ? `&bron=${bron}` : ""}`;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute sm-niet-printen">
        Wie deze code scant, komt op de pagina om een demo aan te vragen. Zet hem op een flyer, een banner of een visitekaartje.
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <section aria-labelledby="sm-qr-kop" className={`${KAART} sm-niet-printen`}>
          <h3 id="sm-qr-kop" className="font-display text-xl font-bold text-smiley-ink">
            De code
          </h3>
          <div className="mt-4">
            <label htmlFor="sm-qr-bron" className={LABEL}>
              Bron <span className="font-normal text-smiley-mute">(mag leeg)</span>
            </label>
            <input
              id="sm-qr-bron"
              type="text"
              value={invoer}
              maxLength={BRON_MAX}
              autoComplete="off"
              placeholder="bijvoorbeeld beurs"
              onChange={(e) => setInvoer(e.target.value)}
              aria-invalid={bronFout || undefined}
              aria-describedby="sm-qr-bron-uitleg"
              className={`mt-1.5 ${VELD}`}
            />
            <p id="sm-qr-bron-uitleg" className="mt-1.5 text-sm text-smiley-mute">
              Eén woord om te zien waar een aanvraag vandaan kwam. Alleen letters, cijfers en streepjes, hooguit {BRON_MAX} tekens.
            </p>
            {bronFout && (
              <p role="alert" className="mt-2 rounded-2xl bg-smiley-coral/15 p-3 text-sm font-semibold text-[#8E2A1E]">
                Deze bron klopt niet. Gebruik alleen letters, cijfers en streepjes, zonder spaties. De code hieronder is nu zonder bron.
              </p>
            )}
          </div>
          <svg viewBox={`0 0 ${zijde} ${zijde}`} role="img" aria-label={`QR-code naar ${adres}`} shapeRendering="crispEdges" className="mx-auto mt-5 h-auto w-full max-w-[260px] rounded-2xl bg-white ring-1 ring-smiley-ink/10">
            <rect width={zijde} height={zijde} fill="#ffffff" />
            <path d={pad} fill="#0E2A20" />
          </svg>
          <p className="mt-3 break-all text-center text-sm font-semibold text-smiley-ink">{adres}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {/* gewone links met download: het bestand komt van de server, met de sessie van het beheer */}
            <a href={download("svg")} download className={KNOP}>
              Download als SVG
            </a>
            <a href={download("png")} download className={KNOP_LICHT}>
              Download als PNG
            </a>
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-smiley-mute">SVG blijft scherp op elke grootte (drukwerk). PNG is handig voor Word of een presentatie.</p>
        </section>

        <section aria-labelledby="sm-kaart-kop" className={KAART}>
          <div className="flex flex-wrap items-center justify-between gap-3 sm-niet-printen">
            <h3 id="sm-kaart-kop" className="font-display text-xl font-bold text-smiley-ink">
              Kaart op A5
            </h3>
            <button type="button" onClick={() => print("kaart")} className={KNOP}>
              Print de kaart
            </button>
          </div>
          <p className="mt-1 text-sm text-smiley-mute sm-niet-printen">Kies in het printvenster papier A5 en zet &ldquo;achtergronden&rdquo; aan, dan komen de kleuren mee.</p>
          {/* de kaart zelf: op het scherm een voorbeeld, bij het printen het enige wat op het papier komt (smiley.css) */}
          <div className={`${druk === "kaart" ? "sm-print-kaart" : "sm-niet-printen"} mx-auto mt-5 flex aspect-[148/210] w-full max-w-[340px] flex-col items-center justify-between overflow-hidden rounded-3xl bg-smiley-ink p-6 text-center text-white`}>
            <Image src={beeld("logo.webp")} alt="Smileyapp" width={500} height={260} className="h-auto w-[46%]" />
            <div>
              <p className="font-display text-[1.7rem] font-bold leading-[1.05]">
                Scan en vraag een <span className="text-smiley-sun">demo</span> aan
              </p>
              <p className="mt-2 text-sm font-semibold text-smiley-green">{SLOGAN}</p>
            </div>
            <svg viewBox={`0 0 ${zijde} ${zijde}`} role="img" aria-label={`QR-code naar ${adres}`} shapeRendering="crispEdges" className="h-auto w-[62%] rounded-2xl bg-white">
              <rect width={zijde} height={zijde} fill="#ffffff" />
              <path d={pad} fill="#0E2A20" />
            </svg>
            <p className="text-xs font-semibold text-white/80">smileyapp.zekerflex.com/demo</p>
          </div>
        </section>
      </div>

      <Poster adres={adres} pad={pad} zijde={zijde} drukAf={druk === "poster"} print={() => print("poster")} />
    </div>
  );
}
