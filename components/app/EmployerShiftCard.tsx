import Link from "next/link";
import { shiftCategory } from "@/lib/shifts/category";
import { dateTime } from "@/components/app/ui";

const STATUS: Record<string, { label: string; tone: string }> = {
  FILLED: { label: "Volledig bezet", tone: "#15803D" },
  IN_PROGRESS: { label: "Loopt nu", tone: "#15803D" },
  PARTIALLY_FILLED: { label: "Deels bezet", tone: "#B45309" },
  OPEN: { label: "Werven", tone: "#B45309" },
  MATCHING: { label: "Aan het matchen", tone: "#B45309" },
  DRAFT: { label: "Concept", tone: "#616B78" },
  COMPLETED: { label: "Afgerond", tone: "#616B78" },
  CANCELLED: { label: "Geannuleerd", tone: "#B91C1C" },
};

export function EmployerShiftCard({
  shift,
  href = "/werkgever/diensten",
}: {
  shift: {
    id: string;
    title: string;
    branch: string;
    startsAt: Date | string;
    endsAt: Date | string;
    positions: number;
    filled: number;
    status: string;
    skill?: string | null;
  };
  href?: string;
}) {
  const cat = shiftCategory(shift.title, shift.skill ?? null);
  const pct = shift.positions > 0 ? Math.round((shift.filled / shift.positions) * 100) : 0;
  const st = STATUS[shift.status] ?? { label: shift.status, tone: "#616B78" };

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cat.photo}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <span
          className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white"
          style={{ background: `${cat.accent}cc` }}
        >
          {cat.label}
        </span>
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white backdrop-blur"
          style={{ background: `${st.tone}dd` }}
        >
          {st.label}
        </span>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="truncate font-display text-base font-bold drop-shadow">{shift.title}</p>
          <p className="truncate text-xs text-white/80">
            {shift.branch} · {dateTime(shift.startsAt)}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutralx-500">Bezetting</span>
          <span className="num font-semibold text-ink">
            {shift.filled} / {shift.positions}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-soft">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? "#15803D" : pct > 0 ? "#4FE0A0" : "#D6D7CF",
            }}
          />
        </div>
      </div>
    </Link>
  );
}
