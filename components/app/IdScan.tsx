"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/chat/Portal";
import { type AuthDict } from "@/lib/i18n/auth";
import { DocumentLezing, goedGelezen, leesDocumentFoto, type Lezing } from "@/components/app/DocumentLezing";
import { useDialog } from "@/components/app/useDialog";
import { OnderSheet } from "@/components/app/OnderSheet";
import { useFT } from "@/components/i18n/useFT";
import { bevestigOverzicht } from "@/lib/werker/bevestig-overzicht";
import { cookieStringHasChip, cookieStringIsApp } from "@/lib/app-mode";
import { useI18n } from "@/components/i18n/I18nProvider";
import { AuthLanguage } from "@/components/auth/AuthLanguage";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { EuIntro, EuToestemming, NlIntro, TipsSheet } from "@/components/app/ScanRouteSchermen";
import { maakTrackCtx } from "@/lib/analytics/label-privacy";
import { heeftAchterkant } from "@/lib/kyc/document-zijden";
import { BEWEGING, bewegingVoldoet, draaiAanwijzing, type LiveMeting } from "@/lib/kyc/gezicht/beweging";
import {
  DOC_LIVE,
  SELFIE_LIVE,
  beeldAanwijzing,
  beweging as beeldVerschil,
  docKantMeting,
  grijs,
  kaderInVideo,
  kanVanzelf,
  licht,
  scherpte,
  selfieAanwijzing,
  serverAanwijzing,
  telSelfie,
  verklein,
  type DocAanwijzing,
  type DocKant,
  type DocKantMeting,
  type DocServerMeting,
  type DocSoortLive,
  type SelfieAanwijzing,
} from "@/lib/kyc/camera-live";

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
  /** de tweede selfie met een gedraaid hoofd (bewegingscontrole); alleen op de laptop, zonder die foto beslist altijd een medewerker */
  selfie2?: File | undefined;
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
type Stap = "start" | "toestemming" | "telefoon" | "soort" | "voor" | "achter" | "chip" | "selfie" | "beweging" | "gegevens" | "bezig" | "klaar";

/** De chipstap (alleen in de Android-app vanaf 1.0.4): de app leest de chip via NFC (lib/kyc/chip). */
/** na zoveel mislukte chippogingen gaat de scan zonder chip verder */
const MAX_CHIP_POGINGEN = 3;

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
type FotoStap = "voor" | "achter" | "selfie" | "beweging";
type Fotos = Partial<Record<FotoStap, File>>;

const STAP_NR: Partial<Record<Stap, number>> = { soort: 1, voor: 2, achter: 3, selfie: 4, beweging: 4 };

/** De twee routes van de ID-check: een Nederlands document, of een paspoort/ID-kaart uit de EU/EER of Zwitserland. */
export type ScanRoute = "nl" | "eu";

/** Waar "Vorige stap" naartoe gaat. Niet vanaf de chip, het wachtscherm en de uitslag: dat is na of tijdens het versturen. */
const VORIGE: Partial<Record<Stap, Stap>> = { toestemming: "start", telefoon: "start", soort: "start", voor: "soort", achter: "voor", selfie: "achter", beweging: "selfie", gegevens: "selfie" };

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

/** Eigen illustratie voor "Bijna klaar": een telefoon met een vinkje en wat vormen eromheen, zonder tekst. */
function BijnaKlaarBeeld() {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" fill="none" aria-hidden className="mx-auto">
      <circle cx="66" cy="66" r="60" className="fill-brand-50" />
      <rect x="40" y="22" width="52" height="88" rx="9" fill="#0B3B3A" />
      <rect x="45" y="32" width="42" height="64" rx="3" fill="#ffffff" />
      <circle cx="66" cy="64" r="15" fill="#0E8F6B" />
      <path d="M59 64l5 5 9-10" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="58" y="102" width="16" height="3" rx="1.5" fill="#ffffff" fillOpacity="0.5" />
      <circle cx="24" cy="36" r="5" fill="#4FE0A0" />
      <circle cx="110" cy="92" r="6" fill="#0E8F6B" fillOpacity="0.5" />
      <rect x="100" y="28" width="12" height="12" rx="3" transform="rotate(20 106 34)" fill="#4FE0A0" fillOpacity="0.6" />
      <path d="M18 88l6 6M24 88l-6 6" stroke="#0E8F6B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** "Kies de achtercamera": een toestel met meer dan een achtercamera; de beste staat vooraf gekozen. */
function CameraKeuze({ x, apparaten, keuze, onKies, onSluit }: { x: T["scan"]["extra"]; apparaten: { id: string; label: string }[]; keuze: string | null; onKies: (id: string) => void; onSluit: () => void }) {
  const ref = useDialog(true, onSluit);
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/50">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="scan-cam-titel" className="w-full rounded-t-2xl bg-white px-4 pb-4 pt-4 text-left">
        <h3 id="scan-cam-titel" className="font-display text-base font-bold text-ink">{x.kiesCamera}</h3>
        <div role="radiogroup" aria-labelledby="scan-cam-titel" className="mt-3 grid gap-2">
          {apparaten.map((a) => (
            <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm text-ink ${keuze === a.id ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
              <input type="radio" name="achtercamera" checked={keuze === a.id} onChange={() => onKies(a.id)} className="accent-brand-600" />
              {a.label}
            </label>
          ))}
        </div>
        <button type="button" onClick={onSluit} className="btn-primary mt-4 w-full">
          {x.doorgaan}
        </button>
      </div>
    </div>
  );
}

/** Een klein beeld (hooguit 640 pixels, zoals de detector het ziet) van de camera of van een foto, voor het live meten. */
async function kleinBeeld(bron: HTMLVideoElement | Blob): Promise<Blob | null> {
  try {
    const bm = bron instanceof Blob ? await createImageBitmap(bron) : null;
    const w = bm ? bm.width : (bron as HTMLVideoElement).videoWidth;
    const h = bm ? bm.height : (bron as HTMLVideoElement).videoHeight;
    if (!w || !h) return null;
    const schaal = Math.min(1, 640 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * schaal));
    c.height = Math.max(1, Math.round(h * schaal));
    c.getContext("2d")?.drawImage(bm ?? (bron as HTMLVideoElement), 0, 0, c.width, c.height);
    bm?.close();
    return await new Promise<Blob | null>((klaar) => c.toBlob((b) => klaar(b), "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

type LiveAntwoord = { status: "ok"; meting: LiveMeting | null } | { status: "fout" } | { status: "stop" };

/** De server meet het gezicht (alleen getallen terug, er wordt niets bewaard). "stop": niet opnieuw proberen (uitgelogd, te vaak, ander account). */
async function meetGezicht(bron: HTMLVideoElement | Blob): Promise<LiveAntwoord> {
  const beeld = await kleinBeeld(bron);
  if (!beeld) return { status: "fout" };
  try {
    const res = await fetch("/api/onboarding/gezicht-live", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: beeld });
    if (res.status === 401 || res.status === 423 || res.status === 429) return { status: "stop" };
    if (!res.ok) return { status: "fout" };
    const data = (await res.json().catch(() => ({}))) as { meting?: LiveMeting | null };
    return { status: "ok", meting: data.meting ?? null };
  } catch {
    return { status: "fout" };
  }
}

/** Een foto op volle grootte van wat de camera nu ziet. */
function fotoVanVideo(v: HTMLVideoElement, naam: string): Promise<File | null> {
  const c = volBeeld(v);
  return c ? fotoVanCanvas(c, naam) : Promise.resolve(null);
}

/** Wat de camera nu ziet, op volle grootte, als canvas. */
function volBeeld(v: HTMLVideoElement): HTMLCanvasElement | null {
  if (!v.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

function fotoVanCanvas(c: HTMLCanvasElement, naam: string): Promise<File | null> {
  return new Promise((klaar) => c.toBlob((b) => klaar(b ? new File([b], `${naam}-${Date.now()}.jpg`, { type: "image/jpeg" }) : null), "image/jpeg", 0.9));
}

/** Het kader (lib/kyc/camera-live.ts, kaderInVideo) uit een beeld van `bronB` × `bronH`, hooguit `breedte` pixels breed. */
function kaderUitsnede(bron: HTMLVideoElement | HTMLCanvasElement, bronB: number, bronH: number, breedte: number): HTMLCanvasElement | null {
  const k = kaderInVideo(bronB, bronH);
  if (!k) return null;
  const schaal = Math.min(1, breedte / k.w);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(k.w * schaal));
  c.height = Math.max(1, Math.round(k.h * schaal));
  c.getContext("2d", { willReadFrequently: true })?.drawImage(bron, k.x, k.y, k.w, k.h, 0, 0, c.width, c.height);
  return c;
}

/** Het grijze beeld van een canvas (alleen in de browser, voor scherpte, licht en beweging). */
function grijsVan(c: HTMLCanvasElement): Uint8Array | null {
  try {
    const d = c.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, c.width, c.height).data;
    return d ? grijs(d, c.width, c.height) : null;
  } catch {
    return null;
  }
}

type DocAntwoord = { status: "ok"; meting: DocServerMeting } | { status: "fout" } | { status: "stop" };

/**
 * De server meet het kader: is de code leesbaar, hoe groot staat de pasfoto (alleen ja/nee en een getal terug). Op de
 * telefoon via de QR-code (niet ingelogd) gaat het via /api/id-overdracht/document-live, met de eenmalige code en het
 * toesteltoken in het formulier, nooit in het adres (12 nov 2026).
 */
async function meetDocument(c: HTMLCanvasElement, kant: DocKantMeting, overdracht?: { code: string; toestel: string }): Promise<DocAntwoord> {
  const beeld = await new Promise<Blob | null>((klaar) => c.toBlob((b) => klaar(b), "image/jpeg", 0.85));
  if (!beeld) return { status: "fout" };
  const zoek = [kant.mrz ? "mrz=1" : "", kant.portret ? "portret=1" : ""].filter(Boolean).join("&");
  try {
    let res: Response;
    if (overdracht) {
      const form = new FormData();
      form.set("code", overdracht.code);
      form.set("toestel", overdracht.toestel);
      if (kant.mrz) form.set("mrz", "1");
      if (kant.portret) form.set("portret", "1");
      form.set("beeld", beeld, "kader.jpg");
      res = await fetch("/api/id-overdracht/document-live", { method: "POST", body: form });
    } else {
      res = await fetch(`/api/onboarding/document-live?${zoek}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: beeld });
    }
    // 404 = de link van de QR-code is verlopen; dan alleen nog de knop
    if (res.status === 401 || res.status === 404 || res.status === 423 || res.status === 429) return { status: "stop" };
    if (!res.ok) return { status: "fout" };
    const data = (await res.json().catch(() => ({}))) as { meting?: DocServerMeting };
    return data.meting ? { status: "ok", meting: data.meting } : { status: "fout" };
  } catch {
    return { status: "fout" };
  }
}

/** Tussen voor- en achterkant: een kaartje dat omdraait, met de tekst eronder. Zonder animatie bij "minder beweging". */
function Omdraaien({ tekst }: { tekst: string }) {
  const kaart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = kaart.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anim = el.animate(
      [
        { transform: "rotateY(0deg)" },
        { transform: "rotateY(0deg)", offset: 0.2 },
        { transform: "rotateY(180deg)", offset: 0.7 },
        { transform: "rotateY(180deg)" },
      ],
      { duration: 2200, easing: "ease-in-out", fill: "forwards" },
    );
    return () => anim.cancel();
  }, []);
  const kant = { backfaceVisibility: "hidden" as const, WebkitBackfaceVisibility: "hidden" as const };
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-black/70 px-6 text-center">
      <div>
        <div className="mx-auto h-[78px] w-[124px]" style={{ perspective: "600px" }}>
          <div ref={kaart} className="relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
            {/* voorkant: pasfoto en regels */}
            <div aria-hidden className="absolute inset-0 rounded-lg border-2 border-white bg-white/95 p-2" style={kant}>
              <div className="flex h-full gap-2">
                <div className="h-full w-9 rounded bg-brand-100" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-1.5 w-full rounded bg-neutralx-300" />
                  <div className="h-1.5 w-3/4 rounded bg-neutralx-300" />
                  <div className="h-1.5 w-2/3 rounded bg-neutralx-300" />
                </div>
              </div>
            </div>
            {/* achterkant: de code onderaan */}
            <div aria-hidden className="absolute inset-0 rounded-lg border-2 border-white bg-white/95 p-2" style={{ ...kant, transform: "rotateY(180deg)" }}>
              <div className="flex h-full flex-col justify-end gap-1">
                <div className="h-1.5 w-full rounded bg-neutralx-400" />
                <div className="h-1.5 w-full rounded bg-neutralx-400" />
                <div className="h-1.5 w-full rounded bg-neutralx-400" />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-base font-semibold text-white">{tekst}</p>
      </div>
    </div>
  );
}

/**
 * Live camera met een kader (kaart of ovaal) en een uitweg naar de camera-app. Met `live` meet de server het gezicht
 * mee: bij de selfie ("recht") aanwijzingen en de foto vanzelf zodra je een paar tellen goed en stil in beeld bent;
 * bij de tweede selfie ("draai", tegen `referentie`, de eerste selfie) de foto vanzelf zodra het hoofd goed staat.
 * Wie zelf op de knop drukt, kijkt weer naar het scherm; daarom telt de knop daar eerst af. Met `doc` begeleidt de
 * camera het document (scherp, stil, licht, glans, afstand) en maakt hij de foto vanzelf zodra de code leesbaar is of
 * de pasfoto goed in het kader staat (lib/kyc/camera-live.ts). Valt het meten weg, dan blijft de knop gewoon werken.
 * `omdraaien`: eerst even het kaartje dat omdraait (achterkant).
 */
function Camera({
  facing,
  vorm,
  t,
  onFoto,
  rond = false,
  eu = false,
  live,
  referentie = null,
  doc,
  omdraaien,
  wijze,
  onZelf,
  onTelefoon,
}: {
  facing: "environment" | "user";
  vorm: "kaart" | "ovaal";
  t: T;
  onFoto: (f: File) => void;
  rond?: boolean;
  eu?: boolean;
  live?: "recht" | "draai" | undefined;
  referentie?: LiveMeting | null;
  /** live begeleiding van het document; `server` = de server mag meten (ingelogd, of op de telefoon met de code van de QR-code) */
  doc?: { soort: DocSoortLive; kant: DocKant; server: boolean; overdracht?: { code: string; toestel: string } | undefined } | undefined;
  omdraaien?: string | undefined;
  /** "auto": de foto gaat vanzelf en er is geen knop; "zelf": alleen de knop (13 nov 2026, eigenaar: geen mengvorm) */
  wijze: ScanWijze;
  /** omschakelen naar "zelf": na ±20 s zonder foto, of meteen als het hier niet vanzelf kan */
  onZelf: () => void;
  /** geen camera: verder op de telefoon met de QR-code (alleen op een computer) */
  onTelefoon?: (() => void) | undefined;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const x = t.scan.extra;
  const l = t.scan.live;
  const [stand, setStand] = useState<"laden" | "aan" | "geen">("laden");
  // de camera gaat uit zolang het tabblad verborgen is, en weer aan als je terugkomt
  const [zichtbaar, setZichtbaar] = useState(true);
  const [aanwijzing, setAanwijzing] = useState<{ a: SelfieAanwijzing; voortgang: number } | null>(null);
  const [liveUit, setLiveUit] = useState(false);
  // het document: de aanwijzing van nu, en of de server nog meet (weg = alleen de aanwijzingen van de browser)
  const [docHint, setDocHint] = useState<DocAanwijzing | null>(null);
  const [docUit, setDocUit] = useState(false);
  const [toonOmdraai, setToonOmdraai] = useState(Boolean(omdraaien));
  const docSoort = doc?.soort;
  const docKant = doc?.kant;
  const docServer = doc?.server === true;
  // op de telefoon via de QR-code: de code en het toesteltoken (als tekst, zodat het meten niet bij elke render opnieuw begint)
  const ovCode = doc?.overdracht?.code;
  const ovToestel = doc?.overdracht?.toestel;
  const docVanzelf = docSoort && docKant ? docServer && kanVanzelf(docKantMeting(docSoort, docKant)) : false;
  // gaat de foto vanzelf? Dan geen uitleg over de handmatige opname. In de stand "zelf" nooit vanzelf: alleen de knop.
  const zelf = wijze === "zelf";
  const zelfRef = useRef(zelf);
  useEffect(() => {
    zelfRef.current = zelf;
  });
  const kanVanzelfHier = (docVanzelf && !docUit) || (live !== undefined && !liveUit);
  const vanzelfAan = !zelf && kanVanzelfHier;
  // automatisch en na ±20 s nog geen foto: dan mag je omschakelen naar "zelf" (een wissel, geen knop in de automatische stand)
  const [traag, setTraag] = useState(false);
  useEffect(() => {
    if (!vanzelfAan || stand !== "aan") return;
    const id = setTimeout(() => setTraag(true), 20_000);
    return () => clearTimeout(id);
  }, [vanzelfAan, stand]);
  const [aftel, setAftel] = useState<number | null>(null);
  const afteller = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opFoto = useRef(onFoto);
  useEffect(() => {
    opFoto.current = onFoto;
  });
  // buitenlandse route: de camera start pas na een tik, met uitleg over de handmatige opname, en bij meer achtercamera's een keuze
  const [gestart, setGestart] = useState(!eu);
  const [uitleg, setUitleg] = useState(false);
  const [apparaten, setApparaten] = useState<{ id: string; label: string }[]>([]);
  const [keuze, setKeuze] = useState<string | null>(null);
  const [kiesOpen, setKiesOpen] = useState(false);
  const gevraagd = useRef(false);

  useEffect(() => {
    const kijk = () => setZichtbaar(document.visibilityState !== "hidden");
    kijk();
    document.addEventListener("visibilitychange", kijk);
    return () => {
      document.removeEventListener("visibilitychange", kijk);
      if (afteller.current) clearTimeout(afteller.current);
    };
  }, []);

  // het kaartje dat omdraait staat even in beeld; zolang meet de camera niet (anders legt hij de voorkant nog eens vast)
  useEffect(() => {
    if (!toonOmdraai || stand !== "aan") return;
    const id = setTimeout(() => setToonOmdraai(false), 2600);
    return () => clearTimeout(id);
  }, [toonOmdraai, stand]);

  useEffect(() => {
    if (!gestart) return;
    if (!zichtbaar) {
      setStand("laden");
      return;
    }
    let stream: MediaStream | null = null;
    let weg = false;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("geen camera");
        const bron = keuze ? { deviceId: { exact: keuze } } : { facingMode: { ideal: facing } };
        const s = await navigator.mediaDevices
          .getUserMedia({
            audio: false,
            // zo scherp als de camera kan: de kleine letters van de code onderop het document (MRZ) vragen veel pixels;
            // een toestel dat minder kan, geeft vanzelf het hoogste wat het heeft
            video: { ...bron, width: { ideal: 3840 }, height: { ideal: 2160 } },
          })
          .catch((e: unknown) => {
            // geweigerd: niet nog eens vragen. Anders (sommige toestellen weigeren de hoge resolutie): eerst nog Full HD,
            // pas daarna zonder eisen. Zonder eisen kwam er 1080x2336 uit en las de MRZ van een paspoort niet (12 nov).
            if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) throw e;
            return navigator.mediaDevices
              .getUserMedia({ audio: false, video: { ...bron, width: { ideal: 1920 }, height: { ideal: 1080 } } })
              .catch((e2: unknown) => {
                if (e2 instanceof DOMException && (e2.name === "NotAllowedError" || e2.name === "SecurityError")) throw e2;
                return navigator.mediaDevices.getUserMedia({ audio: false, video: bron });
              });
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
        // meerdere achtercamera's (groothoek, tele): laat kiezen, met de gewone hoofdcamera vooraf gekozen
        if (eu && facing === "environment" && !gevraagd.current) {
          gevraagd.current = true;
          const lijst = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "videoinput" && !/front|user|selfie|voor/i.test(d.label));
          if (lijst.length > 1 && !weg) {
            const beste = lijst.find((d) => !/wide|ultra|tele|zoom|macro|groot/i.test(d.label)) ?? lijst[0];
            setApparaten(lijst.map((d, i) => ({ id: d.deviceId, label: d.label || t.scan.extra.cameraNr.replace("{n}", String(i + 1)) })));
            setKeuze(beste?.deviceId ?? null);
            setKiesOpen(true);
          }
        }
      } catch {
        if (!weg) setStand("geen");
      }
    })();
    // de camera gaat altijd uit als deze stap sluit
    return () => {
      weg = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij een andere camera, de start of een verborgen tabblad
  }, [facing, gestart, keuze, zichtbaar]);

  // live meten: ongeveer twee beelden per seconde naar de server, alleen getallen terug
  useEffect(() => {
    if (!live || stand !== "aan" || liveUit || !zichtbaar) return;
    if (live === "draai" && !referentie) return;
    let weg = false;
    let fouten = 0;
    // de eerste selfie: goede, stille beelden achter elkaar (lib/kyc/camera-live.ts, telSelfie)
    let teller = 0;
    let vorige: LiveMeting | null = null;
    void (async () => {
      while (!weg) {
        const begin = Date.now();
        const v = video.current;
        if (v?.videoWidth) {
          const r = await meetGezicht(v);
          if (weg) return;
          if (r.status === "stop") {
            setLiveUit(true);
            return;
          }
          if (r.status === "fout") {
            fouten += 1;
            if (fouten >= 3) {
              setLiveUit(true);
              return;
            }
          } else {
            fouten = 0;
            if (live === "recht") {
              teller = telSelfie(teller, vorige, r.meting);
              vorige = r.meting;
              // goed in beeld: "even stilhouden" met een balkje, en na een paar stille beelden de foto vanzelf
              // (zelf de foto maken: alleen de aanwijzing, de knop doet de rest)
              setAanwijzing(
                zelfRef.current
                  ? { a: selfieAanwijzing(r.meting), voortgang: 0 }
                  : { a: teller > 0 ? "stil" : selfieAanwijzing(r.meting), voortgang: Math.min(1, teller / SELFIE_LIVE.goedeBeelden) },
              );
              if (teller >= SELFIE_LIVE.goedeBeelden && !zelfRef.current) {
                // de foto op volle grootte nog een keer gemeten; haalt hij het niet, dan meten we door
                const foto = await fotoVanVideo(v, `${vorm}-auto`);
                if (weg) return;
                const na = foto ? await meetGezicht(foto) : null;
                if (weg) return;
                if (foto && na?.status === "ok" && selfieAanwijzing(na.meting) === "goed") {
                  opFoto.current(foto);
                  return;
                }
                teller = 0;
              }
            } else if (referentie) {
              const d = draaiAanwijzing(referentie, r.meting);
              setAanwijzing({ a: d.aanwijzing, voortgang: d.voortgang });
              if (d.aanwijzing === "goed" && !zelfRef.current) {
                // de foto op volle grootte, nog een keer gemeten met de regels van de server; haalt hij die niet, dan meten we door
                const foto = await fotoVanVideo(v, `${vorm}-auto`);
                if (weg) return;
                const na = foto ? await meetGezicht(foto) : null;
                if (weg) return;
                if (foto && na?.status === "ok" && bewegingVoldoet(referentie, na.meting)) {
                  opFoto.current(foto);
                  return;
                }
              }
            }
          }
        }
        const rust = 400 - (Date.now() - begin);
        if (rust > 0) await new Promise((klaar) => setTimeout(klaar, rust));
      }
    })();
    return () => {
      weg = true;
    };
  }, [live, stand, liveUit, zichtbaar, referentie, vorm]);

  // het document live: de browser meet ±3 keer per seconde scherpte, licht, glans en beweging op het kader; is het
  // beeld goed en stil, dan vraagt hij de server of de code leesbaar is of hoe groot de pasfoto staat (hooguit eens per
  // DOC_LIVE.serverPauze). Bij "goed" gaat juist dát beeld als foto verder.
  useEffect(() => {
    if (!docSoort || !docKant || stand !== "aan" || !zichtbaar || toonOmdraai) return;
    const kant = docKantMeting(docSoort, docKant);
    const metServer = docServer && kanVanzelf(kant);
    let serverUit = !metServer;
    let weg = false;
    let vorige: Uint8Array | null = null;
    let stil = 0;
    let laatsteServer = 0;
    let fouten = 0;
    void (async () => {
      while (!weg) {
        const begin = Date.now();
        const v = video.current;
        const klein = v?.videoWidth ? kaderUitsnede(v, v.videoWidth, v.videoHeight, DOC_LIVE.meetBreedte) : null;
        const g = klein ? grijsVan(klein) : null;
        if (v && klein && g) {
          const dun = verklein(g, klein.width, klein.height, 4);
          const lv = licht(g);
          const eigen = beeldAanwijzing({ scherpte: scherpte(g, klein.width, klein.height), gemiddeld: lv.gemiddeld, glans: lv.glans, beweging: beeldVerschil(vorige, dun) });
          vorige = dun;
          stil = eigen === null ? stil + 1 : 0;
          if (eigen) setDocHint(eigen);
          // niets voor de server te meten (achterkant rijbewijs) of de server is weg: het beeld is goed, de knop doet de rest
          else if (serverUit) setDocHint(null);
          else if (stil >= DOC_LIVE.stilBeelden && Date.now() - laatsteServer >= DOC_LIVE.serverPauze) {
            laatsteServer = Date.now();
            const groot = volBeeld(v);
            const uitsnede = groot ? kaderUitsnede(groot, groot.width, groot.height, kant.mrz ? 1400 : 640) : null;
            const r: DocAntwoord = uitsnede ? await meetDocument(uitsnede, kant, ovCode && ovToestel ? { code: ovCode, toestel: ovToestel } : undefined) : { status: "fout" };
            if (weg) return;
            if (r.status === "stop") {
              serverUit = true;
              setDocUit(true);
            } else if (r.status === "fout") {
              fouten += 1;
              if (fouten >= 3) {
                serverUit = true;
                setDocUit(true);
              }
            } else {
              fouten = 0;
              const a = serverAanwijzing(docSoort, kant, r.meting);
              setDocHint(a);
              if (a === "goed" && groot && !zelfRef.current) {
                const foto = await fotoVanCanvas(groot, `${vorm}-auto`);
                if (weg) return;
                if (foto) {
                  opFoto.current(foto);
                  return;
                }
              }
            }
          }
        }
        const rust = 320 - (Date.now() - begin);
        if (rust > 0) await new Promise((klaar) => setTimeout(klaar, rust));
      }
    })();
    return () => {
      weg = true;
    };
  }, [docSoort, docKant, docServer, stand, zichtbaar, toonOmdraai, vorm, ovCode, ovToestel]);

  function vastleggen() {
    const v = video.current;
    if (!v) return;
    // de werker drukte zelf: "-knop" in de naam (lib/kyc/foto-bron.ts), voor de meting en Beheer; verder hetzelfde
    void fotoVanVideo(v, `${vorm}-knop`).then((f) => {
      if (f) opFoto.current(f);
    });
  }

  /** De knop bij de tweede selfie: eerst drie tellen, zodat je je hoofd kunt draaien zonder naar de knop te kijken. */
  function aftellen() {
    if (aftel !== null) return;
    let n = 3;
    setAftel(n);
    const tik = () => {
      n -= 1;
      if (n <= 0) {
        afteller.current = null;
        setAftel(null);
        vastleggen();
        return;
      }
      setAftel(n);
      afteller.current = setTimeout(tik, 1000);
    };
    afteller.current = setTimeout(tik, 1000);
  }

  const liveTekst = (a: SelfieAanwijzing): string =>
    a === "geen-gezicht"
      ? l.geenGezicht
      : a === "een-gezicht"
        ? l.eenGezicht
        : a === "dichterbij"
          ? l.dichterbij
          : a === "verder"
            ? x.selfieVerder
            : a === "stil"
              ? x.selfieStil
              : a === "recht"
                ? l.recht
                : a === "draai"
                  ? l.draai
                  : a === "te-ver"
                    ? l.teVer
                    : live === "draai"
                      ? l.goedDraai
                      : l.goedRecht;

  const DOC_TEKST: Record<DocAanwijzing, string> = {
    licht: x.docLicht,
    glans: x.docGlans,
    stil: x.docStil,
    dichterbij: x.docDichterbij,
    verder: x.docVerder,
    code: x.docCode,
    zoeken: x.docZoeken,
    goed: x.docGoed,
  };

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
        {eu && !gestart && (
          <button
            type="button"
            onClick={() => {
              setGestart(true);
              // de uitleg "druk op Vastleggen" alleen als de foto niet vanzelf gaat
              setUitleg(!vanzelfAan);
            }}
            className="absolute inset-0 grid place-items-center bg-black/60 px-6 text-center text-lg font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
          >
            {x.tikStart}
          </button>
        )}
        {eu && uitleg && stand === "aan" && !kiesOpen && (
          <div role="status" className="absolute inset-x-4 bottom-4 rounded-xl bg-white px-4 py-3 text-left shadow-lift">
            <p className="text-sm font-semibold text-ink">{x.handmatigKop}</p>
            <p className="mt-1 text-sm text-ink-soft">{x.handmatigTekst}</p>
            <button type="button" onClick={() => setUitleg(false)} className="btn-primary mt-3 w-full">
              {x.doorgaan}
            </button>
          </div>
        )}
        {stand === "aan" && aftel !== null && (
          <p aria-live="assertive" className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/70 px-4 py-3 text-center text-base font-semibold text-white">
            {l.aftellen.replace("{n}", String(aftel))}
          </p>
        )}
        {stand === "aan" && toonOmdraai && omdraaien && <Omdraaien tekst={omdraaien} />}
        {stand === "aan" && doc && docHint && !toonOmdraai && !(eu && uitleg) && !kiesOpen && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4">
            <p role="status" aria-live="polite" className={`rounded-full px-4 py-2 text-center text-sm font-semibold text-white ${docHint === "goed" ? "bg-ok" : "bg-black/70"}`}>
              {DOC_TEKST[docHint]}
            </p>
          </div>
        )}
        {stand === "aan" && live && !liveUit && aanwijzing && !(eu && uitleg) && !kiesOpen && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4">
            <p role="status" aria-live="polite" className={`rounded-full px-4 py-2 text-center text-sm font-semibold text-white ${aanwijzing.a === "goed" || aanwijzing.a === "stil" ? "bg-ok" : "bg-black/70"}`}>
              {liveTekst(aanwijzing.a)}
            </p>
            {(live === "draai" || aanwijzing.voortgang > 0) && (
              <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-ok transition-[width] duration-300" style={{ width: `${Math.round(aanwijzing.voortgang * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        {kiesOpen && <CameraKeuze x={x} apparaten={apparaten} keuze={keuze} onKies={setKeuze} onSluit={() => setKiesOpen(false)} />}
      </div>
      <div className="mt-4 grid gap-2">
        {stand === "aan" && vanzelfAan && <p className="text-center text-xs leading-relaxed text-neutralx-500">{x.vanzelf}</p>}
        {/* automatisch: geen knop. Na ±20 s zonder foto mag je omschakelen; kan het hier niet vanzelf, dan meteen */}
        {stand === "aan" && vanzelfAan && traag && (
          <button type="button" onClick={onZelf} className="btn-ghost w-full text-sm">
            {x.zelfWissel} {x.zelfWisselKnop}
          </button>
        )}
        {stand === "aan" && !zelf && !kanVanzelfHier && (
          <>
            <p role="status" className="text-center text-sm leading-relaxed text-ink-soft">
              {x.autoKanNiet}
            </p>
            <button type="button" onClick={onZelf} className="btn-primary w-full">
              {x.zelfWisselKnop}
            </button>
          </>
        )}
        {stand === "aan" && zelf && !eu && <p className="text-center text-xs leading-relaxed text-neutralx-500">{x.zelfModus}</p>}
        {stand !== "geen" && zelf && (
          live === "draai" ? (
            <button type="button" onClick={aftellen} disabled={stand !== "aan" || aftel !== null} className="btn-primary w-full">
              {l.aftelKnop}
            </button>
          ) : rond ? (
            <button
              type="button"
              onClick={vastleggen}
              disabled={stand !== "aan"}
              aria-label={eu ? x.vastleggen : t.scan.maakFoto}
              className="mx-auto grid h-16 w-16 place-items-center rounded-full border-4 border-brand-600 bg-white p-1 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span aria-hidden className="block h-full w-full rounded-full bg-brand-600" />
            </button>
          ) : (
            <button type="button" onClick={vastleggen} disabled={stand !== "aan"} className="btn-primary w-full">
              {t.scan.maakFoto}
            </button>
          )
        )}
        {/* geen camera (geweigerd of niet aanwezig): geen bestandskeuze meer, wel verder op de telefoon */}
        {stand === "geen" && onTelefoon && (
          <button type="button" onClick={onTelefoon} className="btn-primary w-full">
            {t.scan.telefoonOptie}
          </button>
        )}
      </div>
    </div>
  );
}

/** Een foto als klein voorbeeld in de bevestiging (de eigen foto's van de werker, op zijn eigen scherm). */
function FotoMini({ file, label }: { file: File; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <figure className="text-center">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-20 w-auto rounded-lg border border-hair object-cover" />
      )}
      <figcaption className="mt-1 text-xs text-neutralx-500">{label}</figcaption>
    </figure>
  );
}

/** Automatisch (de foto gaat vanzelf, geen knop) of zelf de foto maken (alleen de knop). */
export type ScanWijze = "auto" | "zelf";

export function IdScan({
  t,
  naam,
  onAfronden,
  onSluiten,
  modus = "laptop",
  overdracht,
  groet,
  onAfrondenOverdracht,
  route,
  wijze: beginWijze = "auto",
}: {
  /** automatisch (aanbevolen) of zelf de foto maken: de keuze aan het begin (WieBenJijIdKaarten) */
  wijze?: ScanWijze;
  /** met een route: eigen introductie, cameravraag vooraf, alleen paspoort of ID-kaart, en bij een paspoort geen achterkant */
  route?: ScanRoute;
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
  const ft = useFT();
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
  // mislukte chippogingen; na MAX_CHIP_POGINGEN gaat het zonder chip verder (zoals Onfido)
  const [chipFouten, setChipFouten] = useState(0);
  // 30 s na "Chip lezen" zonder uitslag: dan mag "Zonder chip verder", zodat niemand vastzit als de app niets terugmeldt
  const [chipLang, setChipLang] = useState(false);
  const [naChip, setNaChip] = useState<Stap>("selfie");
  const [overgedragen, setOvergedragen] = useState(false);
  const [kanTelefoon, setKanTelefoon] = useState(false);
  // de gekozen stand; "Zelf de foto maken" in de camera schakelt om voor de rest van de scan
  const [wijzeNu, setWijzeNu] = useState<ScanWijze>(beginWijze);
  // "verder op je telefoon" kan ook halverwege (camera weg of geweigerd): "Of ga hier verder" brengt je terug waar je was
  const [terugNa, setTerugNa] = useState<Stap>("soort");
  const [tel, setTel] = useState<TelefoonStand | null>(null);
  const [bijna, setBijna] = useState(false);
  const [camVraag, setCamVraag] = useState<"" | "bezig" | "geweigerd">("");
  // de vraag vóór het insturen ("Weet je zeker dat je alles hebt ingevuld?"): de foto's die dan worden ingestuurd; null = niet open
  const [bevestigFotos, setBevestigFotos] = useState<Fotos | null>(null);
  // de eerste selfie, gemeten: het vertrekpunt voor de tweede (het gedraaide hoofd); null = niet gemeten, dan alleen de knop
  const [selfieRef, setSelfieRef] = useState<LiveMeting | null>(null);
  const [liveFout, setLiveFout] = useState<string | null>(null);
  const [meten, setMeten] = useState(false);
  // voor de eigen analytics (data-track-ctx): hoe vaak per stap een foto werd gemaakt, en staand of liggend scherm
  const [pogingen, setPogingen] = useState<Partial<Record<Stap, number>>>({});
  const [scherm, setScherm] = useState<"staand" | "liggend" | null>(null);
  useEffect(() => {
    const mq = window.matchMedia?.("(orientation: landscape)");
    if (!mq) return;
    const zet = () => setScherm(mq.matches ? "liggend" : "staand");
    zet();
    mq.addEventListener?.("change", zet);
    return () => mq.removeEventListener?.("change", zet);
  }, []);
  // een paspoort heeft geen achterkant: die stap slaan we altijd over, ook op de telefoon via de QR-code (12 nov 2026). De server wil
  // twee beelden, dus de fotopagina dient ook als tweede.
  const zonderAchter = !heeftAchterkant(soort);
  const { locale } = useI18n();
  const [tipsOpen, setTipsOpen] = useState(false);
  // de bewegingscontrole (tweede selfie met een gedraaid hoofd) alleen op de laptop: de telefoon stuurt de foto's door en daar beslist altijd een medewerker
  const metBeweging = modus !== "telefoon";
  const vorigeVan = (st: Stap): Stap | undefined => {
    if (route && st === "soort") return "toestemming";
    if (st === "selfie" && zonderAchter) return "voor";
    if (st === "gegevens" && metBeweging) return "beweging";
    if (st === "gegevens" && zonderAchter) return "selfie";
    return VORIGE[st];
  };

  // "verder op je telefoon" alleen op een computer (muis of touchpad), niet op een telefoon of tablet
  useEffect(() => {
    setKanTelefoon(modus === "laptop" && Boolean(onAfrondenOverdracht) && window.matchMedia("(pointer: fine)").matches);
  }, [modus, onAfrondenOverdracht]);

  function naarTelefoon() {
    setTerugNa(stap === "start" || stap === "telefoon" ? "soort" : stap);
    setStap("telefoon");
  }

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

  // een mislukte poging tellen (niet het overslaan zelf: dat zet een lege tekst)
  useEffect(() => {
    if (chip?.status === "fout" && chip.tekst !== "") setChipFouten((n) => n + 1);
  }, [chip]);
  // de 30 s lopen vanaf het tikken op "Chip lezen" (status "wacht"), niet vanaf het openen van het scherm
  const chipWacht = chip?.status === "wacht";
  useEffect(() => {
    setChipLang(false);
    if (!chipWacht) return;
    const id = setTimeout(() => setChipLang(true), 30_000);
    return () => clearTimeout(id);
  }, [chipWacht]);

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
  const fotoStap: FotoStap | null = stap === "voor" || stap === "achter" || stap === "selfie" || stap === "beweging" ? stap : null;
  const handmatig = soort === "DRIVERS_LICENSE" || !goedGelezen(lezing);

  // een stap terug, zolang er nog niets is verstuurd: de foto's blijven bewaard, dus je hoeft niet alles over te doen
  function terug() {
    const vorige = vorigeVan(stap);
    if (!vorige) return;
    setFout(null);
    setLiveFout(null);
    setVoorbeeld(null);
    // naar een kant waar al een foto van is: die eerst tonen, in plaats van de camera
    if (vorige === "voor" || vorige === "achter" || vorige === "selfie" || vorige === "beweging") {
      const f = fotos[vorige];
      if (f) setVoorbeeld({ file: f, url: URL.createObjectURL(f) });
    }
    // de code op het document wordt opnieuw gelezen zodra je de foto weer gebruikt
    if (vorige === mrzKant || stap === mrzKant) setLezing(null);
    setStap(vorige);
  }

  function kiesSoort(d: DocSoort) {
    setSoort(d);
    setFotos({});
    setLezing(null);
    setVoorbeeld(null);
    setGegevens({ nummer: "", datum: "", naam });
    setChip(null);
    setStap("voor");
  }

  /** De browservraag om de camera pas na de uitleg: lukt het, dan gaat de stroom door; geweigerd geeft een melding en een uitweg. */
  async function vraagCamera() {
    setCamVraag("bezig");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("geen camera");
      const st = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      st.getTracks().forEach((tr) => tr.stop());
      setCamVraag("");
      setStap("soort");
    } catch {
      setCamVraag("geweigerd");
    }
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
      ...(metBeweging && f.beweging ? { selfie2: f.beweging } : {}),
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
      setNaChip(k === "voor" && !zonderAchter ? "achter" : "selfie");
      setStap("chip");
      return;
    }
    if (k === "voor" && zonderAchter) {
      setFotos((f) => (alle.voor ? { ...f, achter: alle.voor } : f));
      setStap("selfie");
    } else if (k === "voor") setStap("achter");
    else if (k === "achter") setStap("selfie");
    else if (k === "selfie" && metBeweging) setStap("beweging");
    else if (handmatig) setStap("gegevens");
    // een goed gelezen MRZ vult de gegevens zelf in: dan eerst de vraag (op de telefoon gaat het naar de laptop, die zelf laat nakijken)
    else if (modus === "telefoon") void afronden(alle, gegevens);
    else setBevestigFotos(alle);
  }

  async function gebruik() {
    if (!voorbeeld || !fotoStap) return;
    const k = fotoStap;
    const alle = { ...fotos, [k]: voorbeeld.file };
    setFotos(alle);
    if (k === "selfie" && metBeweging) {
      // de selfie meten als vertrekpunt voor de tweede; kijkt hij niet recht of is er geen gezicht, dan meteen opnieuw
      // (anders komt de werker pas na het versturen te weten dat de bewegingscontrole niet te meten was)
      setMeten(true);
      const r = await meetGezicht(voorbeeld.file);
      setMeten(false);
      if (r.status === "ok" && !r.meting) {
        setLiveFout(s.live.geenGezichtFoto);
        return;
      }
      if (r.status === "ok" && r.meting && Math.abs(r.meting.draaiing) > BEWEGING.rechtMax) {
        setLiveFout(s.live.nietRecht);
        return;
      }
      setSelfieRef(r.status === "ok" ? r.meting : null);
    }
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
  // Context voor de analytics bij elke klik in dit venster (lib/analytics/label-privacy.ts): alleen vaste codes, nooit
  // tekst uit het beeld of de MRZ. reden = waarom de werker "Opnieuw" ziet (12 nov: een stille werker klikte 4x Opnieuw
  // zonder dat te meten was).
  const reden =
    liveFout === s.live.geenGezichtFoto ? "geen-gezicht"
    : liveFout === s.live.nietRecht ? "niet-recht"
    : gelezenHier && lezing.status !== "bezig" ? (goedGelezen(lezing) ? "mrz-ok" : lezing.status === "fout" ? "mrz-fout" : lezing.verlopen ? "verlopen" : "mrz-onzeker")
    : null;
  const wijze = voorbeeld ? (/-auto-/.test(voorbeeld.file.name) ? "auto" : /-knop-/.test(voorbeeld.file.name) ? "knop" : "bestand") : null;
  const trackCtx = maakTrackCtx({
    stap,
    kant: fotoStap === "voor" || fotoStap === "achter" ? `${soort.toLowerCase().replace(/_/g, "-")}-${fotoStap}` : fotoStap,
    stand: scherm,
    wijze,
    reden,
    poging: pogingen[stap] ?? null,
  });
  // bij een paspoort is het een stap minder (geen achterkant)
  const nr = zonderAchter && (stap === "selfie" || stap === "beweging") ? 3 : STAP_NR[stap];
  const totaal = zonderAchter ? 3 : 4;
  const donker = route !== undefined && fotoStap !== null;
  // voortgangsbalk van de buitenlandse route: de echte stap waar iemand nu is, van zeven
  const EU_STAP: Partial<Record<Stap, number>> = { start: 1, toestemming: 2, soort: 3, voor: 4, achter: 5, chip: 5, selfie: 6, beweging: 6, gegevens: 6, bezig: 7, klaar: 7 };
  const euStap = route === "eu" ? (EU_STAP[stap] ?? 1) : 0;
  const gegevensOk = gegevens.nummer.trim().length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(gegevens.datum) && gegevens.naam.trim().length >= 2;

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label={s.titel} data-track-ctx={trackCtx || undefined} className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/60 sm:items-center">
        <div className="relative flex h-full w-full flex-col overflow-y-auto bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:shadow-2xl">
          <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3 ${donker ? "border-transparent bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_100%)] text-white" : "border-hair bg-white"}`}>
            {vorigeVan(stap) ? (
              <button
                type="button"
                onClick={terug}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${donker ? "text-white hover:bg-white/10 focus-visible:outline-white" : "text-brand-600 hover:bg-paper-soft focus-visible:outline-brand-500"}`}
              >
                <span aria-hidden>‹</span> {s.vorige}
              </button>
            ) : (
              route === "eu" ? (
              <AuthLanguage locale={locale} label={AUTH_DICTS[locale].lang} />
            ) : (
              <span className={`font-display text-sm font-bold ${donker ? "text-white" : "text-ink"}`}>ZekerFlex</span>
            )
            )}
            {nr !== undefined && <span className={`text-xs ${donker ? "text-white/80" : "text-neutralx-500"}`}>{s.stap.replace("{n}", String(nr)).replace("{totaal}", String(totaal))}</span>}
            <button
              type="button"
              onClick={() => onSluiten(stap === "klaar" ? uitslag : null)}
              disabled={stap === "bezig"}
              aria-label={s.sluiten}
              className={`grid h-8 w-8 place-items-center rounded-full disabled:opacity-40 ${donker ? "text-white hover:bg-white/10" : "text-neutralx-500 hover:bg-paper-soft"}`}
            >
              ✕
            </button>
          </div>

          {route === "eu" && (
            <div className="h-1.5 bg-hair" role="progressbar" aria-label={s.stap.replace("{n}", String(euStap)).replace("{totaal}", "7")} aria-valuemin={0} aria-valuemax={7} aria-valuenow={euStap}>
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round((euStap / 7) * 100)}%` }} />
            </div>
          )}

          <div className="flex-1 px-5 py-6">
            {/* de chip vooraf noemen (13 nov 2026, eigenaar: "die moet je als eerste voorgesteld krijgen"), alleen in de app die hem
                kan lezen; de Android-app staat nog niet openbaar in de Play Store, dus in de browser beloven we niets */}
            {stap === "start" && route === "nl" && (
              <NlIntro
                x={s.extra}
                privacy={s.privacy}
                annuleren={s.annuleren}
                onStart={() => setStap("toestemming")}
                onAnnuleer={() => onSluiten(null)}
                extra={kanChip ? <p className="mt-4 rounded-lg border border-trust/30 bg-trust/10 px-3 py-2.5 text-left text-sm leading-relaxed text-ink">{s.chipVooraf}</p> : undefined}
              />
            )}
            {stap === "start" && route === "eu" && (
              <EuIntro
                x={s.extra}
                annuleren={s.annuleren}
                onStart={() => setStap("toestemming")}
                onAnnuleer={() => onSluiten(null)}
                extra={kanChip ? <p className="mt-4 rounded-lg border border-trust/30 bg-trust/10 px-3 py-2.5 text-left text-sm leading-relaxed text-ink">{s.chipVooraf}</p> : undefined}
              />
            )}
            {stap === "start" && !route && (
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
                {/* tips voor een goede foto: donkere ondergrond, genoeg licht, alle gegevens zichtbaar */}
                <div className="mt-6 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3">
                  <p className="text-sm font-semibold text-ink">{s.extra.tipsKop}</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
                    {s.extra.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
                {/* de chip alleen noemen in de app die hem leest: de Android-app staat nog niet openbaar in de Play Store en de
                    iPhone-app leest geen chip, dus in de browser beloven we niets (13 nov 2026; owner-todo app-105) */}
                {kanChip && (
                  <p className="mt-5 rounded-lg border border-trust/30 bg-trust/10 px-3 py-2.5 text-sm leading-relaxed text-ink">{s.chipAppHint}</p>
                )}
                <p className="mt-6 text-center text-xs">
                  <a href="/privacy" target="_blank" rel="noopener" className="text-neutralx-500 underline">
                    {s.privacy}
                  </a>
                </p>
                <button type="button" onClick={() => setStap("soort")} className="btn-primary mt-6 w-full">
                  {s.akkoord}
                </button>
                {kanTelefoon && (
                  <button type="button" onClick={naarTelefoon} className="btn-ghost mt-2 w-full">
                    {s.telefoonOptie}
                  </button>
                )}
                <button type="button" onClick={() => onSluiten(null)} className="btn-ghost mt-2 w-full">
                  {s.annuleren}
                </button>
              </>
            )}

            {stap === "toestemming" && route === "eu" && <EuToestemming x={s.extra} privacy={s.privacy} onAkkoord={() => setTipsOpen(true)} />}
            {tipsOpen && (
              <TipsSheet
                x={s.extra}
                onSluit={() => {
                  setTipsOpen(false);
                  setStap("soort");
                }}
              />
            )}

            {stap === "toestemming" && route === "nl" && (
              <div className="text-center">
                <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zM12 16.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h2 className="mt-4 font-display text-xl font-bold text-ink">{s.extra.toestemmingTitel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.extra.toestemmingUitleg}</p>
                {camVraag === "geweigerd" && (
                  <p role="alert" className="mt-4 rounded-lg bg-crit/10 px-3 py-2.5 text-left text-sm text-crit">
                    {s.extra.toestemmingGeweigerd}
                  </p>
                )}
                <button type="button" onClick={() => void vraagCamera()} disabled={camVraag === "bezig"} className="btn-primary mt-6 w-full">
                  {camVraag === "bezig" ? s.extra.toestemmingBezig : s.extra.toestemmingKnop}
                </button>
                {/* geweigerd: geen bestandskeuze meer; op een computer kan het verder op de telefoon */}
                {camVraag === "geweigerd" && kanTelefoon && (
                  <button type="button" onClick={naarTelefoon} className="btn-ghost mt-2 w-full">
                    {s.telefoonOptie}
                  </button>
                )}
              </div>
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
                  <button type="button" onClick={() => setStap(terugNa)} className="btn-ghost w-full">
                    {s.ofHier}
                  </button>
                </div>
              </>
            )}

            {stap === "soort" && (
              <>
                {route === "eu" ? (
                  <>
                    <h2 className="font-display text-lg font-bold text-ink">{s.extra.fotosKop}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{s.extra.fotosTekst}</p>
                    <p className="mt-3 text-sm font-semibold text-ink">{s.kiesSoort}</p>
                  </>
                ) : (
                  <h2 className="font-display text-lg font-bold text-ink">{s.kiesSoort}</h2>
                )}
                <div className="mt-5 grid gap-3">
                  {(route ? (["ID_CARD", "PASSPORT"] as const) : (["ID_CARD", "PASSPORT", "DRIVERS_LICENSE"] as const)).map((d) => (
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
                <div className={route ? "-mx-5 -mt-6 mb-1 bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_100%)] px-5 pb-5 pt-4 text-white" : ""}>
                  <h2 className={`font-display text-lg font-bold ${route ? "text-white" : "text-ink"}`}>
                    {route && fotoStap === "achter" ? s.extra.draaiOm : fotoStap === "voor" ? s.voor[soort] : fotoStap === "achter" ? s.achter[soort] : fotoStap === "beweging" ? s.beweging : s.selfie}
                  </h2>
                  <p className={`mt-1 text-sm ${route ? "text-white/85" : "text-neutralx-500"}`}>
                    {fotoStap === "beweging" ? s.bewegingUitleg : fotoStap === "selfie" ? (route ? s.extra.ovaal : s.selfieUitleg) : s.kader}
                  </p>
                </div>
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
                      {liveFout && fotoStap === "selfie" && (
                        <p role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-ink">
                          {liveFout}
                        </p>
                      )}
                      <div className="mt-4 grid gap-2">
                        {!gelezenHier && !liveFout && (
                          <button type="button" onClick={() => void gebruik()} disabled={meten} className="btn-primary w-full">
                            {s.gebruik}
                          </button>
                        )}
                        {liveFout && fotoStap === "selfie" && (
                          // de meting kan zich vergissen: dan toch door, zonder vertrekpunt (de tweede selfie gaat dan met de knop)
                          <button
                            type="button"
                            onClick={() => {
                              setLiveFout(null);
                              setSelfieRef(null);
                              verder("selfie", { ...fotos, selfie: voorbeeld.file });
                            }}
                            className="btn-ghost w-full order-last"
                          >
                            {s.toch}
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
                              setLiveFout(null);
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
                      facing={fotoStap === "selfie" || fotoStap === "beweging" ? "user" : "environment"}
                      vorm={fotoStap === "selfie" || fotoStap === "beweging" ? "ovaal" : "kaart"}
                      rond={route !== undefined}
                      eu={route === "eu"}
                      t={t}
                      // live meten alleen ingelogd (niet op de telefoon via de QR-code: daar beslist toch een medewerker)
                      live={metBeweging && fotoStap === "selfie" ? "recht" : metBeweging && fotoStap === "beweging" ? "draai" : undefined}
                      referentie={selfieRef}
                      // het document live begeleiden en vanzelf fotograferen; op de telefoon via de QR-code meet de server met de
                      // eenmalige code (/api/id-overdracht/document-live). Beslissen doet daar hoe dan ook een mens.
                      doc={fotoStap === "voor" || fotoStap === "achter" ? { soort, kant: fotoStap, server: metBeweging || Boolean(overdracht), overdracht } : undefined}
                      omdraaien={fotoStap === "achter" && heeftAchterkant(soort) ? (soort === "DRIVERS_LICENSE" ? s.extra.omdraaiRijbewijs : s.extra.omdraaiId) : undefined}
                      wijze={wijzeNu}
                      onZelf={() => setWijzeNu("zelf")}
                      onTelefoon={kanTelefoon ? naarTelefoon : undefined}
                      onFoto={(f) => {
                        setLiveFout(null);
                        setVoorbeeld({ file: f, url: URL.createObjectURL(f) });
                        setPogingen((p) => ({ ...p, [stap]: (p[stap] ?? 0) + 1 }));
                      }}
                    />
                  )}
                </div>
              </>
            )}

            {route && fotoStap && !voorbeeld && fotoStap !== "selfie" && fotoStap !== "beweging" && (
              <p className="mt-5 rounded-lg bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">{s.extra.docsKop}</span> {route === "nl" ? s.extra.docsNl : s.extra.docsEu}
              </p>
            )}

            {stap === "chip" && (
              <>
                <h2 className="font-display text-lg font-bold text-ink">{s.chipTitel}</h2>
                <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{s.chipUitleg}</p>
                <div className="grid place-items-center py-5">
                  <ChipBeeld />
                </div>
                {/* zo leggen de grote partijen het uit (Onfido, ReadID, ABN AMRO, DigiD): hoesje eraf, waar, stil, geen metaal, NFC aan */}
                <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
                  {[s.chipStap1, soort === "PASSPORT" ? s.chipStap2Paspoort : s.chipStap2Kaart, s.chipStap3, s.chipStap4, s.chipStap5].map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                {chip?.status === "wacht" && (
                  <p role="status" className="mt-4 rounded-lg bg-paper-soft px-3 py-2.5 text-sm text-ink-soft">
                    {s.chipWacht}
                  </p>
                )}
                {chip?.status === "klaar" && (
                  <p
                    role="status"
                    className={`mt-4 rounded-lg border px-3 py-2.5 text-sm text-ink ${chip.echt ? "border-ok/30 bg-ok/5" : "border-warn/30 bg-warn/5"}`}
                  >
                    {chip.echt ? `✓ ${s.chipEcht}` : s.chipNietEcht}
                  </p>
                )}
                {chip?.status === "fout" && (
                  <p role="alert" className="mt-4 rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
                    {chipFouten >= MAX_CHIP_POGINGEN ? s.chipDrieKeer : chip.tekst || s.chipFout}
                  </p>
                )}
                <div className="mt-6 grid gap-2">
                  {chip?.status === "klaar" || (chip?.status === "fout" && chipFouten >= MAX_CHIP_POGINGEN) ? (
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
                  {/* "Zonder chip verder" pas na een mislukte poging, of 30 s na "Chip lezen" zonder uitslag */}
                  {((chip?.status === "fout" && chipFouten < MAX_CHIP_POGINGEN) || (chip?.status === "wacht" && chipLang)) && (
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
                {/* op de telefoon (na een QR-code) gaat het alleen naar de laptop, die zelf nog laat nakijken: daar geen tweede vraag */}
                <button type="button" disabled={!gegevensOk} onClick={() => (modus === "telefoon" ? void afronden(fotos, gegevens) : setBevestigFotos(fotos))} className="btn-primary mt-6 w-full">
                  {modus === "telefoon" ? s.telVersturen : s.afronden}
                </button>
              </>
            )}

            <OnderSheet open={bevestigFotos !== null} titelId="idscan-bevestig-titel" beschrijvingId="idscan-bevestig-uitleg" titel={ft.bevestig.titel} onSluit={() => setBevestigFotos(null)}>
                  <div className="overflow-y-auto px-6 pb-6">
                    <p id="idscan-bevestig-uitleg" className="text-center text-sm leading-relaxed text-neutralx-600">{ft.bevestig.uitleg}</p>
                    {/* soort, naam zoals getypt en geldigheid; het documentnummer en alles uit de MRZ blijven buiten beeld */}
                    <dl className="mt-4 divide-y divide-hair rounded-xl border border-hair text-sm">
                      {bevestigOverzicht({
                        methode: "upload",
                        nummerTonen: false,
                        veld: (n) => (n === "nameOnDocument" ? gegevens.naam.trim() || naam : n === "documentExpiry" ? gegevens.datum : ""),
                        labels: { naam: t.nameOnDoc, soort: t.docType, nummer: t.docNumber, geldigTot: t.validUntil, kvk: "", btw: "", postcode: "", fotos: ft.bevestig.fotos, methode: ft.bevestig.methode },
                        soortNaam: t.docs[soort],
                        bedrijf: null,
                        fotoNamen: [],
                        viaStripe: "",
                      }).map(([label, waarde]) => (
                        <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                          <dt className="text-neutralx-500">{label}</dt>
                          <dd className="break-words text-right font-medium text-ink">{waarde}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 text-xs font-semibold text-neutralx-500">{ft.bevestig.fotos}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {bevestigFotos?.voor && <FotoMini file={bevestigFotos.voor} label={t.missingNames.documentFront} />}
                      {!zonderAchter && bevestigFotos?.achter && <FotoMini file={bevestigFotos.achter} label={t.missingNames.documentBack} />}
                      {bevestigFotos?.selfie && <FotoMini file={bevestigFotos.selfie} label={t.missingNames.selfie} />}
                      {metBeweging && bevestigFotos?.beweging && <FotoMini file={bevestigFotos.beweging} label={t.missingNames.selfie2} />}
                    </div>
                    <div className="mt-5 flex gap-2">
                      <button type="button" onClick={() => setBevestigFotos(null)} className="btn-ghost min-h-[44px] flex-1">
                        {ft.bevestig.terug}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const f = bevestigFotos;
                          setBevestigFotos(null);
                          if (f) void afronden(f, gegevens);
                        }}
                        className="btn-trust min-h-[44px] flex-1"
                      >
                        {ft.bevestig.ja}
                      </button>
                    </div>
                  </div>
                </OnderSheet>

            {stap === "bezig" && (
              <div className="grid place-items-center py-16 text-center" role="status">
                <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-4 border-hair border-t-brand-600" />
                <p className="mt-5 font-display text-lg font-bold text-ink">{route ? s.extra.procKop : s.bezig}</p>
                <p className="mt-1 text-sm text-neutralx-500">{s.bezigUitleg}</p>
                {route && (
                  // alleen wat echt is gebeurd: het document is al gelezen (of met de hand ingevuld); de rest wacht op het antwoord van de server
                  <ul className="mt-6 space-y-2 text-left text-sm text-ink-soft">
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-ok text-[11px] text-white">✓</span>
                      {goedGelezen(lezing) ? s.extra.procGelezen : s.extra.procHandmatig}
                    </li>
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-hair border-t-brand-600" />
                      {s.extra.procVersturen}
                    </li>
                  </ul>
                )}
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

            {stap === "klaar" && uitslag && route && uitslag.outcome !== "rejected" && !bijna && (
              <div className="py-6 text-center">
                <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok text-2xl text-white">
                  ✓
                </span>
                <h2 className="mt-4 font-display text-xl font-bold text-ink">{s.extra.bedankTitel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.extra.bedankTekst}</p>
                <ul className="mt-5 space-y-2 text-left text-sm text-ink-soft">
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-ok text-[11px] text-white">✓</span>
                    {s.extra.procKlaar}
                  </li>
                </ul>
                <button type="button" onClick={() => setBijna(true)} className="btn-primary mt-8 w-full">
                  {s.volgende}
                </button>
              </div>
            )}

            {stap === "klaar" && uitslag && route && uitslag.outcome !== "rejected" && bijna && (
              <div className="py-6 text-center">
                <BijnaKlaarBeeld />
                <h2 className="mt-4 font-display text-xl font-bold text-ink">{s.extra.bijnaTitel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.extra.bijnaTekst}</p>
                {/* een gewone link: volledige paginalading, dus de poort en de status zijn vers */}
                <button
                  type="button"
                  onClick={() => {
                    onSluiten(uitslag);
                    window.location.assign("/dashboard/klussen");
                  }}
                  className="btn-primary mt-8 w-full"
                >
                  {s.extra.bijnaKnop}
                </button>
              </div>
            )}

            {stap === "klaar" && uitslag && !(route && uitslag.outcome !== "rejected") && (
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
