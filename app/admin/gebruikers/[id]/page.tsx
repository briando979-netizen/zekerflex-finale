import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { freelancerActivity } from "@/lib/admin/insights/detail";
import { count, dateNl, dateTimeNl, euro, timeAgoNl } from "@/lib/admin/format";
import { Avatar, Empty, Feed, InfoList, KpiStrip, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { UserActions } from "@/components/admin/UserActions";
import { IdentityCheckActions } from "@/components/admin/IdentityCheckActions";
import { KycOverride } from "@/components/admin/KycOverride";
import { InspectLinkPanel } from "@/components/admin/InspectLinkPanel";
import { ChooseViewAsAccount } from "@/components/admin/ViewAsControls";
import { ComplianceDocActions } from "@/components/admin/ComplianceDocActions";
import { listDocs, type DocKind, type DocStatus } from "@/lib/compliance/documents";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Freelancer",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
  SALES: "Sales",
};

// "AI_LOCAL" describes which check attempted the review, not that it
// succeeded — on a deployment with no reachable LLM it always degrades to
// "in_review" (see lib/onboarding/verify.ts), so label it by what a human
// reviewer actually needs to know: how the identity was submitted.
const CHECK_PROVIDER_LABEL: Record<string, string> = {
  AI_LOCAL: "Zelf-verificatie (foto's)",
  DIGITAL_WALLET: "Digitale ID-wallet",
  DIDIT: "Didit (extern)",
  ADMIN_MANUAL: "Handmatig door beheerder",
};

const KYC: Record<string, { label: string; tone: Tone }> = {
  VERIFIED: { label: "Identiteit geverifieerd", tone: "trust" },
  PENDING: { label: "Identiteit in beoordeling", tone: "warn" },
  NOT_STARTED: { label: "Identiteit niet gestart", tone: "neutral" },
  REJECTED: { label: "Identiteit afgewezen", tone: "crit" },
  EXPIRED: { label: "Identiteit verlopen", tone: "crit" },
};

const CHECK_STATUS: Record<string, { label: string; tone: Tone }> = {
  VERIFIED: { label: "Geverifieerd", tone: "ok" },
  REJECTED: { label: "Afgewezen", tone: "crit" },
  PENDING: { label: "In behandeling", tone: "warn" },
};

const DOC_KIND_LABEL: Record<DocKind, string> = {
  id: "Identiteitsbewijs",
  bank: "Bankafschrift",
  other: "Overig",
};

const DOC_STATUS_TONE: Record<DocStatus, Tone> = {
  approved: "ok",
  uploaded: "warn",
  rejected: "crit",
};

const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  approved: "Goedgekeurd",
  uploaded: "In behandeling",
  rejected: "Afgekeurd",
};

function fileSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} kB`;
}

export default async function GebruikerDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      memberships: { include: { tenant: { select: { id: true, name: true } } } },
      freelancerProfile: true,
      identityChecks: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  if (!user) {
    return (
      <div>
        <PageHead title="Gebruiker niet gevonden" subtitle={params.id} />
        <Link href="/admin/gebruikers" className="text-sm font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>← Terug naar gebruikers</Link>
      </div>
    );
  }

  const [auditEntries, approvedCount, disputesRaised, payoutTotal, docs, activity] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorUserId: user.id }, { targetType: "user", targetId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, category: true, action: true, severity: true, summary: true, createdAt: true },
    }),
    prisma.timesheet.count({ where: { approvedById: user.id } }),
    prisma.dispute.count({ where: { raisedById: user.id } }),
    prisma.invoice.aggregate({
      where: { issuerFreelancerId: user.freelancerProfile?.id ?? "__none__", status: "PAID" },
      _sum: { totalCents: true },
    }),
    listDocs(user.id),
    user.freelancerProfile ? freelancerActivity(user.freelancerProfile.id) : Promise.resolve(null),
  ]);

  const isDeleted = user.email.endsWith("@verwijderd.zekerflex.invalid");
  const kyc = KYC[user.kycStatus] ?? { label: `Identiteit: ${user.kycStatus}`, tone: "neutral" as const };
  const profile = user.freelancerProfile;

  return (
    <div className="space-y-4">
      <Link href="/admin/gebruikers" className="inline-block text-xs font-medium hover:underline" style={{ color: "var(--a-mute)" }}>← Alle gebruikers</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={user.fullName} size={56} />
          <div className="min-w-0">
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.625rem]" style={{ color: "var(--a-text)" }}>{user.fullName}</h1>
            <p className="mt-0.5 break-all text-sm" style={{ color: "var(--a-mute)" }}>{user.email}{user.phone ? `, ${user.phone}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={user.disabledAt ? "crit" : "ok"}>{user.disabledAt ? "Geblokkeerd" : "Actief"}</Pill>
              <Pill tone={user.emailVerifiedAt ? "ok" : "warn"}>{user.emailVerifiedAt ? "E-mail bevestigd" : "E-mail niet bevestigd"}</Pill>
              <Pill tone={kyc.tone}>{kyc.label}</Pill>
            </div>
          </div>
        </div>
        {!isDeleted && <UserActions userId={user.id} blocked={Boolean(user.disabledAt)} />}
      </header>

      {activity ? (
        <KpiStrip
          items={[
            { label: "Gewerkte uren", value: count(Math.round(activity.totalHours)), hint: "goedgekeurd", spark: activity.hoursSeries },
            { label: "Verdiend", value: euro(activity.earnedCents), hint: `${euro(payoutTotal._sum.totalCents ?? 0)} op betaalde facturen` },
            { label: "Klussen", value: count(activity.assignments), hint: activity.cancelled > 0 ? `${count(activity.cancelled)} geannuleerd` : "geen annuleringen" },
            { label: "Laatst ingelogd", value: user.lastLoginAt ? timeAgoNl(user.lastLoginAt) : "Nooit", hint: `lid sinds ${dateNl(user.createdAt)}` },
          ]}
        />
      ) : (
        <KpiStrip
          items={[
            { label: "Laatst ingelogd", value: user.lastLoginAt ? timeAgoNl(user.lastLoginAt) : "Nooit", hint: `lid sinds ${dateNl(user.createdAt)}` },
            { label: "Uren goedgekeurd", value: count(approvedCount), hint: "als manager" },
            { label: "Disputen ingediend", value: count(disputesRaised) },
            { label: "Organisaties", value: count(user.memberships.filter((m) => m.tenant).length) },
          ]}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {activity && (
            <Panel title="Uren per maand" subtitle="Goedgekeurde uren, de laatste 12 maanden">
              <Chart title="Goedgekeurde uren per maand" kind="bars" unit="hours" labels={activity.labels} series={[{ label: "Uren", values: activity.hoursSeries }]} height={180} emptyText="Nog geen goedgekeurde uren." />
            </Panel>
          )}

          <Panel title="Wat er gebeurde" subtitle="Het auditspoor van dit account">
            <Feed
              emptyText="Er is nog niets vastgelegd voor dit account."
              items={auditEntries.map((e) => ({
                key: e.id,
                text: e.summary,
                meta: `${dateTimeNl(e.createdAt)}, ${e.category}`,
                ...(e.severity === "critical" ? { tone: "crit" as const } : e.severity === "warning" ? { tone: "warn" as const } : {}),
              }))}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel flush title="Rollen & organisaties">
            {user.memberships.length === 0 ? (
              <Empty title="Geen rol" body="Deze gebruiker heeft nog geen rol." />
            ) : (
              <ul>
                {user.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <span className="font-medium" style={{ color: "var(--a-text)" }}>{ROLE_LABEL[m.role] ?? m.role}</span>
                    {m.tenant && (
                      <Link href={`/admin/bedrijven/${m.tenant.id}`} className="min-w-0 truncate hover:underline" style={{ color: "var(--a-accent-ink)" }}>{m.tenant.name} →</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Gegevens">
            <InfoList
              rows={[
                { label: "Lid sinds", value: dateTimeNl(user.createdAt) },
                { label: "Laatst ingelogd", value: user.lastLoginAt ? dateTimeNl(user.lastLoginAt) : "Nooit" },
                { label: "Uren goedgekeurd als manager", value: count(approvedCount) },
                { label: "Disputen ingediend", value: count(disputesRaised) },
                ...(profile
                  ? [
                      { label: "KVK", value: profile.kvkNumber ? `${profile.kvkNumber}${profile.kvkValid ? ", gecontroleerd" : ", niet gecontroleerd"}` : "—" },
                      { label: "IBAN", value: profile.payoutIban ?? "—" },
                      { label: "Fiscale gegevens", value: <Link href="/admin/fiscaal" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Openen →</Link> },
                    ]
                  : []),
              ]}
            />
          </Panel>

          {!isDeleted && !user.memberships.some((m) => m.role === "PLATFORM_ADMIN" || m.role === "SALES") && (
            <Panel flush title="Bekijk als & AI-inspectie" subtitle="Alleen-lezen">
              <ChooseViewAsAccount
                userId={user.id}
                roles={[
                  ...(user.memberships.some((m) => m.role === "FREELANCER") ? (["freelancer"] as const) : []),
                  ...(user.memberships.some((m) => m.role === "HQ_ADMIN" || m.role === "LOCAL_MANAGER") ? (["employer"] as const) : []),
                ]}
              />
              <InspectLinkPanel userId={user.id} />
            </Panel>
          )}

          <Panel flush title="Identiteitscontroles">
            {!isDeleted && <KycOverride userId={user.id} status={user.kycStatus} />}
            {user.identityChecks.length === 0 ? (
              <Empty title="Geen controles" body="Er is nog geen identiteitscontrole gestart." />
            ) : (
              <ul>
                {user.identityChecks.map((c) => {
                  const status = CHECK_STATUS[c.status] ?? { label: c.status, tone: "warn" as const };
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <span style={{ color: "var(--a-dim)" }}>{CHECK_PROVIDER_LABEL[c.provider] ?? c.provider}</span>
                      <span className="flex items-center gap-3">
                        <Pill tone={status.tone}>{status.label}</Pill>
                        {c.status === "PENDING" && <IdentityCheckActions userId={user.id} checkId={c.id} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel flush title="Documenten">
            {docs.length === 0 ? (
              <Empty title="Nog niets geüpload" body="Deze gebruiker heeft nog geen document geüpload." />
            ) : (
              <ul>
                {docs.map((d) => {
                  const fileUrl = `/api/admin/gebruikers/${user.id}/documents/${d.id}`;
                  const isImage = d.mimeType.startsWith("image/");
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <a href={fileUrl} target="_blank" rel="noreferrer" className="flex-shrink-0">
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fileUrl} alt={`${DOC_KIND_LABEL[d.kind]} van ${user.fullName}`} className="h-14 w-14 rounded-lg object-cover" style={{ border: "1px solid var(--a-border)" }} />
                        ) : (
                          <span className="grid h-14 w-14 place-items-center rounded-lg text-[10px] uppercase" style={{ border: "1px solid var(--a-border)", background: "var(--a-panel-2)", color: "var(--a-mute)" }}>
                            {d.mimeType.split("/")[1] ?? "bestand"}
                          </span>
                        )}
                      </a>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium" style={{ color: "var(--a-text)" }}>{DOC_KIND_LABEL[d.kind]}</p>
                        <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                          {dateTimeNl(d.uploadedAt)}, {fileSize(d.sizeBytes)}
                          {d.note ? `, ${d.note}` : ""}
                        </p>
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>Volledig bekijken →</a>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-2">
                        <Pill tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Pill>
                        {d.kind === "bank" && d.status === "uploaded" && <ComplianceDocActions userId={user.id} docId={d.id} />}
                        {d.kind === "id" && <span className="text-xs" style={{ color: "var(--a-mute)" }}>via Identiteitscontroles</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
