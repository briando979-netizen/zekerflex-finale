"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, InlineAsk, type TableRow } from "@/components/admin/kit-client";
import { NameCell, Pill } from "@/components/admin/kit";
import { SOORT_LABEL, STAP_LABEL, STATUS_INFO, dealEuro, type ScanSoort, type ScanStap, type ScanStatus } from "@/lib/scans/model";

// De tabel van Admin → Scans & deals (app/admin/scans/page.tsx). Alleen weergave.

export interface ScanRij {
  sleutel: string;
  soort: ScanSoort;
  at: string;
  naam: string;
  host: string | null;
  plaats: string | null;
  score: number;
  samenvatting: string;
  rapport: string;
  status: ScanStatus;
  stappen: { stap: ScanStap; at: string; info: string | null }[];
  siteSlug: string | null;
  lead: { status: string; contact: string | null; bron: string } | null;
  deal: { id: string; status: "open" | "bekeken" | "akkoord"; gekozen: string[]; eenmalig: number; maand: number; verlopen: boolean } | null;
  /** e-mailadres van het bedrijf (lead of hun site), om het voorstel naar te mailen */
  email: string | null;
  /** wanneer sales het voorstel het laatst mailde */
  opgevolgd: string | null;
}

const DEAL_LABEL = { open: "Nog niet bekeken", bekeken: "Bekeken", akkoord: "Akkoord" } as const;
const LEAD_LABEL: Record<string, string> = {
  NEW: "Nieuw",
  ENRICHED: "Aangevuld",
  QUEUED: "In de wachtrij",
  DRAFTED: "Bericht klaar",
  APPROVED: "Goedgekeurd",
  SENT: "Benaderd",
  REPLIED: "Gereageerd",
  BOUNCED: "Mail kwam terug",
  UNSUBSCRIBED: "Afgemeld",
  WON: "Gewonnen",
  LOST: "Verloren",
  DISQUALIFIED: "Afgewezen",
};
const tijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ScansTabel({ rijen }: { rijen: ScanRij[] }) {
  const router = useRouter();
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  async function stuur(r: ScanRij, email: string) {
    setMelding(null);
    const res = await fetch("/api/admin/scans/opvolgen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sleutel: r.sleutel, email }) }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMelding({ ok: false, tekst: body?.error?.message ?? "Versturen lukte niet." });
      return;
    }
    setMelding({ ok: true, tekst: `Voorstel voor ${r.naam} gemaild naar ${email}.` });
    router.refresh();
  }

  const rows: TableRow[] = rijen.map((r) => {
    const vervolg = r.stappen.filter((s) => s.stap !== "gescand");
    return {
      id: r.sleutel,
      cells: {
        datum: <span className="whitespace-nowrap text-xs">{tijd(r.at)}</span>,
        bedrijf: <NameCell name={r.naam} sub={[r.host, r.plaats].filter(Boolean).join(" · ") || SOORT_LABEL[r.soort]} />,
        scan: (
          <span className="text-xs">
            <a href={r.rapport} target="_blank" rel="noopener" className="font-semibold underline-offset-2 hover:underline">
              {SOORT_LABEL[r.soort]} {r.score}/100
            </a>
            <span className="block" style={{ color: "var(--a-mute)" }}>
              {r.samenvatting}
            </span>
          </span>
        ),
        status: <Pill tone={STATUS_INFO[r.status].tone}>{STATUS_INFO[r.status].label}</Pill>,
        vervolg: vervolg.length ? (
          <ul className="space-y-0.5 text-xs">
            {vervolg.map((s, i) => (
              <li key={`${s.stap}-${i}`}>
                {STAP_LABEL[s.stap]}
                {s.info ? ` (${s.info})` : ""} <span style={{ color: "var(--a-mute)" }}>· {tijd(s.at)}</span>
              </li>
            ))}
            {r.siteSlug && (
              <li>
                <a href={`/site/${r.siteSlug}`} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
                  Nieuwe site bekijken
                </a>
              </li>
            )}
          </ul>
        ) : (
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            Bleef bij de scan
          </span>
        ),
        lead: r.lead ? (
          <span className="text-xs">
            <Link href="/admin/sales" className="font-semibold underline-offset-2 hover:underline">
              {r.lead.contact ? `Warm: ${r.lead.contact}` : "Automatisch"}
            </Link>
            <span className="block" style={{ color: "var(--a-mute)" }}>
              {LEAD_LABEL[r.lead.status] ?? "Onbekend"}
            </span>
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            Geen (test of eigen site)
          </span>
        ),
        deal: r.deal ? (
          <span className="text-xs">
            <a href={`/deal/${r.deal.id}`} target="_blank" rel="noopener" className="font-semibold underline-offset-2 hover:underline">
              {DEAL_LABEL[r.deal.status]}
            </a>
            <span className="block" style={{ color: "var(--a-mute)" }}>
              {r.deal.status === "akkoord" ? `${dealEuro(r.deal.eenmalig)} + ${dealEuro(r.deal.maand)}/mnd` : `${r.deal.gekozen.length} aanbevolen`}
            </span>
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            –
          </span>
        ),
        opvolgen: r.opgevolgd ? (
          <span className="text-xs">
            Gemaild <span style={{ color: "var(--a-mute)" }}>· {tijd(r.opgevolgd)}</span>
          </span>
        ) : r.deal && r.deal.status !== "akkoord" && !r.deal.verlopen && r.status !== "akkoord" ? (
          <InlineAsk label="Stuur voorstel" question="E-mailadres van het bedrijf" initial={r.email ?? ""} placeholder="info@bedrijf.nl" required submitLabel="Mail voorstel" onSubmit={(email) => stuur(r, email)} />
        ) : (
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            –
          </span>
        ),
      },
      sort: { datum: r.at, bedrijf: r.naam.toLowerCase(), scan: r.score, status: r.status },
      search: [r.naam, r.host, r.plaats, r.samenvatting].filter(Boolean).join(" "),
      filters: { soort: r.soort, status: r.status, opvolging: r.opgevolgd ? "opgevolgd" : "niet" },
      csv: {
        datum: r.at,
        bedrijf: r.naam,
        website: r.host,
        soort: SOORT_LABEL[r.soort],
        score: r.score,
        status: STATUS_INFO[r.status].label,
        vervolg: vervolg.map((s) => STAP_LABEL[s.stap]).join(", "),
        lead: r.lead ? (r.lead.contact ? `warm: ${r.lead.contact}` : "automatisch") : "",
        voorstel: r.deal ? DEAL_LABEL[r.deal.status] : "",
      },
    };
  });
  return (
    <>
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className="mx-4 mb-3 text-sm sm:mx-5" style={{ color: melding.ok ? "var(--a-ok-ink)" : "var(--a-crit)" }}>
          {melding.tekst}
        </p>
      )}
      <DataTable
        columns={[
          { key: "datum", label: "Wanneer" },
          { key: "bedrijf", label: "Bedrijf" },
          { key: "scan", label: "Scan", hideOnMobile: true },
          { key: "status", label: "Status" },
          { key: "vervolg", label: "Vervolg", hideOnMobile: true },
          { key: "lead", label: "Lead", hideOnMobile: true },
          { key: "deal", label: "Voorstel" },
          { key: "opvolgen", label: "Opvolgen" },
        ]}
        rows={rows}
        filters={[
          { key: "soort", label: "Soort", options: (Object.keys(SOORT_LABEL) as ScanSoort[]).map((s) => ({ value: s, label: SOORT_LABEL[s] })) },
          { key: "status", label: "Status", chips: true, options: (Object.keys(STATUS_INFO) as ScanStatus[]).map((s) => ({ value: s, label: STATUS_INFO[s].label })) },
          { key: "opvolging", label: "Opvolging", options: [{ value: "niet", label: "Nog niet gemaild" }, { value: "opgevolgd", label: "Voorstel gemaild" }] },
        ]}
        searchPlaceholder="Zoek op bedrijf, website of plaats"
        csvName="scans"
        emptyText="Nog geen scans."
        defaultSort={{ key: "datum", dir: "desc" }}
      />
    </>
  );
}
