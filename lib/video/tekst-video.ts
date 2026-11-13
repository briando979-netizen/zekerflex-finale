import {
  klem,
  leegProject,
  nieuweBeeldClip,
  nieuweTekstClip,
  rond,
  tekstSchaal,
  woordenVan,
  type BeeldClip,
  type Clip,
  type Formaat,
  type Project,
} from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Tekstvideo in één klik (Admin → Video-editor): regels tekst worden een
// bewegende tekstvideo, zoals de "lyric"-video's op TikTok. Chatbubbels die
// woord voor woord groeien (blauw en groen om en om), één groot 3D-woord met
// glitch, een venster waarin de laatste zinnen getypt worden en een eindbeeld
// met het logo. Tussen de delen een glitch-overgang op een donkere achtergrond.
// Puur (geen DOM, geen netwerk), zodat het te testen is; de editor zet er zelf
// muziek onder (lib/video/muziek.ts).
// ---------------------------------------------------------------------------

/** Eigen voorbeeldtekst (marketing van ZekerFlex zelf). */
export const TEKSTVIDEO_VOORBEELD = ["Werk zoeken?", "Kies je eigen klussen", "Werk wanneer het jou past", "FLEX", "Reageer in één tik.", "Uren schrijven in de app.", "ZekerFlex"];

export const TEKSTVIDEO_LENGTES = [10, 15, 20, 30] as const;

const MAX_REGELS = 12;
const MAX_TEKENS = 90;
const EIND_DUUR = 3;
const OVERGANG = 0.4;
const LOGO = "/icons/icon-512.png";

export interface TekstVideoDelen {
  /** Chatbubbels, in volgorde (blauw, groen, blauw, …). */
  bubbels: string[];
  /** Het grote 3D-woord (hoofdletters). */
  woord: string;
  /** Zinnen die in het venster getypt worden (één per regel). */
  venster: string[];
  /** Titel op het eindbeeld. */
  eind: string;
}

export interface TekstVideoOpties {
  regels: string[];
  formaat: Formaat;
  /** Gewenste totale lengte in seconden. */
  lengte: number;
}

/** Regels uit het tekstvak: één per regel, zonder lege regels, begrensd. */
export function tekstVideoRegels(tekst: string): string[] {
  return tekst
    .split(/\r?\n/)
    .map((r) => r.replace(/\s+/g, " ").trim().slice(0, MAX_TEKENS))
    .filter(Boolean)
    .slice(0, MAX_REGELS);
}

/** Het langste woord zonder leestekens eromheen ("zoeken?" wordt "zoeken"). */
function langsteWoord(regels: string[]): string {
  const woorden = regels.flatMap(woordenVan).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
  return woorden.reduce((a, b) => (b.length > a.length ? b : a), "") || "ZEKER";
}

/**
 * Verdeel de regels over de delen: de laatste regel is het eindbeeld, de
 * eerste regel van één woord wordt het 3D-woord (anders het langste woord), de
 * laatste één of twee zinnen komen in het venster en de rest worden chatbubbels.
 */
export function verdeelRegels(invoer: string[]): TekstVideoDelen {
  const regels = invoer.length ? invoer : TEKSTVIDEO_VOORBEELD;
  const eind = regels.length >= 2 ? (regels[regels.length - 1] ?? "ZekerFlex") : "ZekerFlex";
  const rest = regels.length >= 2 ? regels.slice(0, -1) : regels;
  const i = rest.findIndex((r) => woordenVan(r).length === 1);
  const woord = (i >= 0 ? (rest[i] ?? "") : langsteWoord(rest)).toUpperCase().slice(0, 16);
  const zinnen = i >= 0 ? rest.filter((_, j) => j !== i) : rest;
  const inVenster = zinnen.length >= 4 ? 2 : zinnen.length >= 2 ? 1 : 0;
  return { bubbels: zinnen.slice(0, zinnen.length - inVenster), woord, venster: zinnen.slice(zinnen.length - inVenster), eind };
}

/** Plek van logo, titel en ondertitel op het eindbeeld per formaat (logo: fractie van het halve beeld). */
const EINDBEELD: Record<Formaat, { schaal: number; y: number; titel: number; onder: number }> = {
  "9:16": { schaal: 0.36, y: -0.14, titel: 0.58, onder: 0.63 },
  "4:5": { schaal: 0.34, y: -0.17, titel: 0.64, onder: 0.71 },
  "1:1": { schaal: 0.34, y: -0.2, titel: 0.66, onder: 0.75 },
  "16:9": { schaal: 0.3, y: -0.22, titel: 0.64, onder: 0.75 },
};

export function bouwTekstVideo(o: TekstVideoOpties): Project {
  const delen = verdeelRegels(o.regels);
  const eerste = delen.bubbels[0] ?? delen.woord;
  const p = leegProject(`Tekstvideo: ${eerste}`.slice(0, 80), o.formaat);
  const s = tekstSchaal(o.formaat);
  const lengte = klem(o.lengte, 6, 120);
  const vensterTekst = delen.venster.join("\n");

  // Natuurlijke duur per deel (tijd om te lezen), daarna geschaald naar de
  // gekozen lengte; het eindbeeld duurt altijd even lang.
  const natuur = [...delen.bubbels.map((b) => 0.9 + 0.32 * woordenVan(b).length), 1.7, ...(vensterTekst ? [1.4 + 0.05 * vensterTekst.length] : [])];
  const som = natuur.reduce((a, b) => a + b, 0);
  const factor = Math.max(1, lengte - EIND_DUUR) / som;
  const duren = natuur.map((d) => rond(Math.max(0.9, d * factor), 100));

  const clips: Clip[] = [];
  let t = 0;
  let k = 0;
  let eersteDeel = true;
  // Elk deel een eigen donkere achtergrond; vanaf het tweede deel met een glitch-overgang.
  const achtergrond = (naam: string, start: number, duur: number, kleur: string, kleur2: string, extra: Partial<BeeldClip> = {}) => {
    const clip = nieuweBeeldClip({ spoor: "s-beeld", soort: "kleur", naam, start: rond(start), duur: rond(duur), kleur, kleur2, overgang: eersteDeel ? "geen" : "glitch", overgangDuur: OVERGANG, ...extra });
    eersteDeel = false;
    return clip;
  };

  // 1. Chatbubbels: één tegelijk in het midden, het vlak groeit woord voor woord mee.
  const chatStart = t;
  delen.bubbels.forEach((tekst, i) => {
    const duur = duren[k++] ?? 2;
    clips.push(
      nieuweTekstClip({
        spoor: "s-tekst",
        start: rond(t),
        duur,
        tekst,
        stijl: i % 2 === 0 ? "bubbel-blauw" : "bubbel-groen",
        grootte: Math.round(68 * s),
        kleur: "#FFFFFF",
        vet: false,
        y: 0.5,
        breedte: 0.82,
        animatieIn: "woorden",
        animatieUit: "glitch",
      }),
    );
    t += duur;
  });
  if (t > chatStart) clips.push(achtergrond("Chat", chatStart, t - chatStart, "#0B1220", "#1B2740"));

  // 2. Eén groot woord in 3D, met glitch erin en eruit.
  const woordDuur = duren[k++] ?? 1.7;
  clips.push(
    achtergrond("3D-woord", t, woordDuur, "#050505", "#2A2A2A"),
    nieuweTekstClip({
      spoor: "s-tekst",
      start: rond(t),
      duur: woordDuur,
      tekst: delen.woord,
      stijl: "3d",
      // Korte woorden groot, lange kleiner: het woord moet op één regel passen.
      grootte: Math.round(klem(1400 / Math.max(3, delen.woord.length), 70, 220) * s),
      kleur: "#F4F1EA",
      vet: true,
      y: 0.5,
      breedte: 0.96,
      animatieIn: "glitch",
      animatieUit: "glitch",
    }),
  );
  t += woordDuur;

  // 3. Venster waarin de laatste zinnen regel voor regel getypt worden.
  if (vensterTekst) {
    const duur = duren[k++] ?? 3;
    clips.push(
      achtergrond("Venster", t, duur, "#0A0F1E", "#16213F"),
      nieuweTekstClip({ spoor: "s-tekst", start: rond(t), duur, tekst: vensterTekst, stijl: "venster", grootte: Math.round(54 * s), kleur: "#FFFFFF", vet: true, y: 0.5, breedte: 0.86, animatieIn: "typen", animatieUit: "glitch" }),
    );
    t += duur;
  }

  // 4. Eindbeeld: logo als hoes, titel en het webadres.
  const e = EINDBEELD[o.formaat];
  clips.push(
    achtergrond("Eindbeeld", t, EIND_DUUR, "#0E2A20", "#050B09", { vervagenUit: 0.6 }),
    nieuweBeeldClip({ spoor: "s-overlay", soort: "foto", bron: LOGO, naam: "Logo", start: rond(t + 0.15), duur: rond(EIND_DUUR - 0.15), passen: "passend", plaatsing: { x: 0, y: e.y, schaal: e.schaal, draai: 0 }, beweging: "inzoomen", vervagenIn: 0.35, vervagenUit: 0.6 }),
    nieuweTekstClip({ spoor: "s-tekst", start: rond(t + 0.35), duur: rond(EIND_DUUR - 0.35), tekst: delen.eind, grootte: Math.round(84 * s), y: e.titel, stijl: "schaduw", animatieIn: "pop", animatieUit: "vervagen" }),
    nieuweTekstClip({ spoor: "s-onder", start: rond(t + 0.6), duur: rond(EIND_DUUR - 0.6), tekst: "zekerflex.com", grootte: Math.round(42 * s), y: e.onder, stijl: "gewoon", vet: false, kleur: "#9FB8B0", animatieIn: "opschuiven", animatieUit: "vervagen" }),
  );
  return { ...p, clips };
}
