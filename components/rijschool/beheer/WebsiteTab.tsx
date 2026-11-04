"use client";

import { useEffect, useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import type { RijschoolWebsite } from "@/lib/rijschool/website";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { EigenDomein } from "@/components/rijschool/beheer/EigenDomein";

// De teksten van de rijschoolwebsite. {naam} en {plaats} worden op de site
// vanzelf ingevuld; leeg laten kan niet, dan gebruikt de site de standaard.

export function WebsiteTab({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const [w, setW] = useState<RijschoolWebsite>(data.website);
  const [werkgebied, setWerkgebied] = useState(data.website.werkgebied.join(", "));
  const [slaging, setSlaging] = useState(data.website.slagingspercentage === null ? "" : String(data.website.slagingspercentage));
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setOk(null);
    const pct = slaging.trim() === "" ? null : Number(slaging.replace("%", ""));
    if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 100)) return setFout("Het slagingspercentage is een heel getal tussen 1 en 100, of leeg.");
    setBezig(true);
    try {
      await doe({
        actie: "website",
        data: {
          ...w,
          werkgebied: werkgebied
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 40),
          slagingspercentage: pct,
          sterkePunten: w.sterkePunten.filter((p) => p.titel.trim()),
          faq: w.faq.filter((q) => q.vraag.trim() && q.antwoord.trim()),
        },
      });
      setOk("Opgeslagen. Je website toont de nieuwe teksten meteen.");
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={bewaar} className="space-y-4">
        <Heldfoto />
        <section className="card grid gap-4 p-5">
          <h2 className="font-display text-lg font-bold text-ink">Bovenaan de website</h2>
          <Veld label="Kop" uitleg="{naam} en {plaats} worden automatisch ingevuld.">
            <input className="field-input" value={w.kop} onChange={(e) => setW({ ...w, kop: e.target.value })} maxLength={120} required />
          </Veld>
          <Veld label="Korte introductie">
            <textarea className="field-input min-h-[4rem]" value={w.intro} onChange={(e) => setW({ ...w, intro: e.target.value })} maxLength={400} />
          </Veld>
          <Veld label="Over ons">
            <textarea className="field-input min-h-[7rem]" value={w.overOns} onChange={(e) => setW({ ...w, overOns: e.target.value })} maxLength={2000} />
          </Veld>
          <div className="grid gap-4 sm:grid-cols-3">
            <Veld label="Werkgebied" uitleg="Plaatsen gescheiden door komma's.">
              <input className="field-input" value={werkgebied} onChange={(e) => setWerkgebied(e.target.value)} placeholder="Zwolle, Kampen, Hattem" />
            </Veld>
            <Veld label="Slagingspercentage" uitleg="Alleen invullen als je het kunt onderbouwen.">
              <input className="field-input" inputMode="numeric" value={slaging} onChange={(e) => setSlaging(e.target.value)} placeholder="bijvoorbeeld 78" />
            </Veld>
            <Veld label="WhatsApp-nummer" uitleg="Leeg laten voor geen WhatsApp-knop.">
              <input className="field-input" type="tel" value={w.whatsapp} onChange={(e) => setW({ ...w, whatsapp: e.target.value })} maxLength={20} />
            </Veld>
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Waarom kiezen voor jullie</h2>
            {w.sterkePunten.length < 8 && (
              <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setW({ ...w, sterkePunten: [...w.sterkePunten, { titel: "", tekst: "" }] })}>
                Punt toevoegen
              </button>
            )}
          </div>
          {w.sterkePunten.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
              <input
                className="field-input !mt-0"
                value={p.titel}
                onChange={(e) => setW({ ...w, sterkePunten: w.sterkePunten.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)) })}
                maxLength={80}
                aria-label={`Titel punt ${i + 1}`}
              />
              <input
                className="field-input !mt-0"
                value={p.tekst}
                onChange={(e) => setW({ ...w, sterkePunten: w.sterkePunten.map((x, j) => (j === i ? { ...x, tekst: e.target.value } : x)) })}
                maxLength={300}
                aria-label={`Tekst punt ${i + 1}`}
              />
              <button type="button" className="btn-ghost !px-3 text-crit" onClick={() => setW({ ...w, sterkePunten: w.sterkePunten.filter((_, j) => j !== i) })} aria-label={`Punt ${i + 1} weghalen`}>
                ✕
              </button>
            </div>
          ))}
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Veelgestelde vragen</h2>
            {w.faq.length < 20 && (
              <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setW({ ...w, faq: [...w.faq, { vraag: "", antwoord: "" }] })}>
                Vraag toevoegen
              </button>
            )}
          </div>
          {w.faq.map((q, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-hair p-3">
              <div className="flex gap-2">
                <input
                  className="field-input !mt-0"
                  value={q.vraag}
                  onChange={(e) => setW({ ...w, faq: w.faq.map((x, j) => (j === i ? { ...x, vraag: e.target.value } : x)) })}
                  maxLength={200}
                  aria-label={`Vraag ${i + 1}`}
                />
                <button type="button" className="btn-ghost !px-3 text-crit" onClick={() => setW({ ...w, faq: w.faq.filter((_, j) => j !== i) })} aria-label={`Vraag ${i + 1} weghalen`}>
                  ✕
                </button>
              </div>
              <textarea
                className="field-input !mt-0 min-h-[3.5rem]"
                value={q.antwoord}
                onChange={(e) => setW({ ...w, faq: w.faq.map((x, j) => (j === i ? { ...x, antwoord: e.target.value } : x)) })}
                maxLength={1000}
                aria-label={`Antwoord ${i + 1}`}
              />
            </div>
          ))}
        </section>

        <Melding fout={fout} ok={ok} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={bezig}>
            {bezig ? "Bezig…" : "Website opslaan"}
          </button>
          <a href={data.rijschool.url} target="_blank" rel="noopener" className="btn-ghost">
            Bekijk website
          </a>
        </div>
      </form>
      <EigenDomein data={data} doe={doe} />
    </div>
  );
}

// De foto bovenaan de website (lib/rijschool/heldfoto.ts): los van de teksten,
// want hij wordt meteen opgeslagen.
function Heldfoto() {
  const [url, setUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    stuur<{ url: string | null }>("/api/rijschool/beheer/foto")
      .then((d) => setUrl(d.url))
      .catch((e) => setFout(foutVan(e)));
  }, []);

  async function kies(bestand: File | undefined) {
    if (!bestand) return;
    setFout(null);
    if (bestand.size > 15_000_000) return setFout("Deze foto is groter dan 15 MB.");
    setBezig(true);
    try {
      const foto = await new Promise<string>((klaar, mis) => {
        const lezer = new FileReader();
        lezer.onload = () => klaar(String(lezer.result));
        lezer.onerror = () => mis(new Error("De foto kon niet worden gelezen."));
        lezer.readAsDataURL(bestand);
      });
      setUrl((await stuur<{ url: string | null }>("/api/rijschool/beheer/foto", "POST", { foto })).url);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  async function weg() {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch("/api/rijschool/beheer/foto", { method: "DELETE" });
      if (!res.ok) throw new Error("Verwijderen lukte niet.");
      setUrl(null);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="card grid gap-4 p-5 sm:grid-cols-[1fr_16rem] sm:items-center">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Foto bovenaan je website</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Bijvoorbeeld je lesauto of je instructeurs. De foto komt onder een donkere laag, zodat de tekst leesbaar blijft. Liggend werkt het best. Wat er aan
          locatiegegevens in de foto zit, halen we eruit.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="btn-ghost cursor-pointer">
            {bezig ? "Bezig…" : url ? "Andere foto kiezen" : "Foto kiezen"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={bezig} onChange={(e) => void kies(e.target.files?.[0])} />
          </label>
          {url && (
            <button type="button" className="btn-ghost" disabled={bezig} onClick={() => void weg()}>
              Foto weghalen
            </button>
          )}
        </div>
        <Melding fout={fout} />
      </div>
      <div className="aspect-video overflow-hidden rounded-xl bg-paper-soft ring-1 ring-hair">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- eigen, opgeschoonde foto
          <img src={url} alt="Foto bovenaan je website" className="h-full w-full object-cover" />
        ) : (
          <p className="grid h-full place-items-center px-3 text-center text-xs text-neutralx-500">Nog geen foto</p>
        )}
      </div>
    </section>
  );
}
