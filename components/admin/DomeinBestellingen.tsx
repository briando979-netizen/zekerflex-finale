"use client";

import { useCallback, useEffect, useState } from "react";
import { KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable } from "@/components/admin/kit-client";
import { euroPrijs } from "@/lib/domeinen/extensies";

type Status = "OPEN" | "BETAALD" | "GEREGISTREERD" | "MISLUKT" | "GEANNULEERD" | "OPGEZEGD";
interface Rij {
  id: string;
  domein: string;
  status: Status;
  bedragCent: number;
  bundel: boolean;
  aangemaakt: string;
  email: string;
  notitie: string;
  betaaldOp: string | null;
  verlooptOp: string | null;
  autoVerlengen: boolean;
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  OPEN: { label: "Wacht op betaling", tone: "neutral" },
  BETAALD: { label: "Wordt vastgelegd", tone: "warn" },
  GEREGISTREERD: { label: "Geregistreerd", tone: "ok" },
  MISLUKT: { label: "Mislukt", tone: "crit" },
  GEANNULEERD: { label: "Geannuleerd", tone: "neutral" },
  OPGEZEGD: { label: "Opgezegd", tone: "neutral" },
};
// welke knoppen bij welke status (zelfde regels als lib/domeinen/bestelling.ts)
const KNOPPEN: Record<Status, { naar: Status; label: string }[]> = {
  OPEN: [{ naar: "GEANNULEERD", label: "Annuleren" }],
  BETAALD: [
    { naar: "GEREGISTREERD", label: "Geregistreerd" },
    { naar: "MISLUKT", label: "Mislukt" },
    { naar: "GEANNULEERD", label: "Annuleren" },
  ],
  MISLUKT: [
    { naar: "GEREGISTREERD", label: "Toch geregistreerd" },
    { naar: "GEANNULEERD", label: "Annuleren" },
  ],
  GEREGISTREERD: [],
  GEANNULEERD: [],
  // de klant betaalde toch en de opzegging is bij TransIP ingetrokken
  OPGEZEGD: [{ naar: "GEREGISTREERD", label: "Opzegging ingetrokken" }],
};
const dag = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

// Admin → Domeinen: wat er besteld is. Met de TransIP-koppeling legt ZekerFlex
// een betaalde naam vanzelf vast; de knop "Registreer bij TransIP" is voor een
// naam die bleef hangen. Zonder koppeling: met de hand en dan afvinken.
// Geregistreerd = meteen op de website van de klant. Verlengen gaat vanzelf
// (lib/domeinen/verlengen.ts): factuur, incasso, herinneringen, opzeggen.
export function DomeinBestellingen({ transip, ipv4, ipv6 }: { transip: boolean; ipv4: string; ipv6: string }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const r = await fetch("/api/admin/domeinen", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setFout("De bestellingen konden niet laden.");
    setRijen(((await r.json()) as { bestellingen: Rij[] }).bestellingen);
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function zet(rij: Rij, naar: Status) {
    if (naar === "GEANNULEERD" && !window.confirm(`${rij.domein} annuleren? Is er betaald, betaal het dan terug in Stripe.`)) return;
    setBezig(rij.id);
    setFout(null);
    setOk(null);
    const r = await fetch("/api/admin/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rij.id, status: naar }) }).catch(() => null);
    setBezig(null);
    if (!r?.ok) {
      const d = r ? ((await r.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
      return setFout(d.error?.message ?? "Aanpassen lukte niet.");
    }
    // de serverversie overnemen (die kan meer hebben veranderd)
    setRijen(((await r.json()) as { bestellingen: Rij[] }).bestellingen);
    setOk(`${rij.domein}: ${STATUS[naar].label.toLowerCase()}.${naar === "GEREGISTREERD" ? " De klant krijgt een mail; de notitie zegt of hij op de website staat." : ""}`);
  }

  // registreren in het TransIP-account van ZekerFlex: maakt daar een factuur
  async function registreer(rij: Rij) {
    if (!window.confirm(`${rij.domein} nu registreren bij TransIP? Dit maakt een factuur in het TransIP-account van ZekerFlex.`)) return;
    setBezig(rij.id);
    setFout(null);
    setOk(null);
    const r = await fetch("/api/admin/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rij.id, actie: "registreer" }) }).catch(() => null);
    setBezig(null);
    if (!r?.ok) {
      const d = r ? ((await r.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
      return setFout(d.error?.message ?? "Registreren lukte niet.");
    }
    setRijen(((await r.json()) as { bestellingen: Rij[] }).bestellingen);
    setOk(`${rij.domein} is geregistreerd bij TransIP en wijst naar onze server. De klant krijgt een mail.`);
  }

  const lijst = rijen ?? [];
  const teDoen = lijst.filter((r) => r.status === "BETAALD").length;
  const omzet = lijst.filter((r) => r.status === "BETAALD" || r.status === "GEREGISTREERD").reduce((s, r) => s + r.bedragCent, 0);
  return (
    <div className="space-y-4">
      <PageHead title="Domeinen" subtitle="Bestelde domeinnamen. Betaald = vanzelf vastgelegd en op de website van de klant; elk jaar een verlengfactuur, met incasso of betaallink." />
      {fout && (
        <Notice tone="crit" role="alert">
          {fout}
        </Notice>
      )}
      {ok && <Notice tone="ok">{ok}</Notice>}
      <KpiStrip
        items={[
          { label: "Te registreren", value: teDoen, ...(teDoen > 0 ? { tone: "warn" as const } : {}) },
          { label: "Geregistreerd", value: lijst.filter((r) => r.status === "GEREGISTREERD").length },
          { label: "In de bundel", value: lijst.filter((r) => r.bundel && r.status !== "GEANNULEERD").length },
          { label: "Betaald (incl. btw)", value: euroPrijs(omzet), tone: "money" },
        ]}
      />
      <Notice tone={transip ? "ok" : "warn"}>
        {transip ? (
          <>
            Een betaalde naam wordt vanzelf vastgelegd in het TransIP-account van ZekerFlex en wijst meteen naar onze server. Bleef er een hangen (&quot;Mislukt&quot; of &quot;Wordt
            vastgelegd&quot;), gebruik dan &quot;Registreer bij TransIP&quot;. Verlengen: 35 dagen vooraf een factuur, met incasso of betaallink; onbetaald wordt hij 7 dagen voor
            de verlengdatum opgezegd.
          </>
        ) : (
          <>
            De TransIP-sleutel staat nog niet op de server (Admin → Te doen), dus registreer met de hand in TransIP. Zet daar deze DNS-regels: A @ → {ipv4}, AAAA @ → {ipv6}, CNAME www → de
            domeinnaam zelf. Vink hem daarna hier af op &quot;Geregistreerd&quot;.
          </>
        )}
      </Notice>
      <Panel title="Bestellingen" flush>
        {rijen === null ? (
          <p className="p-4 text-sm" style={{ color: "var(--a-mute)" }}>
            Laden…
          </p>
        ) : (
          <DataTable
            columns={[
              { key: "domein", label: "Domein" },
              { key: "status", label: "Status" },
              { key: "bedrag", label: "Bedrag", align: "right" },
              { key: "klant", label: "Besteld door", hideOnMobile: true },
              { key: "op", label: "Besteld op", hideOnMobile: true },
              { key: "loopt", label: "Loopt tot", hideOnMobile: true },
              { key: "notitie", label: "Notitie", hideOnMobile: true },
              { key: "acties", label: "Actie" },
            ]}
            rows={lijst.map((r) => ({
              id: r.id,
              cells: {
                domein: <strong>{r.domein}</strong>,
                status: <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>,
                bedrag: r.bundel ? "Bundel" : euroPrijs(r.bedragCent),
                klant: r.email,
                op: datum(r.aangemaakt),
                loopt: r.verlooptOp ? `${dag(r.verlooptOp)}${r.status === "GEREGISTREERD" && !r.autoVerlengen ? " (niet verlengen)" : ""}` : "—",
                notitie: <span className="text-xs">{r.notitie}</span>,
                acties: (
                  <span className="flex flex-wrap gap-1.5">
                    {transip && (r.status === "BETAALD" || r.status === "MISLUKT") && (
                      <button type="button" className="a-button a-button-primary text-xs" disabled={bezig === r.id} onClick={() => void registreer(r)}>
                        Registreer bij TransIP
                      </button>
                    )}
                    {KNOPPEN[r.status].map((k) => (
                      <button key={k.naar} type="button" className="a-button text-xs" disabled={bezig === r.id} onClick={() => void zet(r, k.naar)}>
                        {k.label}
                      </button>
                    ))}
                  </span>
                ),
              },
              sort: { domein: r.domein, status: r.status, bedrag: r.bedragCent, klant: r.email, op: r.aangemaakt },
              search: `${r.domein} ${r.email}`,
            }))}
            csvName="domeinbestellingen"
            emptyText="Nog geen domeinen besteld."
            defaultSort={{ key: "op", dir: "desc" }}
          />
        )}
      </Panel>
    </div>
  );
}
