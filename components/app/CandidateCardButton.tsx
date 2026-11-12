"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { respondToOfferAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

interface Card {
  userId: string;
  name: string;
  avatarUrl: string | null;
  badge: string;
  area: string | null;
  reliabilityPct: number;
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
  avgRateCents: number | null;
  rating: { average: number; count: number };
  reviews: { rating: number; text: string; authorRole: string; at: string; shiftTitle?: string }[];
  skills: { name: string; rating: number; shiftsWorked: number }[];
  certificates: { label: string; expiresOn?: string }[];
  history: { title: string; city: string; company: string; monthLabel: string; rateCents: number }[];
  followsYou?: boolean;
}

const euroIn = (c: number, nl: boolean) => `€ ${nl ? (c / 100).toFixed(2).replace(".", ",") : (c / 100).toFixed(2)}`;

function Stars({ n }: { n: number }) {
  const k = useT().kandidaatKaart;
  const full = Math.round(n);
  return (
    <span className="inline-flex" aria-label={fmt(k.sterren, { n })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" className={i <= full ? "text-amber-400" : "text-neutralx-300"}>
          <path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

/** What the page already shows of someone who has not reacted (yet): photo, name and the match lines. */
export interface CandidatePreview {
  avatarUrl: string | null;
  lines: string[];
}

export function CandidateCardButton({
  userId,
  shiftId,
  name,
  children,
  preview,
  beslissing,
  knoppen,
}: {
  userId: string;
  shiftId: string;
  name: string;
  /** custom trigger (e.g. the photo + name of a row); default the "Bekijk profiel" button */
  children?: ReactNode;
  /** set when the full card may not be shown yet (no reaction on this klus: api/werkgever/kandidaat refuses) */
  preview?: CandidatePreview;
  /** a pending reaction: the card ends in a bar to accept or decline it (same view as viewing the profile) */
  beslissing?: { offerId: string; regel: string };
  /** "beslissen": the trigger is the pair Afwijzen / Accepteren, which opens this card first */
  knoppen?: "beslissen";
}) {
  const router = useRouter();
  const toast = useToast();
  const { locale, t: dict } = useI18n();
  const k = dict.kandidaatKaart;
  const euro = (c: number) => euroIn(c, locale === "nl");
  const badgeNaam = (b: string) => (Object.hasOwn(BADGES, b) ? k[BADGES[b]!] : b);
  const [gekozen, setGekozen] = useState<"accepted" | "declined" | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [besluit, setBesluit] = useState<{ decision: "accepted" | "declined"; message: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const titleId = useId();

  const load = async () => {
    setOpen(true);
    if (preview || card || state === "loading") return;
    setState("loading");
    try {
      const r = await fetch(`/api/werkgever/kandidaat?userId=${encodeURIComponent(userId)}&shiftId=${encodeURIComponent(shiftId)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setCard(d.card);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  // decide in the card itself; afterwards the page takes the server's version (assigned list, offers)
  const beslis = async (decision: "accepted" | "declined") => {
    if (!beslissing || bezig) return;
    setBezig(true);
    setFout(null);
    const r = await respondToOfferAction(beslissing.offerId, decision).catch(() => ({ ok: false, message: k.mislukt }));
    setBezig(false);
    if (!r.ok) {
      setFout(r.message);
      return;
    }
    setBesluit({ decision, message: r.message });
    if (decision === "accepted") toast.success(r.message);
    else toast.info(r.message);
    router.refresh();
  };

  const openMet = (keuze: "accepted" | "declined") => {
    setGekozen(keuze);
    setFout(null);
    void load();
  };

  return (
    <>
      {knoppen === "beslissen" ? (
        besluit ? (
          <span className={besluit.decision === "accepted" ? "pill-ok" : "pill-crit"}>{besluit.decision === "accepted" ? k.geaccepteerd : k.afgewezen}</span>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => openMet("declined")} className="btn-ghost px-3 py-1.5 text-xs">
              {k.afwijzen}
            </button>
            <button type="button" onClick={() => openMet("accepted")} className="btn-primary px-3 py-1.5 text-xs">
              {k.accepteren}
            </button>
          </div>
        )
      ) : children ? (
        <button type="button" onClick={load} aria-label={fmt(k.profielVan, { naam: name })} className="group flex min-w-0 items-center gap-3 rounded-xl text-left">
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-medium text-neutralx-700 hover:border-brand-400"
        >
          {k.bekijkProfiel}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id={titleId} className="font-display text-lg font-bold text-ink">
                {beslissing ? fmt(k.reactieVan, { naam: name }) : preview ? name : k.profiel}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={k.sluiten} className="grid h-8 w-8 place-items-center rounded-full bg-paper-soft text-neutralx-600">✕</button>
            </div>

            {preview && (
              <div className="space-y-4">
                {preview.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.avatarUrl} alt={fmt(k.fotoVan, { naam: name })} className="mx-auto aspect-square w-full max-w-[16rem] rounded-2xl object-cover" />
                ) : (
                  <span className="mx-auto grid aspect-square w-40 place-items-center rounded-2xl bg-brand-100 text-5xl font-bold text-brand-700">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                {preview.lines.length > 0 && (
                  <ul className="space-y-1 text-sm text-neutralx-700">
                    {preview.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
                <p className="rounded-xl bg-paper-soft px-3 py-2.5 text-xs text-neutralx-600">
                  {k.volledigProfiel}
                </p>
              </div>
            )}

            {state === "loading" && <p className="py-8 text-center text-sm text-neutralx-500">{k.laden}</p>}
            {state === "error" && <p className="py-8 text-center text-sm text-crit">{k.kanNietLaden}</p>}

            {card && (
              <div className="space-y-5">
                {/* kop */}
                <div className="flex items-center gap-4">
                  {card.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                      {card.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">{card.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-neutralx-500">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">★ {badgeNaam(card.badge)}</span>
                      {card.followsYou && (
                        <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink" title={k.volgtTitle}>
                          {k.volgtJullie}
                        </span>
                      )}
                      {card.area && <span>{fmt(k.omgeving, { gebied: card.area })}</span>}
                      {card.rating.count > 0 && (
                        <span className="inline-flex items-center gap-1"><Stars n={card.rating.average} /> {card.rating.average} ({card.rating.count})</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat value={`${card.reliabilityPct}%`} label={k.statBetrouwbaar} />
                  <Stat value={card.attendancePct !== null ? `${card.attendancePct}%` : "—"} label={k.statOpkomst} />
                  <Stat value={String(card.shiftsCompleted)} label={k.statDiensten} />
                  <Stat value={String(card.cancellations)} label={k.statAfgezegd} tone={card.cancellations > 0 ? "warn" : "ok"} />
                </div>
                {card.avgRateCents !== null && (
                  <p className="text-center text-sm text-neutralx-600">
                    {k.gemTarief}
                    <strong className="text-ink">{fmt(k.perUur, { bedrag: euro(card.avgRateCents) })}</strong>
                  </p>
                )}

                {/* skills + certs */}
                {(card.skills.length > 0 || card.certificates.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {card.skills.slice(0, 8).map((s) => (
                      <span key={s.name} className="rounded-full bg-neutralx-100 px-2.5 py-1 text-xs text-neutralx-700">
                        {s.name}{s.rating > 0 ? ` · ★${s.rating}` : ""}
                      </span>
                    ))}
                    {card.certificates.slice(0, 8).map((c, i) => (
                      <span key={`c-${i}`} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">✓ {c.label}</span>
                    ))}
                  </div>
                )}

                {/* werkverleden */}
                {card.history.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">{k.werkverleden}</h3>
                    <ul className="space-y-2">
                      {card.history.map((h, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-hair px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{h.title}</span>
                            <span className="block truncate text-xs text-neutralx-500">{h.company} · {h.city} · {h.monthLabel}</span>
                          </span>
                          <span className="num flex-shrink-0 text-xs text-neutralx-500">{fmt(k.perUur, { bedrag: euro(h.rateCents) })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* reviews */}
                {card.reviews.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">{k.beoordelingen}</h3>
                    <div className="space-y-2">
                      {card.reviews.map((r, i) => (
                        <figure key={i} className="rounded-xl border border-hair p-3">
                          <Stars n={r.rating} />
                          <blockquote className="mt-1 text-sm text-neutralx-700">&ldquo;{r.text}&rdquo;</blockquote>
                          {r.shiftTitle && <figcaption className="mt-0.5 text-xs text-neutralx-400">{r.shiftTitle}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {beslissing && (
              <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 border-t border-hair bg-white px-5 pb-5 pt-4">
                <p className="text-sm text-ink">{beslissing.regel}</p>
                {fout && (
                  <p role="alert" className="mt-2 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
                    {fout}
                  </p>
                )}
                {besluit ? (
                  <div role="status" className="mt-3 space-y-3">
                    <p className={`rounded-lg px-3 py-2 text-sm font-medium ${besluit.decision === "accepted" ? "bg-ok/10 text-ok" : "bg-paper-soft text-neutralx-700"}`}>
                      {besluit.message}
                    </p>
                    <button type="button" onClick={() => setOpen(false)} className="btn-ghost w-full">
                      {k.sluiten}
                    </button>
                  </div>
                ) : (
                  <>
                    {gekozen && (
                      <p className="mt-1 text-xs text-neutralx-500">
                        {gekozen === "accepted" ? fmt(k.gekozenAccept, { naam: name }) : k.gekozenDecline}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGekozen("declined");
                          void beslis("declined");
                        }}
                        disabled={bezig}
                        className={`btn-ghost disabled:opacity-50 ${gekozen === "declined" ? "ring-2 ring-crit/40" : ""}`}
                      >
                        {bezig && gekozen === "declined" ? k.bezig : k.afwijzen}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGekozen("accepted");
                          void beslis("accepted");
                        }}
                        disabled={bezig}
                        className={`btn-primary disabled:opacity-50 ${gekozen === "accepted" ? "ring-2 ring-brand-300" : ""}`}
                      >
                        {bezig && gekozen === "accepted" ? k.bezig : k.accepteren}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const BADGES: Record<string, "badgeBRONZE" | "badgeSILVER" | "badgeGOLD" | "badgePLATINUM"> = { BRONZE: "badgeBRONZE", SILVER: "badgeSILVER", GOLD: "badgeGOLD", PLATINUM: "badgePLATINUM" };

function Stat({ value, label, tone }: { value: string; label: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl bg-paper-soft py-2">
      <div className={`font-display text-base font-bold ${tone === "warn" ? "text-warn" : "text-brand-600"}`}>{value}</div>
      <div className="text-[10px] text-neutralx-500">{label}</div>
    </div>
  );
}
