import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, dateTime, moneyExact } from "@/components/app/ui";

export const dynamic = "force-dynamic";

export default async function UrenInvullenPage() {
  const principal = await requirePrincipal();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });

  const rows = profile
    ? await prisma.timesheet.findMany({
        where: { freelancerId: profile.id },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          billableMinutes: true,
          hourlyRateCents: true,
          branch: { select: { name: true, city: true } },
          assignment: { select: { shift: { select: { title: true } } } },
        },
        orderBy: { scheduledStart: "desc" },
        take: 60,
      })
    : [];

  // Only klussen that have actually ended and are not yet submitted. Once you
  // hand in your hours the klus moves to "Mijn klussen → Gearchiveerd" — there
  // is no history list here.
  const ended = (r: (typeof rows)[number]) => r.scheduledEnd.getTime() < Date.now();
  const todo = rows.filter((r) => r.status === "DRAFT" && ended(r));

  return (
    <>
      <PageHeader
        title="Uren invullen"
        eyebrow="Afronden"
        subtitle="Vul je uren in na afloop van een klus. Na indienen vind je de klus terug bij Mijn klussen."
      />

      <Section title={`In te vullen${todo.length ? ` (${todo.length})` : ""}`}>
        {todo.length === 0 ? (
          <EmptyState
            title="Niets in te vullen"
            body="Zodra een klus is afgelopen verschijnt hier je urenbriefje. Ingediende uren staan bij Mijn klussen → Gearchiveerd."
          />
        ) : (
          <ul className="space-y-3">
            {todo.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

type TS = {
  id: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  billableMinutes: number;
  hourlyRateCents: number;
  branch: { name: string; city: string };
  assignment: { shift: { title: string } } | null;
};

function Row({ t }: { t: TS }) {
  const hours = t.billableMinutes > 0 ? (t.billableMinutes / 60).toFixed(1) : null;
  const gross = hours ? moneyExact(Math.round((t.billableMinutes / 60) * t.hourlyRateCents)) : null;
  return (
    <li>
      <Link
        href={`/dashboard/uren/${t.id}`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-4 py-3.5 shadow-card transition hover:border-brand-300"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {t.assignment?.shift.title ?? "Klus"}
          </p>
          <p className="text-xs text-neutralx-500">
            {t.branch.name} · {t.branch.city} · {dateTime(t.scheduledStart)}
            {hours ? ` · ${hours} u` : ""}
            {gross ? ` · ${gross}` : ""}
          </p>
        </div>
        <span className="btn-primary flex-shrink-0 px-3 py-1.5 text-xs">Invullen</span>
      </Link>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
