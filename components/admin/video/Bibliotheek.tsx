"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { STOCK_FOTOS } from "@/lib/video/stock";
import { STEMMINGEN, maakMuziek, type Stemming } from "@/lib/video/muziek";
import { meetMedia } from "@/lib/video/speler";
import type { Formaat } from "@/lib/video/model";
import { SLEEP_TYPE, type SleepData } from "@/components/admin/video/Tijdlijn";
import { TEKST_PRESETS } from "@/components/admin/video/presets";
import { Wachtrij } from "@/components/admin/video/Wachtrij";
import { bestandAdres, getJson, maakGratisClip, postJson, tijdTekst, uploadBestand, verwijderBestand, zetBestandInfo, type AiStatus, type VideoBestand } from "@/components/admin/video/api";

type Tab = "media" | "fotos" | "tekst" | "muziek" | "ai";

interface Props {
  bestanden: VideoBestand[];
  ai: AiStatus | null;
  formaat: Formaat;
  projectDuur: number;
  onVernieuw: () => Promise<void>;
  onToevoegen: (data: SleepData) => void;
  onMelding: (tekst: string, soort?: "ok" | "fout") => void;
  onAiVideo: () => void;
}

interface SiteMedia {
  id: string;
  soort: "foto" | "video";
  naam: string;
}

function sleepStart(e: DragEvent, data: SleepData) {
  e.dataTransfer.setData(SLEEP_TYPE, JSON.stringify(data));
  e.dataTransfer.effectAllowed = "copy";
}

function bestandData(b: VideoBestand): SleepData {
  return {
    soort: b.soort,
    bron: bestandAdres(b.id),
    naam: b.naam,
    ...(b.duur ? { duur: b.duur } : {}),
    ...(b.herkomst === "ai-stem" || b.herkomst === "opname" ? { rol: "stem" as const } : b.herkomst === "muziek" ? { rol: "muziek" as const } : {}),
  };
}

const TABS: { id: Tab; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "fotos", label: "Foto's" },
  { id: "tekst", label: "Tekst" },
  { id: "muziek", label: "Muziek" },
  { id: "ai", label: "AI" },
];

export function Bibliotheek({ bestanden, ai, formaat, projectDuur, onVernieuw, onToevoegen, onMelding, onAiVideo }: Props) {
  const [tab, setTab] = useState<Tab>("media");
  const [bezig, setBezig] = useState<string | null>(null);
  const [siteMedia, setSiteMedia] = useState<SiteMedia[] | null>(null);
  const [stemming, setStemming] = useState<Stemming>("vrolijk");
  const [fotoPrompt, setFotoPrompt] = useState("");
  const [fotoModel, setFotoModel] = useState<"gemini-3.1-flash-image" | "gemini-3-pro-image">("gemini-3.1-flash-image");
  const [fotoGrootte, setFotoGrootte] = useState<"1K" | "2K" | "4K">("2K");
  const [stemTekst, setStemTekst] = useState("");
  const [stemNaam, setStemNaam] = useState("Kore");
  const [clipPrompt, setClipPrompt] = useState("");
  const [gratisPrompt, setGratisPrompt] = useState("");
  const [gratisDuur, setGratisDuur] = useState(5);
  const [gratisKwaliteit, setGratisKwaliteit] = useState<"snel" | "scherp">("scherp");
  const [opname, setOpname] = useState<MediaRecorder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== "fotos" || siteMedia) return;
    getJson<{ media: SiteMedia[] }>("/api/admin/ontwerp/media", "")
      .then((d) => setSiteMedia(d.media))
      .catch(() => setSiteMedia([]));
  }, [tab, siteMedia]);

  async function metDuur(item: VideoBestand): Promise<VideoBestand> {
    if (item.soort === "foto" || (item.duur && item.duur > 0)) return item;
    try {
      const m = await meetMedia(bestandAdres(item.id), item.soort);
      if (m.duur > 0) return await zetBestandInfo(item.id, { duur: m.duur, ...(m.breedte ? { breedte: m.breedte, hoogte: m.hoogte } : {}) });
    } catch {
      /* duur blijft onbekend; de clip krijgt dan 5 seconden */
    }
    return item;
  }

  async function upload(files: FileList | File[]) {
    const lijst = [...files];
    if (!lijst.length) return;
    setBezig(`${lijst.length === 1 ? "Bestand" : `${lijst.length} bestanden`} uploaden…`);
    try {
      for (const f of lijst) {
        const item = await metDuur(await uploadBestand(f, f.name));
        onMelding(`${item.naam} staat bij je media.`);
      }
      await onVernieuw();
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBezig(null);
    }
  }

  async function weg(b: VideoBestand) {
    if (!window.confirm(`"${b.naam}" verwijderen? Clips die dit bestand gebruiken tonen dan niets meer.`)) return;
    try {
      await verwijderBestand(b.id);
      await onVernieuw();
    } catch (err) {
      onMelding((err as Error).message, "fout");
    }
  }

  async function neemOp() {
    if (opname) {
      opname.stop();
      return;
    }
    try {
      const stroom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stroom, mime ? { mimeType: mime } : undefined);
      const stukken: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) stukken.push(e.data);
      };
      rec.onstop = async () => {
        stroom.getTracks().forEach((t) => t.stop());
        setOpname(null);
        const blob = new Blob(stukken, { type: (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm" });
        setBezig("Opname bewaren…");
        try {
          const item = await metDuur(await uploadBestand(blob, "Eigen stem", "opname"));
          await onVernieuw();
          onToevoegen(bestandData(item));
          onMelding("Je opname staat op het stemspoor.");
        } catch (err) {
          onMelding((err as Error).message, "fout");
        } finally {
          setBezig(null);
        }
      };
      rec.start(250);
      setOpname(rec);
    } catch {
      onMelding("De microfoon mag niet worden gebruikt. Sta hem toe in je browser.", "fout");
    }
  }

  async function componeer() {
    setBezig("Muziek componeren…");
    try {
      const lengte = Math.ceil(projectDuur + 1);
      const wav = await maakMuziek(stemming, lengte);
      const naam = `Muziek ${STEMMINGEN.find((s) => s.id === stemming)?.label ?? ""}`.trim();
      const item = await uploadBestand(wav, naam, "muziek", lengte);
      await onVernieuw();
      onToevoegen({ ...bestandData(item), duur: lengte, start: 0 });
      onMelding("Muziek staat onder je video. Hij gaat vanzelf zachter onder de stem.");
    } catch (err) {
      onMelding((err as Error).message || "Muziek maken lukte niet.", "fout");
    } finally {
      setBezig(null);
    }
  }

  async function aiFoto() {
    setBezig("AI maakt je foto… (10 tot 40 seconden)");
    try {
      const { item } = await postJson<{ item: VideoBestand }>("/api/admin/video/foto", { prompt: fotoPrompt, formaat, model: fotoModel, grootte: fotoGrootte }, "De foto kon niet gemaakt worden.");
      await onVernieuw();
      onToevoegen(bestandData(item));
      onMelding("AI-foto staat op de tijdlijn.");
      setFotoPrompt("");
    } catch (err) {
      onMelding((err as Error).message, "fout");
      await onVernieuw();
    } finally {
      setBezig(null);
    }
  }

  async function aiStem() {
    setBezig("AI spreekt de tekst in…");
    try {
      const { item } = await postJson<{ item: VideoBestand }>("/api/admin/video/stem", { tekst: stemTekst, stem: stemNaam }, "Inspreken lukte niet.");
      const metD = await metDuur(item);
      await onVernieuw();
      onToevoegen(bestandData(metD));
      onMelding("De stem staat op het stemspoor.");
      setStemTekst("");
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBezig(null);
    }
  }

  async function gratisClip() {
    setBezig("Gratis AI-clip wordt gemaakt op de videokaarten van Lightricks… (meestal 1 tot 3 minuten)");
    try {
      const item = await maakGratisClip({ omschrijving: gratisPrompt, duur: gratisDuur, formaat, kwaliteit: gratisKwaliteit }, (s) =>
        setBezig(`Gratis AI-clip wordt gemaakt… ${tijdTekst(s)} (meestal 1 tot 3 minuten). Je kunt intussen verder werken.`),
      );
      const metD = await metDuur(item);
      await onVernieuw();
      onToevoegen(bestandData(metD));
      onMelding("Je gratis AI-clip staat op de tijdlijn.");
      setGratisPrompt("");
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBezig(null);
    }
  }

  async function aiClip() {
    setBezig("Veo start je videoclip…");
    try {
      const { operatie } = await postJson<{ operatie: string }>("/api/admin/video/clip", { prompt: clipPrompt, verhouding: formaat === "16:9" ? "16:9" : "9:16" }, "De clip kon niet gestart worden.");
      const eind = Date.now() + 8 * 60_000;
      while (Date.now() < eind) {
        await new Promise((r) => setTimeout(r, 8000));
        setBezig(`Veo maakt je clip… (${Math.round((eind - Date.now()) / 60_000)} min over, meestal 1 tot 3 minuten)`);
        const st = await getJson<{ klaar: boolean; item?: VideoBestand }>(`/api/admin/video/clip?op=${encodeURIComponent(operatie)}&naam=${encodeURIComponent(clipPrompt.slice(0, 40))}`, "De clip kon niet opgehaald worden.");
        if (st.klaar && st.item) {
          const metD = await metDuur(st.item);
          await onVernieuw();
          onToevoegen(bestandData(metD));
          onMelding("Je AI-clip staat op de tijdlijn.");
          setClipPrompt("");
          return;
        }
      }
      onMelding("De clip duurde te lang. Kijk zo bij je media, hij komt er vaak alsnog bij.", "fout");
    } catch (err) {
      onMelding((err as Error).message, "fout");
      await onVernieuw();
    } finally {
      setBezig(null);
    }
  }

  const beeldAi = ai?.beeld ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Bibliotheek" className="grid grid-cols-5 gap-0.5 rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="rounded-md px-1 py-1.5 text-[0.6875rem] font-medium" style={tab === t.id ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {bezig && (
        <p role="status" className="mt-2 rounded-md px-2 py-1.5 text-[0.75rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {bezig}
        </p>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {tab === "media" && (
          <div
            className="space-y-2"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              void upload(e.dataTransfer.files);
            }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className="a-button a-button-primary text-xs" onClick={() => inputRef.current?.click()} disabled={Boolean(bezig)}>
                Uploaden
              </button>
              <button type="button" className="a-button text-xs" onClick={() => void neemOp()} aria-pressed={Boolean(opname)} style={opname ? { color: "var(--a-crit)" } : undefined}>
                {opname ? "● Stop opname" : "Stem opnemen"}
              </button>
            </div>
            <input ref={inputRef} type="file" multiple hidden accept="image/*,video/mp4,video/webm,video/quicktime,audio/*" onChange={(e) => e.target.files && void upload(e.target.files)} />
            <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Sleep foto&apos;s, video&apos;s of muziek hierheen, of naar de tijdlijn. Tot 200 MB per bestand.</p>
            {bestanden.length === 0 ? (
              <p className="rounded-lg p-4 text-center text-[0.75rem]" style={{ border: "1px dashed var(--a-border)", color: "var(--a-mute)" }}>
                Nog geen eigen media.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5">
                {bestanden.map((b) => (
                  <li key={b.id} className="group relative overflow-hidden rounded-md" style={{ border: "1px solid var(--a-border)", background: "var(--a-panel-2)" }}>
                    <button type="button" draggable onDragStart={(e) => sleepStart(e, bestandData(b))} onClick={() => onToevoegen(bestandData(b))} className="block w-full text-left" title={`${b.naam}: klik om toe te voegen op de afspeelkop`}>
                      <div className="flex aspect-video items-center justify-center overflow-hidden" style={{ background: "#10221d" }}>
                        {b.soort === "foto" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={bestandAdres(b.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-[1.25rem]" aria-hidden="true">{b.soort === "video" ? "🎬" : b.herkomst === "muziek" ? "🎵" : "🎙️"}</span>
                        )}
                      </div>
                      <div className="px-1.5 py-1">
                        <p className="truncate text-[0.6875rem] font-medium" style={{ color: "var(--a-text)" }}>{b.naam}</p>
                        <p className="text-[0.625rem]" style={{ color: "var(--a-mute)" }}>
                          {b.soort === "foto" ? "Foto" : b.soort === "video" ? "Video" : "Geluid"}
                          {b.duur ? `, ${tijdTekst(b.duur)}` : ""}
                          {b.herkomst.startsWith("ai") ? ", AI" : ""}
                        </p>
                      </div>
                    </button>
                    <button type="button" onClick={() => void weg(b)} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-[0.625rem] text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" aria-label={`${b.naam} verwijderen`}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "fotos" && (
          <div className="space-y-3">
            <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Eigen foto&apos;s met vrije licentie. Klik of sleep naar de tijdlijn.</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {STOCK_FOTOS.map((f) => (
                <li key={f.adres}>
                  <button type="button" draggable onDragStart={(e) => sleepStart(e, { soort: "foto", bron: f.adres, naam: f.naam })} onClick={() => onToevoegen({ soort: "foto", bron: f.adres, naam: f.naam })} className="block w-full overflow-hidden rounded-md text-left" style={{ border: "1px solid var(--a-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.adres} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                    <span className="block truncate px-1.5 py-1 text-[0.6875rem]" style={{ color: "var(--a-text)" }}>{f.naam}</span>
                  </button>
                </li>
              ))}
            </ul>
            {siteMedia && siteMedia.length > 0 && (
              <>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>Uit de Site-ontwerper</p>
                <ul className="grid grid-cols-2 gap-1.5">
                  {siteMedia.map((m) => {
                    const data: SleepData = { soort: m.soort, bron: `/beeld/${m.id}`, naam: m.naam };
                    return (
                      <li key={m.id}>
                        <button type="button" draggable onDragStart={(e) => sleepStart(e, data)} onClick={() => onToevoegen(data)} className="block w-full overflow-hidden rounded-md text-left" style={{ border: "1px solid var(--a-border)" }}>
                          {m.soort === "foto" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/beeld/${m.id}?klein=1`} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex aspect-video items-center justify-center text-xl" style={{ background: "#10221d" }} aria-hidden="true">🎬</span>
                          )}
                          <span className="block truncate px-1.5 py-1 text-[0.6875rem]" style={{ color: "var(--a-text)" }}>{m.naam}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === "tekst" && (
          <div className="space-y-1.5">
            {TEKST_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                draggable
                onDragStart={(e) => sleepStart(e, { soort: "tekst", preset: p.id })}
                onClick={() => onToevoegen({ soort: "tekst", preset: p.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left"
                style={{ background: "#10221d", border: "1px solid var(--a-border)" }}
              >
                <span
                  className="truncate"
                  style={{
                    fontFamily: `"${p.instelling.lettertype ?? "Bricolage Grotesque"}", sans-serif`,
                    fontWeight: p.instelling.vet === false ? 500 : 700,
                    color: p.instelling.kleur ?? "#fff",
                    background: p.instelling.achtergrond || undefined,
                    padding: p.instelling.achtergrond ? "1px 6px" : undefined,
                    borderRadius: 4,
                    textShadow: p.instelling.stijl === "neon" ? `0 0 8px ${p.instelling.kleur}` : "0 1px 3px rgba(0,0,0,.7)",
                  }}
                >
                  {p.voorbeeld}
                </span>
                <span className="text-[0.625rem]" style={{ color: "#9fb8b0" }}>{p.label}</span>
              </button>
            ))}
            <button type="button" draggable onDragStart={(e) => sleepStart(e, { soort: "kleur", naam: "Kleurvlak" })} onClick={() => onToevoegen({ soort: "kleur", naam: "Kleurvlak" })} className="a-button w-full text-xs">
              + Kleurvlak (achtergrond of eindbeeld)
            </button>
          </div>
        )}

        {tab === "muziek" && (
          <div className="space-y-2">
            <p className="text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
              ZekerFlex componeert zelf muziek in de lengte van je video. Geen rechten van anderen, dus vrij te gebruiken in reclame.
            </p>
            <label className="a-label text-[0.75rem]">
              Sfeer
              <select className="a-input" value={stemming} onChange={(e) => setStemming(e.target.value as Stemming)}>
                {STEMMINGEN.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="a-button a-button-primary w-full text-xs" onClick={() => void componeer()} disabled={Boolean(bezig)}>
              Maak muziek ({tijdTekst(Math.ceil(projectDuur + 1))})
            </button>
            <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Eigen muziek? Upload een MP3 bij Media en sleep hem naar het muziekspoor.</p>
          </div>
        )}

        {tab === "ai" && (
          <div className="space-y-4">
            <button type="button" onClick={onAiVideo} className="a-button a-button-primary w-full text-xs">
              ✨ Maak een hele video met AI
            </button>

            <Wachtrij formaat={formaat} onKlaar={onVernieuw} onMelding={onMelding} />

            <section className="space-y-1.5 rounded-lg p-2.5" style={{ background: "var(--a-ok-soft)" }}>
              <p className="text-[0.75rem] font-semibold" style={{ color: "var(--a-text)" }}>Gratis AI-videoclip (LTX-2.3)</p>
              <p className="text-[0.6875rem]" style={{ color: "var(--a-dim)" }}>Echte bewegende beelden met geluid, gemaakt op de videokaarten van Lightricks. Gratis, met een dagtegoed. Schrijf gewoon in het Nederlands.</p>
              <textarea className="a-input text-[0.8125rem]" rows={2} value={gratisPrompt} onChange={(e) => setGratisPrompt(e.target.value)} placeholder="Bijvoorbeeld: een serveerster loopt lachend met twee cappuccino's door een druk café" />
              <div className="grid grid-cols-2 gap-1.5">
                <select className="a-input text-xs" value={gratisDuur} onChange={(e) => setGratisDuur(Number(e.target.value))} aria-label="Lengte van de clip">
                  {[3, 5, 8, 10].map((d) => (
                    <option key={d} value={d}>{d} seconden</option>
                  ))}
                </select>
                <select className="a-input text-xs" value={gratisKwaliteit} onChange={(e) => setGratisKwaliteit(e.target.value as "snel" | "scherp")} aria-label="Kwaliteit">
                  <option value="scherp">Scherp (HD)</option>
                  <option value="snel">Snel (lager)</option>
                </select>
              </div>
              <button type="button" className="a-button a-button-primary w-full text-xs" disabled={gratisPrompt.trim().length < 3 || Boolean(bezig)} onClick={() => void gratisClip()}>
                Maak gratis clip in {formaat}
              </button>
              <p className="text-[0.625rem]" style={{ color: "var(--a-mute)" }}>Tip: kies een foto op de tijdlijn en klik rechts op &quot;Laat bewegen&quot; om die foto tot leven te brengen.</p>
            </section>

            <section className="space-y-1.5">
              <p className="text-[0.75rem] font-semibold" style={{ color: "var(--a-text)" }}>{beeldAi === "cloudflare" ? "AI-foto (gratis, FLUX via Cloudflare)" : "AI-foto (Nano Banana)"}</p>
              {!beeldAi && <p className="text-[0.6875rem]" style={{ color: "var(--a-warn-ink)" }}>Er is geen beeld-AI gekoppeld.</p>}
              {ai?.beeldMelding && <p className="text-[0.6875rem]" style={{ color: "var(--a-warn-ink)" }}>{ai.beeldMelding}</p>}
              <textarea className="a-input text-[0.8125rem]" rows={2} value={fotoPrompt} onChange={(e) => setFotoPrompt(e.target.value)} placeholder="Bijvoorbeeld: een kok die lachend een bord uitserveert in een druk restaurant" />
              {beeldAi !== "cloudflare" && <div className="grid grid-cols-2 gap-1.5">
                <select className="a-input text-xs" value={fotoModel} onChange={(e) => setFotoModel(e.target.value as typeof fotoModel)} aria-label="Beeldmodel">
                  <option value="gemini-3.1-flash-image">Nano Banana 2</option>
                  <option value="gemini-3-pro-image">Nano Banana Pro</option>
                </select>
                <select className="a-input text-xs" value={fotoGrootte} onChange={(e) => setFotoGrootte(e.target.value as typeof fotoGrootte)} aria-label="Grootte">
                  <option value="1K">1K snel</option>
                  <option value="2K">2K scherp</option>
                  <option value="4K">4K hoogste</option>
                </select>
              </div>}
              <button type="button" className="a-button w-full text-xs" disabled={!beeldAi || fotoPrompt.trim().length < 3 || Boolean(bezig)} onClick={() => void aiFoto()}>
                Maak foto in {formaat}
              </button>
            </section>

            <section className="space-y-1.5">
              <p className="text-[0.75rem] font-semibold" style={{ color: "var(--a-text)" }}>AI-stem (voice-over)</p>
              <textarea className="a-input text-[0.8125rem]" rows={3} value={stemTekst} onChange={(e) => setStemTekst(e.target.value)} placeholder="De tekst die de stem moet zeggen" />
              <select className="a-input text-xs" value={stemNaam} onChange={(e) => setStemNaam(e.target.value)} aria-label="Stem">
                <option value="Kore">Kore (vrouw, helder)</option>
                <option value="Aoede">Aoede (vrouw, warm)</option>
                <option value="Leda">Leda (vrouw, jong)</option>
                <option value="Charon">Charon (man, rustig)</option>
                <option value="Puck">Puck (man, vrolijk)</option>
                <option value="Orus">Orus (man, stevig)</option>
              </select>
              <button type="button" className="a-button w-full text-xs" disabled={stemTekst.trim().length < 2 || Boolean(bezig) || !ai?.gemini} onClick={() => void aiStem()}>
                Spreek in
              </button>
            </section>

            <section className="space-y-1.5">
              <p className="text-[0.75rem] font-semibold" style={{ color: "var(--a-text)" }}>AI-videoclip (Google Veo, betaald)</p>
              {ai?.videoMelding && <p className="text-[0.6875rem]" style={{ color: "var(--a-warn-ink)" }}>{ai.videoMelding}</p>}
              <textarea className="a-input text-[0.8125rem]" rows={2} value={clipPrompt} onChange={(e) => setClipPrompt(e.target.value)} placeholder="Bijvoorbeeld: drone-shot over een distributiecentrum bij zonsopkomst" />
              <button type="button" className="a-button w-full text-xs" disabled={clipPrompt.trim().length < 3 || Boolean(bezig) || !ai?.gemini} onClick={() => void aiClip()}>
                Maak clip van 8 seconden
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
