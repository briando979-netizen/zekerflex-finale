"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Het terminalscherm bij de ingang (app/terminal/[sleutel]): een tablet of oude
// telefoon aan de muur. Groot: de klok en een QR-code die elke minuut wisselt
// (de kracht scant hem met de telefoon). Daarnaast, als het apparaat het kan:
// een sleutelhanger tegen de tablet (Web NFC, Chrome op Android) en het
// werkpaspoort van de kracht voor de camera (BarcodeDetector). Elke tik geeft
// zes seconden een groot antwoord: "Welkom, Noa" of "Tot ziens, Noa".
// Geen login op de tablet: de sleutel in het adres is het bewijs.
// ---------------------------------------------------------------------------

interface Info {
  naam: string;
  vestiging: string;
  plaats: string;
  bedrijf: string;
  qr: string;
  geldigSeconden: number;
  koppelen: boolean;
}

interface Uitslag {
  ok: boolean;
  actie: "in" | "uit" | "klaar" | "geen-dienst" | "geen-urenbriefje" | "onbekend";
  naam: string;
  voornaam: string;
  tijd: string;
  dienst: { titel: string; start: string; eind: string } | null;
  gekoppeld?: boolean;
}

// Web NFC en BarcodeDetector zitten niet in de standaard TypeScript-typen.
interface NdefReadingEvent extends Event {
  serialNumber?: string;
}
interface NdefReader {
  scan(): Promise<void>;
  onreading: ((e: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}
interface BarcodeDetectorLike {
  detect(bron: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type Vensters = { NDEFReader?: new () => NdefReader; BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike };

const klok = (d: Date) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
const datum = (d: Date) => d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

function meldingVoor(u: Uitslag): { kop: string; tekst: string; toon: "goed" | "uit" | "let-op" } {
  const tijd = klok(new Date(u.tijd));
  if (u.gekoppeld) return { kop: `Gekoppeld, ${u.voornaam}!`, tekst: "Je sleutelhanger werkt vanaf nu op deze terminal.", toon: "goed" };
  switch (u.actie) {
    case "in":
      return { kop: `Welkom, ${u.voornaam}!`, tekst: `Ingecheckt om ${tijd}${u.dienst ? ` · ${u.dienst.titel}` : ""}. Veel werkplezier.`, toon: "goed" };
    case "uit":
      return { kop: `Tot ziens, ${u.voornaam}!`, tekst: `Uitgecheckt om ${tijd}. Je uren staan in je urenbriefje.`, toon: "uit" };
    case "klaar":
      return { kop: `Al klaar, ${u.voornaam}`, tekst: "Je bent vandaag hier al uitgecheckt.", toon: "let-op" };
    case "geen-dienst":
      return { kop: u.voornaam ? `Hoi ${u.voornaam}` : "Geen dienst gevonden", tekst: "We vinden geen dienst van jou op deze locatie (vanaf twee uur van tevoren). Vraag het de leidinggevende.", toon: "let-op" };
    case "geen-urenbriefje":
      return { kop: `Hoi ${u.voornaam}`, tekst: "Er staat nog geen urenbriefje klaar voor je dienst. Vraag het de leidinggevende.", toon: "let-op" };
    default:
      return { kop: "Niet herkend", tekst: "Deze sleutelhanger of code kennen we niet. Scan de QR-code met je telefoon om in te checken.", toon: "let-op" };
  }
}

export function TerminalScherm({ sleutel }: { sleutel: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [nu, setNu] = useState(() => new Date());
  const [melding, setMelding] = useState<ReturnType<typeof meldingVoor> | null>(null);
  const [nfc, setNfc] = useState<"kan-niet" | "uit" | "aan" | "geweigerd">("kan-niet");
  const [camera, setCamera] = useState<"kan-niet" | "uit" | "aan" | "geweigerd">("kan-niet");
  const [bezig, setBezig] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stroom = useRef<MediaStream | null>(null);
  const laatsteScan = useRef<{ waarde: string; op: number }>({ waarde: "", op: 0 });
  const api = `/api/terminal/${encodeURIComponent(sleutel)}`;

  // de klok, elke seconde
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // de QR van dit moment; opnieuw zodra hij verloopt
  const laad = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const d = (await res.json()) as Info & { error?: { message?: string } };
      if (!res.ok) {
        setFout(d.error?.message ?? "Dit scherm kon niet laden.");
        return 30;
      }
      setInfo(d);
      setFout(null);
      return Math.max(5, Math.min(60, d.geldigSeconden));
    } catch {
      setFout("Geen verbinding. We proberen het vanzelf opnieuw.");
      return 15;
    }
  }, [api]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rond = async () => {
      const sec = await laad();
      if (!stop) timer = setTimeout(rond, sec * 1000 + 300);
    };
    void rond();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [laad]);

  const toon = useCallback((u: Uitslag) => {
    setMelding(meldingVoor(u));
    setTimeout(() => setMelding(null), 6000);
  }, []);

  const tik = useCallback(
    async (body: { serie?: string; paspoort?: string }) => {
      if (bezig) return;
      setBezig(true);
      try {
        const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = (await res.json()) as Uitslag & { error?: { message?: string } };
        if (!res.ok) toon({ ok: false, actie: "onbekend", naam: "", voornaam: "", tijd: new Date().toISOString(), dienst: null });
        else toon(d);
        void laad();
      } catch {
        setFout("Geen verbinding. Probeer het zo nog eens.");
      } finally {
        setBezig(false);
      }
    },
    [api, bezig, laad, toon],
  );

  // sleutelhangers via Web NFC (Chrome op Android); inschakelen vraagt één tik op de knop
  useEffect(() => {
    if ("NDEFReader" in window) setNfc("uit");
    if ("BarcodeDetector" in window && "mediaDevices" in navigator) setCamera("uit");
  }, []);
  const startNfc = async () => {
    const Reader = (window as unknown as Vensters).NDEFReader;
    if (!Reader) return;
    try {
      const reader = new Reader();
      await reader.scan();
      reader.onreading = (e) => {
        const serie = e.serialNumber;
        if (!serie) return;
        const nuMs = Date.now();
        if (laatsteScan.current.waarde === serie && nuMs - laatsteScan.current.op < 4000) return;
        laatsteScan.current = { waarde: serie, op: nuMs };
        void tik({ serie });
      };
      reader.onreadingerror = () => setFout("De sleutelhanger kon niet gelezen worden. Houd hem nog eens tegen de tablet.");
      setNfc("aan");
    } catch {
      setNfc("geweigerd");
    }
  };

  // het werkpaspoort voor de camera (BarcodeDetector)
  const startCamera = async () => {
    const Detector = (window as unknown as Vensters).BarcodeDetector;
    if (!Detector || !video.current) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      stroom.current = s;
      video.current.srcObject = s;
      await video.current.play();
      const detector = new Detector({ formats: ["qr_code"] });
      setCamera("aan");
      const lus = async () => {
        if (!stroom.current || !video.current) return;
        try {
          const codes = await detector.detect(video.current);
          const code = codes[0]?.rawValue;
          if (code && /\/paspoort\//.test(code)) {
            const nuMs = Date.now();
            if (!(laatsteScan.current.waarde === code && nuMs - laatsteScan.current.op < 8000)) {
              laatsteScan.current = { waarde: code, op: nuMs };
              void tik({ paspoort: code });
            }
          }
        } catch {
          /* een enkel beeld kon niet gelezen worden */
        }
        if (stroom.current) setTimeout(lus, 600);
      };
      void lus();
    } catch {
      setCamera("geweigerd");
    }
  };
  useEffect(
    () => () => {
      stroom.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const kleur = melding?.toon === "goed" ? "bg-emerald-600" : melding?.toon === "uit" ? "bg-sky-700" : "bg-amber-600";

  return (
    <main className="relative flex min-h-dvh flex-col bg-[#0b1512] text-[#f3f7f4]">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">{info?.bedrijf ?? "ZekerFlex"}</p>
          <h1 className="truncate text-xl font-bold sm:text-2xl">{info ? `${info.vestiging}${info.naam ? ` · ${info.naam}` : ""}` : "Inchecken"}</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-bold tabular-nums sm:text-6xl">{klok(nu)}</p>
          <p className="text-sm text-[#b9c7bf] sm:text-base">{datum(nu)}</p>
        </div>
      </header>

      <section className="grid flex-1 gap-8 px-6 pb-8 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        <div className="flex flex-col items-center justify-center gap-5">
          <p className="text-center text-2xl font-bold sm:text-3xl">Scan deze code met je telefoon</p>
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
            {info ? (
              <div className="h-[min(58vw,22rem)] w-[min(58vw,22rem)] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: info.qr }} />
            ) : (
              <div className="grid h-[min(58vw,22rem)] w-[min(58vw,22rem)] place-items-center text-[#0b1512]">{fout ? "…" : "Laden…"}</div>
            )}
          </div>
          <p className="text-center text-base text-[#b9c7bf]">
            Nog geen ZekerFlex? Scannen opent de app; na het inloggen tik je op <strong className="text-white">Inchecken</strong>.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-lg font-bold">Of houd je telefoon tegen de sticker</p>
            <p className="mt-1 text-[#b9c7bf]">Bij de ingang hangt een ZekerFlex-sticker. Eén tik en je staat op de incheckpagina.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-lg font-bold">Sleutelhanger</p>
            {nfc === "kan-niet" && <p className="mt-1 text-[#b9c7bf]">Dit apparaat kan geen sleutelhangers lezen. Gebruik Chrome op een Android-tablet met NFC.</p>}
            {nfc === "uit" && (
              <button type="button" onClick={startNfc} className="mt-3 rounded-full bg-emerald-400 px-5 py-3 text-base font-bold text-[#0b1512]">
                Sleutelhangers inschakelen
              </button>
            )}
            {nfc === "aan" && <p className="mt-1 text-emerald-300">Houd je sleutelhanger tegen de achterkant van de tablet.</p>}
            {nfc === "geweigerd" && <p className="mt-1 text-amber-300">NFC is geweigerd. Zet NFC aan in de instellingen van de tablet en laad opnieuw.</p>}
            {info?.koppelen && <p className="mt-2 rounded-xl bg-amber-500/20 px-3 py-2 text-amber-200">Iemand koppelt een sleutelhanger: houd hem nu tegen de tablet.</p>}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-lg font-bold">Werkpaspoort</p>
            {camera === "kan-niet" && <p className="mt-1 text-[#b9c7bf]">Op dit apparaat kan de camera geen QR-codes lezen.</p>}
            {camera === "uit" && (
              <button type="button" onClick={startCamera} className="mt-3 rounded-full border border-white/30 px-5 py-3 text-base font-bold">
                Camera inschakelen
              </button>
            )}
            {camera === "geweigerd" && <p className="mt-1 text-amber-300">De camera is geweigerd. Geef de browser toestemming en laad opnieuw.</p>}
            <div className={camera === "aan" ? "mt-3 overflow-hidden rounded-2xl" : "hidden"}>
              <video ref={video} muted playsInline className="h-40 w-full object-cover" />
              <p className="mt-1 text-sm text-[#b9c7bf]">Houd de QR van je werkpaspoort voor de camera.</p>
            </div>
          </div>
          {fout && (
            <p role="alert" className="rounded-2xl bg-amber-500/15 px-4 py-3 text-amber-200">
              {fout}
            </p>
          )}
        </div>
      </section>

      <footer className="px-6 pb-4 text-center text-xs text-[#7f9087] sm:px-10">Inchecken via ZekerFlex · alleen het tijdstip en deze vestiging worden vastgelegd</footer>

      {melding && (
        <div role="status" aria-live="assertive" className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center text-white ${kleur}`}>
          <p className="text-5xl font-black sm:text-7xl">{melding.kop}</p>
          <p className="max-w-2xl text-xl sm:text-2xl">{melding.tekst}</p>
        </div>
      )}
    </main>
  );
}
