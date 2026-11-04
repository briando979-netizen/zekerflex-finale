import { bronTijd, clipsOpSpoor, einde, muziekDemping, projectDuur, vervaagFactor, type AudioClip, type BeeldClip, type Project } from "@/lib/video/model";
import { canvasMaat, tekenFrame, type Bronnen } from "@/lib/video/teken";

// ---------------------------------------------------------------------------
// De speler van de video-editor: houdt video- en audio-elementen synchroon met
// de tijdlijn, mengt het geluid via Web Audio (volume, in-/uitvagen, muziek
// zachter onder de stem) en tekent elk beeldje via lib/video/teken.ts. De
// export speelt het project in echte tijd af en neemt canvas + geluid op met
// MediaRecorder: MP4 waar de browser dat kan (Chrome, Edge, Safari), anders WebM.
// Alleen in de browser gebruiken.
// ---------------------------------------------------------------------------

export interface OpnameFormaat {
  mime: string;
  ext: "mp4" | "webm";
}

export function kiesOpnameFormaat(): OpnameFormaat | null {
  if (typeof MediaRecorder === "undefined") return null;
  const kandidaten: OpnameFormaat[] = [
    { mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  return kandidaten.find((k) => MediaRecorder.isTypeSupported(k.mime)) ?? null;
}

type MediaClip = BeeldClip | AudioClip;

interface MediaPost {
  el: HTMLMediaElement;
  bron: string;
  gain: GainNode | null;
}

export class Speler {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: Project;
  tijd = 0;
  speelt = false;
  private fotos = new Map<string, HTMLImageElement>();
  private media = new Map<string, MediaPost>();
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private opname: MediaStreamAudioDestinationNode | null = null;
  private raf = 0;
  private wall0 = 0;
  private t0 = 0;
  private eindTijd: number | null = null;
  private schaal: number;
  onTijd: ((t: number) => void) | null = null;
  onStop: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, project: Project, schaal = 0.5) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Deze browser kan geen canvas tekenen.");
    this.ctx = ctx;
    this.project = project;
    this.schaal = schaal;
    this.pasMaatAan();
    this.zetProject(project);
  }

  private pasMaatAan() {
    const { w, h } = canvasMaat(this.project, this.schaal);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private bronnen: Bronnen = {
    foto: (adres) => this.foto(adres),
    video: (id) => {
      const m = this.media.get(id);
      return m && m.el instanceof HTMLVideoElement ? m.el : null;
    },
  };

  private foto(adres: string): HTMLImageElement | null {
    if (!adres) return null;
    let img = this.fotos.get(adres);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (!this.speelt) this.teken();
      };
      img.src = adres;
      this.fotos.set(adres, img);
    }
    return img;
  }

  /** Nieuwe projectstand: media-elementen aanmaken of opruimen waar nodig. */
  zetProject(p: Project) {
    const formaatAnders = p.formaat !== this.project.formaat;
    this.project = p;
    if (formaatAnders) this.pasMaatAan();
    const nodig = new Set<string>();
    for (const c of p.clips) {
      if (c.soort === "foto") this.foto(c.bron);
      if (c.soort !== "video" && c.soort !== "audio") continue;
      nodig.add(c.id);
      const oud = this.media.get(c.id);
      if (oud && oud.bron === c.bron) continue;
      if (oud) this.ruimOp(c.id);
      const el = document.createElement(c.soort === "video" ? "video" : "audio");
      el.preload = "auto";
      el.src = c.bron;
      if (el instanceof HTMLVideoElement) {
        el.playsInline = true;
        el.muted = false;
      }
      const naTekenen = () => {
        if (!this.speelt) this.teken();
      };
      el.addEventListener("seeked", naTekenen);
      el.addEventListener("loadeddata", naTekenen);
      const post: MediaPost = { el, bron: c.bron, gain: null };
      this.media.set(c.id, post);
      this.koppelGeluid(post);
      // Eerste beeldje alvast klaarzetten.
      el.addEventListener(
        "loadedmetadata",
        () => {
          if (c.soort === "video") el.currentTime = Math.min(c.inpunt, Math.max(0, (el.duration || 0) - 0.05));
        },
        { once: true },
      );
    }
    for (const id of [...this.media.keys()]) if (!nodig.has(id)) this.ruimOp(id);
    if (!this.speelt) this.zoek(this.tijd);
  }

  private ruimOp(id: string) {
    const m = this.media.get(id);
    if (!m) return;
    m.el.pause();
    m.el.removeAttribute("src");
    m.el.load();
    m.gain?.disconnect();
    this.media.delete(id);
  }

  private koppelGeluid(post: MediaPost) {
    if (!this.ac || !this.master || post.gain) return;
    try {
      const bron = this.ac.createMediaElementSource(post.el);
      const gain = this.ac.createGain();
      gain.gain.value = 0;
      bron.connect(gain).connect(this.master);
      post.gain = gain;
    } catch {
      /* al gekoppeld */
    }
  }

  /** Web Audio pas starten na een klik (anders weigert de browser). */
  private zorgVoorGeluid() {
    if (this.ac) {
      void this.ac.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.connect(this.ac.destination);
    this.opname = this.ac.createMediaStreamDestination();
    this.master.connect(this.opname);
    for (const post of this.media.values()) this.koppelGeluid(post);
  }

  duur(): number {
    return projectDuur(this.project);
  }

  teken() {
    tekenFrame(this.ctx, this.project, this.tijd, this.bronnen);
  }

  /** Video's die op tijdstip t in beeld moeten zijn (ook de vorige bij een overgang). */
  private zichtbareVideos(t: number): Map<string, number> {
    const uit = new Map<string, number>();
    for (const spoor of this.project.sporen) {
      if (spoor.soort !== "beeld" || spoor.verborgen) continue;
      const clips = clipsOpSpoor(this.project, spoor.id);
      const i = clips.findIndex((c) => t >= c.start && t < einde(c));
      const nu = clips[i];
      if (!nu || nu.soort === "tekst" || nu.soort === "audio") continue;
      if (nu.soort === "video") uit.set(nu.id, bronTijd(nu, t));
      const vorige = clips[i - 1];
      if (vorige && vorige.soort === "video" && nu.overgang !== "geen" && t - nu.start < nu.overgangDuur && Math.abs(einde(vorige) - nu.start) < 0.05) {
        uit.set(vorige.id, bronTijd(vorige, einde(vorige) - 0.04));
      }
    }
    return uit;
  }

  private gain(c: MediaClip, t: number): number {
    const spoor = this.project.sporen.find((s) => s.id === c.spoor);
    if (!spoor || spoor.stil || (spoor.soort === "beeld" && spoor.verborgen)) return 0;
    let g = c.volume * vervaagFactor(c, t);
    if (c.soort === "audio" && c.rol === "muziek") g *= muziekDemping(this.project, t);
    return Math.max(0, g);
  }

  private sync(t: number) {
    const zichtbaar = this.zichtbareVideos(t);
    for (const c of this.project.clips) {
      if (c.soort !== "video" && c.soort !== "audio") continue;
      const post = this.media.get(c.id);
      if (!post) continue;
      const el = post.el;
      const actief = t >= c.start && t < einde(c);
      const doel = bronTijd(c, t);
      if (post.gain && this.ac) post.gain.gain.setTargetAtTime(actief ? this.gain(c, t) : 0, this.ac.currentTime, 0.015);
      if (this.speelt && actief) {
        if (el.playbackRate !== c.snelheid) el.playbackRate = c.snelheid;
        if (el.paused) {
          if (Math.abs(el.currentTime - doel) > 0.05) el.currentTime = doel;
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - doel) > 0.3) el.currentTime = doel;
        continue;
      }
      if (!el.paused) el.pause();
      const vast = zichtbaar.get(c.id);
      if (vast !== undefined && Math.abs(el.currentTime - vast) > 0.03 && el.readyState >= 1) el.currentTime = vast;
      // Wat zo begint alvast op het inpunt zetten, dan start het zonder hapering.
      if (this.speelt && !actief && c.start > t && c.start - t < 1.5 && el.readyState >= 1 && Math.abs(el.currentTime - c.inpunt) > 0.05) el.currentTime = c.inpunt;
    }
  }

  zoek(t: number) {
    this.tijd = Math.max(0, Math.min(t, this.duur()));
    if (this.speelt) {
      this.t0 = this.tijd;
      this.wall0 = performance.now();
    }
    this.sync(this.tijd);
    this.teken();
    this.onTijd?.(this.tijd);
  }

  speel(totEinde?: number) {
    if (this.speelt) return;
    this.zorgVoorGeluid();
    if (this.tijd >= this.duur() - 0.02) this.tijd = 0;
    this.eindTijd = totEinde ?? null;
    this.speelt = true;
    this.t0 = this.tijd;
    this.wall0 = performance.now();
    const lus = () => {
      if (!this.speelt) return;
      const t = this.t0 + (performance.now() - this.wall0) / 1000;
      const eind = this.eindTijd ?? this.duur();
      if (t >= eind) {
        this.tijd = eind;
        this.pauzeer();
        this.teken();
        this.onTijd?.(this.tijd);
        this.onStop?.();
        return;
      }
      this.tijd = t;
      this.sync(t);
      this.teken();
      this.onTijd?.(t);
      this.raf = requestAnimationFrame(lus);
    };
    this.sync(this.tijd);
    this.raf = requestAnimationFrame(lus);
  }

  pauzeer() {
    this.speelt = false;
    cancelAnimationFrame(this.raf);
    for (const m of this.media.values()) {
      m.el.pause();
      if (m.gain && this.ac) m.gain.gain.setTargetAtTime(0, this.ac.currentTime, 0.01);
    }
  }

  /** Wacht tot alle foto's en video's van het project geladen zijn (max. `ms`). */
  async wachtOpMedia(ms = 20_000): Promise<void> {
    const eind = Date.now() + ms;
    const klaar = () =>
      [...this.fotos.values()].every((f) => f.complete) && [...this.media.values()].every((m) => m.el.readyState >= (m.el instanceof HTMLVideoElement ? 2 : 1) || m.el.error);
    while (!klaar() && Date.now() < eind) await new Promise((r) => setTimeout(r, 150));
  }

  /**
   * Neem het hele project op (echte tijd). Geeft het bestand terug. Het
   * tabblad moet zichtbaar blijven: een browser vertraagt tekenen op de achtergrond.
   */
  async exporteer(opties: { schaal: number; formaat: OpnameFormaat; onVoortgang?: (p: number) => void; signaal?: AbortSignal }): Promise<Blob> {
    this.pauzeer();
    const oudeSchaal = this.schaal;
    this.schaal = opties.schaal;
    this.pasMaatAan();
    this.zorgVoorGeluid();
    if (this.ac?.state === "suspended") await this.ac.resume();
    this.zoek(0);
    await this.wachtOpMedia();
    this.zoek(0);
    await new Promise((r) => setTimeout(r, 300));

    const fps = this.project.fps || 30;
    const beeld = this.canvas.captureStream(fps);
    const sporen = [...beeld.getVideoTracks(), ...(this.opname?.stream.getAudioTracks() ?? [])];
    const stroom = new MediaStream(sporen);
    const pixels = this.canvas.width * this.canvas.height;
    const recorder = new MediaRecorder(stroom, {
      mimeType: opties.formaat.mime,
      videoBitsPerSecond: Math.round(Math.min(16_000_000, Math.max(3_000_000, pixels * fps * 0.12))),
      audioBitsPerSecond: 192_000,
    });
    const stukken: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) stukken.push(e.data);
    };
    const gestopt = new Promise<void>((r) => {
      recorder.onstop = () => r();
    });
    const duur = this.duur();
    const oudeOnTijd = this.onTijd;
    try {
      await new Promise<void>((klaar, mis) => {
        const afbreken = () => {
          this.pauzeer();
          mis(new DOMException("Export gestopt", "AbortError"));
        };
        if (opties.signaal?.aborted) return afbreken();
        opties.signaal?.addEventListener("abort", afbreken, { once: true });
        this.onTijd = (t) => {
          oudeOnTijd?.(t);
          opties.onVoortgang?.(Math.min(1, t / duur));
        };
        const oudeOnStop = this.onStop;
        this.onStop = () => {
          this.onStop = oudeOnStop;
          klaar();
        };
        recorder.start(250);
        this.speel(duur);
      });
      // Het laatste beeldje nog even laten opnemen.
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      if (recorder.state !== "inactive") recorder.stop();
      await gestopt;
      beeld.getTracks().forEach((t) => t.stop());
      this.onTijd = oudeOnTijd;
      this.schaal = oudeSchaal;
      this.pasMaatAan();
      this.zoek(0);
    }
    return new Blob(stukken, { type: opties.formaat.mime.split(";")[0] ?? opties.formaat.mime });
  }

  vernietig() {
    this.pauzeer();
    for (const id of [...this.media.keys()]) this.ruimOp(id);
    this.fotos.clear();
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
  }
}

/** Meet de duur (en maat) van een video- of audiobestand in de browser. */
export function meetMedia(adres: string, soort: "video" | "audio"): Promise<{ duur: number; breedte: number; hoogte: number }> {
  return new Promise((klaar, mis) => {
    const el = document.createElement(soort);
    el.preload = "metadata";
    const tijd = setTimeout(() => mis(new Error("Het bestand laadt niet.")), 20_000);
    const meld = () => {
      clearTimeout(tijd);
      const v = el instanceof HTMLVideoElement ? el : null;
      klaar({ duur: Number.isFinite(el.duration) ? el.duration : 0, breedte: v?.videoWidth ?? 0, hoogte: v?.videoHeight ?? 0 });
      el.removeAttribute("src");
    };
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return meld();
      // Opnames uit een browser (WebM) melden geen duur: ver vooruit zoeken
      // dwingt de browser het einde te bepalen.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration)) meld();
      };
      el.currentTime = 1e7;
    };
    el.onerror = () => {
      clearTimeout(tijd);
      mis(new Error("Dit bestand kan de browser niet afspelen."));
    };
    el.src = adres;
  });
}
