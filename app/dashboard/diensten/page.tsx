import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { getMyWork, type MyWorkItem } from "@/lib/dashboard/my-work";
import { PageHeader, moneyExact } from "@/components/app/ui";
import { ShiftCard, ShiftStatusButton } from "@/components/app/ShiftCard";
import { ShiftConfirm } from "@/components/app/ShiftConfirm";
import { AgreementBadge } from "@/components/app/AgreementBadge";
import { CancellationClaimButton } from "@/components/app/CancellationClaimButton";

export const dynamic = "force-dynamic";

const AGREEMENT_LABEL: Record<string, string> = {
  VRIJE_VERVANGING: "Vrije vervanging",
  GEEN_WERKGEVERSGEZAG: "Geen werkgeversgezag",
  TUSSENKOMST: "Tussenkomst",
  BRANCHE: "Branchemodel",
};

function agreementNode(item: MyWorkItem) {
  if (!item.agreement) return null;
  return (
    <div className="mt-3 rounded-lg border border-hair bg-paper-soft px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutralx-400">Modelovereenkomst</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-neutralx-600">{item.agreement.reference}</span>
        <AgreementBadge
          status={item.agreement.status}
          freelancerSigned={item.agreement.freelancerSigned}
          clientSigned={item.agreement.clientSigned}
        />
      </div>
      <p className="mt-1 text-[11px] text-neutralx-400">
        {AGREEMENT_LABEL[item.agreement.type] ?? item.agreement.type} · Wet DBA-proof
      </p>
    </div>
  );
}

export default async function MijnDienstenPage() {
  const principal = await requirePrincipal();
  const work = await getMyWork(principal.userId);

  const counts = { pending: work.pending.length, active: work.active.length, history: work.history.length };

  return (
    <>
      <PageHeader
        title="Mijn klussen"
        subtitle="Alles wat je hebt aangenomen, aangeboden of afgerond — met je modelovereenkomst per klus."
        eyebrow="Overzicht"
      />

      {/* status strip */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          { k: "pending", label: "In afwachting", n: counts.pending, tone: "warn" as const, sub: "wacht op antwoord" },
          { k: "active", label: "Geactiveerd", n: counts.active, tone: "brand" as const, sub: "aankomend & bevestigd" },
          { k: "history", label: "Afgerond & niet uitgekozen", n: counts.history, tone: "default" as const, sub: "historie" },
        ].map((c) => (
          <div key={c.k} className="surface p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutralx-500">{c.label}</p>
            <p
              className={`num mt-1 font-display text-2xl font-bold ${
                c.tone === "warn" ? "text-warn" : c.tone === "brand" ? "text-brand-600" : "text-ink"
              }`}
            >
              {c.n}
            </p>
            <p className="mt-0.5 text-xs text-neutralx-400">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* In afwachting */}
      <Section
        title="In afwachting"
        note="Je bod of aanmelding loopt. De knop is voor jou zichtbaar maar nog niet actief tot de werkgever reageert."
      >
        {work.pending.length === 0 ? (
          <Empty text="Geen openstaande aanmeldingen of tegenbiedingen." />
        ) : (
          <Grid>
            {work.pending.map((item) => (
              <ShiftCard
                key={item.shift.id}
                shift={item.shift}
                href={`/dashboard/klussen/${item.shift.id}`}
                ribbon={{ label: "In afwachting", tone: "amber" }}
                footerOverride={
                  <div className="space-y-2">
                    <ShiftStatusButton
                      label={
                        item.offerRateCents
                          ? `Tegenbod ${moneyExact(item.offerRateCents)}/u`
                          : "Aanmelding verstuurd"
                      }
                      hint={item.offerStatusLabel ?? "in afwachting"}
                      tone="warn"
                    />
                    <Link
                      href={`/dashboard/klussen/${item.shift.id}`}
                      className="block text-center text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      Bekijk klus
                    </Link>
                  </div>
                }
              />
            ))}
          </Grid>
        )}
      </Section>

      {/* Geactiveerd */}
      <Section title="Geactiveerd" note="Bevestigde en aankomende diensten. Bevestig je komst of regel op tijd een vervanger.">
        {work.active.length === 0 ? (
          <Empty text="Nog geen aankomende diensten. Neem er een aan bij Klussen." />
        ) : (
          <Grid>
            {work.active.map((item) => (
              <div key={item.assignmentId ?? item.shift.id} className="flex flex-col">
                <ShiftCard
                  shift={item.shift}
                  href={`/dashboard/klussen/${item.shift.id}`}
                  ribbon={
                    item.replacementRequested
                      ? { label: "Vervanging gevraagd", tone: "crit" }
                      : { label: "Geactiveerd", tone: "brand" }
                  }
                  footerOverride={
                    <div className="space-y-2">
                      {item.assignmentId && (
                        <ShiftConfirm
                          assignmentId={item.assignmentId}
                          confirmedAt={item.confirmedAt}
                          replacementRequested={item.replacementRequested}
                        />
                      )}
                      {agreementNode(item)}
                    </div>
                  }
                />
              </div>
            ))}
          </Grid>
        )}
      </Section>

      {/* Historie */}
      <Section title="Afgerond & niet uitgekozen" note="Je werkverleden op ZekerFlex, inclusief biedingen die niet zijn gekozen.">
        {work.history.length === 0 ? (
          <Empty text="Nog geen historie." />
        ) : (
          <Grid>
            {work.history.map((item) => (
              <ShiftCard
                key={(item.assignmentId ?? item.shift.id) + item.status}
                shift={item.shift}
                href={`/dashboard/klussen/${item.shift.id}`}
                dim
                ribbon={{
                  label:
                    item.status === "cancelled"
                      ? "Geannuleerd"
                      : item.status === "rejected"
                        ? "Niet uitgekozen"
                        : "Afgerond",
                  tone: item.status === "cancelled" || item.status === "rejected" ? "crit" : "neutral",
                }}
                footerOverride={
                  <div className="flex flex-col gap-2">
                    <ShiftStatusButton
                      label={statusLabel(item)}
                      tone={
                        item.timesheetStatus === "PAID"
                          ? "ok"
                          : item.status === "cancelled" || item.status === "rejected"
                            ? "crit"
                            : "neutral"
                      }
                    />
                    {item.cancelledByEmployer && (
                      <CancellationClaimButton shiftId={item.shift.id} shiftTitle={item.shift.title} />
                    )}
                  </div>
                }
              />
            ))}
          </Grid>
        )}
      </Section>
    </>
  );
}

function statusLabel(item: MyWorkItem): string {
  if (item.status === "cancelled") return "Geannuleerd";
  if (item.status === "rejected") return item.offerRateCents ? "Tegenbod afgewezen" : "Niet uitgekozen";
  switch (item.timesheetStatus) {
    case "PAID":
      return "Uitbetaald";
    case "APPROVED":
      return "Goedgekeurd";
    case "SUBMITTED":
      return "Uren ingediend";
    case "DISPUTED":
      return "In dispuut";
    default:
      return "Afgerond";
  }
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-neutralx-500">{note}</p>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairstrong bg-paper-soft/60 px-5 py-10 text-center text-sm text-neutralx-500">
      {text}
    </div>
  );
}
