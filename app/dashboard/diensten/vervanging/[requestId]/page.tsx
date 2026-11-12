import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReplacementRequest } from "@/lib/replacements/store";
import { responderCards } from "@/lib/replacements/responder-stats";
import { PageHeader, StatusPill, dateTime } from "@/components/app/ui";
import { PickSubstituteButton } from "@/components/app/PickSubstituteButton";
import { getFreelancerDict } from "@/lib/i18n/server";
import { vulIn } from "@/lib/i18n/vul-in";

export const dynamic = "force-dynamic";

export default async function VervangingReactiesPage(
  props: {
    params: Promise<{ requestId: string }>;
  }
) {
  const params = await props.params;
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).vervanging;
  const req = await getReplacementRequest(params.requestId);
  if (!req || req.userId !== principal.userId) notFound();

  const shift = await prisma.shift.findUnique({
    where: { id: req.shiftId },
    select: { branch: { select: { latitude: true, longitude: true, city: true } } },
  });
  const branch = shift?.branch
    ? { lat: shift.branch.latitude, lng: shift.branch.longitude }
    : null;

  const noteByUser = new Map(req.responses.map((r) => [r.userId, r.note]));
  const cards = await responderCards(
    req.responses.map((r) => r.userId),
    branch,
  );

  const resolved = req.status === "resolved";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href="/dashboard/diensten"
          className="text-sm font-medium text-neutralx-500 hover:text-brand-600"
        >
          ← {t.back}
        </Link>
      </div>

      <PageHeader
        title={t.titel}
        eyebrow={t.eyebrow}
        subtitle={`${req.shiftTitle} · ${req.branch} · ${dateTime(req.startsAt)}`}
      />

      {resolved ? (
        <div className="card mb-6 border-ok/30 bg-ok/5 p-4 text-sm">
          <StatusPill tone="ok">{t.overgedragen}</StatusPill>
          <p className="mt-2 text-neutralx-700">
            {vulIn(t.overgenomen, { naam: req.substituteName ?? t.eenAndere })}
          </p>
        </div>
      ) : (
        <p className="mb-6 max-w-2xl text-sm text-neutralx-500">
          {t.uitleg}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairstrong bg-paper-soft/60 px-5 py-12 text-center text-sm text-neutralx-500">
          {t.leeg}
        </div>
      ) : (
        <ul className="space-y-4">
          {cards.map((c) => {
            const note = noteByUser.get(c.userId);
            return (
              <li key={c.userId} className="surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-base font-bold text-ink">{c.name}</p>
                      <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] font-semibold text-neutralx-500">
                        {(t.badge as Record<string, string>)[c.badgeLevel] ?? c.badgeLevel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutralx-400">
                      {c.avgRating > 0
                        ? vulIn(c.reviewCount === 1 ? t.reviewEen : t.reviewMeer, { gem: c.avgRating.toFixed(1), n: c.reviewCount })
                        : t.geenReviews}
                      {c.distanceKm != null ? ` · ± ${c.distanceKm} km` : ""}
                    </p>
                  </div>
                  {!resolved && (
                    <PickSubstituteButton
                      requestId={req.id}
                      substituteUserId={c.userId}
                      name={c.name}
                    />
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label={t.klussenGedaan} value={String(c.shiftsCompleted)} />
                  <Stat label={t.reviews} value={String(c.reviewCount)} />
                  <Stat
                    label={t.afzeggingen}
                    value={String(c.cancellations)}
                    tone={c.cancellations === 0 ? "ok" : c.cancellations > 3 ? "crit" : "default"}
                  />
                </dl>

                <div className="mt-3 rounded-lg bg-paper-soft px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutralx-500">{t.opkomst}</span>
                    <span className="num font-semibold text-ink">{c.attendancePct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(100, Math.max(0, c.attendancePct))}%` }}
                    />
                  </div>
                </div>

                {note && (
                  <p className="mt-3 border-l-2 border-hairstrong pl-3 text-sm italic text-neutralx-600">
                    “{note}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "crit";
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="rounded-lg border border-hair bg-white px-2 py-2">
      <p className={`num font-display text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-neutralx-400">{label}</p>
    </div>
  );
}
