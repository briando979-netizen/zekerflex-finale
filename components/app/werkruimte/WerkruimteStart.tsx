import Link from "next/link";
import type { Principal } from "@/lib/auth";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { KlusConceptNudge } from "@/components/app/KlusConceptNudge";
import { OnboardingProgress } from "@/components/app/OnboardingProgress";
import { AAN_DE_SLAG_KAART, AAN_DE_SLAG_STAPPEN, horecaStappen } from "@/lib/onboarding/aan-de-slag";
import { berekenVoortgang } from "@/lib/onboarding/voortgang";
import { KpiCard, PageHeader, Panel, money } from "@/components/app/ui";
import { TegelRaster, type Tegel } from "@/components/app/werkruimte/Tegels";
import { getEmployerOverview } from "@/lib/dashboard/employer";
import { isTenantVerified } from "@/lib/company/verified";
import { rijschoolKerncijfers } from "@/lib/rijschool/kerncijfers";
import { MODULES, MODULE_SLEUTELS } from "@/lib/horeca/modules";
import { horecaCijfers, websiteCijfers } from "@/lib/werkgever/werkruimte-cijfers";
import type { WerkruimteContext } from "@/lib/werkgever/werkruimte-server";
import { BANK_AAN } from "@/lib/app-mode";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// Het startscherm van /werkgever voor een rijschool, horecazaak of wie alleen een
// website of webshop heeft (lib/werkgever/werkruimte.ts). Bovenaan het eigen
// vak met kerncijfers en een tegel per onderdeel, daaronder de rest van de
// werkruimte en dan personeel inhuren. Wisselen van dashboard: de wisselaar in de zijbalk.
// Een bedrijf dat personeel inhuurt houdt het gewone dashboard (app/werkgever/page.tsx).
// ---------------------------------------------------------------------------

type GreetLabels = NonNullable<Parameters<typeof WelcomeBack>[0]["labels"]>;

type WS = Dict["werkruimteStart"];

interface Basis {
  principal: Principal;
  tenantId: string | undefined;
  greet: GreetLabels;
  d: WS;
}

/** "1 nieuwe aanmelding" of "3 nieuwe aanmeldingen": de twee vormen komen uit het woordenboek, met {n} erin. */
const aantal = (n: number, een: string, meer: string) => fmt(n === 1 ? een : meer, { n });

export async function WerkruimteStart({
  w,
  inApp,
  studio,
  ...rest
}: Omit<Basis, "d"> & { w: WerkruimteContext; inApp: boolean; studio: boolean }) {
  const d = (await getDict()).werkruimteStart;
  const basis: Basis = { ...rest, d };
  return (
    <>
      {w.soort === "rijschool" ? <RijschoolVak {...basis} /> : w.soort === "horeca" ? <HorecaVak {...basis} /> : <WebsiteVak {...basis} studio={studio} />}
      <KlusConceptNudge />
      <div className="mt-6">
        <Panel title={d.extraTitel} subtitle={d.extraSub}>
          <TegelRaster label={d.extraTitel} tegels={extraTegels(inApp, d)} />
        </Panel>
      </div>
      <PersoneelVak principal={basis.principal} tenantId={basis.tenantId} ookPersoneel={w.ookPersoneel} d={d} />
    </>
  );
}

/** Nog niet aangezet: één duidelijke stap. */
function Opzetten({ principal, greet, eyebrow, titel, uitleg, href, knop }: Basis & { eyebrow: string; titel: string; uitleg: string; href: string; knop: string }) {
  return (
    <>
      <WelcomeBack name={principal.fullName} labels={greet} />
      <section className="mb-6 rounded-2xl border border-brand-500/30 bg-brand-50 p-6">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="font-display text-[1.6rem] font-bold leading-tight text-ink">{titel}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutralx-700">{uitleg}</p>
        <Link href={href} className="btn-primary mt-5 inline-flex">
          {knop}
        </Link>
      </section>
    </>
  );
}

// --- rijschool ----------------------------------------------------------------

async function RijschoolVak(b: Basis) {
  const d = b.d;
  const k = b.tenantId ? await rijschoolKerncijfers(b.tenantId).catch(() => null) : null;
  if (!k) {
    return (
      <Opzetten
        {...b}
        eyebrow={b.d.rijEyebrow}
        titel={b.d.rijOpzetTitel}
        uitleg={b.d.rijOpzetUitleg}
        href="/werkgever/rijschool"
        knop={b.d.rijOpzetKnop}
      />
    );
  }
  const sub =
    k.aanmeldingen > 0
      ? aantal(k.aanmeldingen, d.rijAanmEen, d.rijAanmMeer)
      : k.ongelezenBerichten > 0
        ? aantal(k.ongelezenBerichten, d.rijBerEen, d.rijBerMeer)
        : k.lessenVandaag > 0
          ? aantal(k.lessenVandaag, d.rijLesEen, d.rijLesMeer)
          : undefined;
  const t = (tab: string) => `/werkgever/rijschool?tab=${tab}`;
  const tegels: Tegel[] = [
    { href: t("agenda"), titel: d.agenda, uitleg: d.rijAgendaUitleg, teller: k.lessenVandaag > 0 ? fmt(d.vandaagTeller, { n: k.lessenVandaag }) : undefined, toon: "ok" },
    {
      href: t("leerlingen"),
      titel: d.rijLeerlingen,
      uitleg: d.rijLeerlingenUitleg,
      teller: k.aanmeldingen > 0 ? fmt(d.nieuwTeller, { n: k.aanmeldingen }) : undefined,
    },
    {
      href: t("berichten"),
      titel: d.berichten,
      uitleg: d.rijBerichtenUitleg,
      teller: k.ongelezenBerichten > 0 ? fmt(d.nieuwTeller, { n: k.ongelezenBerichten }) : undefined,
    },
    {
      href: t("betalingen"),
      titel: d.rijBetalingen,
      uitleg: d.rijBetalingenUitleg,
      teller: k.openBetalingen > 0 ? fmt(d.openTeller, { n: k.openBetalingen }) : undefined,
    },
    { href: t("team"), titel: d.rijTeam, uitleg: d.rijTeamUitleg },
    { href: t("pakketten"), titel: d.rijPakketten, uitleg: d.rijPakkettenUitleg },
    { href: t("website"), titel: d.rijWebsite, uitleg: d.rijWebsiteUitleg },
    { href: t("app"), titel: d.rijApp, uitleg: d.rijAppUitleg },
    { href: `/rijschool/${k.slug}/instructeur`, titel: d.rijInstructeurApp, uitleg: d.rijInstructeurAppUitleg },
    { href: t("instellingen"), titel: d.instellingen, uitleg: d.rijInstellingenUitleg },
  ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow={d.rijEyebrow}
        title={k.naam}
        subtitle={k.online ? d.online : d.rijOffline}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={k.siteUrl} target="_blank" rel="noopener" className="btn-ghost">
              {d.bekijkWebsite}
            </a>
            <Link href={t("agenda")} className="btn-primary">
              {d.rijNaarAgenda}
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={d.rijKpiLessen} value={String(k.lessenVandaag)} hint={fmt(d.rijKpiLessenHint, { n: k.lessenKomendeWeek })} />
        <KpiCard label={d.rijKpiActief} value={String(k.leerlingenActief)} tone="brand" />
        <KpiCard label={d.rijKpiAanm} value={String(k.aanmeldingen)} tone={k.aanmeldingen > 0 ? "warn" : "default"} hint={d.rijKpiAanmHint} />
        <KpiCard label={d.rijKpiTegoed} value={String(k.tegoedTekort)} tone={k.tegoedTekort > 0 ? "crit" : "default"} hint={d.rijKpiTegoedHint} />
        <KpiCard
          label={d.rijKpiOpen}
          value={money(k.openBetalingenCent)}
          tone={k.openBetalingen > 0 ? "warn" : "default"}
          hint={aantal(k.openBetalingen, d.betalingEen, d.betalingMeer)}
        />
      </div>
      <div className="mt-6">
        <Panel title={d.rijPaneel}>
          <TegelRaster label={d.rijTegelLabel} tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- horeca -------------------------------------------------------------------

async function HorecaVak(b: Basis) {
  const d = b.d;
  const h = b.tenantId ? await horecaCijfers(b.tenantId).catch(() => null) : null;
  if (!h) {
    return (
      <Opzetten
        {...b}
        eyebrow={b.d.horEyebrow}
        titel={b.d.horOpzetTitel}
        uitleg={b.d.horOpzetUitleg}
        href="/werkgever/horeca"
        knop={b.d.opzetKnopHoreca}
      />
    );
  }
  const aan = (m: string) => h.modules.includes(m);
  const sub =
    h.openBestellingen > 0
      ? aantal(h.openBestellingen, d.horBestEen, d.horBestMeer)
      : h.reserveringenVandaag > 0
        ? fmt(d.horVandaag, { res: aantal(h.reserveringenVandaag, d.reserveringEen, d.reserveringMeer), gasten: aantal(h.gastenVandaag, d.gastEen, d.gastMeer) })
        : undefined;
  const t = (tab: string) => `/werkgever/horeca?tab=${tab}`;
  const uit = MODULE_SLEUTELS.filter((m) => m !== "personeel" && !aan(m) && MODULES[m].klaar).map((m) => MODULES[m].naam);
  const tegels: Tegel[] = [
    ...(aan("reserveren")
      ? [{ href: t("reserveringen"), titel: d.horReserveringen, uitleg: d.horReserveringenUitleg, teller: h.reserveringenVandaag > 0 ? fmt(d.vandaagTeller, { n: h.reserveringenVandaag }) : undefined, toon: "ok" as const }]
      : []),
    ...(aan("bestellen")
      ? [
          { href: t("bestellingen"), titel: d.bestellingen, uitleg: d.horBestellingenUitleg, teller: h.openBestellingen > 0 ? fmt(d.openTeller, { n: h.openBestellingen }) : undefined },
          { href: t("tafels"), titel: d.horTafels, uitleg: d.horTafelsUitleg },
        ]
      : []),
    ...(aan("qr") ? [{ href: "/werkgever/horeca/qr", titel: d.horQr, uitleg: d.horQrUitleg }] : []),
    ...(aan("taken") ? [{ href: t("taken"), titel: d.horTaken, uitleg: d.horTakenUitleg }] : []),
    {
      href: t("menukaart"),
      titel: d.horMenukaart,
      uitleg: fmt(d.horMenukaartUitleg, { gerechten: aantal(h.menuItems, d.gerechtEen, d.gerechtMeer) }),
      teller: h.uitverkocht > 0 ? fmt(d.uitverkochtTeller, { n: h.uitverkocht }) : undefined,
    },
    { href: t("modules"), titel: d.horModules, uitleg: uit.length ? fmt(d.horModulesNog, { lijst: uit.join(", ") }) : d.horModulesAlle },
    { href: t("gegevens"), titel: d.horGegevens, uitleg: d.horGegevensUitleg },
  ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow={d.horEyebrow}
        title={h.naam}
        subtitle={h.online ? d.online : d.horOffline}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/horeca/${h.slug}`} target="_blank" rel="noopener" className="btn-ghost">
              {d.bekijkWebsite}
            </a>
            <Link href={aan("reserveren") ? t("reserveringen") : t("menukaart")} className="btn-primary">
              {aan("reserveren") ? d.horNaarRes : d.horMenuBewerken}
            </Link>
          </div>
        }
      />
      {/* dezelfde stappen als het live-tabblad van het horecabeheer (lib/onboarding/aan-de-slag.ts); het startscherm kent alleen wat de cijfers geven, de rest verschijnt in het beheer zelf */}
      <OnboardingProgress
        voortgang={berekenVoortgang(horecaStappen({ menuItems: h.menuItems, modules: h.modules, tafels: h.tafels, online: h.online }))}
        steps={AAN_DE_SLAG_STAPPEN}
        texts={AAN_DE_SLAG_KAART.horeca}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {aan("reserveren") && <KpiCard label={d.horKpiRes} value={String(h.reserveringenVandaag)} hint={aantal(h.gastenVandaag, d.gastEen, d.gastMeer)} />}
        {aan("bestellen") && <KpiCard label={d.horKpiOpen} value={String(h.openBestellingen)} tone={h.openBestellingen > 0 ? "warn" : "default"} />}
        {aan("bestellen") && <KpiCard label={d.horKpiBesteld} value={money(h.omzetVandaagCent)} tone="brand" />}
        <KpiCard label={d.horKpiMenu} value={String(h.menuItems)} hint={h.uitverkocht > 0 ? fmt(d.uitverkochtTeller, { n: h.uitverkocht }) : d.horKpiMenuHint} />
        <KpiCard label={d.horKpiTafels} value={String(h.tafels)} hint={d.horKpiTafelsHint} />
      </div>
      <div className="mt-6">
        <Panel title={d.horPaneel}>
          <TegelRaster label={d.horTegelLabel} tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- website en webshop ---------------------------------------------------------

async function WebsiteVak(b: Basis & { studio: boolean }) {
  const d = b.d;
  const s = b.tenantId ? await websiteCijfers(b.tenantId).catch(() => null) : null;
  if (!s) {
    return (
      <Opzetten
        {...b}
        eyebrow={b.d.webEyebrow}
        titel={b.d.webOpzetTitel}
        uitleg={b.d.webOpzetUitleg}
        href={b.studio ? "/studio" : "/werkgever/website"}
        knop={b.d.webOpzetKnop}
      />
    );
  }
  const sub = s.nieuweBestellingen > 0 ? aantal(s.nieuweBestellingen, d.webBestEen, d.webBestMeer) : undefined;
  const tegels: Tegel[] = b.studio
    ? [
        { href: "/studio", titel: d.webStudio, uitleg: d.webStudioUitleg },
        { href: "/studio/webshop/producten", titel: d.webProducten, uitleg: fmt(d.webProductenUitleg, { producten: aantal(s.producten, d.productEen, d.productMeer) }) },
        { href: "/studio/webshop/bestellingen", titel: d.bestellingen, uitleg: d.webBestellingenUitleg, teller: s.nieuweBestellingen > 0 ? fmt(d.nieuwTeller, { n: s.nieuweBestellingen }) : undefined },
        { href: "/studio/website/bouwer", titel: d.webPaginas, uitleg: fmt(d.webPaginasUitleg, { paginas: aantal(s.paginas, d.paginaEen, d.paginaMeer) }) },
        { href: "/studio/webshop/ontwerp", titel: d.webOntwerp, uitleg: d.webOntwerpUitleg },
        { href: "/studio/webshop/instellingen", titel: d.instellingen, uitleg: d.webInstellingenUitleg },
        { href: "/werkgever/website", titel: d.webDomein, uitleg: d.webDomeinUitleg },
      ]
    : [
        { href: "/werkgever/website", titel: d.webBeheer, uitleg: d.webBeheerUitleg },
      ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow={d.webEyebrow}
        title={s.naam || d.webNaam}
        subtitle={s.online ? d.online : d.webNietGepubliceerd}
        action={
          <div className="flex flex-wrap gap-2">
            {s.online && (
              <a href={`/site/${s.slug}`} target="_blank" rel="noopener" className="btn-ghost">
                {d.bekijkWebsite}
              </a>
            )}
            <Link href={b.studio ? "/studio" : "/werkgever/website"} className="btn-primary">
              {b.studio ? d.webOpenStudio : d.webBeheer}
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={d.webKpiBezoekers} value={String(s.bezoekers7d)} hint={fmt(d.webKpiBezoekersHint, { n: s.weergaven7d })} />
        <KpiCard label={d.webKpiBest} value={String(s.nieuweBestellingen)} tone={s.nieuweBestellingen > 0 ? "warn" : "default"} />
        <KpiCard label={d.webProducten} value={String(s.producten)} tone="brand" />
        <KpiCard label={d.webPaginas} value={String(s.paginas)} />
      </div>
      <div className="mt-6">
        <Panel title={d.webPaneel}>
          <TegelRaster label={d.webTegelLabel} tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- de rest van de werkruimte en personeel ---------------------------------------

function extraTegels(inApp: boolean, d: WS): Tegel[] {
  return [
    { href: "/werkgever/berichten", titel: d.chat, uitleg: d.chatUitleg },
    { href: "/werkgever/mail", titel: d.mail, uitleg: d.mailUitleg },
    { href: "/werkgever/whatsapp", titel: d.whatsapp, uitleg: d.whatsappUitleg },
    { href: "/werkgever/google-reviews", titel: d.reviews, uitleg: d.reviewsUitleg },
    { href: "/werkgever/telefonie", titel: d.telefonie, uitleg: d.telefonieUitleg },
    { href: "/werkgever/netwerk", titel: d.netwerk, uitleg: d.netwerkUitleg },
    { href: "/werkgever/agenda", titel: d.agenda, uitleg: d.agendaUitleg },
    { href: "/werkgever/facturen", titel: d.facturen, uitleg: d.facturenUitleg },
    ...(inApp || !BANK_AAN ? [] : [{ href: "/werkgever/bank", titel: d.bank, uitleg: d.bankUitleg }]),
    { href: "/werkgever/bedrijf", titel: d.bedrijf, uitleg: d.bedrijfUitleg },
  ];
}

async function PersoneelVak({ principal, tenantId, ookPersoneel, d }: { principal: Principal; tenantId: string | undefined; ookPersoneel: boolean; d: WS }) {
  if (!ookPersoneel) {
    return (
      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-hair bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-neutralx-600">
          <h2 className="font-semibold text-ink">{d.handenKop}</h2>
          <p className="mt-1">{d.handenTekst}</p>
        </div>
        <Link href="/werkgever/diensten/nieuw" className="btn-ghost flex-shrink-0 self-start sm:self-auto">
          {d.klusPlaatsen}
        </Link>
      </section>
    );
  }
  const [o, geverifieerd] = await Promise.all([getEmployerOverview(principal), tenantId ? isTenantVerified(tenantId).catch(() => true) : Promise.resolve(true)]);
  return (
    <div className="mt-6">
      <Panel
        title={d.inhurenTitel}
        {...(geverifieerd ? {} : { subtitle: d.inhurenNietGeverifieerd })}
        action={
          <Link href="/werkgever/diensten/nieuw" className="text-xs font-semibold text-brand-600 hover:underline">
            {d.klusPlaatsen}
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <KpiCard label={d.kpiOpen} value={String(o.kpis.openShifts)} tone={o.kpis.openShifts > 0 ? "warn" : "default"} />
          <KpiCard label={d.kpiKeuren} value={String(o.kpis.toApprove)} tone={o.kpis.toApprove > 0 ? "warn" : "default"} />
          <KpiCard label={d.kpiActief} value={String(o.kpis.activeFreelancers)} />
        </div>
        <TegelRaster
          label={d.inhurenTitel}
          tegels={[
            { href: "/werkgever/diensten", titel: d.klussenTitel, uitleg: d.klussenUitleg },
            { href: "/werkgever/kalender", titel: d.kalenderTitel, uitleg: d.kalenderUitleg },
            { href: "/werkgever/uren", titel: d.urenTitel, uitleg: d.urenUitleg, teller: o.kpis.toApprove > 0 ? fmt(d.teKeuren, { n: o.kpis.toApprove }) : undefined },
          ]}
        />
      </Panel>
    </div>
  );
}
