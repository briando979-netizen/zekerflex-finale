import {
  leegProject,
  nieuweAudioClip,
  nieuweBeeldClip,
  nieuweTekstClip,
  ondertitels,
  rond,
  type Beweging,
  type Clip,
  type Formaat,
  type Overgang,
  type Project,
} from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Van een AI-scenario naar een kant-en-klaar project op de tijdlijn: een foto
// per scène die langzaam beweegt, een kop die binnenkomt, ondertiteling die
// woord voor woord meeloopt, de ingesproken stem en een eindbeeld. Puur (geen
// netwerk), zodat het te testen is; lib/video/auto.ts levert de beelden en stem.
// ---------------------------------------------------------------------------

export interface Scene {
  kop: string;
  voorlezen: string;
  /** Beschrijving van het beeld (voor de beeld-AI, in het Engels). */
  beeld: string;
  trefwoorden: string[];
}

export interface Scenario {
  titel: string;
  scenes: Scene[];
  slot: { kop: string; onder: string };
}

export interface BouwOpties {
  formaat: Formaat;
  /** Gewenste lengte in seconden als er geen stem is. */
  lengte: number;
  /** Adres van het beeld per scène (zelfde volgorde als scenario.scenes). */
  beelden: string[];
  stem: { adres: string; duur: number } | null;
  ondertiteling: boolean;
  merkKleur?: string;
}

const BEWEGINGEN: Beweging[] = ["inzoomen", "links", "uitzoomen", "rechts", "omhoog"];
const OVERGANGEN: Overgang[] = ["vervagen", "zoom", "schuiven", "vervagen", "wissen"];
const SLOT_DUUR = 3;
const AANLOOP = 0.35;

export function bouwAutoProject(s: Scenario, o: BouwOpties): Project {
  const p = leegProject(s.titel.slice(0, 80) || "AI-video", o.formaat);
  const staand = o.formaat === "9:16" || o.formaat === "4:5";
  const scenes = s.scenes.filter((x) => x.kop.trim() || x.voorlezen.trim());
  const n = Math.max(1, scenes.length);

  // Hoe lang elke scène duurt: met stem naar verhouding van wat er voorgelezen
  // wordt, anders gelijk verdeeld over de gekozen lengte.
  const totaalScenes = o.stem ? o.stem.duur + AANLOOP : Math.max(n * 2, o.lengte - SLOT_DUUR);
  const gewicht = scenes.map((x) => (o.stem ? Math.max(12, x.voorlezen.length) : 1));
  const som = gewicht.reduce((a, b) => a + b, 0) || 1;
  const duren = gewicht.map((g) => Math.max(1.6, (totaalScenes * g) / som));

  const clips: Clip[] = [];
  let t = 0;
  scenes.forEach((scene, i) => {
    const duur = rond(duren[i] ?? 3);
    const bron = o.beelden[i] ?? o.beelden[0] ?? "";
    clips.push(
      nieuweBeeldClip({
        spoor: "s-beeld",
        soort: bron ? "foto" : "kleur",
        bron,
        naam: scene.kop.slice(0, 40) || `Scène ${i + 1}`,
        start: rond(t),
        duur,
        beweging: BEWEGINGEN[i % BEWEGINGEN.length] ?? "inzoomen",
        overgang: i === 0 ? "geen" : (OVERGANGEN[i % OVERGANGEN.length] ?? "vervagen"),
        overgangDuur: 0.5,
        vervagenIn: i === 0 ? 0.4 : 0,
        filters: { helderheid: 96, contrast: 106, verzadiging: 108, vervaging: 0, zwartwit: 0, sepia: 0, tint: 0 },
      }),
    );
    if (scene.kop.trim()) {
      clips.push(
        nieuweTekstClip({
          spoor: "s-tekst",
          start: rond(t + 0.15),
          duur: rond(Math.max(1, duur - 0.3)),
          tekst: scene.kop.trim().slice(0, 90),
          grootte: staand ? 88 : 56,
          y: staand ? 0.3 : 0.22,
          stijl: "schaduw",
          animatieIn: i % 2 === 0 ? "pop" : "opschuiven",
          animatieUit: "vervagen",
        }),
      );
    }
    if (o.ondertiteling && scene.voorlezen.trim()) {
      const start = o.stem ? t + (i === 0 ? AANLOOP : 0) : t + 0.1;
      const lengte = Math.max(0.8, duur - (i === 0 && o.stem ? AANLOOP : 0) - 0.1);
      for (const regel of ondertitels(scene.voorlezen, start, lengte, staand ? 4 : 6)) {
        clips.push(
          nieuweTekstClip({
            spoor: "s-onder",
            start: regel.start,
            duur: regel.duur,
            tekst: regel.tekst,
            grootte: staand ? 56 : 38,
            y: staand ? 0.76 : 0.84,
            stijl: "kader",
            achtergrond: "",
            animatieIn: "geen",
            animatieUit: "geen",
            karaoke: true,
          }),
        );
      }
    }
    t += duur;
  });

  // Eindbeeld in de merkkleur.
  const slotStart = rond(t);
  clips.push(
    nieuweBeeldClip({
      spoor: "s-beeld",
      soort: "kleur",
      naam: "Eindbeeld",
      start: slotStart,
      duur: SLOT_DUUR,
      kleur: o.merkKleur ?? "#0E5C4A",
      kleur2: "#06261F",
      overgang: "vervagen",
      overgangDuur: 0.6,
      vervagenUit: 0.5,
    }),
    nieuweTekstClip({ spoor: "s-tekst", start: rond(slotStart + 0.3), duur: SLOT_DUUR - 0.3, tekst: s.slot.kop.slice(0, 60) || "ZekerFlex", grootte: staand ? 100 : 70, y: 0.45, stijl: "gewoon", animatieIn: "pop", animatieUit: "vervagen" }),
    nieuweTekstClip({ spoor: "s-tekst", start: rond(slotStart + 0.7), duur: SLOT_DUUR - 0.7, tekst: s.slot.onder.slice(0, 80) || "zekerflex.com", grootte: staand ? 50 : 34, y: staand ? 0.56 : 0.6, stijl: "gewoon", vet: false, kleur: "#4FE0A0", animatieIn: "opschuiven", animatieUit: "vervagen" }),
  );

  if (o.stem) {
    clips.push(nieuweAudioClip({ spoor: "s-stem", start: AANLOOP, duur: rond(o.stem.duur), bron: o.stem.adres, bronDuur: o.stem.duur, naam: "AI-stem", rol: "stem", volume: 1 }));
  }
  return { ...p, clips };
}

/** Een eenvoudig scenario zonder taalmodel (als de AI even niet antwoordt). */
export function standaardScenario(onderwerp: string, scenes: number): Scenario {
  const o = onderwerp.trim().replace(/\s+/g, " ").slice(0, 80) || "ZekerFlex";
  const basis: Scene[] = [
    { kop: o, voorlezen: `${o}. Zo geregeld met ZekerFlex.`, beeld: `${o}, people at work in the Netherlands`, trefwoorden: o.split(" ") },
    { kop: "Snel de juiste mensen", voorlezen: "Plaats je klus en krijg reacties van mensen in de buurt.", beeld: "a manager planning shifts on a phone", trefwoorden: ["planning", "team", "werkgever"] },
    { kop: "Alles op één plek", voorlezen: "Rooster, uren en facturen: alles in één app.", beeld: "a worker checking an app on a phone", trefwoorden: ["app", "telefoon", "freelancer"] },
    { kop: "Zeker van je zaak", voorlezen: "Geverifieerde mensen en duidelijke afspraken.", beeld: "a team shaking hands at work", trefwoorden: ["team", "samen"] },
    { kop: "Begin vandaag", voorlezen: "Kijk op zekerflex punt com.", beeld: "a smiling team at the start of a shift", trefwoorden: ["team", "dienst"] },
  ];
  return { titel: o, scenes: basis.slice(0, Math.max(2, Math.min(scenes, basis.length))), slot: { kop: "ZekerFlex", onder: "zekerflex.com" } };
}

/** Maak AI-uitvoer veilig en bruikbaar (lengtes, aantallen). */
export function schoonScenario(ruw: unknown, maxScenes: number): Scenario | null {
  const r = (ruw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.scenes)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const scenes: Scene[] = (r.scenes as Record<string, unknown>[])
    .slice(0, maxScenes)
    .map((x) => ({
      kop: str(x.kop, 70),
      voorlezen: str(x.voorlezen, 260),
      beeld: str(x.beeld, 300),
      trefwoorden: Array.isArray(x.trefwoorden) ? (x.trefwoorden as unknown[]).map((w) => str(w, 30)).filter(Boolean).slice(0, 6) : [],
    }))
    .filter((x) => x.kop || x.voorlezen);
  if (scenes.length < 2) return null;
  const slot = (r.slot ?? {}) as Record<string, unknown>;
  return { titel: str(r.titel, 80) || "AI-video", scenes, slot: { kop: str(slot.kop, 60) || "ZekerFlex", onder: str(slot.onder, 80) || "zekerflex.com" } };
}
