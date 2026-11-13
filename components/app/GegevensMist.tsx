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
function BsnVeld() {
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
      // alleen het BSN: wat niet wordt meegestuurd, laat de route staan (een oudere stand hier zet niets terug)
      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: "uitzendkracht", bsn: bsn.trim() }),
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

/**
 * Het BSN dat van het ID is gelezen (lib/kyc/bsn-uit-document.ts): de werker ziet alleen de laatste 4 en bevestigt het
 * zelf (AVG: hij weet wat we lazen, en een leesfout valt zo op). "Nee" laat het gewone veld zien.
 */
function BsnVoorstelVraag({ laatste4, zelf }: { laatste4: string; zelf: () => void }) {
  const router = useRouter();
  const t = useFT().gegevensMist.bsn;
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function ja() {
    if (busy) return;
    setBusy(true);
    setFout(null);
    try {
      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: "uitzendkracht", bsnVoorstelOk: true }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) setFout(d.error?.message ?? t.mislukt);
      else {
        router.refresh();
        document.getElementById("gegevens-mist-kop")?.focus();
      }
    } catch {
      setFout(t.mislukt);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-ink">{vulIn(t.voorstel, { laatste4 })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void ja()} disabled={busy} className="btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
          {busy ? t.bezig : t.voorstelJa}
        </button>
        <button type="button" onClick={zelf} disabled={busy} className="btn-ghost min-h-[44px] px-4 py-2 text-sm">
          {t.voorstelNee}
        </button>
      </div>
      {fout && <p role="alert" className="mt-1.5 text-xs text-crit">{fout}</p>}
    </div>
  );
}

/** Wat er al bekend is voor het btw-veld (uit de fiscale gegevens; de KVK zo nodig uit het profiel). */
export interface BtwBegin {
  vatNumber: string | null;
  vatRequested: boolean;
  korApplies: boolean;
  kvkNumber: string | null;
}

/**
 * Btw (en bij een flexwerker de KOR) meteen hier, zodat /dashboard/fiscaal niet meer bij de aanmelding hoort (13 nov
 * 2026). Dezelfde route en dezelfde controle als het fiscale formulier (VIES, de regel van fiscaalIngevuld); alleen de
 * btw-, KOR- en KVK-velden gaan mee, de rest laat de route staan. Daarna de stand van de server (router.refresh).
 */
function BtwVeld({ soort, begin }: { soort: "zzp" | "flexwerker"; begin: BtwBegin }) {
  const router = useRouter();
  const ft = useFT();
  const f = ft.fiscaalForm;
  const t = ft.gegevensMist.btw;
  const flex = soort === "flexwerker";
  const [btw, setBtw] = useState(begin.vatNumber ?? "");
  const [aangevraagd, setAangevraagd] = useState(begin.vatRequested);
  const [kor, setKor] = useState(begin.korApplies);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const ingevuld = Boolean(btw.trim()) || aangevraagd || (flex && kor);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ingevuld) return;
    setBusy(true);
    setFout(null);
    try {
      const body: Record<string, unknown> = { workerKind: soort, vatRequested: aangevraagd };
      if (flex) body.korApplies = kor;
      if (btw.trim()) body.vatNumber = btw.trim();
      if (begin.kvkNumber) body.kvkNumber = begin.kvkNumber;
      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string }; vatNumber?: string | null; vatRequested?: boolean; korApplies?: boolean };
      if (!res.ok) setFout(d.error?.message ?? f.opslaanMislukt);
      else {
        // de stand van de server overnemen (die schoont het nummer op en beslist over de KOR)
        setBtw(d.vatNumber ?? "");
        if (typeof d.vatRequested === "boolean") setAangevraagd(d.vatRequested);
        if (typeof d.korApplies === "boolean") setKor(d.korApplies);
        router.refresh();
        document.getElementById("gegevens-mist-kop")?.focus();
      }
    } catch {
      setFout(f.opslaanMislukt);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="mt-2 space-y-2" noValidate>
      <div>
        <label htmlFor="gegevens-btw" className="field-label">{f.btw}</label>
        <input
          id="gegevens-btw"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          value={btw}
          onChange={(e) => setBtw(e.target.value)}
          aria-describedby={fout ? "gegevens-btw-hint gegevens-btw-fout" : "gegevens-btw-hint"}
          aria-invalid={fout ? true : undefined}
          className="field-input mt-1 w-full max-w-xs"
          placeholder="NL123456789B01"
        />
        <p id="gegevens-btw-hint" className="mt-1 text-xs text-neutralx-500">{flex ? f.btwHintOptioneel : f.btwHintLive}</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={aangevraagd} onChange={(e) => setAangevraagd(e.target.checked)} className="mt-1" />
        <span>{f.btwAangevraagd}</span>
      </label>
      {flex && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={kor} onChange={(e) => setKor(e.target.checked)} className="mt-1" />
          <span>{ft.kor.keuzeHeb}</span>
        </label>
      )}
      <button type="submit" disabled={busy || !ingevuld} className="btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
        {busy ? t.bezig : t.opslaan}
      </button>
      {fout && <p id="gegevens-btw-fout" role="alert" className="text-xs text-crit">{fout}</p>}
      {flex && (
        <p className="text-xs">
          <Link href="/dashboard/fiscaal" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 underline underline-offset-2">
            {t.korAanvragen}
          </Link>
        </p>
      )}
    </form>
  );
}

export function GegevensMist({
  mist,
  soort,
  bsnVoorstel = null,
  btw = null,
}: {
  mist: GegevensStuk[];
  soort: "zzp" | "flexwerker" | "uitzendkracht" | null;
  /** de laatste 4 van het BSN dat van het ID is gelezen, nog niet bevestigd */
  bsnVoorstel?: string | null;
  /** wat er al bekend is voor het btw-veld (zzp'er en flexwerker) */
  btw?: BtwBegin | null;
}) {
  const t = useFT().gegevensMist;
  const [zelfInvullen, setZelfInvullen] = useState(false);
  if (mist.length === 0) return null;
  const vraagVoorstel = Boolean(bsnVoorstel) && !zelfInvullen;
  return (
    <section aria-labelledby="gegevens-mist-kop" className="mb-6 rounded-2xl border border-warn/40 bg-warn/5 p-5">
      <h2 id="gegevens-mist-kop" tabIndex={-1} className="font-display text-base font-bold text-ink focus:outline-none">
        {vulIn(mist.length === 1 ? t.titelEen : t.titelMeer, { n: mist.length })}
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">{t.uitleg}</p>
      <ul className="mt-4 space-y-4">
        {mist.includes("bsn") && (
          <li>
            <p className="text-sm font-semibold text-ink">{vraagVoorstel ? t.bsn.voorstelKop : t.bsn.kop}</p>
            <p className="text-xs text-neutralx-600">{t.bsn.hint}</p>
            {vraagVoorstel && bsnVoorstel ? (
              <BsnVoorstelVraag laatste4={bsnVoorstel} zelf={() => setZelfInvullen(true)} />
            ) : (
              <BsnVeld />
            )}
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
            {soort === "zzp" || soort === "flexwerker" ? (
              <BtwVeld soort={soort} begin={btw ?? { vatNumber: null, vatRequested: false, korApplies: false, kvkNumber: null }} />
            ) : (
              <Link href="/dashboard/fiscaal" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600 underline underline-offset-2">{t.btw.knop}</Link>
            )}
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
