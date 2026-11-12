import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
// verificatie flow lives at /dashboard/verificatie
import { prisma } from "@/lib/prisma";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { getUserProfileExtra } from "@/lib/profile/store";
import { getProfileStats } from "@/lib/dashboard/profile-stats";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui";
import { AvatarUpload } from "@/components/app/AvatarUpload";
import { ErvaringLijst } from "@/components/app/ErvaringLijst";
import { getErvaring } from "@/lib/werker/ervaring-store";
import { UitzendContractCard } from "@/components/app/UitzendContractCard";
import { listCertificates } from "@/lib/certificates/store";
import { mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";
import { StripeConnectPayout } from "@/components/app/StripeConnectPayout";
import { BackLink } from "@/components/app/BackLink";
import { PersonalInfoForm } from "@/components/app/PersonalInfoForm";
import { updatePersonalInfoAction } from "@/app/dashboard/profiel/actions";
import { getFreelancerDict } from "@/lib/i18n/server";
import { vulIn } from "@/lib/i18n/vul-in";

export const dynamic = "force-dynamic";

export default async function ProfielPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).profiel;
  const [o, profile, user, fiscal] = await Promise.all([
    getFreelancerOverview(principal.userId),
    prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: {
        kvkNumber: true,
        vatNumber: true,
        kvkValid: true,
        vatValid: true,
        payoutIban: true,
        homePostalCode: true,
        timezone: true,
        stripeConnectedAccountId: true,
        stripePayoutsEnabled: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: { fullName: true, email: true, phone: true, kycStatus: true },
    }),
    getFiscal(principal.userId),
  ]);
  const ervaring = await getErvaring(principal.userId).catch(() => ({ items: [], geen: false }));
  const [profileExtra, stats, mailPrefs, certs] = await Promise.all([
    getUserProfileExtra(principal.userId),
    getProfileStats(principal.userId),
    mailPrefsView(user?.email ?? principal.email),
    listCertificates(principal.userId),
  ]);
  const name = user?.fullName ?? principal.fullName;
  const stars = Math.round(stats.reviews.average);
  const isUitzend = invoiceModeFor(fiscal) === "payroll";
  const validCerts = certs.filter((c) => c.status === "valid").length;

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.titel} subtitle={t.subtitel} />

      {/* hero — matches the app's Account overview */}
      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-ink to-[#0d1f1a] p-6 text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full ring-4 ring-white/10">
            {profileExtra.avatarUploadId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/profile/${principal.userId}/avatar`} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-brand-500 text-2xl font-semibold">
                {name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
              </span>
            )}
          </span>
          <div>
            <p className="font-display text-xl font-bold">{name}</p>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm">
              <span className="text-amber-400">
                {"★★★★★".slice(0, stars)}
                <span className="text-white/25">{"★★★★★".slice(stars)}</span>
              </span>
              <span className="text-white/60">
                {stats.reviews.count > 0 ? vulIn(t.beoordelingen, { n: stats.reviews.count }) : t.geenBeoordelingen}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-xs uppercase tracking-wide text-white/40">
          {t.zesMaanden}
        </p>
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 text-center">
          <div>
            <p className="num font-display text-2xl font-bold">{stats.matchedShifts}</p>
            <p className="text-[11px] text-white/60">{t.gematcht}</p>
          </div>
          <div>
            <p className="num font-display text-2xl font-bold">{stats.notCompleted}</p>
            <p className="text-[11px] text-white/60">{t.nietVoltooid}</p>
          </div>
          <div>
            <p className="num font-display text-2xl font-bold">{stats.replacementsArranged}</p>
            <p className="text-[11px] text-white/60">{t.vervangingGeregeld}</p>
          </div>
        </div>
        {stats.attendancePct != null && (
          <p className="mt-4 text-center text-xs text-white/50">
            {t.opkomst} <span className="font-semibold text-white/80">{stats.attendancePct}%</span>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.onboarding}>
          <ul className="space-y-3 px-5 py-4">
            {o.onboarding.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                    s.done ? "bg-ok text-white" : "border border-hairstrong text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={s.done ? "text-neutralx-500" : "text-ink"}>{t.stappen[s.id] ?? s.label}</span>
              </li>
            ))}
          </ul>
          {!o.profileComplete && (
            <div className="border-t border-hair px-5 py-4">
              <Link href="/dashboard/verificatie" className="btn-primary">
                {isUitzend ? t.verificatieAfronden : t.kvkKoppelen}
              </Link>
            </div>
          )}
        </Panel>

        <Panel title={t.persoon}>
          <div className="border-b border-hair px-5 py-4">
            <AvatarUpload
              userId={principal.userId}
              name={user?.fullName ?? principal.fullName}
              initialHasAvatar={Boolean(profileExtra.avatarUploadId)}
            />
          </div>
          <PersonalInfoForm
            action={updatePersonalInfoAction}
            initialFullName={user?.fullName ?? principal.fullName}
            initialPhone={user?.phone ?? ""}
          />
          <dl className="divide-y divide-hair border-t border-hair text-sm">
            <Field k={t.email} v={user?.email ?? principal.email} />
            <Field
              k={t.kyc}
              v={
                <StatusPill tone={user?.kycStatus === "VERIFIED" ? "ok" : "warn"}>
                  {user?.kycStatus === "VERIFIED" ? t.geverifieerd : (user?.kycStatus ?? t.nietGestart)}
                </StatusPill>
              }
            />
          </dl>
        </Panel>

        {isUitzend ? (
          <Panel title={t.werkvormVerloning}>
            <dl className="divide-y divide-hair text-sm">
              <Field k={t.werkvorm} v={t.uitzendkrachtWerkgever} />
              <Field
                k={t.bsn}
                v={fiscal.bsnLast4 ? vulIn(t.bsnBekend, { nr: fiscal.bsnLast4 }) : t.nogNiet}
              />
              <Field k={t.lhk} v={fiscal.loonheffingskorting ? t.toegepast : t.nietToegepast} />
              <Field k={t.verloning} v={t.wekelijks} />
              <Field k={t.btwKvk} v={t.nietNodig} />
            </dl>
            <div className="flex flex-wrap gap-4 border-t border-hair px-5 py-4 text-sm font-medium text-brand-600">
              <Link href="/dashboard/verloning">{t.loonstroken}</Link>
              <Link href="/dashboard/fiscaal">{t.bsnAanpassen}</Link>
            </div>
          </Panel>
        ) : (
          <Panel title={t.werkvormFiscaal}>
            <dl className="divide-y divide-hair text-sm">
              <Field k={t.werkvorm} v={fiscal.workerKind ? ((t.kinds as Record<string, string>)[fiscal.workerKind] ?? fiscal.workerKind) : t.nogNietGekozen} />
              <Field
                k={t.btwNummer}
                v={
                  fiscal.vatNumber ? (
                    <>
                      {fiscal.vatNumber}{" "}
                      <StatusPill tone={fiscal.vatValid ? "ok" : "warn"}>{fiscal.vatValid ? t.gevalideerd : fiscal.vatStatus ?? t.open}</StatusPill>
                    </>
                  ) : fiscal.korApplies ? (
                    t.kor
                  ) : (
                    "—"
                  )
                }
              />
              <Field k={t.kvkNummer} v={fiscal.kvkNumber ?? profile?.kvkNumber ?? "—"} />
              <Field k={t.facturatie} v={(t.modes as Record<string, string>)[invoiceModeFor(fiscal)] ?? invoiceModeFor(fiscal)} />
            </dl>
            <div className="border-t border-hair px-5 py-4">
              <Link href="/dashboard/fiscaal" className="text-sm font-medium text-brand-600">
                {t.werkvormBtw}
              </Link>
            </div>
          </Panel>
        )}

        {isUitzend && (
          <Panel title={t.uitzendOvereenkomst}>
            <div className="p-5">
              <UitzendContractCard />
            </div>
          </Panel>
        )}

        <Panel title={t.werkervaring}>
          <ErvaringLijst start={ervaring.items} />
        </Panel>

        <Panel title={t.certificaten}>
          <div className="px-5 py-4 text-sm">
            <p className="text-neutralx-600">
              {certs.length === 0
                ? t.geenCerts
                : `${vulIn(t.certsGeldig, { n: validCerts })}${certs.length > validCerts ? vulIn(t.certsControle, { n: certs.length - validCerts }) : ""}`}
            </p>
            <p className="mt-1 text-xs text-neutralx-500">
              {t.certsUitleg}
            </p>
          </div>
          <div className="border-t border-hair px-5 py-4">
            <Link href="/dashboard/certificaten" className="text-sm font-medium text-brand-600">
              {t.certsBeheren}
            </Link>
          </div>
        </Panel>

        <Panel title={t.uitbetaling}>
          <div className="border-b border-hair">
            <StripeConnectPayout
              initialConnected={Boolean(profile?.stripeConnectedAccountId)}
              initialPayoutsEnabled={Boolean(profile?.stripePayoutsEnabled)}
            />
          </div>
          <dl className="divide-y divide-hair text-sm">
            <Field k={t.iban} v={fiscal.iban ?? profile?.payoutIban ?? t.nogNietIngesteld} />
            <Field k={t.postcode} v={profile?.homePostalCode ?? "—"} />
            <Field k={t.tijdzone} v={profile?.timezone ?? "Europe/Amsterdam"} />
          </dl>
          <div className="border-t border-hair px-5 py-4">
            <Link href={isUitzend ? "/dashboard/verloning" : "/dashboard/uitbetalingen"} className="text-sm font-medium text-brand-600">
              {isUitzend ? t.loonstrokenBekijk : t.uitbetalingenBekijk}
            </Link>
          </div>
        </Panel>

        <Panel title={t.mailPrefs}>
          <div className="p-5">
            <p className="mb-4 text-sm text-neutralx-600">
              {t.mailUitleg}
            </p>
            <MailPrefsToggles
              token={mailPrefs.token}
              initialCategories={mailPrefs.categories}
              initialUnsubscribedAll={mailPrefs.unsubscribedAll}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-neutralx-500">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
