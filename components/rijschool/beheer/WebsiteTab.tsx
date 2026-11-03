"use client";

import { useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import type { RijschoolWebsite } from "@/lib/rijschool/website";
import { foutVan } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";

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
    <form onSubmit={bewaar} className="space-y-4">
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
  );
}
