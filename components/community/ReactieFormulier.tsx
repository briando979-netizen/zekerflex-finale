"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { FotoKiezer, type GekozenFoto } from "@/components/community/FotoKiezer";
import { GRENZEN, controleerReactie, schoneTekst } from "@/lib/community/regels";

/** Reageren op een onderwerp. Na het plaatsen haalt de pagina de nieuwe stand van de server op (router.refresh). */
export function ReactieFormulier({ onderwerpId }: { onderwerpId: string }) {
  const router = useRouter();
  const id = useId();
  const [tekst, setTekst] = useState("");
  const [fotos, setFotos] = useState<GekozenFoto[]>([]);
  const [uploaden, setUploaden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  async function plaats(e: FormEvent) {
    e.preventDefault();
    const x = schoneTekst(tekst);
    const probleem = controleerReactie({ tekst: x, fotos: fotos.length });
    if (probleem) return setFout(probleem);
    setBezig(true);
    setFout(null);
    setKlaar(false);
    try {
      const r = await fetch(`/api/community/onderwerpen/${onderwerpId}/reacties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tekst: x, fotos: fotos.map((f) => f.id) }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !d?.ok) throw new Error(d?.error?.message ?? "Plaatsen lukte niet. Probeer het opnieuw.");
      setTekst("");
      setFotos([]);
      setKlaar(true);
      router.refresh();
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void plaats(e)} className="rounded-2xl border border-hair bg-white p-5 md:p-6">
      <label htmlFor={`${id}-tekst`} className="block font-display text-lg font-bold text-ink">
        Reageer
      </label>
      <textarea
        id={`${id}-tekst`}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        maxLength={GRENZEN.reactieMax}
        required
        rows={4}
        placeholder="Schrijf je reactie…"
        className="mt-2 w-full rounded-xl border border-hairstrong bg-white px-4 py-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      />
      <div className="mt-2">
        <FotoKiezer fotos={fotos} setFotos={setFotos} max={GRENZEN.fotosReactie} onBezig={setUploaden} />
      </div>
      <p className="mt-3 text-xs text-neutralx-500">Iedereen kan je reactie lezen, met je voornaam, de eerste letter van je achternaam en je profielfoto.</p>
      {fout && (
        <p role="alert" className="mt-3 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {klaar && (
        <p role="status" className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
          Je reactie staat erbij. Bedankt!
        </p>
      )}
      <button type="submit" className="btn-primary mt-4" disabled={bezig || uploaden}>
        {bezig ? "Bezig…" : "Plaatsen"}
      </button>
    </form>
  );
}
