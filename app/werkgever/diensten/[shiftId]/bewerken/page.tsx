import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { SHIFT_TEMPLATES, MIN_SHIFT_RATE_CENTS } from "@/lib/shifts/create";
import { getOrgProfileExtra, klusBeeldVan } from "@/lib/profile/store";
import { amsterdamLocalInput } from "@/lib/time/amsterdam";
import { PageHeader } from "@/components/app/ui";
import { NewShiftForm } from "@/components/app/NewShiftForm";

export const dynamic = "force-dynamic";

// Klus bewerken: hetzelfde formulier en voorbeeld als Nieuwe dienst, met de
// gegevens van de klus ingevuld. Opslaan gaat via updateShiftAction (overlap met
// ingeplande krachten, bericht + push aan hen). Alleen zolang de klus nog open is.
const BEWERKBAAR = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"];

export default async function KlusBewerkenPage(props: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await props.params;
  const principal = await requirePrincipal();
  const s = await getEmployerShift(principal, shiftId);
  if (!s) notFound();
  if (!BEWERKBAAR.includes(s.status)) redirect(`/werkgever/diensten/${s.id}`);

  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  const extra = tenantId ? await getOrgProfileExtra(tenantId).catch(() => ({})) : {};
  const beeld = tenantId ? klusBeeldVan(tenantId, extra) : { logoUrl: null, useLogo: false };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Klus bewerken"
        eyebrow="Klussen"
        subtitle="Pas je klus aan in hetzelfde formulier als waarmee je hem plaatste. Rechts zie je meteen hoe de kracht hem ziet."
        action={
          <Link href={`/werkgever/diensten/${s.id}`} className="btn-ghost">
            Terug naar de klus
          </Link>
        }
      />
      <div className="surface p-6">
        <NewShiftForm
          branches={[]}
          templates={SHIFT_TEMPLATES}
          minRateCents={MIN_SHIFT_RATE_CENTS}
          beeld={{ ...beeld, canChange: hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") }}
          edit={{
            shiftId: s.id,
            locatie: `${s.branch} — ${s.city}`,
            assignedCount: s.assigned.length,
            initial: {
              title: s.title,
              description: s.description ?? "",
              dresscode: s.dresscode ?? "",
              extraInfo: s.extraInfo ?? "",
              startsAt: amsterdamLocalInput(s.startsAt),
              endsAt: amsterdamLocalInput(s.endsAt),
              breakMinutes: s.breakMinutes,
              hourlyRateCents: s.hourlyRateCents,
              positions: s.positions,
            },
          }}
        />
      </div>
    </div>
  );
}
