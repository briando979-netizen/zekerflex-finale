import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getShiftDetail } from "@/lib/dashboard/marketplace";
import { PageHeader, Panel, StatusPill, money, moneyExact, dateTime } from "@/components/app/ui";
import { ApplyButton } from "@/components/app/ApplyButton";
import { ShiftMiniMap } from "@/components/app/ShiftMiniMap";
import { shiftCategory } from "@/lib/shifts/category";
import { MODE_ORDER, formatMinutes } from "@/lib/geo/travel-modes";
import { AgreementBadge } from "@/components/app/AgreementBadge";
import { CounterOfferForm } from "@/components/app/CounterOfferForm";
import { SeriesApply } from "@/components/app/SeriesApply";
import { MessageEmployerButton } from "@/components/app/MessageEmployerButton";
import { ReviewButton } from "@/components/app/ReviewButton";

const AGREEMENT_LABEL: Record<string, string> = {
  VRIJE_VERVANGING: "Vrije vervanging",
  GEEN_WERKGEVERSGEZAG: "Geen werkgeversgezag",
  TUSSENKOMST: "Tussenkomst",
  BRANCHE: "Branchemodel",
};

export const dynamic = "force-dynamic";

export default async function ShiftDetailPage({ params }: { params: { shiftId: string } }) {
  const principal = await requirePrincipal();
  const s = await getShiftDetail(principal.userId, params.shiftId);
  if (!s) notFound();

  const osm = `https://www.openstreetmap.org/?mlat=${s.branchLat}&mlon=${s.branchLng}#map=15/${s.branchLat}/${s.branchLng}`;
  const cat = shiftCategory(s.title, s.skill);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard/klussen" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Alle klussen
        </Link>
      </div>

      {/* photo hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cat.photo} alt="" className="aspect-[21/9] w-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
        <span
          className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
          style={{ background: `${cat.accent}dd` }}
        >
          {cat.label}
        </span>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <h1 className="font-display text-2xl font-bold drop-shadow md:text-3xl">{s.title}</h1>
          <p className="mt-1 text-sm text-white/85">
            {s.branch} · {s.city}
            {s.travel ? ` · ${s.travel.distanceKm} km` : ""}
          </p>
        </div>
        {s.match && (
          <span className="absolute right-4 top-4 rounded-full bg-brand-500/90 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
            {Math.round(s.match.score * 100)}% match
          </span>
        )}
      </div>

      <PageHeader
        title="Details"
        subtitle="Alles wat je moet weten voor je aanneemt"
        action={
          <Link href="/dashboard/klussen" className="btn-ghost">
            Terug
          </Link>
        }
      />

      {s.alreadyApplied && (
        <div className="card mb-6 flex flex-wrap items-center gap-3 border-ok/30 bg-ok/5 p-4 text-sm">
          <StatusPill tone="ok">Je hebt deze dienst aangenomen</StatusPill>
          {new Date(s.endsAt).getTime() < Date.now() ? (
            <>
              <span>Klaar met deze klus?</span>
              <ReviewButton
                subjectType="company"
                subjectId={s.clientTenantId}
                subjectName={s.clientName}
                shiftId={s.id}
                label="Beoordeel opdrachtgever"
              />
            </>
          ) : (
            <span>— je vindt hem bij Mijn diensten.</span>
          )}
        </div>
      )}
      {!s.canApply && s.blockReason && !s.alreadyApplied && (
        <div className="card mb-6 border-warn/30 bg-warn/5 p-4 text-sm text-neutralx-700">{s.blockReason}</div>
      )}

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Details">
            <dl className="divide-y divide-hair text-sm">
              <Row k="Wanneer" v={`${dateTime(s.startsAt)} – ${dateTime(s.endsAt)}`} />
              <Row k="Duur" v={`${s.hours} uur${s.breakMinutes ? ` · ${s.breakMinutes} min pauze` : ""}`} />
              <Row k="Uurtarief" v={`${moneyExact(s.hourlyRateCents)} bruto`} />
              <Row k="Geschat bruto" v={<span className="font-semibold text-brand-600">{money(s.grossCents)}</span>} />
              {s.skill && <Row k="Vak" v={s.skill} />}
              <Row k="Plekken" v={`${s.positions - s.taken} van ${s.positions} vrij`} />
              {s.workedHereBefore > 0 && <Row k="Historie" v={`Je werkte hier al ${s.workedHereBefore}×`} />}
            </dl>
          </Panel>

          {s.description && (
            <Panel title="Omschrijving">
              <p className="px-5 py-4 text-sm leading-relaxed text-ink-soft">{s.description}</p>
            </Panel>
          )}

          <Panel title="Jouw modelovereenkomst">
            <div className="px-5 py-4">
              {s.agreement ? (
                <div className="rounded-lg border border-hair bg-paper-soft/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`/api/model-agreements/${s.agreement.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-brand-600 hover:underline"
                    >
                      {s.agreement.reference} · pdf openen
                    </a>
                    <AgreementBadge
                      status={s.agreement.status}
                      freelancerSigned={s.agreement.freelancerSigned}
                      clientSigned={s.agreement.clientSigned}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-neutralx-500">
                    {AGREEMENT_LABEL[s.agreement.type] ?? s.agreement.type} · geldt ook voor deze klus bij dezelfde opdrachtgever.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-hairstrong bg-paper-soft/60 p-3 text-sm text-neutralx-600">
                  Zodra je aanneemt maakt ZekerFlex automatisch een modelovereenkomst aan
                  ({AGREEMENT_LABEL[s.agreementType] ?? "Vrije vervanging"}) — Wet DBA-proof. Je tekent digitaal, de opdrachtgever ook.
                </div>
              )}
              <ul className="mt-3 space-y-1.5 text-sm text-neutralx-600">
                <li>Check in op locatie; na goedkeuring van je uren kies je zelf hoe snel je uitbetaald wordt (gratis wachten of sneller tegen een fee).</li>
                <li>De factuur wordt automatisch voor je aangemaakt — je hoeft niets te sturen.</li>
              </ul>
            </div>
          </Panel>

          <Panel title="Annuleren? Zo werkt dat">
            <ul className="space-y-2 px-5 py-4 text-sm text-neutralx-600">
              <li>
                <span className="font-medium text-ink">Je bent zelf verantwoordelijk voor je vervanger.</span> Kun je niet, regel dan
                op tijd iemand via &ldquo;Regel een vervanger&rdquo; bij Mijn klussen.
              </li>
              <li>
                Je klus wordt dan automatisch teruggezet op het platform met het kopje{" "}
                <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-semibold text-warn">Vervanging</span>, zodat een
                andere kracht het kan overnemen.
              </li>
              <li>Last-minute annuleren zonder vervanger telt mee in je betrouwbaarheidsscore en kan je matching beperken.</li>
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          {s.travel && (
            <Panel title="Reistijd vanaf je thuisbasis" subtitle={`± ${s.travel.distanceKm} km hemelsbreed`}>
              <ul className="divide-y divide-hair">
                {MODE_ORDER.map((m) => {
                  const e = s.travel!.byMode[m];
                  const fast = m === s.travel!.fastest.mode;
                  return (
                    <li key={m} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className={`flex items-center gap-2 ${fast ? "font-semibold text-brand-700" : "text-ink-soft"}`}>
                        {e.label}
                        {fast && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">snelst</span>}
                      </span>
                      <span className="num text-right">
                        <span className={fast ? "font-semibold text-ink" : "text-ink-soft"}>{formatMinutes(e.minutes)}</span>
                        <span className="ml-2 text-xs text-neutralx-400">{e.distanceKm} km</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="px-5 py-3 text-[11px] text-neutralx-400">
                Schatting op basis van afstand en gemiddelde snelheden. De exacte reistijd volgt uit de routeplanner bij het aannemen.
              </p>
            </Panel>
          )}

          <Panel title="Locatie">
            <div className="px-4 py-4">
              <p className="text-sm text-ink-soft">{s.address}</p>
              <p className="text-sm text-neutralx-500">{s.postalCode} {s.city}</p>
              {s.travel && (
                <p className="mt-2 text-xs text-neutralx-500">
                  ± {s.travel.distanceKm} km · snelste route {s.travel.fastest.label.toLowerCase()} ~{formatMinutes(s.travel.fastest.minutes)}
                </p>
              )}
              <div className="mt-3">
                <ShiftMiniMap
                  home={s.match ? { lat: s.branchLat, lng: s.branchLng } : { lat: s.branchLat, lng: s.branchLng }}
                  points={[{ id: s.id, lat: s.branchLat, lng: s.branchLng, score: s.match?.score ?? 0.6, label: s.title, km: 0 }]}
                  height={180}
                />
              </div>
              <a href={osm} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
                Bekijk op OpenStreetMap →
              </a>
            </div>
          </Panel>

          {s.match && (
            <Panel title="Jouw match">
              <div className="px-5 py-4">
                <p className="num text-2xl font-bold text-brand-600">{Math.round(s.match.score * 100)}%</p>
                <ul className="mt-2 space-y-1 text-xs text-neutralx-600">
                  {s.match.reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </div>
            </Panel>
          )}

          <div className="card space-y-3 p-5">
            {s.alreadyApplied ? (
              <span className="pill-ok">Je hebt deze dienst al aangenomen</span>
            ) : s.seriesDays.length > 1 ? (
              <SeriesApply days={s.seriesDays} currentShiftId={s.id} disabled={!s.canApply} />
            ) : (
              <>
                <ApplyButton shiftId={s.id} disabled={!s.canApply} />
                <CounterOfferForm
                  shiftId={s.id}
                  listedRateCents={s.hourlyRateCents}
                  existing={s.myOffer}
                  disabled={!s.canApply}
                />
              </>
            )}
            <p className="text-xs text-neutralx-400">Je kunt binnen 60 seconden annuleren.</p>
            <div className="border-t border-hair pt-3">
              <MessageEmployerButton shiftId={s.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-neutralx-500">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
