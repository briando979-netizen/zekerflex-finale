"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { respondToOfferAction, zetReserveAction, type OfferResponse } from "@/app/werkgever/diensten/[shiftId]/actions";
import { LaatsteChecksVenster } from "@/components/werkgever/LaatsteChecksVenster";
import { BreedVenster } from "@/components/werkgever/BreedVenster";
import { RegioVenster } from "@/components/werkgever/RegioVenster";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { Envelop, Hoek, Kalender, KruisRond, Speld, Ster, Telefoon, Trechter, Wissel } from "@/components/werkgever/iconen";
import { BEDRIJF_NOG_NIET_GECONTROLEERD } from "@/lib/company/gecontroleerd";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// De profielkaart van een freelancer voor een bedrijf (23 nov 2026 uitgebreid naar de kaart van YoungOnes): foto en naam,
// omgeving, telefoon en e-mail (afgeschermd tot de match: de server stuurt ze dan niet eens mee, lib/employer/candidate-card.ts),
// favoriet en blokkeren, de drie cijfers over 6 maanden, de beoordelingen met de verdeling per ster, per sector en functie een
// uitklaprij met "Gewerkt bij", vaardigheden met het aantal klussen, de eigen werkervaring en de bedrijven waar via ZekerFlex
// is gewerkt. Bij een open reactie eindigt de kaart in de balk Afwijzen / Accepteren.

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
  rating: { average: number; count: number; distribution?: Record<string, number> };
  reviews: { rating: number; text: string; authorRole: string; at: string; shiftTitle?: string }[];
  skills: { name: string; rating: number; shiftsWorked: number; sector?: string }[];
  certificates: { label: string; expiresOn?: string }[];
  history: { title: string; city: string; company: string; monthLabel: string; rateCents: number }[];
  followsYou?: boolean;
  matched?: boolean;
  contact?: { phone: string | null; email: string } | null;
  prestaties?: { gematcht: number; nietVoltooid: number; vervanging: number };
  perFunctie?: { sleutel: string; sector: string; functie: string | null; average: number; count: number; bedrijven: { naam: string; aantal: number }[] }[];
  ervaring?: { functie: string; bedrijf: string; vanMaand: number; vanJaar: number; nu: boolean; totMaand: number | null; totJaar: number | null; omschrijving: string }[];
  gewerktBij?: string[];
  favoriet?: boolean;
  geblokkeerd?: boolean;
  regios?: { naam: string; lat: number; lng: number }[];
}

const euroIn = (c: number, nl: boolean) => `€ ${nl ? (c / 100).toFixed(2).replace(".", ",") : (c / 100).toFixed(2)}`;
const KOP = "font-display text-xl font-bold text-ink sm:text-2xl";
const LINK = "inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline";

/** Vijf sterren; het gevulde deel volgt het gemiddelde (ook halve sterren). */
function Stars({ n, maat = 14 }: { n: number; maat?: number }) {
  const k = useT().kandidaatKaart;
  const pct = Math.max(0, Math.min(100, (n / 5) * 100));
  const rij = [1, 2, 3, 4, 5].map((i) => <Ster key={i} maat={maat} />);
  return (
    <span className="relative inline-flex" role="img" aria-label={fmt(k.sterren, { n })}>
      <span className="inline-flex text-neutralx-300">{rij}</span>
      <span aria-hidden className="absolute inset-y-0 left-0 inline-flex overflow-hidden whitespace-nowrap text-money-bright" style={{ width: `${pct}%` }}>
        {rij}
      </span>
    </span>
  );
}

/** Een icoon in een grijs vakje met een regel tekst ernaast (omgeving, telefoon, e-mail). */
function ContactRegel({ icoon, label, children }: { icoon: ReactNode; label: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5 text-sm text-ink">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-paper-soft text-brand-600">{icoon}</span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/** Wat er staat zolang telefoon en e-mail zijn afgeschermd: een wazig vlak met een vaste nepwaarde, nooit het echte gegeven. */
function Afgeschermd({ vorm, uitleg }: { vorm: string; uitleg: string }) {
  return (
    <>
      <span aria-hidden className="select-none rounded bg-paper-soft px-1 text-neutralx-400 blur-[5px]">
        {vorm}
      </span>
      <span className="sr-only">{uitleg}</span>
    </>
  );
}

function Cijfer({ icoon, n, label, sub }: { icoon: ReactNode; n: number; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-4 py-3 sm:px-6 sm:py-0 sm:first:pl-0">
      <span className="mt-1 text-neutralx-400">{icoon}</span>
      <div>
        <p className="num font-display text-3xl font-bold leading-none text-ink">{n}</p>
        <p className="mt-1.5 text-sm text-ink">{label}</p>
        <p className="text-sm text-neutralx-500">{sub}</p>
      </div>
    </div>
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
  reserveKeuze = [],
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
  /** the other open reactions: with the last seat, accepting first asks which of them go on the reserve bench (max 3) */
  reserveKeuze?: { offerId: string; naam: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { locale, t: dict } = useI18n();
  const k = dict.kandidaatKaart;
  const kp = dict.klusPagina;
  const nl = locale === "nl";
  const euro = (c: number) => euroIn(c, nl);
  const cijfer = (n: number) => (nl ? n.toFixed(1).replace(".", ",") : n.toFixed(1));
  const badgeNaam = (b: string) => (Object.hasOwn(BADGES, b) ? k[BADGES[b]!] : b);
  const [gekozen, setGekozen] = useState<"accepted" | "declined" | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [besluit, setBesluit] = useState<{ decision: "accepted" | "declined"; message: string } | null>(null);
  // reserves kiezen vóór het accepteren van de laatste plek (zoals YoungOnes' back-up lijst, lib/reservebank)
  const [reserveStap, setReserveStap] = useState(false);
  const [reserves, setReserves] = useState<string[]>([]);
  // "Nog een paar laatste checks": het venster voor een bedrijf dat nog niet is gecontroleerd
  const [checks, setChecks] = useState(false);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [alleReviews, setAlleReviews] = useState(false);
  const [alleSkills, setAlleSkills] = useState(false);
  const [sector, setSector] = useState("");
  const [regioOpen, setRegioOpen] = useState(false);
  const [fotoOpen, setFotoOpen] = useState(false);
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
  const beslis = async (decision: "accepted" | "declined", metReserves: string[] | null = null) => {
    if (!beslissing || bezig) return;
    // laatste plek en nog andere reacties: eerst vragen wie op de reservebank mag
    if (decision === "accepted" && reserveKeuze.length > 0 && metReserves === null) {
      setReserveStap(true);
      return;
    }
    setBezig(true);
    setFout(null);
    for (const offerId of metReserves ?? []) {
      // een reserve die niet lukt houdt het accepteren niet tegen; de pagina toont daarna de echte stand
      await zetReserveAction(offerId, true).catch(() => undefined);
    }
    const r: OfferResponse = await respondToOfferAction(beslissing.offerId, decision).catch(() => ({ ok: false, message: k.mislukt }));
    setReserveStap(false);
    setBezig(false);
    if (!r.ok) {
      // een bedrijf dat nog niet is gecontroleerd: de reactie blijft openstaan en het venster vraagt de bedrijfsgegevens (23 nov 2026)
      if (r.code === BEDRIJF_NOG_NIET_GECONTROLEERD) {
        setOpen(false);
        setChecks(true);
        return;
      }
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

  const toonNaam = card?.name ?? name;
  const verdeling: Record<string, number> = card?.rating.distribution ?? {};
  const meeste = Math.max(1, ...[1, 2, 3, 4, 5].map((s) => verdeling[String(s)] ?? 0));
  const perFunctie = card?.perFunctie ?? [];
  const sectoren = [...new Set((card?.skills ?? []).map((s) => s.sector ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  const skills = (card?.skills ?? []).filter((s) => !sector || s.sector === sector);
  const maanden = k.maanden.split(",");
  const maand = (n: number | null) => maanden[(n ?? 1) - 1] ?? "";

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

      <BreedVenster
        open={open}
        titelId={titleId}
        titel={toonNaam}
        sluitLabel={k.sluiten}
        onSluit={() => setOpen(false)}
        kop={
          card ? (
            card.avatarUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.avatarUrl}
                  alt={fmt(k.fotoVan, { naam: toonNaam })}
                  className="mb-5 h-28 w-28 cursor-zoom-in rounded-full object-cover sm:h-44 sm:w-44"
                  onClick={() => setFotoOpen(true)}
                />
                {fotoOpen && (
                  <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setFotoOpen(false)}
                    role="dialog"
                    aria-modal
                    aria-label={fmt(k.fotoVan, { naam: toonNaam })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.avatarUrl} alt={fmt(k.fotoVan, { naam: toonNaam })} className="max-h-[90vh] max-w-full rounded-xl object-contain" />
                  </div>
                )}
              </>
            ) : (
              <span aria-hidden className="mb-5 grid h-28 w-28 place-items-center rounded-full bg-brand-100 text-4xl font-bold text-brand-700 sm:h-44 sm:w-44">
                {toonNaam.slice(0, 1).toUpperCase()}
              </span>
            )
          ) : beslissing ? (
            <p className="mb-1 text-sm font-semibold text-neutralx-500">{fmt(k.reactieVan, { naam: name })}</p>
          ) : null
        }
        voet={
          beslissing ? (
            <div className="sticky bottom-0 border-t border-hair bg-white px-5 pb-5 pt-4 sm:px-10">
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
                  <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-11 w-full sm:w-auto">
                    {k.sluiten}
                  </button>
                </div>
              ) : reserveStap ? (
                <div className="mt-3 space-y-3">
                  <p className="font-semibold text-ink">{k.reservesKop}</p>
                  <p className="text-xs text-neutralx-600">{fmt(k.reservesUitleg, { naam: name })}</p>
                  <ul className="space-y-1.5">
                    {reserveKeuze.map((r) => {
                      const aan = reserves.includes(r.offerId);
                      const vol = !aan && reserves.length >= 3;
                      return (
                        <li key={r.offerId}>
                          <label className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${aan ? "border-brand-400 bg-brand-50" : "border-hair"} ${vol ? "opacity-50" : ""}`}>
                            <input
                              type="checkbox"
                              checked={aan}
                              disabled={vol}
                              onChange={(e) => setReserves((v) => (e.target.checked ? [...v, r.offerId].slice(0, 3) : v.filter((id) => id !== r.offerId)))}
                            />
                            <span>{r.naam}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <button type="button" onClick={() => void beslis("accepted", [])} disabled={bezig} className="btn-ghost min-h-11 disabled:opacity-50">
                      {k.reservesOverslaan}
                    </button>
                    <button type="button" onClick={() => void beslis("accepted", reserves)} disabled={bezig || reserves.length === 0} className="btn-primary min-h-11 disabled:opacity-50">
                      {bezig ? k.reservesBezig : k.reservesDoorgaan}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {gekozen && (
                    <p className="mt-1 text-xs text-neutralx-500">
                      {gekozen === "accepted" ? fmt(k.gekozenAccept, { naam: name }) : k.gekozenDecline}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setGekozen("declined");
                        void beslis("declined");
                      }}
                      disabled={bezig}
                      className={`btn-ghost min-h-11 disabled:opacity-50 ${gekozen === "declined" ? "ring-2 ring-crit/40" : ""}`}
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
                      className={`btn-primary min-h-11 disabled:opacity-50 ${gekozen === "accepted" ? "ring-2 ring-brand-300" : ""}`}
                    >
                      {bezig && gekozen === "accepted" ? k.bezig : k.accepteren}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null
        }
      >
        {preview && (
          <div className="mt-5 space-y-4">
            {preview.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.avatarUrl} alt={fmt(k.fotoVan, { naam: name })} className="aspect-square w-full max-w-[16rem] rounded-2xl object-cover" />
            ) : (
              <span className="grid aspect-square w-40 place-items-center rounded-2xl bg-brand-100 text-5xl font-bold text-brand-700">{name.slice(0, 1).toUpperCase()}</span>
            )}
            {preview.lines.length > 0 && (
              <ul className="space-y-1 text-sm text-neutralx-700">
                {preview.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
            <p className="rounded-xl bg-paper-soft px-3 py-2.5 text-xs text-neutralx-600">{k.volledigProfiel}</p>
          </div>
        )}

        {state === "loading" && <p className="py-8 text-center text-sm text-neutralx-500">{k.laden}</p>}
        {state === "error" && (
          <p role="alert" className="py-8 text-center text-sm text-crit">
            {k.kanNietLaden}
          </p>
        )}

        {card && (
          <div className="mt-4 divide-y divide-hair">
            {/* kop: labels, favoriet en blokkeren, en waar en hoe je iemand bereikt */}
            <div className="pb-6">
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutralx-500">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">★ {badgeNaam(card.badge)}</span>
                {card.followsYou && (
                  <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink" title={k.volgtTitle}>
                    {k.volgtJullie}
                  </span>
                )}
                <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink">
                  {card.reliabilityPct}% {k.statBetrouwbaar}
                </span>
                <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink">
                  {card.shiftsCompleted} {k.statDiensten}
                </span>
                <span role="group" aria-label={k.relatieKop} className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <FreelancerRelationButton userId={card.userId} name={card.name} kind="favorite" active={Boolean(card.favoriet)} />
                  <FreelancerRelationButton userId={card.userId} name={card.name} kind="block" active={Boolean(card.geblokkeerd)} />
                </span>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
                {card.area && (
                  <ContactRegel icoon={<Speld />} label={k.woonplaats}>
                    {fmt(k.omgeving, { gebied: card.area }).replace("📍 ", "")}
                  </ContactRegel>
                )}
                <ContactRegel icoon={<Telefoon />} label={k.telefoon}>
                  {card.contact ? card.contact.phone || k.onbekend : <Afgeschermd vorm="06 00 00 00 00" uitleg={k.naMatch} />}
                </ContactRegel>
                <ContactRegel icoon={<Envelop />} label={k.email}>
                  {card.contact ? card.contact.email : <Afgeschermd vorm="naam@voorbeeld.nl" uitleg={k.naMatch} />}
                </ContactRegel>
              </div>
              {!card.contact && <p className="mt-2 text-xs text-neutralx-500">{k.naMatch}</p>}
            </div>

            {/* de drie cijfers over de laatste 6 maanden */}
            {card.prestaties && (
              <div className="grid py-6 sm:grid-cols-3 sm:divide-x sm:divide-hair">
                <Cijfer icoon={<Kalender maat={28} />} n={card.prestaties.gematcht} label={kp.gematcht} sub={k.laatste6} />
                <Cijfer icoon={<KruisRond maat={28} />} n={card.prestaties.nietVoltooid} label={kp.nietVoltooid} sub={k.laatste6} />
                <Cijfer icoon={<Wissel maat={28} />} n={card.prestaties.vervanging} label={kp.vervanging} sub={k.laatste6} />
              </div>
            )}

            {/* beoordelingen: gemiddelde, verdeling per ster, per sector en functie */}
            <div className="py-6">
              <h3 className={KOP}>{k.beoordelingen}</h3>
              {card.rating.count === 0 ? (
                <p className="mt-3 text-sm text-neutralx-600">{k.geenBeoordelingen}</p>
              ) : (
                <div className="mt-4 grid gap-6 rounded-lg bg-paper-soft p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:p-6">
                  <div>
                    <p className="num font-display text-5xl font-bold leading-none text-ink">{cijfer(card.rating.average)}</p>
                    <p className="mt-3">
                      <Stars n={card.rating.average} maat={22} />
                    </p>
                    <p className="mt-2 text-sm text-neutralx-500">{card.rating.count === 1 ? k.reviewsAantalEen : fmt(k.reviewsAantal, { n: card.rating.count })}</p>
                  </div>
                  <ul className="space-y-2.5 self-center">
                    {[5, 4, 3, 2, 1].map((s) => {
                      const n = verdeling[String(s)] ?? 0;
                      return (
                        <li key={s} className="flex items-center gap-3 text-sm text-ink">
                          <span className="w-20 flex-shrink-0">{s === 1 ? k.sterRij : fmt(k.sterrenRij, { n: s })}</span>
                          <span aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white">
                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(n / meeste) * 100}%` }} />
                          </span>
                          <span className="num w-8 flex-shrink-0 text-right text-neutralx-500">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {perFunctie.length > 0 && (
                <ul className="mt-3">
                  {(alleReviews ? perFunctie : perFunctie.slice(0, 4)).map((g) => (
                    <li key={g.sleutel}>
                      <details className="group/rij">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 text-sm text-ink [&::-webkit-details-marker]:hidden">
                          <span className="text-neutralx-500 transition-transform group-open/rij:rotate-180">
                            <Hoek />
                          </span>
                          <span className="min-w-0 flex-1 break-words">{g.functie ? `${g.sector} - ${g.functie}` : g.sector}</span>
                          <span className="inline-flex flex-shrink-0 items-center gap-1">
                            <span className="text-money-bright">
                              <Ster />
                            </span>
                            <span className="num font-medium">{cijfer(g.average)}</span>
                          </span>
                          <span className="w-20 flex-shrink-0 text-right text-neutralx-500">{g.count === 1 ? dict.klusPagina.reviewsEen : fmt(dict.klusPagina.reviewsN, { n: g.count })}</span>
                        </summary>
                        <div className="pb-3 pl-7 text-sm text-ink">
                          <p className="font-semibold">{k.gewerktBij}</p>
                          <ul className="mt-1 space-y-0.5 text-neutralx-600">
                            {g.bedrijven.map((b) => (
                              <li key={b.naam}>{b.aantal === 1 ? fmt(k.bedrijfMetEen, { naam: b.naam }) : fmt(k.bedrijfMet, { naam: b.naam, n: b.aantal })}</li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              {perFunctie.length > 4 && (
                <button type="button" onClick={() => setAlleReviews((v) => !v)} aria-expanded={alleReviews} className={LINK}>
                  {alleReviews ? k.minderReviews : k.meerReviews}
                  <Hoek open={alleReviews} />
                </button>
              )}

              {card.reviews.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-ink">{k.watGeschreven}</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {card.reviews.map((r, i) => (
                      <figure key={i} className="rounded-xl border border-hair p-3">
                        <Stars n={r.rating} />
                        <blockquote className="mt-1 break-words text-sm text-neutralx-700">&ldquo;{r.text}&rdquo;</blockquote>
                        {r.shiftTitle && <figcaption className="mt-0.5 text-xs text-neutralx-400">{r.shiftTitle}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* vaardigheden (met het aantal klussen) en certificaten */}
            {(card.skills.length > 0 || card.certificates.length > 0) && (
              <div className="py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className={KOP}>{k.vaardigheden}</h3>
                  {sectoren.length > 1 && (
                    <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink">
                      <Trechter maat={16} />
                      <span className="sr-only">{k.sectorFilter}</span>
                      <select value={sector} onChange={(e) => setSector(e.target.value)} className="min-h-10 bg-transparent text-sm">
                        <option value="">{k.alleSectoren}</option>
                        {sectoren.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {card.skills.length > 0 && <p className="mt-2 text-sm text-neutralx-600">{fmt(k.vaardighedenUitleg, { naam: toonNaam })}</p>}
                <ul className="mt-4 flex flex-wrap gap-2">
                  {(alleSkills ? skills : skills.slice(0, 8)).map((s) => (
                    <li key={s.name} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-hairstrong py-0.5 pl-4 pr-1 text-sm text-ink">
                      {s.name}
                      <span className="num grid h-7 min-w-7 place-items-center rounded-full bg-brand-100 px-1.5 text-sm font-semibold text-brand-700">{s.shiftsWorked}</span>
                    </li>
                  ))}
                  {card.certificates.slice(0, 8).map((c, i) => (
                    <li key={`c-${i}`} className="inline-flex min-h-9 items-center rounded-full bg-brand-50 px-4 text-sm text-brand-700">
                      ✓ {c.label}
                    </li>
                  ))}
                </ul>
                {skills.length > 8 && (
                  <button type="button" onClick={() => setAlleSkills((v) => !v)} aria-expanded={alleSkills} className={LINK}>
                    {alleSkills ? k.minderVaardigheden : k.meerVaardigheden}
                    <Hoek open={alleSkills} />
                  </button>
                )}
              </div>
            )}

            {/* werkervaring die de freelancer zelf invulde */}
            {(card.ervaring ?? []).length > 0 && (
              <div className="py-6">
                <h3 className={KOP}>{k.werkervaring}</h3>
                <ul className="mt-4 space-y-5">
                  {(card.ervaring ?? []).map((e, i) => (
                    <li key={i} className="border-l-2 border-hair pl-5">
                      {e.functie && <p className="text-sm font-semibold text-ink">{e.functie}</p>}
                      <p className="text-sm text-ink">{e.bedrijf}</p>
                      <p className="mt-1 text-sm text-neutralx-500">
                        {maand(e.vanMaand)} {e.vanJaar} - {e.nu ? k.ervaringNu : `${maand(e.totMaand)} ${e.totJaar ?? ""}`.trim()}
                      </p>
                      {e.omschrijving && <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{e.omschrijving}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* actieve regio's */}
            {(card.regios ?? []).length > 0 && (
              <div className="py-2">
                <button type="button" className={LINK} onClick={() => setRegioOpen(true)}>
                  <Speld maat={15} />
                  {fmt(k.actiefInRegios, { n: (card.regios ?? []).length })}
                </button>
              </div>
            )}

            {/* waar via ZekerFlex is gewerkt */}
            {((card.gewerktBij ?? []).length > 0 || card.history.length > 0) && (
              <div className="py-6">
                {(card.gewerktBij ?? []).length > 0 && (
                  <>
                    <h3 className={KOP}>{fmt(k.gewerktVia, { naam: toonNaam })}</h3>
                    <ul className="mt-4 grid gap-x-8 gap-y-1 text-sm text-ink sm:grid-cols-2">
                      {(card.gewerktBij ?? []).map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                          <span className="min-w-0 break-words">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {card.history.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-2 text-sm font-semibold text-ink">{k.werkverleden}</h4>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {card.history.map((h, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-hair px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{h.title}</span>
                            <span className="block truncate text-xs text-neutralx-500">
                              {h.company} · {h.city} · {h.monthLabel}
                            </span>
                          </span>
                          <span className="num flex-shrink-0 text-xs text-neutralx-500">{fmt(k.perUur, { bedrag: euro(h.rateCents) })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {card.avgRateCents !== null && (
                  <p className="mt-4 text-sm text-neutralx-600">
                    {k.gemTarief}
                    <strong className="text-ink">{fmt(k.perUur, { bedrag: euro(card.avgRateCents) })}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </BreedVenster>

      {(card?.regios ?? []).length > 0 && (
        <RegioVenster
          open={regioOpen}
          naam={toonNaam}
          regios={(card?.regios ?? []).map((r) => ({ naam: r.naam, lat: r.lat, lng: r.lng, klussen: 0 }))}
          klus={null}
          onSluit={() => setRegioOpen(false)}
        />
      )}

      {checks && beslissing && (
        <LaatsteChecksVenster
          naam={name}
          keuzes={[{ offerId: beslissing.offerId, shiftId }]}
          onSluit={() => setChecks(false)}
          onGecontroleerd={() => {
            // het bedrijf is meteen gecontroleerd: de keuze gaat nu alsnog door (de reserves staan er al)
            setChecks(false);
            void beslis("accepted", []);
          }}
        />
      )}
    </>
  );
}

const BADGES: Record<string, "badgeBRONZE" | "badgeSILVER" | "badgeGOLD" | "badgePLATINUM"> = { BRONZE: "badgeBRONZE", SILVER: "badgeSILVER", GOLD: "badgeGOLD", PLATINUM: "badgePLATINUM" };
