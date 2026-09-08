import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { getUserCard } from "@/lib/profile/card";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { listMyReplacementRequests } from "@/lib/replacements/store";

export const dynamic = "force-dynamic";

type Item =
  | { label: string; href: string; external?: boolean }
  | { label: string; value: string };

export default async function AccountPage() {
  const principal = await requirePrincipal();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });

  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const [card, overview, fiscal, myReplacements, matched, notCompleted] = await Promise.all([
    getUserCard(principal.userId),
    getFreelancerOverview(principal.userId),
    getFiscal(principal.userId),
    listMyReplacementRequests(principal.userId),
    profile
      ? prisma.shiftAssignment.count({
          where: { freelancerId: profile.id, acceptedAt: { gte: since } },
        })
      : Promise.resolve(0),
    profile
      ? prisma.shiftAssignment.count({
          where: { freelancerId: profile.id, acceptedAt: { gte: since }, cancelledAt: { not: null } },
        })
      : Promise.resolve(0),
  ]);

  const isUitzend = invoiceModeFor(fiscal) === "payroll";
  const replacementsArranged = myReplacements.filter((r) => new Date(r.at) >= since).length;
  const reviews = card?.freelancer?.reviews ?? { average: 0, count: 0, distribution: {} as never };
  const stars = Math.round(reviews.average);

  const GROUPS: { items: Item[] }[] = [
    {
      items: [
        { label: "Ik heb een vraag", href: "/kennis" },
        {
          label: "Feedback verzenden",
          href: "mailto:info@zekerflex.com?subject=Feedback%20ZekerFlex-app",
          external: true,
        },
        { label: "Pushmeldingen", href: "/dashboard/beschikbaarheid" },
        { label: "Favoriete opdrachtgevers", href: "/dashboard/klussen" },
        { label: "Verborgen opdrachtgevers", href: "/dashboard/account/verborgen" },
      ],
    },
    {
      items: isUitzend
        ? [
            { label: "Persoonlijke gegevens", href: "/dashboard/profiel" },
            { label: "Adresgegevens", href: "/dashboard/profiel" },
            { label: "Werkervaring", href: "/dashboard/profiel" },
            { label: "Certificaten (VCA, BHV, heftruck…)", href: "/dashboard/certificaten" },
            { label: "Uitzendovereenkomst", href: "/dashboard/verificatie" },
            { label: "Verloning & loonstroken", href: "/dashboard/verloning" },
            { label: "Werkvorm & BSN", href: "/dashboard/fiscaal" },
          ]
        : [
            { label: "Persoonlijke gegevens", href: "/dashboard/profiel" },
            { label: "Adresgegevens", href: "/dashboard/profiel" },
            { label: "Werkervaring", href: "/dashboard/profiel" },
            { label: "Certificaten (VCA, BHV, heftruck…)", href: "/dashboard/certificaten" },
            { label: "Zakelijke gegevens", href: "/dashboard/fiscaal" },
            { label: "Verzekering & voordelen", href: "/dashboard/verzekering" },
            { label: "Facturenoverzicht", href: "/dashboard/uitbetalingen" },
            { label: "Machtiging", href: "/dashboard/uitbetalingen" },
          ],
    },
    {
      items: [
        { label: "E-mailadres wijzigen", href: "/dashboard/profiel" },
        { label: "Wachtwoord wijzigen", href: "/wachtwoord-vergeten" },
        {
          label: "Account verwijderen",
          href: "mailto:info@zekerflex.com?subject=Verzoek%20account%20verwijderen",
          external: true,
        },
      ],
    },
    {
      items: [
        { label: "Kennisbank", href: "/kennis" },
        { label: "Join de community", href: "/nieuwsbrief" },
      ],
    },
    {
      items: [{ label: "Privacy instellingen", href: "/privacy" }],
    },
    {
      items: [
        { label: "Weergave", value: "Licht" },
        { label: "Taal", value: "Nederlands" },
      ],
    },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          Account
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
      </div>

      {/* Profile header */}
      <div className="rounded-2xl border border-hair bg-white p-5 text-center shadow-card">
        <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-hair bg-paper-soft">
          {card?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-2xl font-bold text-neutralx-400">
              {(card?.name ?? "?").slice(0, 1)}
            </span>
          )}
        </div>
        <p className="mt-3 font-display text-xl font-bold text-ink">{card?.name ?? principal.email}</p>

        <div className="mt-1.5 flex items-center justify-center gap-1 text-lg text-amber-500">
          {"★★★★★".slice(0, stars)}
          <span className="text-neutralx-300">{"★★★★★".slice(stars)}</span>
        </div>
        <Link
          href="/dashboard/profiel"
          className="mt-1 inline-block text-sm font-semibold text-ink underline underline-offset-2"
        >
          {reviews.count} {reviews.count === 1 ? "beoordeling" : "beoordelingen"}
        </Link>

        <div className="mt-5 border-t border-hair pt-4">
          <p className="text-sm text-neutralx-500">Jouw klussen over de laatste 6 maanden</p>
          <div className="mt-3 grid grid-cols-3 divide-x divide-hair">
            <Stat value={matched} label="Gematchte klussen" />
            <Stat value={notCompleted} label="Niet voltooide klussen" />
            <Stat value={replacementsArranged} label="Vervanging geregeld" />
          </div>
        </div>
      </div>

      {!overview.profileComplete && (
        <Link
          href="/dashboard/verificatie"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3.5 text-sm"
        >
          <span className="font-semibold text-ink">Rond je profiel af om klussen aan te nemen</span>
          <span className="text-neutralx-400">›</span>
        </Link>
      )}

      <div className="mt-4 space-y-5">
        {GROUPS.map((g, gi) => (
          <div key={gi} className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
            {g.items.map((it) => (
              <Row key={it.label} item={it} />
            ))}
          </div>
        ))}

        <form action={logoutAction} className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
          <button
            type="submit"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-crit hover:bg-crit/5"
          >
            Uitloggen
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M16 17l5-5-5-5M21 12H9M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-neutralx-400">
        ZekerFlex · {principal.email}
      </p>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-2">
      <p className="font-display text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs leading-tight text-neutralx-500">{label}</p>
    </div>
  );
}

function Row({ item }: { item: Item }) {
  const chevron = (
    <span className="flex-shrink-0 text-neutralx-400" aria-hidden>
      ›
    </span>
  );

  if ("value" in item) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-hair px-4 py-3.5 text-sm last:border-b-0">
        <span className="font-medium text-ink">{item.label}</span>
        <span className="text-neutralx-400">{item.value}</span>
      </div>
    );
  }

  const cls =
    "flex items-center justify-between gap-3 border-b border-hair px-4 py-3.5 text-sm font-medium text-ink last:border-b-0 hover:bg-paper-soft";

  if (item.external) {
    return (
      <a href={item.href} className={cls}>
        {item.label}
        {chevron}
      </a>
    );
  }
  return (
    <Link href={item.href} className={cls}>
      {item.label}
      {chevron}
    </Link>
  );
}
