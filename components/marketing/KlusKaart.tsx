import { shiftCategory } from "@/lib/shifts/category";
import { euroCents, euroWhole } from "@/lib/rekentools/invoer";

// ---------------------------------------------------------------------------
// The klus as a worker sees it in the app: the same look as
// components/app/ShiftCard.tsx (photo of the category, rate badge, company —
// place, title, when, "Freelance", pay line), without links or the save heart,
// so /klus-plaatsen can show it without loading the worker app.
// ---------------------------------------------------------------------------

const uurNl = (h: number) => h.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

export function KlusKaart({
  title,
  bedrijf,
  city,
  when,
  rateCents,
  hours,
  ribbon,
}: {
  title: string;
  bedrijf: string;
  city: string;
  when: string;
  rateCents: number;
  hours: number;
  ribbon?: string;
}) {
  const cat = shiftCategory(title, null);
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-hair bg-white text-left shadow-card">
      <div className="relative aspect-[16/9] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat.photo} alt="" decoding="async" className="h-full w-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white backdrop-blur" style={{ background: `${cat.accent}cc` }}>
          {cat.label}
        </span>
        <span aria-hidden="true" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-sm text-neutralx-500 shadow-sm">
          ♡
        </span>
        {ribbon ? (
          <span className="absolute bottom-3 left-3 rounded-full px-2 py-1 text-[11px] font-bold text-white backdrop-blur" style={{ background: "rgba(14,92,74,.92)" }}>
            {ribbon}
          </span>
        ) : null}
        <span className="num absolute bottom-3 right-3 rounded-lg bg-money-bright px-2 py-1 text-sm font-bold text-ink shadow-sm">{euroCents(rateCents)}/u</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-xs font-semibold text-brand-600">
          {bedrijf} — {city}
        </p>
        <p className="mt-0.5 font-display text-base font-bold leading-snug text-ink">{title}</p>
        <p className="mt-2 text-xs text-neutralx-500">
          {when} · {city}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600">Freelance</span>
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-hair pt-3">
          <div>
            <p className="num font-display text-lg font-bold text-ink">{euroCents(rateCents)} / uur</p>
            <p className="text-[11px] text-neutralx-500">Verdien ~ {euroWhole(Math.round(rateCents * hours))}</p>
          </div>
          <span className="num rounded-lg bg-paper-soft px-2 py-1 text-xs font-semibold text-neutralx-600">{uurNl(hours)} uur</span>
        </div>
      </div>
    </article>
  );
}
