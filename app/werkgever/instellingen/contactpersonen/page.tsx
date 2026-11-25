import Link from "next/link";
import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/server";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { IUser, IMail } from "@/components/app/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contactpersonen" };

const ROL_LABEL: Record<string, string> = {
  HQ_ADMIN: "Beheerder",
  LOCAL_MANAGER: "Lokale manager",
  DISPUTE_MANAGER: "Geschillenbeheerder",
  PLATFORM_ADMIN: "Platformbeheerder",
};

export default async function ContactpersonenPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  const leden = tenantId
    ? await prisma.membership.findMany({
        where: { tenantId },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <>
      <InstellingenKop title={s.cContactT} subtitle={s.cContactS} />

      {leden.length === 0 ? (
        <p className="text-sm text-neutralx-500">Geen teamleden gevonden.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leden.map((lid) => (
            <li key={lid.id} className="surface flex items-start gap-3 p-4">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-paper-soft text-brand-600">
                <IUser />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-ink">{lid.user.fullName || lid.user.email}</p>
                <p className="mt-0.5 text-xs text-neutralx-400">{ROL_LABEL[lid.role] ?? lid.role}</p>
                <a
                  href={`mailto:${lid.user.email}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                >
                  <IMail />
                  <span>{lid.user.email}</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm text-neutralx-500">
        Teamleden toevoegen of verwijderen kan via{" "}
        <Link href="/werkgever/team" className="text-brand-600 hover:underline">
          Team
        </Link>
        .
      </p>
    </>
  );
}
