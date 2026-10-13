import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { PageHeader, Panel } from "@/components/app/ui";
import { PersonalInfoForm } from "@/components/app/PersonalInfoForm";
import { updateEmployerPersonalInfoAction } from "@/app/werkgever/account/actions";

export const dynamic = "force-dynamic";

export default async function WerkgeverAccountPage() {
  const principal = await requirePrincipal();
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { fullName: true, email: true, phone: true },
  });

  return (
    <>
      <Link href="/werkgever/instellingen" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← Instellingen
      </Link>

      <PageHeader title="Persoonlijke accountinstellingen" subtitle="Je naam, telefoonnummer en inloggegevens." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Persoonsgegevens">
          <PersonalInfoForm
            action={updateEmployerPersonalInfoAction}
            initialFullName={user?.fullName ?? principal.fullName}
            initialPhone={user?.phone ?? ""}
          />
          <dl className="divide-y divide-hair border-t border-hair text-sm">
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-neutralx-500">E-mail</span>
              <span className="font-medium text-ink">{user?.email ?? principal.email}</span>
            </div>
          </dl>
        </Panel>

        <Panel title="Wachtwoord">
          <div className="p-5 text-sm text-neutralx-600">
            <p>Wachtwoord wijzigen gaat via de &ldquo;wachtwoord vergeten&rdquo;-link — we sturen een reset-link naar je e-mailadres.</p>
            <Link href="/wachtwoord-vergeten" className="btn-ghost mt-3 inline-block">
              Wachtwoord resetten
            </Link>
          </div>
        </Panel>
      </div>

      <form action={logoutAction} className="mt-6 overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
        <button
          type="submit"
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-semibold text-crit hover:bg-crit/5"
        >
          Uitloggen
        </button>
      </form>
    </>
  );
}
