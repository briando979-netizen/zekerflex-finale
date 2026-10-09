import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader, APanel, APill, AStat } from "@/components/admin/ui";
import { getUitzendbureauOverview } from "@/lib/uitzendbureau/admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nieuw",
  ENRICHED: "Verrijkt",
  QUEUED: "In wachtrij",
  DRAFTED: "Concept klaar",
  APPROVED: "Goedgekeurd",
  SENT: "Benaderd",
  REPLIED: "Gereageerd",
  BOUNCED: "Onbezorgbaar",
  UNSUBSCRIBED: "Afgemeld",
  WON: "Klant",
  LOST: "Verloren",
  DISQUALIFIED: "Afgewezen",
};
const STATUS_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  NEW: "warn",
  WON: "ok",
  REPLIED: "ok",
  LOST: "crit",
  DISQUALIFIED: "crit",
  BOUNCED: "crit",
  UNSUBSCRIBED: "crit",
};

function nlDateTime(d: Date): string {
  return d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function UitzendbureauAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Het uitzendbureau-overzicht is alleen voor beheerders." />;
  }

  const { leads, clients } = await getUitzendbureauOverview();
  const openPositions = clients.reduce((n, c) => n + c.openPositions, 0);
  const filledPositions = clients.reduce((n, c) => n + c.filledPositions, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <APageHeader
        title="Uitzendbureau"
        subtitle="Bedrijven die personeel via het ZekerFlex-uitzendbureau afnemen — van eerste aanvraag tot actieve klant."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <AStat label="Aanvragen" value={leads.length} />
        <AStat label="Actieve klanten" value={clients.length} />
        <AStat label="Open plekken" value={openPositions} />
        <AStat label="Bezette plekken" value={filledPositions} />
      </div>

      <APanel title="Actieve klanten" subtitle="Bedrijven met minstens één klus via het uitzendbureau.">
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            Nog geen klussen met het uitzendbureau-vinkje.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {clients.map((c) => (
              <div
                key={c.tenantId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ background: "var(--a-elev)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {c.tenantName}
                  </p>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {c.shiftCount} {c.shiftCount === 1 ? "klus" : "klussen"} · {c.filledPositions} bezet, {c.openPositions} open
                    {c.nextShiftAt ? ` · eerstvolgende ${nlDateTime(c.nextShiftAt)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </APanel>

      <div className="mt-6">
        <APanel
          title="Aanvragen"
          subtitle="Binnengekomen via het contactformulier op /uitzendbureau."
          action={<span className="text-xs" style={{ color: "var(--a-mute)" }}>{leads.length}</span>}
        >
          {leads.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--a-mute)" }}>
              Nog geen aanvragen binnengekomen.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {leads.map((l) => (
                <div key={l.id} className="rounded-xl px-4 py-3" style={{ background: "var(--a-elev)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                      {l.companyName}
                    </p>
                    <APill tone={STATUS_TONE[l.status] ?? "neutral"}>{STATUS_LABEL[l.status] ?? l.status}</APill>
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
                    {l.contactName ?? "—"}
                    {l.contactEmail ? ` · ${l.contactEmail}` : ""}
                    {l.contactPhone ? ` · ${l.contactPhone}` : ""} · {nlDateTime(l.createdAt)}
                  </p>
                  {l.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs" style={{ color: "var(--a-dim)" }}>
                      {l.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </APanel>
      </div>
    </div>
  );
}
