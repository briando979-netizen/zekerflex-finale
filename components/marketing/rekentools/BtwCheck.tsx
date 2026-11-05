"use client";

import Link from "next/link";
import { useState } from "react";
import { kvkZoekLink, LANDEN, leesInvoer, uitlegBtw, viesLink, type ViesStatus } from "@/lib/rekentools/btw-check";
import { useEersteGebruik } from "@/components/marketing/rekentools/Veld";

// De gratis btw-nummer-/KVK-check (lib/rekentools/btw-check.ts): één veld,
// één knop, de uitkomst in gewone taal. Een btw-id wordt op de server bij
// VIES gecontroleerd; een KVK-nummer krijgt een zoeklink in het Handelsregister.

interface Uitkomst {
  soort: "btw" | "kvk" | "onbekend";
  waarde: string;
  landcode?: string;
  status?: ViesStatus;
  naam?: string | null;
  adres?: string | null;
  link?: string;
}

const TOON = { ok: "border-brand-300 bg-mintwash text-brand-700", warn: "border-warn/40 bg-warn/10 text-warn", crit: "border-red-200 bg-red-50 text-red-800" } as const;

export function BtwCheck() {
  const used = useEersteGebruik("btw-nummer-check");
  const [nummer, setNummer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [uit, setUit] = useState<Uitkomst | null>(null);
  const herkend = leesInvoer(nummer);

  async function controleer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nummer.trim()) return;
    used();
    setBezig(true);
    setFout(null);
    setUit(null);
    try {
      const r = await fetch("/api/rekentools/btw-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nummer }) });
      const d = (await r.json().catch(() => ({}))) as Uitkomst & { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Controleren lukte niet. Probeer het opnieuw.");
      setUit(d);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <form onSubmit={controleer} className="rounded-3xl border border-hair bg-white p-6 shadow-card md:p-8">
        <label htmlFor="btw-nummer" className="block text-sm font-medium text-ink">
          Btw-nummer of KVK-nummer
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="btw-nummer"
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            placeholder="NL001234567B01 of 12345678"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-hair bg-paper px-4 py-3 font-mono text-base text-ink focus:outline focus:outline-2 focus:outline-brand-500"
          />
          <button type="submit" disabled={bezig || !nummer.trim()} className="btn-primary whitespace-nowrap disabled:opacity-50">
            {bezig ? "Controleren…" : "Controleer"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutralx-500">
          {nummer.trim()
            ? herkend.soort === "btw"
              ? `Herkend als btw-nummer uit ${LANDEN[herkend.landcode ?? ""] ?? herkend.landcode}.`
              : herkend.soort === "kvk"
                ? "Herkend als KVK-nummer (8 cijfers)."
                : "Nog niet herkend: een btw-id begint met de landcode (NL…), een KVK-nummer heeft 8 cijfers."
            : "Spaties, punten en streepjes mogen; alle EU-landen werken."}
        </p>
        {fout && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-800">
            {fout}
          </p>
        )}

        {uit?.soort === "btw" && uit.status && (
          <div role="status" className={`mt-6 rounded-2xl border p-5 ${TOON[uitlegBtw(uit.status, uit.landcode ?? "").toon]}`}>
            <p className="font-display text-lg font-bold">{uitlegBtw(uit.status, uit.landcode ?? "").kop}</p>
            <p className="mt-1 text-sm">{uitlegBtw(uit.status, uit.landcode ?? "").tekst}</p>
            <dl className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-[auto_1fr]">
              <dt className="font-medium">Nummer</dt>
              <dd className="font-mono">{uit.waarde}</dd>
              {uit.naam && (
                <>
                  <dt className="font-medium">Naam</dt>
                  <dd>{uit.naam}</dd>
                </>
              )}
              {uit.adres && (
                <>
                  <dt className="font-medium">Adres</dt>
                  <dd className="whitespace-pre-line">{uit.adres}</dd>
                </>
              )}
            </dl>
            {uit.status === "valid" && !uit.naam && <p className="mt-3 text-xs text-neutralx-600">Nederland en enkele andere landen geven bij VIES geen naam en adres vrij; het nummer zelf is wel gecontroleerd.</p>}
            <p className="mt-3 text-xs text-neutralx-600">
              Zelf nakijken kan op{" "}
              <a href={viesLink} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">
                de VIES-site van de Europese Commissie
              </a>
              .
            </p>
          </div>
        )}
        {uit?.soort === "kvk" && (
          <div role="status" className="mt-6 rounded-2xl border border-hair bg-paper-soft p-5">
            <p className="font-display text-lg font-bold text-ink">KVK-nummer {uit.waarde}</p>
            <p className="mt-1 text-sm text-neutralx-700">
              De vorm klopt (8 cijfers). Of het bedrijf bestaat en wie de eigenaar is, zie je in het Handelsregister van de KVK; een uittreksel kost daar een paar euro, de basisgegevens zijn gratis.
            </p>
            <a href={uit.link ?? kvkZoekLink(uit.waarde)} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 inline-block">
              Zoek in het Handelsregister
            </a>
          </div>
        )}
        {uit?.soort === "onbekend" && (
          <div role="status" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-display text-lg font-bold">Niet herkend</p>
            <p className="mt-1 text-sm">Een Nederlands btw-id is NL + 9 cijfers + B + 2 cijfers (NL001234567B01); een KVK-nummer heeft 8 cijfers. Andere EU-landen: landcode gevolgd door het nummer.</p>
          </div>
        )}
      </form>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-hair bg-white p-6">
          <p className="font-display text-lg font-bold text-ink">Waarom controleren?</p>
          <ul className="mt-3 space-y-2 text-sm text-neutralx-700">
            <li>Een factuur van een zzp&apos;er zonder geldig btw-nummer mag je niet zomaar als voorbelasting aftrekken.</li>
            <li>Bij levering aan een bedrijf in een ander EU-land (btw verlegd) moet je het btw-nummer van de klant hebben gecontroleerd en bewaard.</li>
            <li>Een KVK-nummer op de factuur is verplicht; even nakijken voorkomt dat je zaken doet met een spookbedrijf.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-hair bg-white p-6">
          <p className="font-display text-lg font-bold text-ink">Op ZekerFlex gebeurt dit vanzelf</p>
          <p className="mt-2 text-sm text-neutralx-700">
            Elk bedrijf en elke zzp&apos;er die zich aanmeldt, wordt gecontroleerd op KVK en btw-nummer voordat er wordt ingepland of gefactureerd. Jij hoeft niets na te kijken.
          </p>
          <Link href="/register?type=bedrijf" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Gratis account aanmaken →
          </Link>
        </div>
      </aside>
    </div>
  );
}
