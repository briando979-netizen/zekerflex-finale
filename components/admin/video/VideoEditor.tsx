"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Notice, PageHead, Pill } from "@/components/admin/kit";
import {
  FORMATEN,
  clipOp,
  dupliceer,
  einde,
  klem,
  knip,
  leegProject,
  nieuweAudioClip,
  nieuweBeeldClip,
  nieuweTekstClip,
  nieuwId,
  ondertitels,
  projectDuur,
  rond,
  spoorEinde,
  standOp,
  tekstSchaal,
  verwijderClip,
  vervangClip,
  vrijePlek,
  zetStand,
  type AudioClip,
  type BeeldClip,
  type Clip,
  type Project,
  type SpoorSoort,
} from "@/lib/video/model";
import { Speler } from "@/lib/video/speler";
import { maakMuziek, type Stemming } from "@/lib/video/muziek";
import { Tijdlijn, spoorVoor, type SleepData } from "@/components/admin/video/Tijdlijn";
import { Eigenschappen } from "@/components/admin/video/Eigenschappen";
import { Bibliotheek } from "@/components/admin/video/Bibliotheek";
import { AiVideo, type AiVideoKeuze } from "@/components/admin/video/AiVideo";
import { TekstVideo } from "@/components/admin/video/TekstVideo";
import { Export } from "@/components/admin/video/Export";
import { Venster } from "@/components/admin/video/Venster";
import { TEKST_PRESETS } from "@/components/admin/video/presets";
import { metSpraakOndertitels, ondertitelSpoor, spraakRegels, type GesprokenWoord, type SpraakRegel } from "@/lib/video/spraak-ondertitels";
import { knipStiltesWeg, spraakStukken } from "@/lib/video/stiltes";
import {
  bewaarProject,
  haalBestanden,
  haalProject,
  haalProjecten,
  bestandAdres,
  maakGratisClip,
  postJson,
  spraakNaarWoorden,
  tijdTekst,
  uploadBestand,
  verwijderProject,
  type AiStatus,
  type ProjectKort,
  type VideoBestand,
} from "@/components/admin/video/api";

interface Geschiedenis {
  verleden: Project[];
  nu: Project;
  toekomst: Project[];
  sleutel: string | null;
  op: number;
}

const nieuweGeschiedenis = (p: Project): Geschiedenis => ({ verleden: [], nu: p, toekomst: [], sleutel: null, op: 0 });

const klokTijd = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const datumTijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function VideoEditor() {
  const [g, setG] = useState<Geschiedenis | null>(null);
  const [selectie, setSelectie] = useState<string | null>(null);
  const [tijd, setTijd] = useState(0);
  const [speelt, setSpeelt] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [magneetAan, setMagneetAan] = useState(true);
  const [bestanden, setBestanden] = useState<VideoBestand[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [opslag, setOpslag] = useState<{ status: "bewaard" | "bezig" | "fout"; op?: string } | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; soort: "ok" | "fout" } | null>(null);
  const [aiMeldingen, setAiMeldingen] = useState<string[]>([]);
  const [venster, setVenster] = useState<"ai" | "tekstvideo" | "export" | "projecten" | null>(null);
  const [projecten, setProjecten] = useState<ProjectKort[] | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spelerRef = useRef<Speler | null>(null);
  const [speler, setSpeler] = useState<Speler | null>(null);
  const project = g?.nu ?? null;
  // Stand (bijgewerkt) die op de server staat; anders wordt er opgeslagen.
  const laatstBewaard = useRef<string | null>(null);

  const meld = useCallback((tekst: string, soort: "ok" | "fout" = "ok") => setMelding({ tekst, soort }), []);

  // Wat de spraakherkenning in een bestand hoorde, per taal en bestand: ondertitels en stiltes delen één keer luisteren.
  const spraak = useRef(new Map<string, Promise<{ tekst: string; woorden: GesprokenWoord[] }>>());
  const woordenVan = useCallback((bron: string, taal: string) => {
    const sleutel = `${taal}|${bron}`;
    let bezig = spraak.current.get(sleutel);
    if (!bezig) {
      bezig = spraakNaarWoorden(bron, taal);
      spraak.current.set(sleutel, bezig);
      // een fout niet onthouden: dan kan het meteen opnieuw
      bezig.catch(() => spraak.current.delete(sleutel));
    }
    return bezig;
  }, []);
  useEffect(() => {
    if (!melding) return;
    const t = window.setTimeout(() => setMelding(null), melding.soort === "fout" ? 9000 : 4500);
    return () => window.clearTimeout(t);
  }, [melding]);

  const wijzig = useCallback((fn: (p: Project) => Project, sleutel?: string) => {
    setG((h) => {
      if (!h) return h;
      const nieuw = { ...fn(h.nu), bijgewerkt: new Date().toISOString() };
      const samen = Boolean(sleutel) && h.sleutel === sleutel && Date.now() - h.op < 1200;
      return { verleden: samen ? h.verleden : [...h.verleden.slice(-99), h.nu], nu: nieuw, toekomst: [], sleutel: sleutel ?? null, op: Date.now() };
    });
  }, []);

  const ongedaan = useCallback(() => {
    setG((h) => {
      const vorige = h?.verleden[h.verleden.length - 1];
      if (!h || !vorige) return h;
      return { verleden: h.verleden.slice(0, -1), nu: vorige, toekomst: [h.nu, ...h.toekomst], sleutel: null, op: 0 };
    });
  }, []);
  const opnieuw = useCallback(() => {
    setG((h) => {
      const volgende = h?.toekomst[0];
      if (!h || !volgende) return h;
      return { verleden: [...h.verleden, h.nu], nu: volgende, toekomst: h.toekomst.slice(1), sleutel: null, op: 0 };
    });
  }, []);

  const vernieuwBestanden = useCallback(async () => {
    try {
      const d = await haalBestanden();
      setBestanden(d.bestanden);
      setAi(d.ai);
    } catch {
      /* lijst blijft zoals hij was */
    }
  }, []);

  const openProject = useCallback((p: Project) => {
    laatstBewaard.current = p.bijgewerkt;
    setG(nieuweGeschiedenis(p));
    setSelectie(null);
    setTijd(0);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("project", p.id);
      window.history.replaceState(null, "", url);
    } catch {
      /* geen adresbalk (voorbeeld) */
    }
  }, []);

  // Eerste keer: bestanden, en het project uit het adres of het laatst gewijzigde.
  useEffect(() => {
    void vernieuwBestanden();
    (async () => {
      try {
        const id = new URL(window.location.href).searchParams.get("project");
        if (id) {
          try {
            openProject(await haalProject(id));
            return;
          } catch {
            /* bestaat niet meer: neem het laatste */
          }
        }
        const lijst = await haalProjecten();
        setProjecten(lijst);
        const eerste = lijst[0];
        openProject(eerste ? await haalProject(eerste.id) : leegProject());
      } catch (err) {
        setLaadFout((err as Error).message);
        openProject(leegProject());
      }
    })();
  }, [openProject, vernieuwBestanden]);

  // De speler hoort bij één canvas; een ander project krijgt een verse speler.
  const projectId = project?.id;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !g) return;
    const s = new Speler(canvas, g.nu, 0.5);
    s.onTijd = (t) => setTijd(t);
    s.onStop = () => setSpeelt(false);
    spelerRef.current = s;
    setSpeler(s);
    return () => {
      s.vernietig();
      spelerRef.current = null;
      setSpeler(null);
    };
    // Alleen bij een ander project; wijzigingen gaan via zetProject hieronder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (project) spelerRef.current?.zetProject(project);
  }, [project]);

  // Automatisch opslaan, 1,2 s na de laatste wijziging. (De server maakt het
  // project alleen schoon; die stand nemen we niet over, anders springt een
  // veld terug terwijl je nog typt.)
  useEffect(() => {
    if (!project || laatstBewaard.current === project.bijgewerkt) return;
    const t = window.setTimeout(async () => {
      setOpslag({ status: "bezig" });
      try {
        const bewaard = await bewaarProject(project);
        laatstBewaard.current = project.bijgewerkt;
        setOpslag({ status: "bewaard", op: bewaard.bijgewerkt });
      } catch {
        setOpslag({ status: "fout" });
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [project]);

  const zoek = useCallback((t: number) => {
    const s = spelerRef.current;
    if (!s) return;
    s.zoek(t);
    setTijd(s.tijd);
  }, []);

  const speelPauzeer = useCallback(() => {
    const s = spelerRef.current;
    if (!s) return;
    if (s.speelt) {
      s.pauzeer();
      setSpeelt(false);
    } else {
      s.speel();
      setSpeelt(true);
    }
  }, []);

  const geselecteerd = project?.clips.find((c) => c.id === selectie) ?? null;

  const toevoegen = useCallback(
    (data: SleepData, spoorId?: string, t?: number) => {
      if (!g) return;
      const p = g.nu;
      const soort = spoorVoor(data.soort);
      const kandidaten = p.sporen.filter((s) => s.soort === soort && !s.slot);
      let spoor = spoorId && kandidaten.some((s) => s.id === spoorId) ? spoorId : undefined;
      if (!spoor && soort === "audio") spoor = kandidaten.find((s) => s.id === (data.rol === "muziek" ? "s-muziek" : "s-stem"))?.id;
      if (!spoor && soort === "tekst" && data.preset === "onder") spoor = kandidaten.find((s) => s.id === "s-onder")?.id;
      spoor = spoor ?? kandidaten[0]?.id;
      if (!spoor) {
        meld("Er is geen spoor voor dit soort clip. Voeg er onder de tijdlijn een toe.", "fout");
        return;
      }
      const hoofd = p.sporen.find((s) => s.soort === "beeld")?.id;
      const gewenst = data.start ?? t ?? (soort === "beeld" && spoor === hoofd ? spoorEinde(p, spoor) : spelerRef.current?.tijd ?? 0);
      let clip: Clip;
      if (data.soort === "tekst") {
        const preset = TEKST_PRESETS.find((x) => x.id === data.preset) ?? TEKST_PRESETS[0];
        const ins = preset?.instelling ?? {};
        clip = nieuweTekstClip({ spoor, start: 0, duur: preset?.duur ?? 3, ...ins, grootte: Math.round((ins.grootte ?? 70) * tekstSchaal(p.formaat)) });
      } else if (data.soort === "audio") {
        clip = nieuweAudioClip({ spoor, start: 0, duur: data.duur ?? 5, bron: data.bron ?? "", naam: data.naam ?? "Geluid", bronDuur: data.duur ?? null, rol: data.rol ?? (spoor === "s-muziek" ? "muziek" : "stem"), ...(data.rol === "muziek" ? { volume: 0.55, vervagenUit: 1.5 } : {}) });
      } else {
        clip = nieuweBeeldClip({
          spoor,
          soort: data.soort,
          start: 0,
          duur: data.soort === "video" ? (data.duur ?? 5) : 3,
          bron: data.bron ?? "",
          naam: data.naam ?? (data.soort === "kleur" ? "Kleurvlak" : "Clip"),
          bronDuur: data.soort === "video" ? (data.duur ?? null) : null,
          overgang: spoor === hoofd && p.clips.some((c) => c.spoor === spoor) ? "vervagen" : "geen",
        });
      }
      const start = vrijePlek(p, spoor, clip.duur, gewenst);
      const klaar = { ...clip, start } as Clip;
      wijzig((x) => ({ ...x, clips: [...x.clips, klaar] }));
      setSelectie(klaar.id);
    },
    [g, meld, wijzig],
  );

  const knipNu = useCallback(() => {
    if (!project) return;
    const t = spelerRef.current?.tijd ?? tijd;
    const doel = (geselecteerd && t > geselecteerd.start && t < einde(geselecteerd) ? geselecteerd : null) ?? project.sporen.map((s) => clipOp(project, s.id, t)).find(Boolean) ?? null;
    if (!doel) return meld("Zet de afspeelkop op een clip om te knippen.", "fout");
    const delen = knip(doel, t);
    if (!delen) return;
    wijzig((p) => ({ ...p, clips: [...p.clips.filter((c) => c.id !== doel.id), ...delen] }));
    setSelectie(delen[1].id);
  }, [project, geselecteerd, tijd, wijzig, meld]);

  const verwijder = useCallback(() => {
    if (!geselecteerd || !project) return;
    const hoofd = project.sporen.find((s) => s.soort === "beeld")?.id;
    wijzig((p) => verwijderClip(p, geselecteerd.id, geselecteerd.spoor === hoofd));
    setSelectie(null);
  }, [geselecteerd, project, wijzig]);

  const dupliceerNu = useCallback(() => {
    if (!geselecteerd || !g) return;
    const { kopie } = dupliceer(g.nu, geselecteerd.id);
    if (!kopie) return;
    wijzig((p) => ({ ...p, clips: [...p.clips, kopie] }));
    setSelectie(kopie.id);
  }, [geselecteerd, g, wijzig]);

  // Sneltoetsen (niet als je in een veld typt of een venster open is).
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      if (venster || (doel && (doel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName)))) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const fps = project?.fps ?? 30;
      if (e.key === " ") {
        e.preventDefault();
        speelPauzeer();
      } else if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) opnieuw();
        else ongedaan();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        opnieuw();
      } else if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dupliceerNu();
      } else if ((!ctrl && e.key.toLowerCase() === "s") || (ctrl && e.key.toLowerCase() === "b")) {
        e.preventDefault();
        knipNu();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        verwijder();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const stap = e.shiftKey ? 1 : 1 / fps;
        zoek((spelerRef.current?.tijd ?? 0) + (e.key === "ArrowLeft" ? -stap : stap));
      } else if (e.key === "Home") zoek(0);
      else if (e.key === "End" && project) zoek(projectDuur(project));
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [venster, project, speelPauzeer, opnieuw, ongedaan, dupliceerNu, knipNu, verwijder, zoek]);

  // Gekozen tekst of beeld verschuiven door op het voorbeeld te slepen.
  const canvasSleep = useRef<{ x0: number; y0: number; clip: Clip; w: number; h: number } | null>(null);
  const opCanvasOmlaag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!geselecteerd || geselecteerd.soort === "audio") return;
    const r = e.currentTarget.getBoundingClientRect();
    // Het beeld zelf (object-fit: contain) binnen het canvas-vak.
    const verh = e.currentTarget.width / e.currentTarget.height;
    const w = Math.min(r.width, r.height * verh);
    const h = w / verh;
    canvasSleep.current = { x0: e.clientX, y0: e.clientY, clip: geselecteerd, w, h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const opCanvasBeweeg = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = canvasSleep.current;
    if (!s) return;
    const dx = (e.clientX - s.x0) / s.w;
    const dy = (e.clientY - s.y0) / s.h;
    const c = s.clip;
    if (c.soort === "tekst") wijzig((p) => vervangClip(p, { ...c, x: rond(klem(c.x + dx, 0, 1)), y: rond(klem(c.y + dy, 0, 1)) }), "canvas");
    else if (c.soort !== "audio") {
      // met sleutelbeelden verschuift het sleutelbeeld op de afspeelkop (zetStand), anders de hele clip
      const pl = standOp(c, tijd).plaatsing;
      wijzig((p) => vervangClip(p, zetStand(c, tijd, { x: rond(klem(pl.x + dx * 2, -2, 2)), y: rond(klem(pl.y + dy * 2, -2, 2)) })), "canvas");
    }
  };
  const opCanvasLos = () => {
    canvasSleep.current = null;
  };

  async function aiBewerk(clip: BeeldClip, instructie: string) {
    if (!project) return;
    const { item, adres } = await postJson<{ item: VideoBestand; adres: string }>("/api/admin/video/foto", { prompt: instructie, formaat: project.formaat, bron: clip.bron }, "Bewerken lukte niet.");
    wijzig((p) => vervangClip(p, { ...clip, bron: adres, naam: item.naam }));
    await vernieuwBestanden();
    meld("De foto is bewerkt. Ongedaan maken kan met Ctrl+Z.");
  }

  /** Een foto-clip vervangen door de bewegende versie (zelfde plek en lengte). */
  const zetOmNaarVideo = useCallback(
    (id: string, item: VideoBestand, bronDuur: number) => {
      wijzig((p) => {
        const c = p.clips.find((x) => x.id === id);
        if (!c || c.soort === "tekst" || c.soort === "audio") return p;
        // LTX maakt er eigen omgevingsgeluid bij; naast een stem of muziek staat dat standaard uit.
        const heeftGeluid = p.clips.some((x) => x.soort === "audio");
        return vervangClip(p, { ...c, soort: "video", bron: bestandAdres(item.id), naam: `${c.naam} (bewegend)`.slice(0, 80), inpunt: 0, bronDuur, duur: Math.min(c.duur, bronDuur), beweging: "geen", volume: heeftGeluid ? 0 : 1 });
      });
    },
    [wijzig],
  );

  async function aiBeweeg(clip: BeeldClip, omschrijving: string) {
    if (!project) return;
    const duur = Math.min(10, Math.max(2, Math.ceil(clip.duur)));
    const item = await maakGratisClip({ omschrijving, duur, formaat: project.formaat, kwaliteit: "scherp", fotoBron: clip.bron });
    zetOmNaarVideo(clip.id, item, item.duur ?? duur);
    await vernieuwBestanden();
    meld("De foto beweegt nu. Ongedaan maken kan met Ctrl+Z.");
  }

  /** Ondertitels uit de spraak van een video- of geluidsclip (eigen Whisper, gratis), als één stap in de geschiedenis. */
  async function maakOndertitels(clip: BeeldClip | AudioClip, taal: string) {
    if (!project) return;
    if (!ondertitelSpoor(project)) throw new Error("Er is geen tekstspoor voor de ondertitels.");
    const { tekst, woorden } = await woordenVan(clip.bron, taal);
    const staand = FORMATEN[project.formaat].h > FORMATEN[project.formaat].w;
    const perRegel = staand ? 4 : 6;
    const regelsVoor = (c: BeeldClip | AudioClip): SpraakRegel[] => {
      const r = spraakRegels(woorden, c, { maxWoorden: perRegel });
      // zonder woordtijden (een andere spraakherkenning): de tekst gelijk over de clip verdeeld
      return r.length || !tekst.trim() ? r : ondertitels(tekst, c.start, c.duur, perRegel).map((x) => ({ ...x, woordTijden: [] }));
    };
    const eerst = regelsVoor(clip);
    if (!eerst.length) throw new Error("In deze clip is geen spraak gehoord.");
    wijzig((p) => {
      // de clip zoals hij nu staat: hij kan tijdens het luisteren verschoven of ingekort zijn
      const nu = p.clips.find((c) => c.id === clip.id);
      const bron = nu && (nu.soort === "video" || nu.soort === "audio") ? nu : clip;
      const spoor = ondertitelSpoor(p);
      return spoor ? metSpraakOndertitels(p, spoor, bron, bron === clip ? eerst : regelsVoor(bron)) : p;
    });
    meld(`${eerst.length} ondertitels gemaakt. Elke regel blijft aan te passen; ongedaan maken kan met Ctrl+Z.`);
  }

  /** Stiltes uit een video- of geluidsclip halen (op de woordtijden van de spraak); alles erna schuift aan. */
  async function haalStiltesWeg(clip: BeeldClip | AudioClip, taal: string, minStilte: number) {
    if (!project) return;
    const { woorden } = await woordenVan(clip.bron, taal);
    if (!woorden.length) throw new Error("In deze clip is geen spraak gehoord; dan valt er niets weg te halen.");
    const stukkenVoor = (c: BeeldClip | AudioClip) => spraakStukken(woorden, { van: c.inpunt, tot: c.inpunt + c.duur * (c.snelheid || 1) }, { minStilte });
    const proef = knipStiltesWeg(project, clip.id, stukkenVoor(clip));
    if (!proef.weg) {
      meld(`Geen stiltes gevonden die langer zijn dan ${String(minStilte).replace(".", ",")} s.`);
      return;
    }
    wijzig((p) => {
      // de clip zoals hij nu staat: hij kan tijdens het luisteren verschoven of ingekort zijn
      const nu = p.clips.find((c) => c.id === clip.id);
      return nu && (nu.soort === "video" || nu.soort === "audio") ? knipStiltesWeg(p, nu.id, stukkenVoor(nu)).project : p;
    });
    meld(`${proef.stiltes} ${proef.stiltes === 1 ? "stilte" : "stiltes"} weggehaald; het geheel is ${proef.weg.toFixed(1).replace(".", ",")} s korter. Ongedaan maken kan met Ctrl+Z.`);
  }

  /** Eigen muziek componeren en onder een net gemaakt project zetten. */
  async function zetMuziekOnder(p: Project, stemming: Stemming) {
    try {
      const lengte = Math.ceil(projectDuur(p) + 0.5);
      const wav = await maakMuziek(stemming, lengte);
      const item = await uploadBestand(wav, `Muziek ${p.naam}`.slice(0, 80), "muziek", lengte);
      const clip = nieuweAudioClip({ spoor: "s-muziek", start: 0, duur: lengte, bron: `/api/admin/video/bestand/${item.id}`, bronDuur: lengte, naam: "Muziek", rol: "muziek", volume: 0.5, vervagenIn: 0.5, vervagenUit: 1.8 });
      // Als eerste stap in de geschiedenis van het nieuwe project.
      setG((h) => (h && h.nu.id === p.id ? { ...h, nu: { ...h.nu, clips: [...h.nu.clips, clip], bijgewerkt: new Date().toISOString() }, op: Date.now() } : h));
      await vernieuwBestanden();
    } catch {
      meld("De muziek kon niet gemaakt worden; voeg hem toe via het tabblad Muziek.", "fout");
    }
  }

  async function tekstVideoKlaar(p: Project, muziek: Stemming | null) {
    try {
      await bewaarProject(p);
    } catch {
      /* wordt bij de eerste wijziging opnieuw geprobeerd */
    }
    openProject(p);
    setVenster(null);
    if (muziek) await zetMuziekOnder(p, muziek);
    meld("Je tekstvideo staat klaar. Druk op afspelen; elke tekst, kleur en tijd blijft aan te passen.");
  }

  async function aiKlaar(p: Project, keuze: AiVideoKeuze, meldingen: string[]) {
    openProject(p);
    setVenster(null);
    setAiMeldingen(meldingen);
    await vernieuwBestanden();
    if (keuze.muziek) await zetMuziekOnder(p, keuze.muziek);
    meld(keuze.bewegend ? "Je AI-video staat klaar. Het openingsshot wordt nu een echte bewegende video (1 tot 3 minuten); je kunt intussen verder." : "Je AI-video staat klaar. Druk op afspelen, pas aan wat je wilt en exporteer.");
    if (keuze.bewegend) {
      const eerste = p.clips.filter((c): c is BeeldClip => c.soort === "foto" && c.spoor === "s-beeld").sort((a, b) => a.start - b.start)[0];
      if (eerste) {
        const duur = Math.min(10, Math.max(2, Math.ceil(eerste.duur)));
        void maakGratisClip({ omschrijving: `${eerste.naam}. ${keuze.onderwerp}`, duur, formaat: p.formaat, kwaliteit: "scherp", fotoBron: eerste.bron })
          .then(async (item) => {
            zetOmNaarVideo(eerste.id, item, item.duur ?? duur);
            await vernieuwBestanden();
            meld("Het openingsshot beweegt nu echt. Druk op afspelen.");
          })
          .catch((err: Error) => meld(`Het bewegende openingsshot lukte niet: ${err.message}`, "fout"));
      }
    }
  }

  async function nieuwProject(formaat: Project["formaat"]) {
    const p = leegProject("Nieuwe video", formaat);
    try {
      await bewaarProject(p);
    } catch {
      /* wordt bij de eerste wijziging opnieuw geprobeerd */
    }
    openProject(p);
    setVenster(null);
  }

  async function toonProjecten() {
    setVenster("projecten");
    try {
      setProjecten(await haalProjecten());
    } catch (err) {
      meld((err as Error).message, "fout");
    }
  }

  const duur = project ? projectDuur(project) : 1;
  const maat = project ? FORMATEN[project.formaat] : FORMATEN["9:16"];

  return (
    <div className="space-y-3">
      <PageHead
        title="Video-editor"
        subtitle="Monteer video's zoals in CapCut: sporen, knippen, overgangen, filters, tekst, muziek en ondertiteling. Of laat de AI in één klik een hele video maken."
        meta={
          opslag ? (
            <Pill tone={opslag.status === "fout" ? "crit" : opslag.status === "bezig" ? "plan" : "ok"}>
              {opslag.status === "fout" ? "Niet opgeslagen" : opslag.status === "bezig" ? "Opslaan…" : `Opgeslagen ${opslag.op ? klokTijd(opslag.op) : ""}`}
            </Pill>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button" onClick={() => void toonProjecten()}>Projecten</button>
            <button type="button" className="a-button" onClick={() => setVenster("tekstvideo")}>Tekstvideo</button>
            <button type="button" className="a-button" onClick={() => setVenster("ai")}>✨ Video met AI</button>
            <button type="button" className="a-button a-button-primary" onClick={() => setVenster("export")} disabled={!project || project.clips.length === 0}>Exporteren</button>
          </div>
        }
      />

      {laadFout && <Notice tone="warn">{laadFout} Je werkt nu in een nieuw project.</Notice>}
      {aiMeldingen.length > 0 && (
        <Notice tone="warn">
          <span className="block font-medium">Over je AI-video:</span>
          {aiMeldingen.map((m) => (
            <span key={m} className="block">{m}</span>
          ))}
          <button type="button" className="a-button mt-1 text-xs" onClick={() => setAiMeldingen([])}>Begrepen</button>
        </Notice>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(250px,310px)]">
        <section aria-label="Bibliotheek" className="order-2 rounded-lg p-2.5 lg:order-1" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", height: "min(70vh, 640px)" }}>
          <Bibliotheek
            bestanden={bestanden}
            ai={ai}
            formaat={project?.formaat ?? "9:16"}
            projectDuur={duur}
            onVernieuw={vernieuwBestanden}
            onToevoegen={(d) => toevoegen(d)}
            onMelding={meld}
            onAiVideo={() => setVenster("ai")}
            onTekstVideo={() => setVenster("tekstvideo")}
          />
        </section>

        <section aria-label="Voorbeeld" className="order-1 flex min-w-0 flex-col rounded-lg lg:order-2" style={{ background: "#0b0f0e", border: "1px solid var(--a-border)" }}>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <canvas
              ref={canvasRef}
              className="block w-full touch-none"
              style={{ height: "min(56vh, 560px)", objectFit: "contain", cursor: geselecteerd && geselecteerd.soort !== "audio" ? "move" : "default" }}
              onPointerDown={opCanvasOmlaag}
              onPointerMove={opCanvasBeweeg}
              onPointerUp={opCanvasLos}
              onPointerCancel={opCanvasLos}
              aria-label={`Voorbeeld van de video, ${maat.w} bij ${maat.h}`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-2 pb-2.5 text-white">
            <button type="button" className="rounded-md px-2 py-1.5 text-sm hover:bg-white/10" onClick={() => zoek(0)} aria-label="Naar het begin">⏮</button>
            <button type="button" className="rounded-md px-2 py-1.5 text-sm hover:bg-white/10" onClick={() => zoek(tijd - 1 / (project?.fps ?? 30))} aria-label="Eén beeldje terug">◀︎</button>
            <button type="button" className="rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: "#4FE0A0", color: "#06261F" }} onClick={speelPauzeer} aria-label={speelt ? "Pauzeren" : "Afspelen"}>
              {speelt ? "❚❚ Pauze" : "▶ Afspelen"}
            </button>
            <button type="button" className="rounded-md px-2 py-1.5 text-sm hover:bg-white/10" onClick={() => zoek(tijd + 1 / (project?.fps ?? 30))} aria-label="Eén beeldje verder">▶︎</button>
            <span className="ml-1 font-mono text-xs text-white/70">
              {tijdTekst(tijd, true)} / {tijdTekst(duur)}
            </span>
          </div>
        </section>

        <section aria-label="Eigenschappen" className="order-3 overflow-y-auto rounded-lg p-3" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", height: "min(70vh, 640px)" }}>
          <p className="mb-2 text-[0.8125rem] font-semibold" style={{ color: "var(--a-text)" }}>
            {geselecteerd ? (geselecteerd.soort === "tekst" ? "Tekst" : geselecteerd.soort === "audio" ? "Geluid" : geselecteerd.soort === "video" ? "Video" : geselecteerd.soort === "foto" ? "Foto" : "Kleurvlak") : "Project"}
          </p>
          {project && (
            <Eigenschappen
              project={project}
              clip={geselecteerd}
              onClip={(c, sleutel) => wijzig((p) => vervangClip(p, c), sleutel ? `${c.id}:${sleutel}` : undefined)}
              onProject={(deel, sleutel) => wijzig((p) => ({ ...p, ...deel }), sleutel ? `project:${sleutel}` : undefined)}
              onAiBewerk={aiBewerk}
              onAiBeweeg={aiBeweeg}
              onOndertitels={maakOndertitels}
              onStiltes={haalStiltesWeg}
              aiBeeld={Boolean(ai?.beeld)}
              tijd={tijd}
            />
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="a-button text-xs" onClick={knipNu} title="Knippen op de afspeelkop (S)">✂ Knippen</button>
        <button type="button" className="a-button text-xs" onClick={dupliceerNu} disabled={!geselecteerd} title="Dupliceren (Ctrl+D)">⧉ Dupliceren</button>
        <button type="button" className="a-button text-xs" onClick={verwijder} disabled={!geselecteerd} title="Verwijderen (Delete)">🗑 Verwijderen</button>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--a-border)" }} aria-hidden="true" />
        <button type="button" className="a-button text-xs" onClick={ongedaan} disabled={!g?.verleden.length} title="Ongedaan maken (Ctrl+Z)">↶ Ongedaan</button>
        <button type="button" className="a-button text-xs" onClick={opnieuw} disabled={!g?.toekomst.length} title="Opnieuw (Ctrl+Shift+Z)">↷ Opnieuw</button>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--a-border)" }} aria-hidden="true" />
        <button type="button" className={`a-button text-xs ${magneetAan ? "a-button-primary" : ""}`} onClick={() => setMagneetAan((m) => !m)} aria-pressed={magneetAan} title="Clips klikken tegen elkaar aan">🧲 Magneet</button>
        <label className="ml-auto flex items-center gap-2 text-[0.75rem]" style={{ color: "var(--a-mute)" }}>
          Zoom
          <input type="range" min={6} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ accentColor: "var(--a-accent)" }} />
        </label>
        <button type="button" className="a-button text-xs" onClick={() => setZoom(Math.max(6, Math.min(200, Math.floor(900 / Math.max(5, duur)))))}>Passend</button>
      </div>

      {project && (
        <Tijdlijn
          project={project}
          tijd={tijd}
          speelt={speelt}
          zoom={zoom}
          selectie={selectie}
          magneetAan={magneetAan}
          onSelecteer={setSelectie}
          onZoek={zoek}
          onWijzig={(fn) => wijzig(fn)}
          onNeerzetten={(d, spoor, t) => toevoegen(d, spoor, t)}
          onSpoor={(id, deel) => wijzig((p) => ({ ...p, sporen: p.sporen.map((s) => (s.id === id ? { ...s, ...deel } : s)) }))}
          onSpoorErbij={(soort: SpoorSoort) =>
            wijzig((p) => {
              const naam = soort === "beeld" ? "Beeld" : soort === "tekst" ? "Tekst" : "Geluid";
              const n = p.sporen.filter((s) => s.soort === soort).length + 1;
              const nieuw = { id: nieuwId("s"), soort, naam: `${naam} ${n}` };
              // Beeldsporen boven de bestaande beeldsporen, de rest achteraan in hun groep.
              const laatste = p.sporen.map((s) => s.soort).lastIndexOf(soort);
              const sporen = [...p.sporen];
              sporen.splice(laatste + 1, 0, nieuw);
              return { ...p, sporen };
            })
          }
        />
      )}

      {melding && (
        <div role={melding.soort === "fout" ? "alert" : "status"} className="fixed bottom-4 left-1/2 z-[90] max-w-[92vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-[0.8125rem] shadow-lg" style={{ background: melding.soort === "fout" ? "var(--a-crit)" : "#06261F", color: "#fff" }}>
          {melding.tekst}
        </div>
      )}

      {venster === "ai" && <AiVideo ai={ai} onSluit={() => setVenster(null)} onKlaar={aiKlaar} />}
      {venster === "tekstvideo" && <TekstVideo onSluit={() => setVenster(null)} onKlaar={tekstVideoKlaar} />}
      {venster === "export" && project && <Export project={project} speler={speler} duur={duur} onSluit={() => setVenster(null)} onMelding={meld} onBewaard={vernieuwBestanden} />}
      {venster === "projecten" && (
        <Venster titel="Projecten" onSluit={() => setVenster(null)} breed>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FORMATEN) as Project["formaat"][]).map((f) => (
                <button key={f} type="button" className="a-button text-xs" onClick={() => void nieuwProject(f)}>
                  + Nieuw {f}
                </button>
              ))}
            </div>
            {projecten === null ? (
              <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Laden…</p>
            ) : projecten.length === 0 ? (
              <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Nog geen opgeslagen projecten.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
                {projecten.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md" style={{ background: "#10221d" }}>
                      {p.voorbeeld && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.voorbeeld} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{p.naam}{p.id === project?.id ? " (open)" : ""}</p>
                      <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
                        {p.formaat}, {tijdTekst(p.duur)}, {p.clips} clips, {datumTijd(p.bijgewerkt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="a-button text-xs"
                      onClick={async () => {
                        try {
                          openProject(await haalProject(p.id));
                          setVenster(null);
                        } catch (err) {
                          meld((err as Error).message, "fout");
                        }
                      }}
                    >
                      Openen
                    </button>
                    <button
                      type="button"
                      className="a-button text-xs"
                      style={{ color: "var(--a-crit)" }}
                      onClick={async () => {
                        if (!window.confirm(`"${p.naam}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
                        try {
                          await verwijderProject(p.id);
                          setProjecten((l) => (l ?? []).filter((x) => x.id !== p.id));
                          if (p.id === project?.id) openProject(leegProject());
                        } catch (err) {
                          meld((err as Error).message, "fout");
                        }
                      }}
                    >
                      Verwijderen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Venster>
      )}
    </div>
  );
}
