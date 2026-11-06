"use client";

import { useCallback, useEffect, useState } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { btn, input } from "@/components/studio/ui";

// ---------------------------------------------------------------------------
// Studio → eigen domeinnaam koppelen (website én webshop): GET/POST
// /api/werkgever/sites/domain?soort=… (lib/sites/domain.ts). Zelfde stappen als
// het tabblad Domein in de paginabouwer, voor de soort van deze werkruimte.
// ---------------------------------------------------------------------------

interface DnsRecordRij {
  type: string;
  name: string;
  short: string;
  value: string;
  why: string;
}
interface DomeinStand {
  host: string;
  alias: string | null;
  verifiedAt: string | null;
  activeAt: string | null;
  check: { at: string; txt: boolean; a: boolean; aaaa: boolean; alias: boolean; https: boolean; problem: string | null } | null;
  viaZekerflex?: boolean;
}
interface Antwoord {
  domein: DomeinStand | null;
  records: DnsRecordRij[];
}

const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export function Domein({ onChange }: { onChange?: () => void }) {
  const { api, data, soort } = useStudio();
  const [stand, setStand] = useState<Antwoord | null>(null);
  const [naam, setNaam] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const eigenaar = soort === "webshop" ? "webshop" : "website";

  const laad = useCallback(async () => {
    const res = await fetch(api("/domain"), { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFout(await foutVan(res, "Je domein kon niet laden."));
    setStand((await res.json()) as Antwoord);
  }, [api]);
  useEffect(() => {
    void laad();
  }, [laad]);

  if (!data?.site) return <p className="text-sm text-[#616161]">Maak eerst je {eigenaar}; daarna koppel je hier een eigen domeinnaam.</p>;

  const doe = async (action: "koppel" | "controleer" | "ontkoppel") => {
    if (action === "ontkoppel" && !window.confirm(`Het domein loskoppelen? Je ${eigenaar} blijft online op het adres van ZekerFlex.`)) return;
    setBezig(action);
    setFout(null);
    const res = await fetch(api("/domain"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "koppel" ? { action, domein: naam } : { action }) }).catch(() => null);
    setBezig(null);
    if (!res?.ok) return setFout(await foutVan(res, "Dat lukte niet. Probeer het opnieuw."));
    setStand((await res.json()) as Antwoord);
    onChange?.();
  };

  const kopieer = async (waarde: string) => {
    try {
      await navigator.clipboard.writeText(waarde);
      setGekopieerd(waarde);
      setTimeout(() => setGekopieerd(null), 1500);
    } catch {
      setGekopieerd(null);
    }
  };

  if (!stand) return fout ? <p role="alert" className="text-sm text-[#b42318]">{fout}</p> : <div className="h-16 animate-pulse rounded-xl bg-[#f1f1f1]" aria-busy="true" aria-label="Domein laden" />;
  const d = stand.domein;
  const c = d?.check ?? null;

  if (!d) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void doe("koppel");
        }}
      >
        <p className="text-sm text-[#616161]">Gebruik je eigen domeinnaam, zoals jouwwinkel.nl. Je {eigenaar} blijft bij ZekerFlex staan; je zet alleen een paar regels bij je domeinprovider.</p>
        <div>
          <label htmlFor="studio-domein" className="mb-1 block text-xs font-semibold text-[#303030]">Je domeinnaam</label>
          <input id="studio-domein" className={input} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="jouwwinkel.nl" autoComplete="off" spellCheck={false} />
        </div>
        {fout && <p role="alert" className="text-sm text-[#b42318]">{fout}</p>}
        <button type="submit" disabled={bezig !== null || !naam.trim()} className={btn.primary}>{bezig === "koppel" ? "Bezig…" : "Domein koppelen"}</button>
      </form>
    );
  }

  const punten: { label: string; ok: boolean | null }[] = [
    { label: d.viaZekerflex ? "Het domein staat bij ZekerFlex" : "Het domein is van jou (TXT-regel)", ok: d.verifiedAt ? true : c ? c.txt : null },
    { label: `${d.host} wijst naar ZekerFlex`, ok: c ? c.a : null },
    { label: "Geen oude IPv6-regel naar een ander adres", ok: c ? c.aaaa : null },
    ...(d.alias ? [{ label: `${d.alias} doet mee`, ok: c ? c.alias : null }] : []),
    { label: "Beveiligde verbinding (https)", ok: c ? c.https : null },
  ];

  return (
    <div className="space-y-4 text-sm">
      {d.activeAt ? (
        <p role="status" className="rounded-xl bg-[#cdfed4] p-3 text-[#014b1a]">
          Je {eigenaar} staat op <a href={`https://${d.host}`} target="_blank" rel="noopener" className="font-semibold underline">{d.host}</a>.
        </p>
      ) : d.viaZekerflex ? (
        <p className="text-[#616161]"><strong className="text-[#1a1a1a]">{d.host}</strong> staat bij ZekerFlex. Wij zetten deze regels voor je; je hoeft niets te doen. Het kan een paar uur duren. Klik daarna op Controleren.</p>
      ) : (
        <p className="text-[#616161]">Zet deze regels bij je domeinprovider voor <strong className="text-[#1a1a1a]">{d.host}</strong>. Laat de MX-regels voor je e-mail staan zoals ze zijn.</p>
      )}
      <ul className="space-y-2">
        {stand.records.map((r) => (
          <li key={`${r.type}${r.name}`} className="rounded-xl border border-[#e3e3e3] p-3">
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#1a1a1a]">{r.type} · naam {r.short}</span>
              <button type="button" onClick={() => void kopieer(r.value)} className="font-semibold text-[#005bd3] hover:underline">{gekopieerd === r.value ? "Gekopieerd" : "Kopieer waarde"}</button>
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[#1a1a1a]">{r.value}</p>
            <p className="mt-1 text-xs text-[#707070]">{r.why}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <button type="button" disabled={bezig !== null} onClick={() => void doe("controleer")} className={btn.primary}>
          {bezig === "controleer" ? "Controleren… (kan een halve minuut duren)" : "Controleren"}
        </button>
        <ul className="space-y-1" aria-label="Stand van je domein">
          {punten.map((p) => (
            <li key={p.label} className="flex items-start gap-2 text-xs">
              <span aria-hidden className={p.ok === null ? "text-[#707070]" : p.ok ? "text-[#0c5132]" : "text-[#b42318]"}>{p.ok === null ? "–" : p.ok ? "✓" : "✗"}</span>
              <span className="text-[#303030]">
                {p.label}
                <span className="sr-only">{p.ok === null ? ": nog niet gecontroleerd" : p.ok ? ": in orde" : ": nog niet in orde"}</span>
              </span>
            </li>
          ))}
        </ul>
        {c?.problem && <p role="status" className="rounded-xl bg-[#f1f1f1] p-3 text-xs text-[#303030]">{c.problem}</p>}
        {c && <p className="text-[11px] text-[#707070]">Laatst gecontroleerd {wanneer(c.at)}</p>}
      </div>
      {fout && <p role="alert" className="text-sm text-[#b42318]">{fout}</p>}
      <button type="button" disabled={bezig !== null} onClick={() => void doe("ontkoppel")} className="text-xs font-semibold text-[#b42318] hover:underline disabled:opacity-50">Domein loskoppelen</button>
    </div>
  );
}
