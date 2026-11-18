import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { naarStudioAccount } from "@/lib/studio/account-server";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { inDemoSessie, VOORBEELD_UITGANG } from "@/lib/auth/demo-sessie";
import { PageHeader, Panel } from "@/components/app/ui";
import { PersonalInfoForm } from "@/components/app/PersonalInfoForm";
import { updateEmployerPersonalInfoAction } from "@/app/werkgever/account/actions";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { PasskeySettings } from "@/components/auth/PasskeySettings";
import { BirthdayForm } from "@/components/app/BirthdayForm";
import { getUserBirthday } from "@/lib/seasons/settings";
import { getDict, getLocale } from "@/lib/i18n/server";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

export const dynamic = "force-dynamic";

// De persoonlijke accountpagina van een bedrijf, in de taal van de werkgeversapp (15 nov 2026: was alleen Nederlands).
// Tweestapsverificatie en passkeys krijgen in het Engels dezelfde vertaling als de werkersapp (platte strings).
export default async function WerkgeverAccountPage() {
  const principal = await requirePrincipal();
  // dashboard website of webshop open: het account staat in de studio (lib/studio/account.ts)
  await naarStudioAccount(principal, "account");
  const [user, birthday, d, locale] = await Promise.all([
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: { fullName: true, email: true, phone: true },
    }),
    getUserBirthday(principal.userId),
    getDict(),
    getLocale(),
  ]);
  const t = d.persoonlijkAccount;
  const en = locale === "en";
  // in een voorbeeld (demo) wordt de uitlogknop een gewone uitgang-link (lib/auth/demo-sessie.ts)
  const demo = await inDemoSessie();

  return (
    <>
      <Link href="/werkgever/instellingen" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← {d.shell.settings}
      </Link>

      <PageHeader title={t.titel} subtitle={t.sub} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.persoon}>
          <PersonalInfoForm
            action={updateEmployerPersonalInfoAction}
            initialFullName={user?.fullName ?? principal.fullName}
            initialPhone={user?.phone ?? ""}
          />
          <dl className="divide-y divide-hair border-t border-hair text-sm">
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-neutralx-500">{t.email}</dt>
              <dd className="font-medium text-ink">{user?.email ?? principal.email}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title={t.wachtwoord}>
          <div className="p-5 text-sm text-neutralx-600">
            <p>{t.wachtwoordUitleg}</p>
            <Link href="/wachtwoord-vergeten" className="btn-ghost mt-3 inline-block">
              {t.wachtwoordKnop}
            </Link>
          </div>
        </Panel>

        <Panel title={t.tweestap}>
          <div className="p-5">
            <TwoFactorSettings recommended {...(en ? { texts: FREELANCER_DICTS.en.twofa } : {})} />
          </div>
        </Panel>

        <Panel title={t.passkey}>
          <div className="p-5">
            <PasskeySettings {...(en ? { texts: FREELANCER_DICTS.en.passkeys } : {})} />
          </div>
        </Panel>

        <Panel title={t.verjaardag}>
          <BirthdayForm initial={birthday} />
        </Panel>
      </div>

      <form
        {...(demo ? { action: VOORBEELD_UITGANG, method: "get" as const } : { action: logoutAction })}
        className="mt-6 overflow-hidden rounded-2xl border border-hair bg-white shadow-card"
      >
        <button
          type="submit"
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-semibold text-crit hover:bg-crit/5"
        >
          {d.shell.logout}
        </button>
      </form>
    </>
  );
}
