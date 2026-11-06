"use client";

import Link from "next/link";
import { useState } from "react";
import { geldigKenteken, toonKenteken } from "@/lib/locatie/modules";
import { LOCATIE_TEKSTEN, type LocatieTeksten } from "@/lib/locatie/teksten";

// Werker → Mijn kenteken: één keer invullen; een slagboom met kentekenherkenning
// herkent je dan waar je ingepland staat (lib/locatie/toegang.ts, /api/me/voertuig).

export function WerkerVoertuig({ init, t = LOCATIE_TEKSTEN.nl, terugHref = "/dashboard/account" }: { init: { kenteken: string; sinds: string } | null; t?: LocatieTeksten; terugHref?: string }) {
  const [huidig, setHuidig] = useState(init);
  const [veld, setVeld] = useState(init ? toonKenteken(init.kenteken) : "");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const bewaar = async (kenteken: string | null) => {
    if (kenteken && !geldigKenteken(kenteken)) return setMelding({ ok: false, tekst: t.voertuig.fout });
    setBezig(true);
    setMelding(null);
    const r = await fetch("/api/me/voertuig", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kenteken }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { voertuig?: { kenteken: string; sinds: string } | null; error?: { message?: string } }) : null;
    setBezig(false);
    if (!r?.ok) return setMelding({ ok: false, tekst: d?.error?.message ?? t.voertuig.fout });
    setHuidig(d?.voertuig ?? null);
    setVeld(d?.voertuig ? toonKenteken(d.voertuig.kenteken) : "");
    setMelding({ ok: true, tekst: t.voertuig.opgeslagen });
  };

  return (
    <div>
      <Link href={terugHref} className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        {t.terug}
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-ink">🚗 {t.voertuig.titel}</h1>
      <p className="mt-1 text-sm text-neutralx-500">{t.voertuig.uitleg}</p>
      <form
        className="mt-6 rounded-2xl border border-hair bg-white p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar(veld.trim() || null);
        }}
      >
        <label className="block text-xs font-semibold uppercase tracking-wide text-neutralx-500" htmlFor="kenteken">
          {t.voertuig.label}
        </label>
        <input
          id="kenteken"
          value={veld}
          onChange={(e) => setVeld(e.target.value.toUpperCase())}
          placeholder={t.voertuig.voorbeeld}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="mt-2 block w-full rounded-xl border-2 border-hairstrong bg-[#F7D117] px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.25em] text-ink placeholder:text-ink/40"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={bezig || !veld.trim()} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {t.voertuig.opslaan}
          </button>
          {huidig && (
            <button type="button" disabled={bezig} onClick={() => void bewaar(null)} className="rounded-xl border border-hairstrong px-4 py-2.5 text-sm font-medium text-crit">
              {t.voertuig.weghalen}
            </button>
          )}
        </div>
        {melding && (
          <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-sm ${melding.ok ? "text-ok" : "text-crit"}`}>
            {melding.tekst}
          </p>
        )}
        {!huidig && !melding && <p className="mt-3 text-xs text-neutralx-400">{t.voertuig.geen}</p>}
      </form>
      <p className="mt-4 text-xs text-neutralx-500">{t.voertuig.privacy}</p>
    </div>
  );
}
