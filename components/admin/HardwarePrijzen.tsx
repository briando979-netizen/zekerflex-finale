"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/admin/kit";

// Hier stelt de eigenaar de echte prijzen vast: de marge, een eigen verkoopprijs per apparaat (excl. btw),
// wat niet in de verkoop is en de prijs van de installatie. Leeg laten = het voorstel (inkoop plus marge).

export interface PrijsRegel {
  id: string;
  naam: string;
  /** het voorstel in centen, of null als er nog geen inkoopprijs is */
  voorstelCent: number | null;
  /** een eigen prijs in centen, of null */
  eigenCent: number | null;
  uit: boolean;
}

const naarEuro = (cent: number | null) => (cent === null ? "" : (cent / 100).toFixed(2).replace(".", ","));
const naarCent = (tekst: string): number | null | "fout" => {
  const t = tekst.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : "fout";
};

export function HardwarePrijzen({ regels, margePct, installatieCent }: { regels: PrijsRegel[]; margePct: number; installatieCent: number | null }) {
  const router = useRouter();
  const [marge, setMarge] = useState(String(margePct).replace(".", ","));
  const [install, setInstall] = useState(naarEuro(installatieCent));
  const [prijzen, setPrijzen] = useState<Record<string, string>>(Object.fromEntries(regels.map((r) => [r.id, naarEuro(r.eigenCent)])));
  const [uit, setUit] = useState<Set<string>>(new Set(regels.filter((r) => r.uit).map((r) => r.id)));
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  async function bewaar() {
    setMelding(null);
    const verkoopCent: Record<string, number> = {};
    for (const r of regels) {
      const c = naarCent(prijzen[r.id] ?? "");
      if (c === "fout") return setMelding({ ok: false, tekst: `De prijs bij “${r.naam}” klopt niet. Vul een bedrag in, bijvoorbeeld 649,00.` });
      if (c !== null) verkoopCent[r.id] = c;
    }
    const m = Number(marge.replace(",", "."));
    if (!Number.isFinite(m) || m < 0 || m > 300) return setMelding({ ok: false, tekst: "De marge klopt niet. Vul een percentage in tussen 0 en 300." });
    const i = naarCent(install);
    if (i === "fout") return setMelding({ ok: false, tekst: "De prijs van de installatie klopt niet." });
    setBezig(true);
    try {
      const res = await fetch("/api/admin/hardware", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ margePct: m, verkoopCent, uit: [...uit], installatieCent: i }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setMelding({ ok: false, tekst: typeof msg === "string" ? msg : "Opslaan lukte niet. Probeer het opnieuw." });
        return;
      }
      setMelding({ ok: true, tekst: "Opgeslagen. De lijst en de pakketten hierboven rekenen nu met deze prijzen." });
      router.refresh();
    } catch {
      setMelding({ ok: false, tekst: "Opslaan lukte niet. Probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      {melding && <Notice tone={melding.ok ? "ok" : "crit"} role={melding.ok ? "status" : "alert"}>{melding.tekst}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium" style={{ color: "var(--a-text)" }}>Marge op de inkoop (%)</span>
          <input value={marge} onChange={(e) => setMarge(e.target.value)} inputMode="decimal" className="a-input mt-1 w-full" />
          <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>Het voorstel is inkoop plus deze marge, naar boven afgerond op € 5, exclusief btw.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium" style={{ color: "var(--a-text)" }}>Prijs installatie per pakket (€, excl. btw)</span>
          <input value={install} onChange={(e) => setInstall(e.target.value)} inputMode="decimal" placeholder="nog niet vastgesteld" className="a-input mt-1 w-full" />
          <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>De monteur, de reistijd en de uitleg op locatie. Leeg = nog niet vastgesteld.</span>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[0.8125rem]">
          <thead>
            <tr style={{ color: "var(--a-mute)" }}>
              <th className="py-2 pr-3 text-left font-medium">Apparaat</th>
              <th className="py-2 pr-3 text-right font-medium">Voorstel (excl.)</th>
              <th className="py-2 pr-3 text-left font-medium">Eigen verkoopprijs (€, excl.)</th>
              <th className="py-2 text-left font-medium">In de verkoop</th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                <td className="py-2 pr-3" style={{ color: "var(--a-text)" }}>{r.naam}</td>
                <td className="num py-2 pr-3 text-right">{r.voorstelCent === null ? "geen inkoop bekend" : `€ ${naarEuro(r.voorstelCent)}`}</td>
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`prijs-${r.id}`}>Eigen verkoopprijs voor {r.naam}</label>
                  <input
                    id={`prijs-${r.id}`}
                    value={prijzen[r.id] ?? ""}
                    onChange={(e) => setPrijzen((p) => ({ ...p, [r.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder={r.voorstelCent === null ? "vul een prijs in" : "voorstel gebruiken"}
                    className="a-input w-44"
                  />
                </td>
                <td className="py-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!uit.has(r.id)}
                      onChange={(e) =>
                        setUit((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                    <span>{uit.has(r.id) ? "Uit" : "Aan"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => void bewaar()} disabled={bezig} className="a-button a-button-primary text-sm">
        {bezig ? "Bezig…" : "Prijzen opslaan"}
      </button>
    </div>
  );
}
