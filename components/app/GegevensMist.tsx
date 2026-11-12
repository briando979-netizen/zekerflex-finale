"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import type { GegevensStuk } from "@/lib/onboarding/gegevens-mist";

// Bovenaan /dashboard/verificatie: wat er nog mist voor "gegevens", per onderdeel met de plek waar je het invult. Het BSN van een
// uitzendkracht kan hier meteen (daarvoor moest je tot nu toe zelf /dashboard/fiscaal vinden; daar kwam bijna niemand).

/** Het BSN invullen: bewaard via dezelfde route als het fiscale formulier (versleuteld, nooit onversleuteld opgeslagen). */
function BsnVeld({ loonheffingskorting }: { loonheffingskorting: boolean }) {
  const router = useRouter();
  const t = useFT().gegevensMist.bsn;
  const [bsn, setBsn] = useState("");
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !bsn.trim()) return;
    setBusy(true);
    setFout(null);
    try {
      // loonheffingskorting meegeven zoals ze nu staat: de route zet het anders terug op "ja"
      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: "uitzendkracht", bsn: bsn.trim(), loonheffingskorting }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) setFout(d.error?.message ?? t.mislukt);
      else {
        router.refresh();
        // het veld verdwijnt na het opslaan: de focus naar de kop van de lijst, anders valt hij weg en leest een schermlezer niets voor
        document.getElementById("gegevens-mist-kop")?.focus();
      }
    } catch {
      setFout(t.mislukt);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="mt-2" noValidate>
      <label htmlFor="gegevens-bsn" className="field-label">{t.label}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id="gegevens-bsn"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          value={bsn}
          onChange={(e) => setBsn(e.target.value)}
          aria-describedby={fout ? "gegevens-bsn-fout" : undefined}
          aria-invalid={fout ? true : undefined}
          className="field-input w-44"
          placeholder="123456782"
        />
        <button type="submit" disabled={busy || !bsn.trim()} className="btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
          {busy ? t.bezig : t.opslaan}
        </button>
      </div>
      {fout && <p id="gegevens-bsn-fout" role="alert" className="mt-1.5 text-xs text-crit">{fout}</p>}
    </form>
  );
}

export function GegevensMist({ mist, soort, loonheffingskorting }: { mist: GegevensStuk[]; soort: "zzp" | "flexwerker" | "uitzendkracht" | null; loonheffingskorting: boolean }) {
  const t = useFT().gegevensMist;
  if (mist.length === 0) return null;
  return (
    <section aria-labelledby="gegevens-mist-kop" className="mb-6 rounded-2xl border border-warn/40 bg-warn/5 p-5">
      <h2 id="gegevens-mist-kop" tabIndex={-1} className="font-display text-base font-bold text-ink focus:outline-none">
        {vulIn(mist.length === 1 ? t.titelEen : t.titelMeer, { n: mist.length })}
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">{t.uitleg}</p>
      <ul className="mt-4 space-y-4">
        {mist.includes("bsn") && (
          <li>
            <p className="text-sm font-semibold text-ink">{t.bsn.kop}</p>
            <p className="text-xs text-neutralx-600">{t.bsn.hint}</p>
            <BsnVeld loonheffingskorting={loonheffingskorting} />
          </li>
        )}
        {mist.includes("contract") && (
          <li>
            <p className="text-sm font-semibold text-ink">{t.contract.kop}</p>
            <p className="text-xs text-neutralx-600">{t.contract.hint}</p>
            <a href="#uitzendovereenkomst" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600 underline underline-offset-2">{t.contract.knop}</a>
          </li>
        )}
        {mist.includes("btw") && (
          <li>
            <p className="text-sm font-semibold text-ink">{t.btw.kop}</p>
            <p className="text-xs text-neutralx-600">{soort === "zzp" ? t.btw.hintZzp : t.btw.hintFlex}</p>
            <Link href="/dashboard/fiscaal" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600 underline underline-offset-2">{t.btw.knop}</Link>
          </li>
        )}
        {mist.includes("postcode") && (
          <li>
            <p className="text-sm font-semibold text-ink">{t.postcode.kop}</p>
            <p className="text-xs text-neutralx-600">{t.postcode.hint}</p>
          </li>
        )}
      </ul>
    </section>
  );
}
