"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CAMPAGNE_DOELEN, campagneFouten, campagneSlug, type CampagneDoelgroep, type CampagnePagina } from "@/lib/campagne/pagina";

/**
 * Beheer → Sales & groei → Campagnepagina's: een pagina maken of bijwerken (POST /api/admin/campagnes) of weghalen (DELETE).
 * De regels staan in lib/campagne/pagina.ts; het formulier toont dezelfde fouten als de server.
 */
export function CampagneFormulier({ fotos, begin }: { fotos: { slug: string; naam: string }[]; begin?: CampagnePagina }) {
  const router = useRouter();
  const [slug, setSlug] = useState(begin?.slug ?? "");
  const [doelgroep, setDoelgroep] = useState<CampagneDoelgroep>(begin?.doelgroep ?? "werker");
  const [kop, setKop] = useState(begin?.kop ?? "");
  const [kopAccent, setKopAccent] = useState(begin?.kopAccent ?? "");
  const [tekst, setTekst] = useState(begin?.tekst ?? "");
  const [punten, setPunten] = useState((begin?.punten ?? []).join("\n"));
  const [knopTekst, setKnopTekst] = useState(begin?.knopTekst ?? "");
  const [knopDoel, setKnopDoel] = useState(begin?.knopDoel ?? "aanmelden");
  const [foto, setFoto] = useState(begin?.foto ?? fotos[0]?.slug ?? "");
  const [aan, setAan] = useState(begin?.aan ?? true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);

  const doelen = Object.entries(CAMPAGNE_DOELEN).filter(([, d]) => d.voor === doelgroep);

  function kiesDoelgroep(d: CampagneDoelgroep) {
    setDoelgroep(d);
    // de knop hoort bij de doelgroep: kies de eerste die past
    const eerste = Object.entries(CAMPAGNE_DOELEN).find(([, x]) => x.voor === d)?.[0];
    if (eerste) setKnopDoel(eerste);
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    setKlaar(null);
    const pagina = {
      slug: begin?.slug ?? campagneSlug(slug) ?? slug.trim(),
      doelgroep,
      kop: kop.trim(),
      kopAccent: kopAccent.trim(),
      tekst: tekst.trim(),
      punten: punten.split("\n").map((p) => p.trim()).filter(Boolean),
      knopTekst: knopTekst.trim(),
      knopDoel,
      foto,
      aan,
    };
    const fouten = campagneFouten(pagina);
    if (fouten.length > 0) {
      setFout(fouten[0] ?? "De pagina klopt nog niet.");
      return;
    }
    setBezig(true);
    const r = await fetch("/api/admin/campagnes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pagina) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { pagina?: CampagnePagina; error?: { message?: string } } | null;
    setBezig(false);
    if (r?.ok && d?.pagina) {
      setKlaar(`Opgeslagen. De pagina staat op /c/${d.pagina.slug}.`);
      router.refresh();
    } else {
      setFout(d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
    }
  }

  async function weghalen() {
    if (!begin) return;
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/admin/campagnes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: begin.slug }) }).catch(() => null);
    setBezig(false);
    if (r?.ok) router.refresh();
    else setFout("Weghalen lukte niet. Probeer het opnieuw.");
  }

  const veld = "a-input mt-1 w-full";
  const id = begin?.slug ?? "nieuw";
  return (
    <form onSubmit={(e) => void opslaan(e)} className="grid gap-3 text-sm sm:grid-cols-2" style={{ color: "var(--a-text)" }}>
      {!begin && (
        <label htmlFor={`cp-slug-${id}`} className="sm:col-span-2">
          Adres van de pagina
          <input id={`cp-slug-${id}`} className={veld} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="zomer-horeca" maxLength={48} required />
          <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>
            Wordt: zekerflex.com/c/{campagneSlug(slug) ?? "…"}
          </span>
        </label>
      )}
      <label htmlFor={`cp-groep-${id}`}>
        Voor wie
        <select id={`cp-groep-${id}`} className={veld} value={doelgroep} onChange={(e) => kiesDoelgroep(e.target.value === "bedrijf" ? "bedrijf" : "werker")}>
          <option value="werker">Werkers</option>
          <option value="bedrijf">Bedrijven</option>
        </select>
      </label>
      <label htmlFor={`cp-foto-${id}`}>
        Foto
        <select id={`cp-foto-${id}`} className={veld} value={foto} onChange={(e) => setFoto(e.target.value)}>
          {fotos.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.naam}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`cp-kop-${id}`}>
        Kop, eerste regel
        <input id={`cp-kop-${id}`} className={veld} value={kop} onChange={(e) => setKop(e.target.value)} placeholder="Werken in" maxLength={28} required />
      </label>
      <label htmlFor={`cp-accent-${id}`}>
        Kop, tweede regel (groen)
        <input id={`cp-accent-${id}`} className={veld} value={kopAccent} onChange={(e) => setKopAccent(e.target.value)} placeholder="de horeca?" maxLength={28} />
      </label>
      <label htmlFor={`cp-tekst-${id}`} className="sm:col-span-2">
        Tekst onder de kop
        <textarea id={`cp-tekst-${id}`} className={veld} rows={2} value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={220} required />
      </label>
      <label htmlFor={`cp-punten-${id}`} className="sm:col-span-2">
        Punten met een vinkje (hooguit drie, elk op een eigen regel)
        <textarea id={`cp-punten-${id}`} className={veld} rows={3} value={punten} onChange={(e) => setPunten(e.target.value)} placeholder={"Gratis aanmelden\nMet of zonder KVK"} />
      </label>
      <label htmlFor={`cp-knop-${id}`}>
        Tekst op de knop
        <input id={`cp-knop-${id}`} className={veld} value={knopTekst} onChange={(e) => setKnopTekst(e.target.value)} placeholder="Meld je gratis aan" maxLength={32} required />
      </label>
      <label htmlFor={`cp-doel-${id}`}>
        De knop gaat naar
        <select id={`cp-doel-${id}`} className={veld} value={knopDoel} onChange={(e) => setKnopDoel(e.target.value)}>
          {doelen.map(([sleutel, d]) => (
            <option key={sleutel} value={sleutel}>
              {d.naam}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} />
        De pagina staat aan (uit = niet bereikbaar)
      </label>
      {fout && (
        <p role="alert" className="sm:col-span-2" style={{ color: "var(--a-crit, #b91c1c)" }}>
          {fout}
        </p>
      )}
      {klaar && (
        <p role="status" className="sm:col-span-2">
          {klaar}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="a-button" disabled={bezig}>
          {bezig ? "Bezig…" : begin ? "Wijzigingen opslaan" : "Pagina maken"}
        </button>
        {begin && (
          <button type="button" className="a-button" disabled={bezig} onClick={() => void weghalen()}>
            Pagina weghalen
          </button>
        )}
      </div>
    </form>
  );
}
