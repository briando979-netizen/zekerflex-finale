import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { EigenTestSchakelaar } from "@/components/admin/EigenTestSchakelaar";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { prisma } from "@/lib/prisma";
import { freelancerActivity } from "@/lib/admin/insights/detail";
import { count, dateNl, dateTimeNl, euro, timeAgoNl } from "@/lib/admin/format";
import { Avatar, Empty, Feed, InfoList, KpiStrip, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { UserActions } from "@/components/admin/UserActions";
import { IdentityCheckActions } from "@/components/admin/IdentityCheckActions";
import { IdFoto, KopFoto } from "@/components/admin/IdFoto";
import { StripeFotoSleutel } from "@/components/admin/StripeFotoSleutel";
import { stripeFotoSleutelInfo } from "@/lib/kyc/stripe-fotos";
import { KycOverride } from "@/components/admin/KycOverride";
import { InspectLinkPanel } from "@/components/admin/InspectLinkPanel";
import { ChooseViewAsAccount } from "@/components/admin/ViewAsControls";
import { ComplianceDocActions } from "@/components/admin/ComplianceDocActions";
import { listDocs, type DocKind, type DocStatus } from "@/lib/compliance/documents";
import { WerkrechtActions } from "@/components/admin/WerkrechtActions";
import { werkrechtOverzicht } from "@/lib/werkrecht/store";
import { landNaam, type WerkrechtStand } from "@/lib/werkrecht/landen";
import { onboardingData } from "@/lib/admin/insights/onboarding";
import { OnboardingActies } from "@/components/admin/OnboardingActies";
import { isOnboardingAudit, stappenVan, tijdlijn, vastStatus } from "@/lib/admin/onboarding-model";
import { getFiscal } from "@/lib/fiscal/store";
import { kvGet } from "@/lib/storage/kv";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { FOTO_SOORTEN, PROVIDER_LABEL, STRIPE_MET_RAPPORT, fotoUploadId, idControleWeergave, stripeSessieUrl, stripeZonderUitslag, type FotoSoort } from "@/lib/admin/kyc-weergave";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { poortSamenvatting, poortStappen } from "@/lib/admin/werker-poort-weergave";
import { isReservedTestAddress } from "@/lib/mail/test-adres";

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

const WERKRECHT_STAND: Record<WerkrechtStand, { label: string; tone: Tone }> = {
  "verklaring-nodig": { label: "Verklaring nog niet aangevinkt", tone: "warn" },
  "bewijs-nodig": { label: "Document nodig", tone: "warn" },
  wacht: { label: "Wacht op jou", tone: "warn" },
  afgewezen: { label: "Afgewezen", tone: "crit" },
  verlopen: { label: "Verlopen", tone: "warn" },
  ok: { label: "In orde", tone: "ok" },
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
      identityChecks: { orderBy: { createdAt: "desc" }, take: 10 },
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

  const [auditEntries, approvedCount, disputesRaised, payoutTotal, docs, activity, onboarding, onbFiscal, onbHerinnering] = await Promise.all([
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
    onboardingData({ testMeetellen: true, alleenId: user.id }).then((d) => d.rijen[0] ?? null).catch(() => null),
    getFiscal(user.id).catch(() => null),
    kvGet<{ stage?: number; at?: string; handmatig?: number }>(`onboarding-reminder:${user.id}`).catch(() => null),
  ]);

  // recht om te werken per land (lib/werkrecht), alleen bij werkers
  const werkrechten = user.freelancerProfile ? await werkrechtOverzicht(user.id) : [];

  const isDeleted = user.email.endsWith("@verwijderd.zekerflex.invalid");
  const kyc = KYC[user.kycStatus] ?? { label: `Identiteit: ${user.kycStatus}`, tone: "neutral" as const };
  const profile = user.freelancerProfile;
  // de poort van de werker-app (lib/onboarding/werker-poort.ts): zolang die dicht is, ziet de werker alleen de onboarding.
  // Een goedgekeurde ID is maar één van de stappen; het blok "Onboarding" hieronder is de trechter, niet de poort.
  const poortTest = isReservedTestAddress(user.email);
  const poort = profile && !isDeleted && !poortTest ? await werkerPoortStand(user.id).catch(() => null) : null;
  const poortLijst = poort ? poortStappen(poort, poort.workerKind) : [];
  // de profielfoto (KV profile-user:<id>) en de laatste in- en uitchecks met plek (GpsEvent)
  const [avatars, stripeSleutel, checkins] = await Promise.all([
    getUserAvatars([user.id]).catch(() => ({}) as Record<string, string>),
    stripeFotoSleutelInfo().catch(() => null),
    profile
      ? prisma.gpsEvent
          .findMany({
            where: { timesheet: { freelancerId: profile.id } },
            orderBy: { recordedAt: "desc" },
            take: 12,
            select: {
              id: true,
              type: true,
              recordedAt: true,
              latitude: true,
              longitude: true,
              accuracyMeters: true,
              distanceToBranchMeters: true,
              withinGeofence: true,
              mocked: true,
              bron: true,
              timesheet: { select: { assignment: { select: { shift: { select: { title: true, branch: { select: { name: true } } } } } } } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const fotoUrl = avatarUrlFor(user.id, Boolean(avatars[user.id]));
  // Stripe-controles: de foto's staan bij Stripe en komen via de beperkte sleutel (lib/kyc/stripe-fotos.ts)
  const stripeFotosVan = (c: (typeof user.identityChecks)[number]) =>
    c.provider === "STRIPE_IDENTITY" && Boolean(stripeSleutel) && Boolean(c.sessionId) && STRIPE_MET_RAPPORT.has(c.decisionStatus ?? "");
  const fotosVan = (c: (typeof user.identityChecks)[number]): FotoSoort[] =>
    stripeFotosVan(c)
      ? FOTO_SOORTEN.map((f) => f.id).filter((f) => f !== "selfie2" && !(f === "back" && c.documentType === "PASSPORT"))
      : // een paspoort heeft geen achterkant: sinds 12 nov stuurt de scan de fotopagina als tweede beeld mee (lib/kyc/document-zijden.ts),
        // en eerder fotografeerden werkers die pagina vaak twee keer; die kopie tonen als "Achterkant" zag eruit als een fout
        idControleWeergave(c.provider, c.rawPayload).fotos.filter((f) => !(f === "back" && c.documentType === "PASSPORT"));
  // geen profielfoto: dan de selfie van de nieuwste (liefst goedgekeurde) ID-controle
  const metSelfie = user.identityChecks.filter((c) => (stripeFotosVan(c) ? true : Boolean(fotoUploadId(c.rawPayload, "selfie"))));
  const selfieCheck = fotoUrl ? null : (metSelfie.find((c) => c.status === "VERIFIED") ?? metSelfie[0] ?? null);
  const kopSelfie = selfieCheck ? `/api/admin/gebruikers/${user.id}/identiteit/${selfieCheck.id}/beeld?welk=selfie` : null;
  const kaartLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=16/${lat.toFixed(5)}/${lng.toFixed(5)}`;
  const onbStatus = onboarding ? vastStatus(onboarding, new Date()) : null;
  // "eigen test (telt niet mee)": een account van de eigenaar zelf (lib/admin/eigen-test-kern.ts)
  const eigenTest = await leesEigenTest();
  const onbStappen = onboarding ? stappenVan(onboarding.doelgroep) : [];
  const onbTijdlijn = onboarding
    ? tijdlijn({
        aangemeld: user.createdAt,
        emailBevestigdOp: user.emailVerifiedAt,
        laatsteInlog: user.lastLoginAt,
        profielAangemaakt: profile?.createdAt ?? null,
        soort: onboarding.doelgroep === "werker" ? (onbFiscal?.workerKind ?? null) : null,
        identiteit: user.identityChecks.map((c) => ({ at: c.createdAt, label: `${CHECK_PROVIDER_LABEL[c.provider] ?? c.provider}, ${(CHECK_STATUS[c.status]?.label ?? c.status).toLowerCase()}`, goed: c.status === "VERIFIED" ? true : c.status === "REJECTED" ? false : null })),
        herinneringen: { aantal: (onbHerinnering?.stage ?? 0) + (onbHerinnering?.handmatig ?? 0), laatsteOp: onbHerinnering?.at ? new Date(onbHerinnering.at) : null },
        audit: auditEntries.filter((e) => isOnboardingAudit(e.action)).map((e) => ({ at: e.createdAt, action: e.action, summary: e.summary })),
      })
    : [];

  return (
    <div className="space-y-4">
      <Link href="/admin/gebruikers" className="inline-block text-xs font-medium hover:underline" style={{ color: "var(--a-mute)" }}>← Alle gebruikers</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {fotoUrl ? (
            <KopFoto src={fotoUrl} naam={user.fullName} titel="Profielfoto op ware grootte" />
          ) : kopSelfie ? (
            <KopFoto src={kopSelfie} klein={`${kopSelfie}&klein=1`} naam={user.fullName} titel="Selfie van de ID-controle (er is geen profielfoto)" />
          ) : (
            <Avatar name={user.fullName} size={72} />
          )}
          <div className="min-w-0">
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.625rem]" style={{ color: "var(--a-text)" }}>{user.fullName}</h1>
            <p className="mt-0.5 break-all text-sm" style={{ color: "var(--a-mute)" }}>{user.email}{user.phone ? `, ${user.phone}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={user.disabledAt ? "crit" : "ok"}>{user.disabledAt ? "Geblokkeerd" : "Actief"}</Pill>
              <Pill tone={user.emailVerifiedAt ? "ok" : "warn"}>{user.emailVerifiedAt ? "E-mail bevestigd" : "E-mail niet bevestigd"}</Pill>
              <Pill tone={kyc.tone}>{kyc.label}</Pill>
            </div>
            {!isDeleted && <EigenTestSchakelaar soort="user" id={user.id} sinds={eigenTest.users[user.id] ?? null} />}
            {!fotoUrl && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--a-mute)" }}>
                {kopSelfie
                  ? "Geen profielfoto: de foto is de selfie van de ID-controle."
                  : user.identityChecks.some((c) => c.provider === "STRIPE_IDENTITY") && !stripeSleutel
                    ? "Geen profielfoto. De selfie van de ID-controle staat bij Stripe: zet bij Identiteitscontroles de Stripe-sleutel, dan staat hij hier."
                    : "Nog geen profielfoto."}
              </p>
            )}
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

          {onboarding && onbStatus && (
            <Panel title="Onboarding" subtitle={onbStatus.stap === -1 ? "Alle stappen zijn gehaald" : `Nu: ${onbStatus.label}`}>
              <ol className="mb-4 space-y-1.5">
                {onbStappen.map((st, i) => (
                  <li key={st.key} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                    <span style={{ color: "var(--a-dim)" }}>{st.label}</span>
                    <Pill tone={onboarding.gehaald[i] ? "ok" : "neutral"}>{onboarding.gehaald[i] ? "Gehaald" : "Open"}</Pill>
                  </li>
                ))}
              </ol>
              {!isDeleted && (
                <div className="mb-4">
                  <OnboardingActies userId={user.id} emailBevestigd={Boolean(user.emailVerifiedAt)} bedrijfId={onboarding.doelgroep === "werkgever" && !onboarding.gehaald[4] ? onboarding.tenantId : null} klaar={onbStatus.stap === -1} />
                </div>
              )}

          {profile && !isDeleted && (
            <Panel
              title="Toegang tot de werker-app"
              subtitle={poortTest ? "Testaccount: geen poort, ziet de hele app" : poort ? poortSamenvatting(poortLijst) : "De stand kon niet worden gelezen"}
            >
              {poortLijst.length > 0 && (
                <ol className="space-y-1.5">
                  {poortLijst.map((st) => (
                    <li key={st.key} className="flex items-start justify-between gap-3 text-[0.8125rem]">
                      <span style={{ color: "var(--a-dim)" }}>
                        {st.label}
                        {!st.ok && <span className="mt-0.5 block text-xs">{st.uitleg}</span>}
                      </span>
                      <Pill tone={st.ok ? "ok" : "neutral"}>{st.ok ? "Af" : "Open"}</Pill>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
              <Feed
                emptyText="Nog niets bekend."
                items={onbTijdlijn.map((e) => ({ key: e.key, text: e.tekst, meta: e.at ? dateTimeNl(e.at) : e.tone === "warn" ? "Nog niet" : "Tijdstip onbekend", ...(e.tone === "neutral" ? {} : { tone: e.tone }) }))}
              />
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
                      {
                        label: "Thuisbasis",
                        value:
                          profile.homeLatitude != null && profile.homeLongitude != null ? (
                            <a href={kaartLink(profile.homeLatitude, profile.homeLongitude)} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>
                              {profile.homePostalCode ?? "plek"} · {profile.homeLatitude.toFixed(4)}, {profile.homeLongitude.toFixed(4)} · kaart →
                            </a>
                          ) : (
                            (profile.homePostalCode ?? "—")
                          ),
                      },
                      { label: "Fiscale gegevens", value: <Link href="/admin/fiscaal" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Openen →</Link> },
                    ]
                  : []),
                { label: "Profielfoto", value: fotoUrl ? <a href={fotoUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Bekijken →</a> : "Nog geen" },
                { label: "Alle gegevens", value: <a href={`/api/admin/gebruikers/${user.id}/export`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Downloaden (JSON) →</a> },
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
            {user.identityChecks.some((c) => c.provider === "STRIPE_IDENTITY") && (
              <div className="px-4 pb-3 sm:px-5">
                <StripeFotoSleutel begin={stripeSleutel} />
              </div>
            )}
            {user.identityChecks.length === 0 ? (
              <Empty title="Geen controles" body="Er is nog geen identiteitscontrole gestart." />
            ) : (
              <ul>
                {user.identityChecks.map((c) => {
                  const status = CHECK_STATUS[c.status] ?? { label: c.status, tone: "warn" as const };
                  const w = idControleWeergave(c.provider, c.rawPayload, c.sessionId, c.faceMatchScore);
                  const fotos = fotosVan(c);
                  return (
                    <li key={c.id} className="space-y-3 px-4 py-3.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium" style={{ color: "var(--a-text)" }}>{PROVIDER_LABEL[c.provider] ?? CHECK_PROVIDER_LABEL[c.provider] ?? c.provider}</p>
                          <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                            {dateTimeNl(c.createdAt)}
                            {c.documentType ? ` · ${c.documentType === "PASSPORT" ? "paspoort" : c.documentType === "ID_CARD" ? "ID-kaart" : c.documentType === "DRIVERS_LICENSE" ? "rijbewijs" : c.documentType}` : ""}
                            {c.expiresAt ? ` · geldig tot ${dateNl(c.expiresAt)}` : ""}
                            {c.decisionStatus ? ` · ${c.decisionStatus}` : ""}
                          </p>
                        </div>
                        <Pill tone={status.tone}>{status.label}</Pill>
                      </div>
                      {/* de uitkomst in één oogopslag (lib/onboarding/auto-redenen.ts) en de gegevens van het document */}
                      {((w.nietAutomatisch && (w.nietAutomatisch.length > 0 || c.status === "VERIFIED")) || w.document) && (
                        <div className="space-y-1 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--a-panel-2)", color: "var(--a-dim)" }}>
                          {w.nietAutomatisch && w.nietAutomatisch.length === 0 && c.status === "VERIFIED" && (
                            <p>
                              <strong style={{ color: "var(--a-text)" }}>Uitkomst:</strong> automatisch goedgekeurd, alle controles klopten.
                            </p>
                          )}
                          {w.nietAutomatisch && w.nietAutomatisch.length > 0 && (
                            <div>
                              <p>
                                <strong style={{ color: "var(--a-text)" }}>
                                  {c.status === "PENDING" ? "Wacht op jou, omdat:" : "Niet automatisch goedgekeurd, omdat:"}
                                </strong>
                              </p>
                              <ul className="list-disc pl-4">
                                {w.nietAutomatisch.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {w.document && (
                            <p>
                              <strong style={{ color: "var(--a-text)" }}>Document:</strong>{" "}
                              {w.document.naam ? `${w.document.naam} (${w.document.uitDeCode ? "gelezen uit de code op het document" : "zoals getypt"})` : "naam onbekend"}
                              {w.document.nummerEind ? ` · nummer eindigt op ${w.document.nummerEind}` : ""}
                              {c.expiresAt ? ` · geldig tot ${dateNl(c.expiresAt)}` : ""}
                            </p>
                          )}
                        </div>
                      )}
                      {fotos.length > 0 && (
                        <div className={`grid gap-2 ${fotos.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                          {FOTO_SOORTEN.filter((f) => fotos.includes(f.id)).map((f) => (
                            <IdFoto key={f.id} src={`/api/admin/gebruikers/${user.id}/identiteit/${c.id}/beeld?welk=${f.id}`} klein={`/api/admin/gebruikers/${user.id}/identiteit/${c.id}/beeld?welk=${f.id}&klein=1`} label={f.label} />
                          ))}
                        </div>
                      )}
                      {c.provider === "AI_LOCAL" && w.fotos.length === 0 && (
                        <p className="text-xs" style={{ color: "var(--a-mute)" }}>De foto&apos;s van deze controle zijn er niet meer (na 30 dagen opgeruimd).</p>
                      )}
                      {w.stripe && (
                        <p className="text-xs" style={{ color: "var(--a-dim)" }}>
                          {w.stripe.naamOpDocument ? `Naam op document: ${w.stripe.naamOpDocument}${w.stripe.naamKlopt === false ? " (klopt niet met het account)" : w.stripe.naamKlopt ? " (klopt)" : ""}. ` : ""}
                          {w.stripe.reden ? `Reden: ${w.stripe.reden}. ` : ""}
                          {fotos.length > 0
                            ? "De foto's komen rechtstreeks van Stripe en worden bij ons niet bewaard. "
                            : stripeSleutel
                              ? "Bij deze poging heeft Stripe geen foto's (niet afgerond). "
                              : "De foto's van voor- en achterkant en de selfie staan bij Stripe (zet hierboven de sleutel om ze hier te zien). "}
                          <a href={stripeSessieUrl(w.stripe.sessieId)} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Open in Stripe →</a>
                        </p>
                      )}
                      {w.regels.length > 0 && (
                        <ul className="space-y-0.5 text-xs">
                          {w.regels.map((r, i) => (
                            <li key={i} style={{ color: r.ok ? "var(--a-dim)" : "var(--a-crit, #b91c1c)" }}>
                              {r.ok ? "✓" : "✗"} {r.label}{r.detail ? `: ${r.detail}` : ""}{r.intern ? " (alleen voor jou)" : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(w.gezicht || w.ai || w.beeld.samenvatting.length > 0 || w.mrz.length > 0 || w.chip.length > 0 || w.overig.length > 0) && (
                        <div className="space-y-1 text-xs" style={{ color: "var(--a-dim)" }}>
                          {w.gezicht && (
                            <p>
                              Gezicht (pasfoto tegen selfie): <strong>{w.gezicht.oordeel}</strong>
                              {w.gezicht.procent != null ? ` (${w.gezicht.procent}%)` : ""}
                              {w.gezicht.technisch ? " · de gezichtscontrole kon niet draaien" : ""}
                              {w.gezicht.automatisch ? " · deze controle keurde zelf goed" : ""}
                            </p>
                          )}
                          {w.gezicht?.beweging && (
                            <p>
                              Beweging (tweede selfie): <strong>{w.gezicht.beweging}</strong>
                            </p>
                          )}
                          {w.gezicht?.reeks && (
                            // alleen ter informatie (lib/kyc/gezicht/reeks.ts): nog geen poort
                            <p>
                              Live draai: <strong>{w.gezicht.reeks}</strong>
                            </p>
                          )}
                          {w.fotoBron && (
                            // uit de bestandsnaam van de browser (lib/kyc/foto-bron.ts): alleen ter informatie
                            <p>
                              Foto&apos;s: <strong>{w.fotoBron}</strong>
                            </p>
                          )}
                          {w.ai && (
                            <p>
                              Automatische beoordeling: <strong>{w.ai.oordeel}</strong>
                              {w.ai.zekerheid != null ? ` (zekerheid ${Math.round(w.ai.zekerheid * 100)}%)` : ""}
                              {w.ai.redenen.length ? `: ${w.ai.redenen.join("; ")}` : ""}
                            </p>
                          )}
                          {w.beeld.samenvatting.length > 0 && <p>Beeld: {w.beeld.samenvatting.join(" · ")}</p>}
                          {w.mrz.length > 0 && <p>MRZ: {w.mrz.join(", ")}</p>}
                          {w.chip.length > 0 && <p>Chip: {w.chip.join(", ")}</p>}
                          {w.overig.map((o, i) => (
                            <p key={i}>{o}</p>
                          ))}
                        </div>
                      )}
                      {c.status === "PENDING" &&
                        (stripeZonderUitslag(c.provider, c.decisionStatus) ? (
                          <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                            Deze Stripe-sessie is niet afgerond: er zijn geen foto&apos;s en geen uitslag. Keur de persoon goed of af met de knoppen bovenaan dit blok.
                          </p>
                        ) : (
                          <IdentityCheckActions userId={user.id} checkId={c.id} />
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {profile && (
            <Panel flush title="In- en uitchecks" subtitle="De laatste 12, met plek">
              {checkins.length === 0 ? (
                <Empty title="Nog geen check-ins" body="Zodra deze werker op een klus in- of uitcheckt, staat hier waar en wanneer." />
              ) : (
                <ul>
                  {checkins.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <span className="min-w-0">
                        <span className="block font-medium" style={{ color: "var(--a-text)" }}>
                          {g.type === "CHECK_IN" ? "Ingecheckt" : g.type === "CHECK_OUT" ? "Uitgecheckt" : "Positie tijdens de dienst"} · {dateTimeNl(g.recordedAt)}
                        </span>
                        <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                          {g.timesheet.assignment.shift.title} · {g.timesheet.assignment.shift.branch.name}
                          {g.bron ? ` · via ${g.bron}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Pill tone={g.withinGeofence ? "ok" : "warn"}>{g.withinGeofence ? "Op locatie" : `${Math.round(g.distanceToBranchMeters)} m ernaast`}</Pill>
                        {g.mocked && <Pill tone="crit">Nep-locatie</Pill>}
                        <a href={kaartLink(g.latitude, g.longitude)} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: "var(--a-accent-ink)" }}>kaart →</a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

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
                        <p className="font-medium" style={{ color: "var(--a-text)" }}>{d.note === "kor-bevestiging" ? "KOR-bevestiging (goedkeuren zet de KOR aan)" : DOC_KIND_LABEL[d.kind]}</p>
                        <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                          {dateTimeNl(d.uploadedAt)}, {fileSize(d.sizeBytes)}
                          {d.note ? `, ${d.note}` : ""}
                        </p>
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>Volledig bekijken →</a>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-2">
                        <Pill tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Pill>
                        {(d.kind === "bank" || d.note === "kor-bevestiging") && d.status === "uploaded" && <ComplianceDocActions userId={user.id} docId={d.id} />}
                        {d.kind === "id" && <span className="text-xs" style={{ color: "var(--a-mute)" }}>via Identiteitscontroles</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {werkrechten.length > 0 && (
            <Panel flush title="Recht om te werken">
              <ul>
                {werkrechten.map((w) => {
                  const st = WERKRECHT_STAND[w.stand];
                  const fileUrl = w.id && w.document ? `/api/admin/gebruikers/${user.id}/werkrecht/${w.id}` : null;
                  return (
                    <li key={w.land} className="flex items-start gap-3 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium" style={{ color: "var(--a-text)" }}>{landNaam(w.land, "nl")}</p>
                        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                          {w.verklaard ? "Verklaring aangevinkt" : "Verklaring niet aangevinkt"}
                          {w.idBewijs ? ", bewijs: EU/EER/CH-paspoort of -ID-kaart uit de ID-controle" : ""}
                          {w.document?.geldigTot ? `, document geldig tot ${w.document.geldigTot.split("-").reverse().join("-")}` : ""}
                          {w.document?.note ? `, reden afwijzing: ${w.document.note}` : ""}
                        </p>
                        {fileUrl && (
                          <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>
                            Document bekijken →
                          </a>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-2">
                        <Pill tone={st.tone}>{st.label}</Pill>
                        {w.id && w.document?.status === "uploaded" && <WerkrechtActions userId={user.id} wrId={w.id} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
