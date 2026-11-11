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

// ---------------------------------------------------------------------------
// Het startscherm van /werkgever voor een rijschool, horecazaak of wie alleen een
// website of webshop heeft (lib/werkgever/werkruimte.ts). Bovenaan het eigen
// vak met kerncijfers en een tegel per onderdeel, daaronder de rest van de
// werkruimte en dan personeel inhuren. Wisselen van dashboard: de wisselaar in de zijbalk.
// Een bedrijf dat personeel inhuurt houdt het gewone dashboard (app/werkgever/page.tsx).
// ---------------------------------------------------------------------------

type GreetLabels = NonNullable<Parameters<typeof WelcomeBack>[0]["labels"]>;

interface Basis {
  principal: Principal;
  tenantId: string | undefined;
  greet: GreetLabels;
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function WerkruimteStart({
  w,
  inApp,
  studio,
  ...basis
}: Basis & { w: WerkruimteContext; inApp: boolean; studio: boolean }) {
  return (
    <>
      {w.soort === "rijschool" ? <RijschoolVak {...basis} /> : w.soort === "horeca" ? <HorecaVak {...basis} /> : <WebsiteVak {...basis} studio={studio} />}
      <KlusConceptNudge />
      <div className="mt-6">
        <Panel title="Ook in je werkruimte" subtitle="Contact met klanten, reviews en je administratie">
          <TegelRaster label="Ook in je werkruimte" tegels={extraTegels(inApp)} />
        </Panel>
      </div>
      <PersoneelVak principal={basis.principal} tenantId={basis.tenantId} ookPersoneel={w.ookPersoneel} />
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
  const k = b.tenantId ? await rijschoolKerncijfers(b.tenantId).catch(() => null) : null;
  if (!k) {
    return (
      <Opzetten
        {...b}
        eyebrow="Rijschool"
        titel="Zet je rijschool aan"
        uitleg="Je krijgt een eigen rijschoolwebsite met proefles-aanvraag, een lesagenda per instructeur, leerlingen met tegoed en leskaart, en een app voor leerlingen en instructeurs."
        href="/werkgever/rijschool"
        knop="Rijschool aanzetten"
      />
    );
  }
  const sub =
    k.aanmeldingen > 0
      ? `${meervoud(k.aanmeldingen, "nieuwe aanmelding wacht", "nieuwe aanmeldingen wachten")} op je.`
      : k.ongelezenBerichten > 0
        ? `${meervoud(k.ongelezenBerichten, "nieuw bericht", "nieuwe berichten")} van leerlingen.`
        : k.lessenVandaag > 0
          ? `Vandaag ${meervoud(k.lessenVandaag, "les", "lessen")} gepland.`
          : undefined;
  const t = (tab: string) => `/werkgever/rijschool?tab=${tab}`;
  const tegels: Tegel[] = [
    { href: t("agenda"), titel: "Agenda", uitleg: "Lessen plannen en verzetten, per instructeur.", teller: k.lessenVandaag > 0 ? `${k.lessenVandaag} vandaag` : undefined, toon: "ok" },
    {
      href: t("leerlingen"),
      titel: "Leerlingen",
      uitleg: "Aanmeldingen, voortgang, leskaart en tegoed.",
      teller: k.aanmeldingen > 0 ? `${k.aanmeldingen} nieuw` : undefined,
    },
    {
      href: t("berichten"),
      titel: "Berichten",
      uitleg: "Vragen en berichten van je leerlingen.",
      teller: k.ongelezenBerichten > 0 ? `${k.ongelezenBerichten} nieuw` : undefined,
    },
    {
      href: t("betalingen"),
      titel: "Betalingen",
      uitleg: "Wat openstaat en wat binnen is.",
      teller: k.openBetalingen > 0 ? `${k.openBetalingen} open` : undefined,
    },
    { href: t("team"), titel: "Instructeurs en auto's", uitleg: "Instructeurs, werktijden en lesauto's." },
    { href: t("pakketten"), titel: "Pakketten en prijzen", uitleg: "Lespakketten en losse lessen." },
    { href: t("website"), titel: "Website", uitleg: "Teksten, veelgestelde vragen en de foto bovenaan." },
    { href: t("app"), titel: "App", uitleg: "Je eigen app in Google Play, stap voor stap." },
    { href: `/rijschool/${k.slug}/instructeur`, titel: "Instructeur-app", uitleg: "De app voor je instructeurs, voor onderweg." },
    { href: t("instellingen"), titel: "Instellingen", uitleg: "Gegevens, lessen en automatische mails." },
  ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow="Rijschool"
        title={k.naam}
        subtitle={k.online ? "Je website is online." : "Je website staat nog niet online."}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={k.siteUrl} target="_blank" rel="noopener" className="btn-ghost">
              Bekijk website
            </a>
            <Link href={t("agenda")} className="btn-primary">
              Naar de agenda
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Lessen vandaag" value={String(k.lessenVandaag)} hint={`${k.lessenKomendeWeek} deze week`} />
        <KpiCard label="Actieve leerlingen" value={String(k.leerlingenActief)} tone="brand" />
        <KpiCard label="Nieuwe aanmeldingen" value={String(k.aanmeldingen)} tone={k.aanmeldingen > 0 ? "warn" : "default"} hint="wachten op een eerste les" />
        <KpiCard label="Tegoed onder nul" value={String(k.tegoedTekort)} tone={k.tegoedTekort > 0 ? "crit" : "default"} hint="leerlingen die moeten bijbetalen" />
        <KpiCard
          label="Openstaand"
          value={money(k.openBetalingenCent)}
          tone={k.openBetalingen > 0 ? "warn" : "default"}
          hint={meervoud(k.openBetalingen, "betaling", "betalingen")}
        />
      </div>
      <div className="mt-6">
        <Panel title="Alles voor je rijschool">
          <TegelRaster label="Onderdelen van je rijschool" tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- horeca -------------------------------------------------------------------

async function HorecaVak(b: Basis) {
  const h = b.tenantId ? await horecaCijfers(b.tenantId).catch(() => null) : null;
  if (!h) {
    return (
      <Opzetten
        {...b}
        eyebrow="Horeca"
        titel="Zet je horecazaak aan"
        uitleg="Je krijgt een eigen website met menukaart en openingstijden. Daarna zet je per module aan wat je nodig hebt: reserveren, bestellingen met keukenscherm, bestellen aan tafel met QR en takenlijsten."
        href="/werkgever/horeca"
        knop="Horeca aanzetten"
      />
    );
  }
  const aan = (m: string) => h.modules.includes(m);
  const sub =
    h.openBestellingen > 0
      ? `${meervoud(h.openBestellingen, "bestelling staat", "bestellingen staan")} open.`
      : h.reserveringenVandaag > 0
        ? `Vandaag ${meervoud(h.reserveringenVandaag, "reservering", "reserveringen")}, ${meervoud(h.gastenVandaag, "gast", "gasten")}.`
        : undefined;
  const t = (tab: string) => `/werkgever/horeca?tab=${tab}`;
  const uit = MODULE_SLEUTELS.filter((m) => m !== "personeel" && !aan(m) && MODULES[m].klaar).map((m) => MODULES[m].naam);
  const tegels: Tegel[] = [
    ...(aan("reserveren")
      ? [{ href: t("reserveringen"), titel: "Reserveringen", uitleg: "Het reserveringsboek per dag.", teller: h.reserveringenVandaag > 0 ? `${h.reserveringenVandaag} vandaag` : undefined, toon: "ok" as const }]
      : []),
    ...(aan("bestellen")
      ? [
          { href: t("bestellingen"), titel: "Bestellingen", uitleg: "Keuken- en barscherm met de status per bestelling.", teller: h.openBestellingen > 0 ? `${h.openBestellingen} open` : undefined },
          { href: t("tafels"), titel: "Tafels en QR", uitleg: "Je tafels en de QR-code per tafel." },
        ]
      : []),
    ...(aan("qr") ? [{ href: "/werkgever/horeca/qr", titel: "QR-codes printen", uitleg: "Een printvel met de QR-code van elke tafel." }] : []),
    ...(aan("taken") ? [{ href: t("taken"), titel: "Takenlijsten", uitleg: "Openings-, sluit- en HACCP-lijsten afvinken." }] : []),
    {
      href: t("menukaart"),
      titel: "Menukaart",
      uitleg: `${meervoud(h.menuItems, "gerecht", "gerechten")} met prijzen en allergenen.`,
      teller: h.uitverkocht > 0 ? `${h.uitverkocht} uitverkocht` : undefined,
    },
    { href: t("modules"), titel: "Modules en abonnement", uitleg: uit.length ? `Nog niet aan: ${uit.join(", ")}.` : "Alle modules staan aan." },
    { href: t("gegevens"), titel: "Gegevens en openingstijden", uitleg: "Adres, contact en wanneer je open bent." },
  ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow="Horeca"
        title={h.naam}
        subtitle={h.online ? "Je website is online." : "Je website staat nog niet online."}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/horeca/${h.slug}`} target="_blank" rel="noopener" className="btn-ghost">
              Bekijk website
            </a>
            <Link href={aan("reserveren") ? t("reserveringen") : t("menukaart")} className="btn-primary">
              {aan("reserveren") ? "Naar het reserveringsboek" : "Menukaart bewerken"}
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
        {aan("reserveren") && <KpiCard label="Reserveringen vandaag" value={String(h.reserveringenVandaag)} hint={meervoud(h.gastenVandaag, "gast", "gasten")} />}
        {aan("bestellen") && <KpiCard label="Open bestellingen" value={String(h.openBestellingen)} tone={h.openBestellingen > 0 ? "warn" : "default"} />}
        {aan("bestellen") && <KpiCard label="Besteld vandaag" value={money(h.omzetVandaagCent)} tone="brand" />}
        <KpiCard label="Menukaart" value={String(h.menuItems)} hint={h.uitverkocht > 0 ? `${h.uitverkocht} uitverkocht` : "gerechten en dranken"} />
        <KpiCard label="Tafels" value={String(h.tafels)} hint="actief" />
      </div>
      <div className="mt-6">
        <Panel title="Alles voor je zaak">
          <TegelRaster label="Onderdelen van je zaak" tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- website en webshop ---------------------------------------------------------

async function WebsiteVak(b: Basis & { studio: boolean }) {
  const s = b.tenantId ? await websiteCijfers(b.tenantId).catch(() => null) : null;
  if (!s) {
    return (
      <Opzetten
        {...b}
        eyebrow="Website en webshop"
        titel="Maak je website"
        uitleg="Kies een ontwerp, vul je teksten en foto's in en zet producten in je eigen webshop. Klanten bestellen direct via je website; jij krijgt bij elke bestelling een mail."
        href={b.studio ? "/studio" : "/werkgever/website"}
        knop="Begin met je website"
      />
    );
  }
  const sub = s.nieuweBestellingen > 0 ? `${meervoud(s.nieuweBestellingen, "nieuwe bestelling wacht", "nieuwe bestellingen wachten")} op je.` : undefined;
  const tegels: Tegel[] = b.studio
    ? [
        { href: "/studio", titel: "Studio-overzicht", uitleg: "Bezoekers, bestellingen en wat er nog te doen is." },
        { href: "/studio/webshop/producten", titel: "Producten", uitleg: `${meervoud(s.producten, "product", "producten")} in je webshop.` },
        { href: "/studio/webshop/bestellingen", titel: "Bestellingen", uitleg: "Alles wat klanten in je webshop bestellen.", teller: s.nieuweBestellingen > 0 ? `${s.nieuweBestellingen} nieuw` : undefined },
        { href: "/studio/website/bouwer", titel: "Pagina's", uitleg: `${meervoud(s.paginas, "pagina", "pagina's")} met teksten en blokken.` },
        { href: "/studio/webshop/ontwerp", titel: "Ontwerp", uitleg: "Stijl, kleuren, letters en je logo." },
        { href: "/studio/webshop/instellingen", titel: "Instellingen", uitleg: "Webadres, bestellen en bezorgen, bedrijfsgegevens." },
        { href: "/werkgever/website", titel: "Eigen domein en beheer", uitleg: "Je eigen webadres koppelen en je website laten beheren." },
      ]
    : [
        { href: "/werkgever/website", titel: "Website-beheer", uitleg: "Je eigen webadres en het beheer van je website. Bewerken kan de beheerder van je bedrijf." },
      ];
  return (
    <>
      <WelcomeBack name={b.principal.fullName} labels={b.greet} {...(sub ? { subtitle: sub } : {})} />
      <PageHeader
        eyebrow="Website en webshop"
        title={s.naam || "Je website"}
        subtitle={s.online ? "Je website is online." : "Je website is nog niet gepubliceerd."}
        action={
          <div className="flex flex-wrap gap-2">
            {s.online && (
              <a href={`/site/${s.slug}`} target="_blank" rel="noopener" className="btn-ghost">
                Bekijk website
              </a>
            )}
            <Link href={b.studio ? "/studio" : "/werkgever/website"} className="btn-primary">
              {b.studio ? "Open de studio" : "Website-beheer"}
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Bezoekers" value={String(s.bezoekers7d)} hint={`laatste 7 dagen · ${s.weergaven7d} weergaven`} />
        <KpiCard label="Nieuwe bestellingen" value={String(s.nieuweBestellingen)} tone={s.nieuweBestellingen > 0 ? "warn" : "default"} />
        <KpiCard label="Producten" value={String(s.producten)} tone="brand" />
        <KpiCard label="Pagina's" value={String(s.paginas)} />
      </div>
      <div className="mt-6">
        <Panel title="Alles voor je website">
          <TegelRaster label="Onderdelen van je website" tegels={tegels} />
        </Panel>
      </div>
    </>
  );
}

// --- de rest van de werkruimte en personeel ---------------------------------------

function extraTegels(inApp: boolean): Tegel[] {
  return [
    { href: "/werkgever/berichten", titel: "Chat", uitleg: "Gesprekken, bellen en videobellen." },
    { href: "/werkgever/mail", titel: "Mail", uitleg: "Je zakelijke mail op één plek." },
    { href: "/werkgever/whatsapp", titel: "WhatsApp", uitleg: "Klantgesprekken via WhatsApp." },
    { href: "/werkgever/google-reviews", titel: "Google-reviews", uitleg: "Vraag klanten om een review en scan hoe je ervoor staat." },
    { href: "/werkgever/telefonie", titel: "Telefonie", uitleg: "Een zakelijk nummer en bellen vanuit ZekerFlex." },
    { href: "/werkgever/netwerk", titel: "Wifi en VPN", uitleg: "Wifi die het rooster volgt, een veilige verbinding op afstand en een eigen 5G-netwerk." },
    { href: "/werkgever/agenda", titel: "Agenda", uitleg: "Afspraken uit je mail, chat en WhatsApp, vanzelf bij elkaar." },
    { href: "/werkgever/facturen", titel: "Facturen", uitleg: "Facturen van ZekerFlex." },
    ...(inApp || !BANK_AAN ? [] : [{ href: "/werkgever/bank", titel: "ZekerFlex Bank", uitleg: "Zakelijke rekening en betalingen." }]),
    { href: "/werkgever/bedrijf", titel: "Bedrijfsprofiel", uitleg: "Je bedrijfsgegevens en KVK." },
  ];
}

async function PersoneelVak({ principal, tenantId, ookPersoneel }: { principal: Principal; tenantId: string | undefined; ookPersoneel: boolean }) {
  if (!ookPersoneel) {
    return (
      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-hair bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-neutralx-600">
          <h2 className="font-semibold text-ink">Extra handen nodig?</h2>
          <p className="mt-1">Plaats een klus en huur flexkrachten in voor drukke dagen. Je betaalt alleen voor gewerkte uren.</p>
        </div>
        <Link href="/werkgever/diensten/nieuw" className="btn-ghost flex-shrink-0 self-start sm:self-auto">
          Klus plaatsen
        </Link>
      </section>
    );
  }
  const [o, geverifieerd] = await Promise.all([getEmployerOverview(principal), tenantId ? isTenantVerified(tenantId).catch(() => true) : Promise.resolve(true)]);
  return (
    <div className="mt-6">
      <Panel
        title="Personeel inhuren"
        {...(geverifieerd ? {} : { subtitle: "Je bedrijf is nog niet geverifieerd: je kunt één testklus plaatsen." })}
        action={
          <Link href="/werkgever/diensten/nieuw" className="text-xs font-semibold text-brand-600 hover:underline">
            Klus plaatsen
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <KpiCard label="Open diensten" value={String(o.kpis.openShifts)} tone={o.kpis.openShifts > 0 ? "warn" : "default"} />
          <KpiCard label="Uren te keuren" value={String(o.kpis.toApprove)} tone={o.kpis.toApprove > 0 ? "warn" : "default"} />
          <KpiCard label="Actieve flexkrachten" value={String(o.kpis.activeFreelancers)} />
        </div>
        <TegelRaster
          label="Personeel inhuren"
          tegels={[
            { href: "/werkgever/diensten", titel: "Klussen", uitleg: "Je diensten en wie er reageerde." },
            { href: "/werkgever/kalender", titel: "Kalender", uitleg: "Wie wanneer werkt." },
            { href: "/werkgever/uren", titel: "Uren goedkeuren", uitleg: "Gewerkte uren controleren.", teller: o.kpis.toApprove > 0 ? `${o.kpis.toApprove} te keuren` : undefined },
          ]}
        />
      </Panel>
    </div>
  );
}
