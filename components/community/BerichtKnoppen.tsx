"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { GRENZEN, MELD_REDENEN } from "@/lib/community/regels";

// ---------------------------------------------------------------------------
// De knoppen onder een bericht in de community: Handig, Melden (ook zonder account, Digital Services Act) en, bij je eigen
// bericht, Verwijderen. Drie losse onderdelen op het hoogste niveau (geen component binnen een component); het melden is een
// eigen formulier dat nooit binnen een ander formulier staat.
// ---------------------------------------------------------------------------

const knop = "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-hair bg-white px-3 text-xs font-semibold text-neutralx-700 transition hover:border-ink hover:text-ink disabled:opacity-60";

export function HandigKnop({
  onderwerpId,
  reactieId,
  aantal,
  aan,
  ingelogd,
  eigen,
  terug,
}: {
  onderwerpId: string;
  reactieId: string | null;
  aantal: number;
  aan: boolean;
  ingelogd: boolean;
  /** je eigen bericht: alleen het aantal */
  eigen: boolean;
  terug: string;
}) {
  const [stand, setStand] = useState({ aantal, aan });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const tekst = `👍 Handig${stand.aantal ? ` · ${stand.aantal}` : ""}`;

  if (!ingelogd) {
    return (
      <Link href={`/login?callbackUrl=${encodeURIComponent(terug)}`} className={knop} title="Log in om Handig te geven">
        {tekst}
      </Link>
    );
  }
  if (eigen) {
    return stand.aantal ? <span className="inline-flex min-h-[36px] items-center px-1 text-xs font-semibold text-neutralx-500">👍 {stand.aantal} vond dit handig</span> : null;
  }

  async function wissel() {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch(`/api/community/onderwerpen/${onderwerpId}/handig`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactie: reactieId }),
      });
      const d = (await r.json().catch(() => null)) as { aantal?: number; aan?: boolean; error?: { message?: string } } | null;
      if (!r.ok || typeof d?.aantal !== "number") throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
      setStand({ aantal: d.aantal, aan: d.aan === true });
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" className={`${knop} ${stand.aan ? "border-brand-600 bg-brand-50 text-brand-700" : ""}`} aria-pressed={stand.aan} disabled={bezig} onClick={() => void wissel()}>
        {tekst}
      </button>
      {fout && (
        <span role="alert" className="mt-1 text-xs text-crit">
          {fout}
        </span>
      )}
    </span>
  );
}

export function MeldKnop({ onderwerpId, reactieId }: { onderwerpId: string; reactieId: string | null }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState("");
  const [toelichting, setToelichting] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    if (!reden) return setFout("Kies een reden.");
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/community/melden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onderwerp: onderwerpId, reactie: reactieId, reden, toelichting }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !d?.ok) throw new Error(d?.error?.message ?? "Melden lukte niet. Mail het gerust naar support@zekerflex.com.");
      setKlaar(true);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <p role="status" className="w-full rounded-lg bg-paper-soft px-3 py-2 text-xs text-neutralx-700">
        Bedankt voor je melding. We kijken ernaar. Na meerdere meldingen verdwijnt een bericht vanzelf tot we het hebben bekeken.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className={knop} onClick={() => setOpen(true)} aria-expanded={false}>
        <span aria-hidden>⚑</span> Melden
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void verstuur(e)} className="w-full rounded-xl border border-hair bg-paper-soft p-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Wat is er mis met dit bericht?</legend>
        <div className="mt-2 space-y-1.5">
          {MELD_REDENEN.map((m) => (
            <label key={m.sleutel} className="flex items-center gap-2 text-sm text-neutralx-700">
              <input type="radio" name={`${id}-reden`} value={m.sleutel} checked={reden === m.sleutel} onChange={() => setReden(m.sleutel)} />
              {m.naam}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-toelichting`} className="mt-3 block text-sm font-semibold text-ink">
        Toelichting (mag leeg)
      </label>
      <textarea
        id={`${id}-toelichting`}
        value={toelichting}
        onChange={(e) => setToelichting(e.target.value)}
        maxLength={GRENZEN.toelichting}
        rows={2}
        className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      />
      {fout && (
        <p role="alert" className="mt-2 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={bezig}>
          {bezig ? "Bezig…" : "Melding versturen"}
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)} disabled={bezig}>
          Annuleren
        </button>
      </div>
    </form>
  );
}

export function VerwijderKnop({ onderwerpId, reactieId }: { onderwerpId: string; reactieId: string | null }) {
  const router = useRouter();
  const [zeker, setZeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verwijder() {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch(`/api/community/onderwerpen/${onderwerpId}${reactieId ? `?reactie=${reactieId}` : ""}`, { method: "DELETE" });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !d?.ok) throw new Error(d?.error?.message ?? "Verwijderen lukte niet. Probeer het opnieuw.");
      if (reactieId) router.refresh();
      else router.push("/community");
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
      setZeker(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {zeker ? (
        <>
          <button type="button" className={`${knop} border-crit text-crit`} disabled={bezig} onClick={() => void verwijder()}>
            {bezig ? "Bezig…" : "Ja, verwijder"}
          </button>
          <button type="button" className={knop} disabled={bezig} onClick={() => setZeker(false)}>
            Nee
          </button>
        </>
      ) : (
        <button type="button" className={knop} onClick={() => setZeker(true)}>
          Verwijderen
        </button>
      )}
      {fout && (
        <span role="alert" className="text-xs text-crit">
          {fout}
        </span>
      )}
    </span>
  );
}
