"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerkoopRij } from "@/lib/shop/verkoper";
import { VERKOOP_STATUS_LABEL, VERVOERDERS, trackUrl, type VerkoopStatus } from "@/lib/shop/verkoper-core";
import { Card, Pill, btn, input } from "@/components/studio/ui";

// Studio → Verkopen: wat er van jouw producten besteld is. Na betaling staat het
// adres erbij; verstuur en vul de track-en-trace in, dan krijgt de koper hem per mail.

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" });
const TONE: Record<VerkoopStatus, "ok" | "info" | "warn" | "neutral" | "crit"> = { wacht: "neutral", verzenden: "warn", onderweg: "info", vast: "ok", uitbetaald: "neutral", vervallen: "crit" };

export function VerkoperVerkopen({ verkopen }: { verkopen: VerkoopRij[] }) {
  const zichtbaar = verkopen.filter((v) => v.status !== "wacht");
  return (
    <Card title="Bestellingen van jouw producten" className="mt-4" pad={false}>
      {zichtbaar.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-sm text-[#616161]">Nog geen bestellingen. Zodra iemand iets van jou koopt en betaalt, staat het hier en krijg je een mail.</p>
      ) : (
        <ul className="divide-y divide-[#f1f1f1]">
          {zichtbaar.map((v) => (
            <VerkoopItem key={`${v.orderId}-${v.status}`} v={v} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function VerkoopItem({ v }: { v: VerkoopRij }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1a1a1a]">
            Bestelling #{v.orderId.slice(-8).toUpperCase()} <span className="font-normal text-[#616161]">· {datum(v.at)}</span>
          </p>
          <ul className="mt-1 text-sm text-[#303030]">
            {v.producten.map((p, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {p.aantal}× {p.naam}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-right">
          <Pill tone={TONE[v.status]}>{VERKOOP_STATUS_LABEL[v.status]}</Pill>
          <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">Jij krijgt {euro(v.uitbetalingCents)}</p>
          <p className="text-xs text-[#707070]">
            {euro(v.verkoopCents + v.verzendCents)} min {euro(v.commissieCents)} commissie
          </p>
        </div>
      </div>
      {v.koper && (
        <p className="mt-2 text-sm leading-relaxed text-[#303030]">
          <span className="font-semibold">Versturen naar:</span> {v.koper.naam}, {v.koper.adres}, {v.koper.postcode} {v.koper.plaats}
        </p>
      )}
      {v.zending && <Zending vervoerder={v.zending.vervoerder} code={v.zending.code} />}
      {v.status === "verzenden" && <VerzendFormulier orderId={v.orderId} />}
    </li>
  );
}

function Zending({ vervoerder, code }: { vervoerder: string; code: string }) {
  const link = trackUrl(vervoerder, code);
  return (
    <p className="mt-2 text-sm text-[#303030]">
      Verstuurd met {vervoerder}:{" "}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold underline">
          {code}
        </a>
      ) : (
        <span className="font-mono font-semibold">{code}</span>
      )}
    </p>
  );
}

function VerzendFormulier({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [vervoerder, setVervoerder] = useState<string>(VERVOERDERS[0]);
  const [code, setCode] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const verstuur = async (e: FormEvent) => {
    e.preventDefault();
    setFout("");
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/verkopen/zending", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, vervoerder, code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(data?.error?.message ?? "Dat is niet gelukt. Probeer het opnieuw.");
        return;
      }
      router.refresh();
    } catch {
      setFout("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <form onSubmit={verstuur} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-[#fafafa] p-3">
      <label className="grid gap-1 text-xs font-semibold text-[#616161]" htmlFor={`vv-${orderId}`}>
        Vervoerder
        <select id={`vv-${orderId}`} value={vervoerder} onChange={(e) => setVervoerder(e.target.value)} className={`${input} w-32`}>
          {VERVOERDERS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-[#616161]" htmlFor={`tt-${orderId}`}>
        Track-en-tracecode
        <input id={`tt-${orderId}`} value={code} onChange={(e) => setCode(e.target.value)} required minLength={6} maxLength={40} spellCheck={false} autoComplete="off" className={`${input} min-w-[10rem] font-mono`} />
      </label>
      <button type="submit" disabled={bezig} className={btn.primary}>
        {bezig ? "Bezig…" : "Verzonden"}
      </button>
      {fout && (
        <p role="alert" className="w-full text-sm font-semibold text-[#b42318]">
          {fout}
        </p>
      )}
    </form>
  );
}
