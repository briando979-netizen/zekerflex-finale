"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/chat/Portal";
import { type AuthDict } from "@/lib/i18n/auth";
import { DocumentLezing, goedGelezen, leesDocumentFoto, type Lezing } from "@/components/app/DocumentLezing";
import { cookieStringHasChip, cookieStringIsApp } from "@/lib/app-mode";

// ---------------------------------------------------------------------------
// ID-scan van ZekerFlex (9 nov 2026): een eigen omgeving zoals die van Stripe.
// Toestemming → document kiezen → live camera met kader (voor- en achterkant,
// de code op het document wordt meteen gelezen) → selfie → afronden → uitslag.
// Het basisformulier (KVK, postcode, IBAN) blijft in OnboardingForm; deze scan
// levert de foto's en documentgegevens, en OnboardingForm verstuurt alles naar
// de bestaande controle (/api/onboarding, lib/onboarding/verify.ts).
// Lukt de camera niet (geen toestemming, oude browser), dan opent de camera-app.
// In een Portal naar <body>: altijd licht, zoals de omgeving van Stripe.
// ---------------------------------------------------------------------------

export type DocSoort = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";

export interface ScanGegevens {
  documentType: DocSoort;
  documentNumber: string;
  documentExpiry: string;
  nameOnDocument: string;
  front: File;
  back: File;
  selfie: File;
}

export interface ScanUitslag {
  outcome: "verified" | "in_review" | "rejected";
  summary: string;
  reasons: string[];
}

/** Afronden: op de laptop de uitslag; op de telefoon (na een QR-code) alleen "overgedragen". */
export type ScanAfronden = (g: ScanGegevens) => Promise<{ ok: true; uitslag: ScanUitslag } | { ok: true; overgedragen: true } | { ok: false; fout: string }>;
/** De laptop rondt af met de foto's die de telefoon instuurde (lib/kyc/overdracht.ts). */
export type ScanAfrondenOverdracht = () => Promise<{ ok: true; uitslag: ScanUitslag } | { ok: false; fout: string }>;

/** De stand van "verder op je telefoon" op de laptop. */
interface TelefoonStand {
  /** "controle": de telefoon leverde in; eerst nakijken, pas dan versturen (review H2) */
  status: "maken" | "wacht" | "geopend" | "controle" | "ontvangen" | "verlopen" | "geweigerd" | "fout";
  qr?: string;
  tekst?: string;
  /** een ander toestel probeerde de code ook te openen */
  anderToestel?: boolean;
  /** wat er binnenkwam (geen volledig documentnummer) */
  voorbeeld?: { soort: string; naam: string; nummer: string; datum: string };
  /** om de foto's na een nieuwe inlevering opnieuw te laden */
  ronde?: number;
}

type T = AuthDict["onb"];
type Stap = "start" | "telefoon" | "soort" | "voor" | "achter" | "chip" | "selfie" | "gegevens" | "bezig" | "klaar";

/** De chipstap (alleen in de Android-app vanaf 1.0.4): de app leest de chip via NFC (lib/kyc/chip). */
interface ChipStand {
  /** klaarzetten: code ophalen · gereed: de knop opent de app · wacht: de app leest · klaar · fout */
  status: "klaarzetten" | "gereed" | "wacht" | "klaar" | "fout";
  /** het tijdstip van de vorige uitslag: een nieuwe uitslag heeft een ander tijdstip (geen klokvergelijking) */
  vorige?: string | null;
  /** de eenmalige code voor de app (10 minuten, mag een paar keer) */
  code?: string;
  echt?: boolean;
  tekst?: string;
}

/** Een telefoon met een kaart ertegen. */
function ChipBeeld() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden className="text-brand-600">
      <rect x="34" y="10" width="52" height="96" rx="9" stroke="currentColor" strokeWidth="3" />
      <rect x="18" y="52" width="70" height="44" rx="6" fill="white" stroke="currentColor" strokeWidth="3" />
      <rect x="28" y="62" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M96 40c5 5 5 15 0 20M103 33c9 9 9 25 0 34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

async function laatsteChip(): Promise<{ op: string; echt: boolean; nummerKlopt: boolean } | null> {
  const res = await fetch("/api/onboarding/chip/status", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { lezing?: { op: string; echt: boolean; nummerKlopt: boolean } | null } | null;
  return data?.lezing ?? null;
}
type FotoStap = "voor" | "achter" | "selfie";
type Fotos = Partial<Record<FotoStap, File>>;

const STAP_NR: Partial<Record<Stap, number>> = { soort: 1, voor: 2, achter: 3, selfie: 4 };

function Icoon({ n }: { n: number }) {
  const pad =
    n === 0
      ? "M4 7h3l1.5-2h7L17 7h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zM12 16.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z"
      : n === 1
        ? "M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 10h.01M15 10h.01M9 15c1.5 1.3 4.5 1.3 6 0"
        : "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 flex-shrink-0 text-brand-600">
      <path d={pad} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Live camera met een kader (kaart of ovaal) en een uitweg naar de camera-app. */
function Camera({ facing, vorm, t, onFoto }: { facing: "environment" | "user"; vorm: "kaart" | "ovaal"; t: T; onFoto: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const bestand = useRef<HTMLInputElement>(null);
  const [stand, setStand] = useState<"laden" | "aan" | "geen">("laden");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let weg = false;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("geen camera");
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // zo scherp als de camera kan: de kleine letters van de code onderop het document (MRZ) vragen veel pixels;
          // een toestel dat minder kan, geeft vanzelf het hoogste wat het heeft
          video: { facingMode: { ideal: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (weg) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        setStand("aan");
      } catch {
        if (!weg) setStand("geen");
      }
    })();
    // de camera gaat altijd uit als deze stap sluit
    return () => {
      weg = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [facing]);

  function vastleggen() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (b) onFoto(new File([b], `${vorm}-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <div className="relative">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black">
        <video ref={video} playsInline muted autoPlay className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
        {stand === "aan" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div
              className={`border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${
                vorm === "kaart" ? "aspect-[1.586] w-[88%] rounded-xl" : "aspect-[3/4] w-[62%] rounded-[50%]"
              }`}
            />
          </div>
        )}
        {stand === "geen" && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm leading-relaxed text-white">{t.scan.geenCamera}</p>
        )}
      </div>
      <div className="mt-4 grid gap-2">
        {stand !== "geen" && (
          <button type="button" onClick={vastleggen} disabled={stand !== "aan"} className="btn-primary w-full">
            {t.scan.maakFoto}
          </button>
        )}
        <button
          type="button"
          onClick={() => bestand.current?.click()}
          className={stand === "geen" ? "btn-primary w-full" : "btn-ghost w-full text-sm"}
        >
          {t.scan.cameraApp}
        </button>
        <input
          ref={bestand}
          type="file"
          accept="image/*"
          capture={facing}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFoto(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export function IdScan({
  t,
  naam,
  onAfronden,
  onSluiten,
  modus = "laptop",
  overdracht,
  groet,
  onAfrondenOverdracht,
}: {
  t: T;
  /** de accountnaam: standaard voor "naam zoals op document" */
  naam: string;
  onAfronden: ScanAfronden;
  onSluiten: (uitslag: ScanUitslag | null) => void;
  /** "telefoon": geopend via de QR-code op de laptop (/id-scan), niet ingelogd */
  modus?: "laptop" | "telefoon";
  /** de eenmalige code van de QR-code en het toesteltoken van deze telefoon (alleen op de telefoon) */
  overdracht?: { code: string; toestel: string };
  /** voornaam voor "Hoi …" op de telefoon */
  groet?: string;
  /** laptop: met de foto's van de telefoon afronden; zonder dit geen QR-knop */
  onAfrondenOverdracht?: ScanAfrondenOverdracht;
}) {
  const s = t.scan;
  const [stap, setStap] = useState<Stap>("start");
  const [soort, setSoort] = useState<DocSoort>("ID_CARD");
  const [fotos, setFotos] = useState<Fotos>({});
  const [voorbeeld, setVoorbeeld] = useState<{ file: File; url: string } | null>(null);
  const [lezing, setLezing] = useState<Lezing | null>(null);
  const [gegevens, setGegevens] = useState({ nummer: "", datum: "", naam });
  const [uitslag, setUitslag] = useState<ScanUitslag | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [kanChip, setKanChip] = useState(false);
  const [chip, setChip] = useState<ChipStand | null>(null);
  const [naChip, setNaChip] = useState<Stap>("selfie");
  const [overgedragen, setOvergedragen] = useState(false);
  const [kanTelefoon, setKanTelefoon] = useState(false);
  const [tel, setTel] = useState<TelefoonStand | null>(null);

  // "verder op je telefoon" alleen op een computer (muis of touchpad), niet op een telefoon of tablet
  useEffect(() => {
    setKanTelefoon(modus === "laptop" && Boolean(onAfrondenOverdracht) && window.matchMedia("(pointer: fine)").matches);
  }, [modus, onAfrondenOverdracht]);

  /** Laptop: een eenmalige code vragen en als QR-code tonen (de code staat na de #, dus nooit in een serverlog). */
  async function maakQr() {
    setTel({ status: "maken" });
    try {
      const res = await fetch("/api/onboarding/overdracht", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: { message?: string } };
      if (!res.ok || typeof data.code !== "string") {
        setTel({ status: "fout", tekst: data.error?.message ?? s.mislukt });
        return;
      }
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(`${window.location.origin}/id-scan#${data.code}`, { margin: 1, width: 260 });
      setTel({ status: "wacht", qr });
    } catch {
      setTel({ status: "fout", tekst: s.mislukt });
    }
  }

  useEffect(() => {
    if (stap === "telefoon" && tel === null) void maakQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen van de stap
  }, [stap, tel]);

  /** Laptop: de werker keurde goed wat de telefoon instuurde; nu pas afronden (review H2). */
  async function rondTelefoonAf() {
    if (!onAfrondenOverdracht) return;
    setTel((v0) => (v0 ? { ...v0, status: "ontvangen" } : v0));
    setStap("bezig");
    const r = await onAfrondenOverdracht();
    if (r.ok) {
      setUitslag(r.uitslag);
      setStap("klaar");
    } else {
      setTel({ status: "fout", tekst: r.fout });
      setStap("telefoon");
    }
  }

  /** Laptop: "klopt niet": alles van de telefoon weg en een nieuwe QR-code. */
  async function kloptNiet() {
    await fetch("/api/onboarding/overdracht", { method: "DELETE" }).catch(() => null);
    setTel(null);
  }

  // laptop: elke 2 s kijken of de telefoon de link opende, of een ander toestel het probeerde,
  // en of hij klaar is. Bij "klaar" niet meteen versturen: eerst laat de laptop zien wat er kwam.
  const telWacht = stap === "telefoon" && (tel?.status === "wacht" || tel?.status === "geopend");
  useEffect(() => {
    if (!telWacht) return;
    let stop = false;
    const kijk = async () => {
      const res = await fetch("/api/onboarding/overdracht", { cache: "no-store" }).catch(() => null);
      const data = res?.ok
        ? ((await res.json().catch(() => null)) as {
            overdracht?: { status?: string; anderToestel?: boolean } | null;
            voorbeeld?: TelefoonStand["voorbeeld"] | null;
          } | null)
        : null;
      const st = data?.overdracht?.status;
      if (stop || !st) return;
      const ander = data?.overdracht?.anderToestel === true;
      if (st === "geopend") setTel((v0) => (v0 && (v0.status !== "geopend" || v0.anderToestel !== ander) ? { ...v0, status: "geopend", anderToestel: ander } : v0));
      else if (st === "verlopen") setTel({ status: "verlopen" });
      else if (st === "geweigerd") {
        stop = true;
        setTel({ status: "geweigerd" });
      } else if (st === "klaar") {
        stop = true;
        setTel((v0) => ({
          ...(v0 ?? {}),
          status: "controle",
          anderToestel: ander,
          ronde: Date.now(),
          ...(data?.voorbeeld ? { voorbeeld: data.voorbeeld } : {}),
        }));
      }
    };
    const id = setInterval(() => void kijk(), 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [telWacht]);

  // alleen een app die de chip kan lezen (lib/app-mode.ts): de website en oudere apps slaan de stap over
  useEffect(() => {
    setKanChip(modus === "laptop" && cookieStringIsApp(document.cookie) && cookieStringHasChip(document.cookie));
  }, [modus]);

  // terug uit de app: elke 2 s (alleen als dit scherm zichtbaar is) kijken of er een nieuwe uitslag is
  const wachtOp = chip?.status === "wacht" ? (chip.vorige ?? "") : null;
  useEffect(() => {
    if (wachtOp === null) return;
    let klaar = false;
    const kijk = async () => {
      if (klaar || document.visibilityState !== "visible") return;
      const l = await laatsteChip();
      if (!klaar && l && l.op !== wachtOp) {
        klaar = true;
        setChip({ status: "klaar", echt: l.echt && l.nummerKlopt });
      }
    };
    const t = setInterval(() => void kijk(), 2000);
    document.addEventListener("visibilitychange", kijk);
    const stop = setTimeout(() => {
      if (!klaar) setChip({ status: "fout", tekst: s.chipFout });
    }, 4 * 60_000);
    return () => {
      klaar = true;
      clearInterval(t);
      clearTimeout(stop);
      document.removeEventListener("visibilitychange", kijk);
    };
  }, [wachtOp, s.chipFout]);

  /** Vooraf de code ophalen: Chrome opent de app alleen direct na een tik, dus de knop mag niet eerst wachten. */
  async function zetChipKlaar() {
    setChip({ status: "klaarzetten" });
    try {
      const vorige = (await laatsteChip())?.op ?? null;
      const res = await fetch("/api/onboarding/chip/start", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: { message?: string } };
      if (!res.ok || typeof data.code !== "string") {
        setChip({ status: "fout", tekst: data.error?.message ?? s.chipFout });
        return;
      }
      setChip({ status: "gereed", vorige, code: data.code });
    } catch {
      setChip({ status: "fout", tekst: s.chipFout });
    }
  }

  // de chipstap opent: meteen de code klaarzetten
  useEffect(() => {
    if (stap === "chip" && chip === null) void zetChipKlaar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen van de stap
  }, [stap, chip]);

  /** Opent ChipActivity in de app; de code gaat als extra mee, nooit in een adres op het web. */
  function openChipApp() {
    if (!chip?.code) return;
    setChip({ ...chip, status: "wacht" });
    // de iPhone-app (ios-app/, ChipLezer.swift): via de brug van de WKWebView, ook nooit in een adres
    const iphone = (window as unknown as { webkit?: { messageHandlers?: { zfChip?: { postMessage: (m: unknown) => void } } } }).webkit
      ?.messageHandlers?.zfChip;
    if (iphone) {
      iphone.postMessage({ code: chip.code });
      return;
    }
    window.location.href = `intent://chip#Intent;scheme=zekerflex;package=com.zekerflex.app;S.code=${encodeURIComponent(chip.code)};end`;
  }

  // de pagina eronder scrollt niet mee zolang de scan open is
  useEffect(() => {
    const oud = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = oud;
    };
  }, []);

  // het voorbeeld van een foto opruimen zodra het weg is
  useEffect(() => {
    const url = voorbeeld?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [voorbeeld]);

  // aan welke kant staat de code (MRZ): ID-kaart achter, paspoort voor, rijbewijs geen
  const mrzKant: FotoStap | null = soort === "PASSPORT" ? "voor" : soort === "ID_CARD" ? "achter" : null;
  const fotoStap: FotoStap | null = stap === "voor" || stap === "achter" || stap === "selfie" ? stap : null;
  const handmatig = soort === "DRIVERS_LICENSE" || !goedGelezen(lezing);

  function kiesSoort(d: DocSoort) {
    setSoort(d);
    setFotos({});
    setLezing(null);
    setVoorbeeld(null);
    setGegevens({ nummer: "", datum: "", naam });
    setChip(null);
    setStap("voor");
  }

  async function afronden(f: Fotos, g: typeof gegevens) {
    if (!f.voor || !f.achter || !f.selfie) return;
    setFout(null);
    setStap("bezig");
    const r = await onAfronden({
      documentType: soort,
      documentNumber: g.nummer.trim(),
      documentExpiry: g.datum,
      nameOnDocument: g.naam.trim() || naam,
      front: f.voor,
      back: f.achter,
      selfie: f.selfie,
    });
    if (r.ok && "overgedragen" in r) {
      // telefoon: de foto's staan klaar, de laptop rondt af
      setOvergedragen(true);
      setStap("klaar");
    } else if (r.ok) {
      setUitslag(r.uitslag);
      setStap("klaar");
    } else {
      // terug naar het overzicht met de gegevens, met de melding erboven
      setFout(r.fout);
      setStap("gegevens");
    }
  }

  function verder(k: FotoStap, alle: Fotos) {
    setVoorbeeld(null);
    // in de app met NFC: na een goed gelezen MRZ eerst de chip (de MRZ is de sleutel)
    if (kanChip && k === mrzKant && goedGelezen(lezing) && chip === null) {
      setNaChip(k === "voor" ? "achter" : "selfie");
      setStap("chip");
      return;
    }
    if (k === "voor") setStap("achter");
    else if (k === "achter") setStap("selfie");
    else if (handmatig) setStap("gegevens");
    else void afronden(alle, gegevens);
  }

  async function gebruik() {
    if (!voorbeeld || !fotoStap) return;
    const k = fotoStap;
    const alle = { ...fotos, [k]: voorbeeld.file };
    setFotos(alle);
    if (k !== mrzKant) {
      verder(k, alle);
      return;
    }
    // de kant met de code: meteen lezen en laten zien wat er staat
    setLezing({ status: "bezig" });
    const l = await leesDocumentFoto(voorbeeld.file, t, overdracht);
    setLezing(l);
    if (goedGelezen(l)) {
      setGegevens((g) => ({ nummer: l.documentnummer ?? g.nummer, datum: l.vervaldatum ?? g.datum, naam: l.naam ?? g.naam }));
    }
  }

  const gelezenHier = fotoStap !== null && fotoStap === mrzKant && voorbeeld !== null && lezing !== null;
  const nr = STAP_NR[stap];
  const gegevensOk = gegevens.nummer.trim().length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(gegevens.datum) && gegevens.naam.trim().length >= 2;

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label={s.titel} className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/60 sm:items-center">
        <div className="relative flex h-full w-full flex-col overflow-y-auto bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hair bg-white px-5 py-3">
            <span className="font-display text-sm font-bold text-ink">ZekerFlex</span>
            {nr !== undefined && <span className="text-xs text-neutralx-500">{s.stap.replace("{n}", String(nr)).replace("{totaal}", "4")}</span>}
            <button
              type="button"
              onClick={() => onSluiten(stap === "klaar" ? uitslag : null)}
              disabled={stap === "bezig"}
              aria-label={s.sluiten}
              className="grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft disabled:opacity-40"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 px-5 py-6">
            {stap === "start" && (
              <>
                {groet !== undefined && (
                  <p className="mb-2 text-center text-sm text-neutralx-500">{s.telHallo.replace("{naam}", groet || "")}</p>
                )}
                <h2 className="text-center font-display text-xl font-bold text-ink">{s.titel}</h2>
                <ul className="mt-6 space-y-5">
                  {s.punten.map((p, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                      <Icoon n={i} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-center text-xs">
                  <a href="/privacy" target="_blank" rel="noopener" className="text-neutralx-500 underline">
                    {s.privacy}
                  </a>
                </p>
                <button type="button" onClick={() => setStap("soort")} className="btn-primary mt-6 w-full">
                  {s.akkoord}
                </button>
                {kanTelefoon && (
                  <button type="button" onClick={() => setStap("telefoon")} className="btn-ghost mt-2 w-full">
                    {s.telefoonOptie}
                  </button>
                )}
                <button type="button" onClick={() => onSluiten(null)} className="btn-ghost mt-2 w-full">
                  {s.annuleren}
                </button>
              </>
            )}

            {stap === "telefoon" && tel?.status === "controle" && (
              <>
                {/* eerst nakijken wat de telefoon instuurde; pas dan versturen (review H2) */}
                <h2 className="font-display text-lg font-bold text-ink">{s.telefoonControle}</h2>
                {tel.anderToestel && (
                  <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-ink">
                    {s.telefoonAnderToestel}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(["voor", "achter", "selfie"] as const).map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f}
                      src={`/api/onboarding/overdracht?foto=${f}&r=${tel.ronde ?? 0}`}
                      alt=""
                      className="aspect-[3/4] w-full rounded-lg border border-hair object-cover"
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutralx-500">{s.telefoonVoorbeeldKlein}</p>
                {tel.voorbeeld && (
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-neutralx-500">{s.telefoonNaam}</dt>
                    <dd className="font-medium text-ink">{tel.voorbeeld.naam}</dd>
                    <dt className="text-neutralx-500">{s.telefoonNummer}</dt>
                    <dd className="font-medium text-ink">{tel.voorbeeld.nummer}</dd>
                    <dt className="text-neutralx-500">{s.telefoonGeldigTot}</dt>
                    <dd className="font-medium text-ink">{tel.voorbeeld.datum.split("-").reverse().join("-")}</dd>
                  </dl>
                )}
                <div className="mt-6 grid gap-2">
                  <button type="button" onClick={() => void rondTelefoonAf()} className="btn-primary w-full">
                    {s.telefoonKlopt}
                  </button>
                  <button type="button" onClick={() => void kloptNiet()} className="btn-ghost w-full">
                    {s.telefoonKloptNiet}
                  </button>
                </div>
              </>
            )}

            {stap === "telefoon" && tel?.status !== "controle" && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">{s.telefoonTitel}</h2>
                <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{s.telefoonUitleg}</p>
                {tel?.anderToestel && (
                  <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-ink">
                    {s.telefoonAnderToestel}
                  </p>
                )}
                <div className="mt-6 grid min-h-[268px] place-items-center">
                  {tel?.qr && (tel.status === "wacht" || tel.status === "geopend") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tel.qr} alt={s.telefoonTitel} width={260} height={260} className="rounded-xl border border-hair" />
                  ) : tel?.status === "maken" || tel?.status === "ontvangen" ? (
                    <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-4 border-hair border-t-brand-600" />
                  ) : null}
                </div>
                <p role="status" className="mt-4 text-center text-sm text-ink-soft">
                  {tel?.status === "geopend"
                    ? s.telefoonVerbonden
                    : tel?.status === "ontvangen"
                      ? s.telefoonOntvangen
                      : tel?.status === "verlopen"
                        ? s.telefoonVerlopen
                        : tel?.status === "geweigerd"
                          ? s.telefoonGeweigerd
                          : tel?.status === "wacht"
                            ? s.telefoonWacht
                            : ""}
                </p>
                {tel?.status === "fout" && (
                  <p role="alert" className="mt-3 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
                    {tel.tekst ?? s.mislukt}
                  </p>
                )}
                <div className="mt-6 grid gap-2">
                  {(tel?.status === "verlopen" || tel?.status === "fout" || tel?.status === "geweigerd") && (
                    <button type="button" onClick={() => void maakQr()} className="btn-primary w-full">
                      {s.nieuweCode}
                    </button>
                  )}
                  <button type="button" onClick={() => setStap("soort")} className="btn-ghost w-full">
                    {s.ofHier}
                  </button>
                </div>
              </>
            )}

            {stap === "soort" && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">{s.kiesSoort}</h2>
                <div className="mt-5 grid gap-3">
                  {(["ID_CARD", "PASSPORT", "DRIVERS_LICENSE"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => kiesSoort(d)}
                      className="flex items-center justify-between rounded-xl border border-hairstrong px-4 py-4 text-left text-sm font-semibold text-ink hover:border-brand-500"
                    >
                      {t.docs[d]}
                      <span aria-hidden className="text-neutralx-400">›</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {fotoStap && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">
                  {fotoStap === "voor" ? s.voor[soort] : fotoStap === "achter" ? s.achter[soort] : s.selfie}
                </h2>
                <p className="mt-1 text-sm text-neutralx-500">{fotoStap === "selfie" ? s.selfieUitleg : s.kader}</p>
                {soort === "DRIVERS_LICENSE" && fotoStap === "voor" && (
                  // een rijbewijs mag voor het account; voor betaald werk volgt nog een ID (lib/werkrecht)
                  <p role="note" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-ink">
                    {s.rijbewijsUitleg}
                  </p>
                )}
                <div className="mt-4">
                  {voorbeeld ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={voorbeeld.url} alt="" className="w-full rounded-xl bg-black object-contain" />
                      {gelezenHier && (
                        <div className="mt-3">
                          <DocumentLezing lezing={lezing} t={t} />
                        </div>
                      )}
                      <div className="mt-4 grid gap-2">
                        {!gelezenHier && (
                          <button type="button" onClick={() => void gebruik()} className="btn-primary w-full">
                            {s.gebruik}
                          </button>
                        )}
                        {gelezenHier && lezing.status !== "bezig" && goedGelezen(lezing) && (
                          <button type="button" onClick={() => verder(fotoStap, fotos)} className="btn-primary w-full">
                            {s.volgende}
                          </button>
                        )}
                        {gelezenHier && lezing.status !== "bezig" && lezing.verlopen && lezing.geldig && (
                          <button type="button" onClick={() => setStap("soort")} className="btn-primary w-full">
                            {s.anderDocument}
                          </button>
                        )}
                        {gelezenHier && lezing.status !== "bezig" && !lezing.geldig && (
                          <button type="button" onClick={() => verder(fotoStap, fotos)} className="btn-ghost w-full">
                            {s.toch}
                          </button>
                        )}
                        {!(gelezenHier && lezing.status === "bezig") && (
                          <button
                            type="button"
                            onClick={() => {
                              setVoorbeeld(null);
                              if (gelezenHier) setLezing(null);
                            }}
                            className="btn-ghost w-full"
                          >
                            {s.opnieuw}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Camera
                      key={fotoStap}
                      facing={fotoStap === "selfie" ? "user" : "environment"}
                      vorm={fotoStap === "selfie" ? "ovaal" : "kaart"}
                      t={t}
                      onFoto={(f) => setVoorbeeld({ file: f, url: URL.createObjectURL(f) })}
                    />
                  )}
                </div>
              </>
            )}

            {stap === "chip" && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">{s.chipTitel}</h2>
                <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{s.chipUitleg}</p>
                <div className="grid place-items-center py-8">
                  <ChipBeeld />
                </div>
                {chip?.status === "wacht" && (
                  <p role="status" className="rounded-lg bg-paper-soft px-3 py-2.5 text-sm text-ink-soft">
                    {s.chipWacht}
                  </p>
                )}
                {chip?.status === "klaar" && (
                  <p
                    role="status"
                    className={`rounded-lg border px-3 py-2.5 text-sm text-ink ${chip.echt ? "border-ok/30 bg-ok/5" : "border-warn/30 bg-warn/5"}`}
                  >
                    {chip.echt ? `✓ ${s.chipEcht}` : s.chipNietEcht}
                  </p>
                )}
                {chip?.status === "fout" && (
                  <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
                    {chip.tekst ?? s.chipFout}
                  </p>
                )}
                <div className="mt-6 grid gap-2">
                  {chip?.status === "klaar" ? (
                    <button type="button" onClick={() => setStap(naChip)} className="btn-primary w-full">
                      {s.volgende}
                    </button>
                  ) : chip?.status === "fout" ? (
                    <button type="button" onClick={() => void zetChipKlaar()} className="btn-primary w-full">
                      {s.opnieuw}
                    </button>
                  ) : (
                    <button type="button" onClick={openChipApp} disabled={!chip?.code} className="btn-primary w-full">
                      {s.chipStart}
                    </button>
                  )}
                  {chip?.status !== "klaar" && (
                    <button
                      type="button"
                      onClick={() => {
                        setChip({ status: "fout", tekst: "" });
                        setStap(naChip);
                      }}
                      className="btn-ghost w-full"
                    >
                      {s.chipOverslaan}
                    </button>
                  )}
                </div>
              </>
            )}

            {stap === "gegevens" && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">{s.gegevens}</h2>
                {fout ? (
                  <p role="alert" className="mt-3 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
                    {fout}
                  </p>
                ) : (
                  handmatig && <p className="mt-1 text-sm text-neutralx-500">{s.gegevensUitleg}</p>
                )}
                <div className="mt-4 grid gap-3">
                  <label className="block">
                    <span className="field-label">{t.docNumber}</span>
                    <input value={gegevens.nummer} onChange={(e) => setGegevens({ ...gegevens, nummer: e.target.value })} className="field-input" autoCapitalize="characters" />
                  </label>
                  <label className="block">
                    <span className="field-label">{t.validUntil}</span>
                    <input type="date" value={gegevens.datum} onChange={(e) => setGegevens({ ...gegevens, datum: e.target.value })} className="field-input" />
                  </label>
                  <label className="block">
                    <span className="field-label">{t.nameOnDoc}</span>
                    <input value={gegevens.naam} onChange={(e) => setGegevens({ ...gegevens, naam: e.target.value })} className="field-input" />
                  </label>
                </div>
                <button type="button" disabled={!gegevensOk} onClick={() => void afronden(fotos, gegevens)} className="btn-primary mt-6 w-full">
                  {modus === "telefoon" ? s.telVersturen : s.afronden}
                </button>
              </>
            )}

            {stap === "bezig" && (
              <div className="grid place-items-center py-16 text-center" role="status">
                <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-4 border-hair border-t-brand-600" />
                <p className="mt-5 font-display text-lg font-bold text-ink">{s.bezig}</p>
                <p className="mt-1 text-sm text-neutralx-500">{s.bezigUitleg}</p>
              </div>
            )}

            {stap === "klaar" && overgedragen && (
              <div className="py-10 text-center">
                <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok text-2xl text-white">
                  ✓
                </span>
                <h2 className="mt-4 font-display text-xl font-bold text-ink">{s.telKlaarTitel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.telKlaarUitleg}</p>
              </div>
            )}

            {stap === "klaar" && uitslag && (
              <div className="py-6 text-center">
                <span
                  aria-hidden
                  className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl text-white ${
                    uitslag.outcome === "verified" ? "bg-ok" : uitslag.outcome === "in_review" ? "bg-warn" : "bg-crit"
                  }`}
                >
                  {uitslag.outcome === "verified" ? "✓" : uitslag.outcome === "in_review" ? "…" : "!"}
                </span>
                <h2 className="mt-4 font-display text-xl font-bold text-ink">
                  {uitslag.outcome === "verified" ? s.goed : uitslag.outcome === "in_review" ? s.review : s.af}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{uitslag.summary}</p>
                {uitslag.outcome === "rejected" && uitslag.reasons.length > 0 && (
                  <ul className="mt-4 space-y-1 text-left text-sm text-crit">
                    {uitslag.reasons.slice(0, 4).map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => onSluiten(uitslag)} className="btn-primary mt-8 w-full">
                  {s.terug}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
