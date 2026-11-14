"use client";

import { useCallback, useEffect, useState } from "react";
import { APanel, APill, AButton } from "@/components/admin/ui";
import { BEL_UITKOMSTEN, belLabel, type BelRegel, type BelUitkomst } from "@/lib/sales/bellijst";

// Het tabblad "Bellen" in Beheer → Sales (14 nov 2026): leads met een telefoonnummer en een score van 55 of hoger, zonder
// reactie, oudste eerst. De eigenaar belt zelf via de tel:-link en legt met "Gebeld" vast wat het opleverde
// (lib/sales/bellijst.ts). Na elke uitkomst komt de lijst opnieuw van de server, want een lead kan eraf gaan.

interface Lijst {
  regels: BelRegel[];
  script: string[];
  nietBeloven: string;
  minScore: number;
}

const tijd = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function stand(r: BelRegel): string {
  if (r.terugbellenOp) return `Terugbellen afgesproken voor ${tijd(r.terugbellenOp)}`;
  const mail = r.heeftMail ? "heeft ook een e-mailadres" : "geen e-mailadres";
  if (r.laatste) return `${r.pogingen}× gebeld, laatst ${r.laatste.label.toLowerCase()} (${tijd(r.laatste.at)}) · ${mail}`;
  return `Nog niet gebeld · ${mail}`;
}

export function BelLijst() {
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sales/bellijst", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as (Lijst & { error?: { message?: string } }) | null;
      if (!res.ok || !data) {
        setFout(data?.error?.message ?? "De bellijst laden lukte niet. Vernieuw de pagina.");
        return;
      }
      setLijst(data);
      setFout(null);
    } catch {
      setFout("Netwerkfout bij het laden van de bellijst.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  async function gebeld(r: BelRegel, uitkomst: BelUitkomst) {
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const res = await fetch(`/api/admin/sales/leads/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gebeld", uitkomst, ...(notitie.trim() ? { notitie: notitie.trim() } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFout(data?.error?.message ?? "De uitkomst opslaan lukte niet.");
        return;
      }
      setMelding(`${r.companyName}: "${belLabel(uitkomst)}" opgeslagen.`);
      setOpen(null);
      setNotitie("");
      await laad();
    } catch {
      setFout("Netwerkfout: de uitkomst is niet opgeslagen.");
    } finally {
      setBezig(false);
    }
  }

  const minScore = lijst?.minScore ?? 55;
  return (
    <div className="space-y-4">
      <APanel
        title="Bellen"
        subtitle={`Leads met een telefoonnummer en een score van ${minScore} of hoger, nog zonder reactie, oudste eerst. ZekerFlex belt niemand zelf: jij belt en legt vast wat het opleverde.`}
      >
        <details>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            Belscript
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            {(lijst?.script ?? []).map((regel, i) => (
              <li key={i}>{regel}</li>
            ))}
          </ol>
          {lijst?.nietBeloven ? (
            <p className="mt-2 text-xs" style={{ color: "var(--a-warn)" }}>
              {lijst.nietBeloven}
            </p>
          ) : null}
        </details>
      </APanel>

      {melding && (
        <p role="status" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {melding}
        </p>
      )}
      {fout && (
        <p role="alert" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}

      <APanel pad={false}>
        {lijst === null ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            {fout ? "De bellijst is niet geladen." : "Laden…"}
          </p>
        ) : lijst.regels.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            Niemand om te bellen: geen lead met een telefoonnummer en een score van {minScore} of hoger zonder reactie.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {lijst.regels.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-4" style={{ borderColor: "var(--a-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                      {r.companyName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                      {[r.city, r.sector].filter(Boolean).join(" · ") || "Plaats en sector onbekend"}
                    </p>
                    <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                      {r.waarom}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                      {stand(r)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {typeof r.score === "number" ? <APill tone="ok">{`Score ${r.score}`}</APill> : null}
                    {r.telHref ? (
                      <a href={r.telHref} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
                        📞 {r.telefoon}
                      </a>
                    ) : (
                      <span className="text-sm" style={{ color: "var(--a-dim)" }}>
                        {r.telefoon}
                      </span>
                    )}
                    <AButton
                      variant="ghost"
                      onClick={() => {
                        setOpen(open === r.id ? null : r.id);
                        setNotitie("");
                      }}
                    >
                      Gebeld
                    </AButton>
                  </div>
                </div>
                {open === r.id && (
                  <div className="rounded-lg p-3" style={{ background: "var(--a-panel-2)" }}>
                    <label htmlFor={`notitie-${r.id}`} className="text-xs font-medium" style={{ color: "var(--a-dim)" }}>
                      Notitie (mag leeg blijven)
                    </label>
                    <input
                      id={`notitie-${r.id}`}
                      value={notitie}
                      onChange={(e) => setNotitie(e.target.value)}
                      maxLength={300}
                      placeholder="bijvoorbeeld: na 14:00 vragen naar de bedrijfsleider"
                      className="mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                      style={{ background: "var(--a-elev)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {BEL_UITKOMSTEN.map((u) => (
                        <AButton key={u.id} variant={u.id === "interesse" ? "primary" : "ghost"} disabled={bezig} onClick={() => void gebeld(r, u.id)}>
                          {u.label}
                        </AButton>
                      ))}
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
                      Interesse: de lead gaat naar &quot;Reactie ontvangen&quot;. Geen interesse: geen mail meer en het nummer op de niet-bellen-lijst.
                      Terugbellen: weer op de lijst op de volgende werkdag om 10:00. Geen gehoor: blijft op de lijst.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </APanel>
    </div>
  );
}
