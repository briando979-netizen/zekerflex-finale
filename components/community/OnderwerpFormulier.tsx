"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { FotoKiezer, type GekozenFoto } from "@/components/community/FotoKiezer";
import { CATEGORIEEN, GRENZEN, controleerOnderwerp, schoneTekst, schoneTitel, type Categorie } from "@/lib/community/regels";

/** Een nieuw onderwerp starten (/community). Eerst een knop; het formulier klapt open. Na het plaatsen naar het onderwerp zelf. */
export function OnderwerpFormulier({ categorie }: { categorie: Categorie | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [soort, setSoort] = useState<string>(categorie ?? "algemeen");
  const [titel, setTitel] = useState("");
  const [tekst, setTekst] = useState("");
  const [fotos, setFotos] = useState<GekozenFoto[]>([]);
  const [uploaden, setUploaden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function plaats(e: FormEvent) {
    e.preventDefault();
    const t = schoneTitel(titel);
    const x = schoneTekst(tekst);
    const probleem = controleerOnderwerp({ titel: t, tekst: x, categorie: soort, fotos: fotos.length });
    if (probleem) return setFout(probleem);
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/community/onderwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titel: t, tekst: x, categorie: soort, fotos: fotos.map((f) => f.id) }),
      });
      const d = (await r.json().catch(() => null)) as { pad?: string; error?: { message?: string } } | null;
      if (!r.ok || !d?.pad) throw new Error(d?.error?.message ?? "Plaatsen lukte niet. Probeer het opnieuw.");
      router.push(d.pad);
    } catch (err) {
      setFout((err as Error).message);
      setBezig(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Start een onderwerp
      </button>
    );
  }

  const veld = "mt-1 w-full rounded-xl border border-hairstrong bg-white px-4 py-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";
  return (
    <form onSubmit={(e) => void plaats(e)} className="rounded-2xl border border-hair bg-white p-5 shadow-e1 md:p-6" aria-labelledby={`${id}-kop`}>
      <h2 id={`${id}-kop`} className="font-display text-xl font-bold text-ink">
        Start een onderwerp
      </h2>
      <label htmlFor={`${id}-soort`} className="mt-4 block text-sm font-semibold text-ink">
        Waar gaat het over?
      </label>
      <select id={`${id}-soort`} value={soort} onChange={(e) => setSoort(e.target.value)} className={veld}>
        {CATEGORIEEN.map((c) => (
          <option key={c.sleutel} value={c.sleutel}>
            {c.naam}: {c.uitleg}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-titel`} className="mt-4 block text-sm font-semibold text-ink">
        Titel
      </label>
      <input
        id={`${id}-titel`}
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        maxLength={GRENZEN.titelMax}
        required
        placeholder="Bijvoorbeeld: Tips voor je eerste dienst in de horeca?"
        className={veld}
      />
      <label htmlFor={`${id}-tekst`} className="mt-4 block text-sm font-semibold text-ink">
        Je bericht
      </label>
      <textarea
        id={`${id}-tekst`}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        maxLength={GRENZEN.tekstMax}
        required
        rows={6}
        aria-describedby={`${id}-teller`}
        className={veld}
      />
      <p id={`${id}-teller`} className="mt-1 text-right text-xs text-neutralx-500">
        {tekst.length} / {GRENZEN.tekstMax}
      </p>
      <div className="mt-2">
        <FotoKiezer fotos={fotos} setFotos={setFotos} max={GRENZEN.fotosOnderwerp} onBezig={setUploaden} />
      </div>
      <p className="mt-4 rounded-xl bg-paper-soft px-4 py-3 text-xs leading-relaxed text-neutralx-600">
        Iedereen kan dit lezen. Bij je bericht staan je voornaam, de eerste letter van je achternaam, je profielfoto en of je werker of
        bedrijf bent. Zet er geen telefoonnummer, e-mailadres of andere privégegevens in.
      </p>
      {fout && (
        <p role="alert" className="mt-3 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={bezig || uploaden}>
          {bezig ? "Bezig…" : "Plaatsen"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={bezig}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
