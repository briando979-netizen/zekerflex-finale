import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITEITEN, BASE } from "@/lib/voorstel/schwarzwald";
import { AANWEZIG_LABEL } from "@/lib/voorstel/aanwezig-regels";
import { dubbelIngepland, perBegeleider } from "@/lib/voorstel/begeleider-regels";
import { beheerder } from "@/lib/voorstel/schwarzwald-accounts";
import { AGENDA, isDatum } from "@/lib/voorstel/schwarzwald-agenda";
import { boekingenOp } from "@/lib/voorstel/schwarzwald-boekingen";
import { klantkaart } from "@/lib/voorstel/schwarzwald-crm";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { dagOverzicht, plusDagen } from "@/lib/voorstel/schwarzwald-planning";
import { PrintKnop } from "@/components/voorstel/beheer/PrintKnop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dagplanning" };

// Dagplanning voor het personeel, om te printen en mee de vloer op te nemen:
// alle reserveringen van één dag op begintijd, met eindtijd, begeleider,
// contact, opmerking en de wensen uit het klantdossier (dieet, allergieën).

const dagNaam = (datum: string, opties: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { ...opties, timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));
const STATUS: Record<string, string> = { nieuw: "nog bevestigen", bevestigd: "bevestigd" };

// bij printen alleen de dagplanning: kop, voet, menu en meldingen van de site vallen weg
const PRINT = `@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body * { visibility: hidden; }
  #dagplanning, #dagplanning * { visibility: visible; }
  #dagplanning { position: absolute; inset: 0 auto auto 0; width: 100%; }
  .niet-printen { display: none !important; }
}`;

export default async function DagplanningPage({ params }: { params: Promise<{ datum: string }> }) {
  const { datum } = await params;
  if (!isDatum(datum)) notFound();
  const wie = await beheerder();
  if (!wie) {
    return (
      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-8">
        <div className="rounded-xl3 bg-white p-8 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          <h1 className="font-display text-2xl font-bold">Alleen voor beheerders</h1>
          <p className="mt-2 text-schw-mute">Log in met een beheerdersaccount om de dagplanning te zien.</p>
          <Link href={`${BASE}/beheer`} className="mt-5 inline-block rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
            Naar beheer
          </Link>
        </div>
      </section>
    );
  }

  const [boekingen, cfg] = await Promise.all([boekingenOp(datum), agendaConfig()]);
  const duur = Object.fromEntries([...Object.entries(AGENDA), ...Object.entries(cfg.regels)].map(([slug, r]) => [slug, r.duurMin]));
  const namen: Record<string, string> = Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]));
  const { regels, perActiviteit, gasten, geannuleerd } = dagOverzicht(boekingen, duur);
  const kaarten = await Promise.all(regels.map((r) => klantkaart(r.b.account ?? r.b.email).catch(() => null)));
  const blokkades = (cfg.blokkades ?? []).filter((k) => k.datum === datum).sort((a, b) => a.van.localeCompare(b.van));
  const team = perBegeleider(boekingen);
  const dubbel = dubbelIngepland(boekingen, duur);

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
      <style>{PRINT}</style>
      <div className="niet-printen mb-6 flex flex-wrap items-center gap-3">
        <Link href={`${BASE}/beheer#planning`} className="rounded-full px-5 py-3 font-semibold ring-1 ring-schw-night/15">
          ‹ Beheer
        </Link>
        <Link href={`${BASE}/beheer/dag/${plusDagen(datum, -1)}`} className="rounded-full px-5 py-3 font-semibold ring-1 ring-schw-night/15" aria-label="Vorige dag">
          ‹ Vorige dag
        </Link>
        <Link href={`${BASE}/beheer/dag/${plusDagen(datum, 1)}`} className="rounded-full px-5 py-3 font-semibold ring-1 ring-schw-night/15" aria-label="Volgende dag">
          Volgende dag ›
        </Link>
        <span className="ml-auto">
          <PrintKnop />
        </span>
      </div>

      <div id="dagplanning" className="rounded-xl3 bg-white p-6 text-schw-night shadow-[0_1px_2px_rgba(10,18,14,0.06)] print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-schw-night/15 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Dagplanning Het Schwarzwald</p>
            <h1 className="mt-1 font-display text-3xl font-bold first-letter:uppercase">{dagNaam(datum, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
          </div>
          <p className="text-sm">
            <strong>{regels.length}</strong> {regels.length === 1 ? "reservering" : "reserveringen"} · <strong>{gasten}</strong> gasten
            {geannuleerd > 0 && <> · {geannuleerd} geannuleerd (niet in de lijst)</>}
          </p>
        </div>

        {perActiviteit.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {perActiviteit.map((a) => (
              <li key={a.activiteit} className="rounded-full bg-schw-sand px-3 py-1">
                <strong>{namen[a.activiteit] ?? a.activiteit}</strong>: {a.groepen} {a.groepen === 1 ? "groep" : "groepen"}, {a.personen} pers.
              </li>
            ))}
          </ul>
        )}

        {team.length > 0 && (
          <div className="mt-4 text-sm">
            <p className="font-bold">Per begeleider</p>
            <ul className="mt-1 space-y-0.5">
              {team.map((t) => (
                <li key={t.naam}>
                  <strong>{t.naam}</strong>: {t.groepen.map((b) => `${b.tijd} ${namen[b.activiteit] ?? b.activiteit} (${b.personen} p.)`).join(" · ")}
                  {t.groepen.some((b) => dubbel.has(`${b.datum}-${b.id}`)) && <span className="font-bold text-schw-rust"> · let op: groepen lopen tegelijk</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {blokkades.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-schw-night/30 px-4 py-3 text-sm">
            <p className="font-bold">Geblokkeerd voor online boeken</p>
            <ul className="mt-1 space-y-0.5">
              {blokkades.map((k, i) => (
                <li key={`${k.van}-${k.activiteit}-${i}`}>
                  {k.van}–{k.tot} · {k.activiteit ? (namen[k.activiteit] ?? k.activiteit) : "alle activiteiten"}
                  {k.reden && <span className="text-schw-mute"> · {k.reden}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {regels.length === 0 ? (
          <p className="mt-6 text-schw-mute">Geen reserveringen op deze dag.</p>
        ) : (
          <table className="mt-5 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-schw-night/30 text-xs uppercase tracking-wide">
                <th className="py-2 pr-3">Tijd</th>
                <th className="py-2 pr-3">Activiteit</th>
                <th className="py-2 pr-3 text-right">Pers.</th>
                <th className="py-2 pr-3">Naam en telefoon</th>
                <th className="py-2 pr-3">Opmerking en wensen</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-center">Binnen</th>
              </tr>
            </thead>
            <tbody>
              {regels.map(({ b, eind }, i) => {
                const wensen = kaarten[i]?.wensen?.trim() ?? "";
                return (
                  <tr key={b.id} className="break-inside-avoid border-b border-schw-night/10 align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 font-bold">
                      {b.tijd}–{eind}
                    </td>
                    <td className="py-2.5 pr-3">
                      {namen[b.activiteit] ?? b.activiteit}
                      {b.begeleider && (
                        <>
                          <br />
                          <span className="font-semibold">Begeleider: {b.begeleider}</span>
                          {dubbel.has(`${b.datum}-${b.id}`) && (
                            <>
                              <br />
                              <span className="font-bold text-schw-rust">
                                Tegelijk ook: {(dubbel.get(`${b.datum}-${b.id}`) ?? []).map((x) => `${x.tijd} ${namen[x.activiteit] ?? x.activiteit}`).join(", ")}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold">{b.personen}</td>
                    <td className="py-2.5 pr-3">
                      {b.naam}
                      <br />
                      <span className="text-schw-mute">{b.telefoon}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {b.opmerking && <p>&ldquo;{b.opmerking}&rdquo;</p>}
                      {wensen && <p className="font-semibold">Wensen: {wensen}</p>}
                      {b.verzetVan && <p className="text-schw-mute">Verzet door de gast</p>}
                      {b.aantalVan !== undefined && <p className="text-schw-mute">Aantal gewijzigd, was {b.aantalVan}</p>}
                      {!b.opmerking && !wensen && !b.verzetVan && b.aantalVan === undefined && <span className="text-schw-mute">–</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      {STATUS[b.status] ?? b.status}
                      <br />
                      <span className="text-xs text-schw-mute">nr. {b.id}</span>
                    </td>
                    <td className="py-2.5 text-center">
                      {b.aanwezig ? (
                        <span className="font-bold">
                          <span aria-hidden="true">{b.aanwezig === "ja" ? "✓" : "✗"}</span>
                          <span className="sr-only">{AANWEZIG_LABEL[b.aanwezig]}</span>
                        </span>
                      ) : (
                        <span aria-hidden="true" className="inline-block h-5 w-5 rounded border-2 border-schw-night/40" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-6 text-xs text-schw-mute">Afgedrukt uit het beheer van Het Schwarzwald. Bevat contactgegevens van gasten: na gebruik vernietigen.</p>
      </div>
    </section>
  );
}
