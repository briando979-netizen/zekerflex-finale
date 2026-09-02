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
import { mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { zzp: "ZZP'er", flexwerker: "Flexwerker", uitzendkracht: "Uitzendkracht" };
const MODE_LABEL: Record<string, string> = {
  "reverse-billing": "Reverse billing",
  "self-invoice": "Zelf-facturatie (KOR)",
  payroll: "Payroll / verloning",
};

export default async function ProfielPage() {
  const principal = await requirePrincipal();
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
      },
    }),
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: { fullName: true, email: true, phone: true, kycStatus: true },
    }),
    getFiscal(principal.userId),
  ]);
  const [profileExtra, stats, mailPrefs] = await Promise.all([
    getUserProfileExtra(principal.userId),
    getProfileStats(principal.userId),
    mailPrefsView(user?.email ?? principal.email),
  ]);
  const name = user?.fullName ?? principal.fullName;
  const stars = Math.round(stats.reviews.average);

  return (
    <>
      <PageHeader title="Account" subtitle="Je gegevens, verificatie en uitbetaalinstellingen." />

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
                {stats.reviews.count > 0 ? `${stats.reviews.count} beoordelingen` : "nog geen beoordelingen"}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-xs uppercase tracking-wide text-white/40">
          Jouw klussen over de laatste 6 maanden
        </p>
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 text-center">
          <div>
            <p className="num font-display text-2xl font-bold">{stats.matchedShifts}</p>
            <p className="text-[11px] text-white/60">Gematchte klussen</p>
          </div>
          <div>
            <p className="num font-display text-2xl font-bold">{stats.notCompleted}</p>
            <p className="text-[11px] text-white/60">Niet voltooide klussen</p>
          </div>
          <div>
            <p className="num font-display text-2xl font-bold">{stats.replacementsArranged}</p>
            <p className="text-[11px] text-white/60">Vervanging geregeld</p>
          </div>
        </div>
        {stats.attendancePct != null && (
          <p className="mt-4 text-center text-xs text-white/50">
            Opkomstpercentage laatste 6 maanden: <span className="font-semibold text-white/80">{stats.attendancePct}%</span>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Onboarding">
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
                <span className={s.done ? "text-neutralx-500" : "text-ink"}>{s.label}</span>
              </li>
            ))}
          </ul>
          {!o.profileComplete && (
            <div className="border-t border-hair px-5 py-4">
              <Link href="/dashboard/verificatie" className="btn-primary">
                KVK koppelen & ID verifiëren
              </Link>
            </div>
          )}
        </Panel>

        <Panel title="Persoonsgegevens">
          <div className="border-b border-hair px-5 py-4">
            <AvatarUpload
              userId={principal.userId}
              name={user?.fullName ?? principal.fullName}
              initialHasAvatar={Boolean(profileExtra.avatarUploadId)}
            />
          </div>
          <dl className="divide-y divide-hair text-sm">
            <Field k="Naam" v={user?.fullName ?? principal.fullName} />
            <Field k="E-mail" v={user?.email ?? principal.email} />
            <Field k="Telefoon" v={user?.phone ?? "—"} />
            <Field
              k="Identiteit (KYC)"
              v={
                <StatusPill tone={user?.kycStatus === "VERIFIED" ? "ok" : "warn"}>
                  {user?.kycStatus === "VERIFIED" ? "Geverifieerd" : (user?.kycStatus ?? "Niet gestart")}
                </StatusPill>
              }
            />
          </dl>
        </Panel>

        <Panel title="Werkvorm & fiscaal">
          <dl className="divide-y divide-hair text-sm">
            <Field k="Werkvorm" v={fiscal.workerKind ? KIND_LABEL[fiscal.workerKind] : "Nog niet gekozen"} />
            <Field
              k="Btw-nummer"
              v={
                fiscal.vatNumber ? (
                  <>
                    {fiscal.vatNumber}{" "}
                    <StatusPill tone={fiscal.vatValid ? "ok" : "warn"}>{fiscal.vatValid ? "gevalideerd" : fiscal.vatStatus ?? "open"}</StatusPill>
                  </>
                ) : fiscal.korApplies ? (
                  "Kleineondernemersregeling"
                ) : fiscal.workerKind === "uitzendkracht" ? (
                  "n.v.t. (verloning)"
                ) : (
                  "—"
                )
              }
            />
            <Field k="KVK-nummer" v={fiscal.kvkNumber ?? profile?.kvkNumber ?? "—"} />
            <Field k="Facturatie / verloning" v={MODE_LABEL[invoiceModeFor(fiscal)] ?? invoiceModeFor(fiscal)} />
          </dl>
          <div className="border-t border-hair px-5 py-4">
            <Link href="/dashboard/fiscaal" className="text-sm font-medium text-brand-600">
              Werkvorm & btw aanpassen →
            </Link>
          </div>
        </Panel>

        <Panel title="Uitbetaling">
          <dl className="divide-y divide-hair text-sm">
            <Field k="IBAN" v={profile?.payoutIban ?? "Nog niet ingesteld"} />
            <Field k="Postcode thuisbasis" v={profile?.homePostalCode ?? "—"} />
            <Field k="Tijdzone" v={profile?.timezone ?? "Europe/Amsterdam"} />
          </dl>
          <div className="border-t border-hair px-5 py-4">
            <Link href="/dashboard/uitbetalingen" className="text-sm font-medium text-brand-600">
              Bekijk uitbetalingen →
            </Link>
          </div>
        </Panel>

        <Panel title="E-mailvoorkeuren">
          <div className="p-5">
            <p className="mb-4 text-sm text-neutralx-600">
              Kies welke optionele e-mail je ontvangt. Belangrijke e-mail (verificatie, wachtwoord, facturen,
              loonstroken) staat hier niet bij — die krijg je altijd.
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
