import { randomUUID } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { llmHealth } from "@/lib/ai/client";
import { getStripeClient } from "@/lib/billing/stripe";
import { getProducts } from "@/lib/bank/insurance";
import { platformAdminIds } from "@/lib/messaging/contacts";
import { hasTwoFactor } from "@/lib/auth/two-factor";
import { prisma } from "@/lib/prisma";
import { getReminderSettings } from "@/lib/billing/reminders";
import { readBackupReport, type BackupReport } from "@/lib/ops/backup";
import { listModels3D } from "@/lib/shop/model3d";
import { playIngesteld } from "@/lib/play/account";
import { bouwerInstellingen } from "@/lib/bouwer/werker";

// ---------------------------------------------------------------------------
// "Te doen voor jou" — the things only the owner can do (accounts, payment
// details, legal sign-off). Where the platform can see it, an item checks
// itself (env set, model reachable, Stripe webhook configured, last night's
// backup restored); the rest is ticked off by hand. Plus free-form notes/todos
// of the owner's own.
//   key "owner-todos:done"   → { [id]: { at, by } }
//   key "owner-todos:custom" → CustomTodo[]
// Since 30 Oct 2026 the site runs on its own server (VPS), not on Vercel:
// settings go to Claude, who puts them in .env.production on that server.
// ---------------------------------------------------------------------------

export interface OwnerTodo {
  id: string;
  group: "AI" | "Geld & bank" | "Juridisch" | "Vindbaarheid & app" | "Bellen & koppelingen" | "Beheer & veiligheid" | "Overig";
  title: string;
  why: string;
  how: string[];
  /** checked automatically from the live configuration */
  auto: boolean;
  done: boolean;
  doneNote?: string;
}

export interface CustomTodo {
  id: string;
  text: string;
  done: boolean;
  at: string;
}

const ISSUING_EVENTS = ["issuing_authorization.request", "issuing_authorization.updated", "issuing_transaction.created", "issuing_card.updated"];

/** Cities that say nothing about where the work is ("centrum"). */
const VAGUE_CITIES = ["centrum", "center", "stad", "onbekend", "nvt", "n.v.t.", "-"];

/** Does at least one platform admin receive push notifications (for outage alerts)? */
async function adminHasPush(): Promise<boolean> {
  try {
    const ids = await platformAdminIds();
    return (await prisma.webPushSubscription.count({ where: { userId: { in: ids }, disabledAt: null } })) > 0;
  } catch {
    return false;
  }
}

/** How many active platform admins have two-step verification on. */
async function adminTwoFactor(): Promise<{ on: number; total: number }> {
  try {
    const ids = await platformAdminIds();
    const on = (await Promise.all(ids.map((id) => hasTwoFactor(id)))).filter(Boolean).length;
    return { on, total: ids.length };
  } catch {
    return { on: 0, total: 0 };
  }
}

async function stripeIssuingActive(): Promise<boolean | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  try {
    const acct = await getStripeClient().accounts.retrieveCurrent();
    return (acct.capabilities as Record<string, string> | undefined)?.card_issuing === "active";
  } catch {
    return null;
  }
}

/** Every event the enabled Stripe webhook endpoints receive ("*" = all), or null when Stripe can't be asked. */
async function stripeWebhookEvents(): Promise<Set<string> | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  try {
    const list = await getStripeClient().webhookEndpoints.list({ limit: 100 });
    return new Set(list.data.filter((w) => w.status === "enabled").flatMap((w) => w.enabled_events as string[]));
  } catch {
    return null;
  }
}

const receives = (events: Set<string>, type: string) => events.has("*") || events.has(type);

/** Search Console's "Domein" method: a google-site-verification TXT record on the main domain. */
async function googleDnsVerified(base: string): Promise<boolean> {
  let host = "";
  try {
    host = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  if (!host.includes(".")) return false;
  try {
    const records = await new Resolver({ timeout: 2500, tries: 1 }).resolveTxt(host);
    return records.some((r) => r.join("").startsWith("google-site-verification="));
  } catch {
    return false;
  }
}

/** Throwaway accounts from the October login diagnosis (zf-…@example.com); null = couldn't count. */
async function testAccountCount(): Promise<number | null> {
  try {
    return await prisma.user.count({ where: { email: { startsWith: "zf-", endsWith: "@example.com" } } });
  } catch {
    return null;
  }
}

/** Branches whose city says nothing, as "company (branch)" so the owner knows whom to ask; null = couldn't look. */
async function vagueBranchCities(): Promise<string[] | null> {
  try {
    const rows = await prisma.branch.findMany({
      where: { OR: [{ city: "" }, ...VAGUE_CITIES.map((c) => ({ city: { equals: c, mode: "insensitive" as const } }))] },
      select: { name: true, tenant: { select: { name: true } } },
      take: 20,
    });
    return rows.map((b) => `${b.tenant.name} (${b.name})`);
  } catch {
    return null;
  }
}

function backupNote(report: BackupReport | null): string {
  if (!report?.available) return "geen back-upmap gevonden op deze server";
  if (report.state === "ok" && report.status) {
    const when = new Date(report.status.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return `laatste back-up ${when}, proef-terugzetting gelukt`;
  }
  return report.reasons[0] ?? "de laatste back-up is niet in orde";
}

const hasVideos = () => {
  try {
    return existsSync(path.join(process.cwd(), "public", "videos", "wat-is-zekerflex.mp4"));
  } catch {
    return false;
  }
};

export async function ownerTodos(): Promise<OwnerTodo[]> {
  const manual = (await kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")) ?? {};
  const base = env.APP_BASE_URL ?? "";
  const [webhookEvents, products, issuing, llm, admin2fa, adminPush, reminders, backup, models3d, googleDns, testAccounts, vagueBranches, playKoppeling, bouwer] = await Promise.all([
    stripeWebhookEvents(),
    getProducts().catch(() => []),
    stripeIssuingActive(),
    llmHealth(),
    adminTwoFactor(),
    adminHasPush(),
    getReminderSettings().catch(() => ({ enabled: false })),
    readBackupReport().catch(() => null),
    listModels3D().catch(() => new Map()),
    googleDnsVerified(base),
    testAccountCount(),
    vagueBranchCities(),
    playIngesteld().catch(() => false),
    bouwerInstellingen().catch(() => null),
  ]);
  const m = (id: string) => ({ done: Boolean(manual[id]), ...(manual[id] ? { doneNote: `afgevinkt door ${manual[id]!.by} op ${new Date(manual[id]!.at).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}` } : {}) });

  return [
    {
      id: "llm",
      group: "AI",
      title: "Eigen AI-server (taalmodel) aanzetten",
      why: "Zet Jarvis, de denkende AI-teams, herschrijven/vertalen in de chat, het volle specialistenadvies en nieuwe advertentievarianten aan.",
      how: ["Huur een server met GPU — hoe meer videogeheugen, hoe slimmer de AI (24 GB of meer aangeraden, 48 GB voor de beste kwaliteit) — en maak een subdomein ai.zekerflex.com met een A-record naar de server.", "Kopieer deploy/ai-node/setup.sh naar de server en draai: sudo bash setup.sh ai.zekerflex.com", "Geef de waarden die het script laat zien aan Claude; die zet ze op de server en herstart de app."],
      auto: true,
      done: llm.ok,
      doneNote: llm.ok ? `AI-server antwoordt (model ${llm.model})` : `nog niet: ${llm.detail ?? "niet bereikbaar"}`,
    },
    {
      id: "image",
      group: "AI",
      title: "Beeldserver voor de Studio koppelen (optioneel)",
      why: "Nodig om in admin → Studio beelden te laten maken.",
      how: ["Draai ComfyUI of AUTOMATIC1111 op dezelfde GPU-server (zie deploy/ai-node/README.md).", "Geef Claude het adres en de sleutel van die beeldserver; die zet IMAGE_ENABLED, IMAGE_BACKEND, IMAGE_BASE_URL en IMAGE_API_KEY op de server."],
      auto: true,
      done: env.IMAGE_ENABLED,
    },
    {
      id: "bouwer-github",
      group: "AI",
      title: "GitHub-sleutel voor de Bouwer invullen",
      why: "De Bouwer (ZekerFlex AI → Bouwer) maakt wijzigingen en laat ze je eerst zien. Zonder deze sleutel kan hij een goedgekeurde wijziging niet opslaan en dus niet live zetten.",
      how: [
        "Open Admin → ZekerFlex AI → Bouwer → instellingen en klik Sleutel aanmaken bij GitHub (log in bij GitHub als dat gevraagd wordt). Het formulier staat al ingevuld.",
        "Kies bij Repository access → Only select repositories → zekerflex-finale, klik Generate token en kopieer de sleutel (begint met github_pat_).",
        "Plak hem terug in de Bouwer-instellingen bij GitHub-sleutel en klik Bewaar. Hij wordt versleuteld bewaard.",
      ],
      auto: true,
      done: Boolean(bouwer?.githubSleutel),
      ...(bouwer?.githubSleutel ? { doneNote: "sleutel staat erin (versleuteld)" } : {}),
    },
    {
      id: "bouwer-auto",
      group: "AI",
      title: "Automatische reparaties van de Bouwer aanzetten (optioneel)",
      why: "Komt een fout uit het foutenlogboek steeds terug, dan begint de Bouwer er zelf aan en krijg je een melding als er een reparatie klaarstaat. Goedkeuren doe je altijd zelf; hooguit 3 per dag.",
      how: ["Zet in Admin → ZekerFlex AI → Bouwer → instellingen het vinkje bij \"Automatisch reparaties voorstellen\" aan. Werkt pas echt als de GitHub-sleutel er ook in staat."],
      auto: true,
      done: Boolean(bouwer?.autoFouten),
      ...(bouwer?.autoFouten ? { doneNote: "staat aan" } : {}),
    },
    {
      id: "sepa",
      group: "Geld & bank",
      title: "Zakelijke rekening van ZekerFlex invullen (SEPA)",
      why: "Zonder deze gegevens kunnen freelancers niet op hun eigen IBAN worden uitbetaald en kunnen opnames van ZekerFlex Bank niet worden verwerkt.",
      how: ["Geef Claude jullie zakelijke IBAN en de tenaamstelling (bijv. ZekerFlex B.V.); die worden SEPA_CREDITOR_IBAN en SEPA_CREDITOR_NAME op de server.", "Daarna komt elke ochtend automatisch een SEPA-bestand klaar (je krijgt een mail)."],
      auto: true,
      done: Boolean(env.SEPA_CREDITOR_IBAN && env.SEPA_CREDITOR_NAME),
    },
    {
      id: "issuing-active",
      group: "Geld & bank",
      title: "Betaalpassen: een andere uitgever zoeken (Stripe zei nee)",
      why: "Stripe heeft Issuing (betaalpassen) op 30 oktober afgewezen voor ZekerFlex. De passen blijven uit tot een Europese partij ze wél uitgeeft; de rest van de site werkt gewoon.",
      how: [
        "Vraag offertes bij Europese kaartuitgevers met een e-geldvergunning (bijvoorbeeld Swan of Treezor) en kies er één.",
        "Geef Claude de documentatie van die partij; de regels voor limieten en blokkades die al gebouwd zijn, worden hergebruikt.",
        `Komt Stripe er toch op terug, dan vinkt deze taak zichzelf af. Daarna nog nodig: op de Stripe-webhook ${ISSUING_EVENTS.join(", ")}, de publishable key (pk_live_…) op de server en Apple/Google Pay onder Issuing → Settings.`,
      ],
      auto: issuing !== null,
      done: issuing === true,
      ...(issuing === null ? m("issuing-active") : {}),
    },
    {
      id: "stripe-expired",
      group: "Geld & bank",
      title: "Stripe-melding 'checkout.session.expired' aanzetten",
      why: "Sluit iemand in de webshop het betaalscherm zonder te betalen, dan meldt Stripe dat na 24 uur. Zonder die melding blijft zo'n bestelling in Admin → Shop op 'wacht op betaling' staan. Voorraad gaat pas af bij betaling, dus er gaat niets mis: het is opruimen.",
      how: ["dashboard.stripe.com → Developers → Webhooks → het endpoint dat eindigt op /api/webhooks/stripe.", "Kies 'Gebeurtenissen bewerken', voeg checkout.session.expired toe en sla op."],
      auto: webhookEvents !== null,
      done: webhookEvents !== null && receives(webhookEvents, "checkout.session.expired"),
      ...(webhookEvents === null ? m("stripe-expired") : {}),
    },
    {
      id: "stripe-connect-profiel",
      group: "Geld & bank",
      title: "Stripe Connect aanzetten (platformprofiel invullen)",
      why: "Rijscholen laten leerlingen met iDEAL betalen naar hun eigen bankrekening, en freelancers krijgen hun geld via een eigen Stripe-account. Daarvoor maakt ZekerFlex voor hen een Stripe-account aan (Connect). Stripe weigert dat nu: 'You must complete your platform profile to use Connect'. Op 3 november getest met een tijdelijke testrijschool.",
      how: [
        "Ga naar dashboard.stripe.com/connect/accounts/overview en vul de vragenlijst van het platformprofiel in.",
        "Antwoorden die passen: ZekerFlex is een platform/marktplaats; accounts zijn Express; jullie verbonden accounts zijn rijscholen en zzp'ers in Nederland; geld loopt via 'destination charges' (de klant betaalt op ZekerFlex, het geld gaat naar het account van de rijschool); ZekerFlex houdt alleen de transactiekosten in.",
        "Vink deze taak daarna af en zeg het tegen Claude; die test het koppelen opnieuw met een tijdelijke testrijschool (er beweegt geen geld).",
      ],
      auto: false,
      ...m("stripe-connect-profiel"),
    },
    {
      id: "stripe-btw",
      group: "Geld & bank",
      title: "Btw op abonnementen: kies exclusief of inclusief",
      why: "Op de site staan de abonnementen Pro/Business en Website-beheer als exclusief btw, maar het betaalscherm van Stripe rekent het kale bedrag zonder btw: € 49 in plaats van € 59,29. Bij de API-abonnementen staat niets over btw, en ook daar komt geen btw bij. Dan draag je de btw zelf af uit dat bedrag, en is de Stripe-bon geen geldige btw-factuur voor een zakelijke klant. Er betaalt nog niemand een abonnement via Stripe, dus er is niets misgegaan.",
      how: [
        "Aangeraden: prijzen blijven exclusief btw, net als de platformfee. Zet dan Stripe Tax aan: dashboard.stripe.com → Instellingen → Belastingen, Nederland als registratie en je btw-nummer invullen.",
        "Zeg daarna tegen Claude dat Stripe Tax aanstaat; die zet de btw-berekening aan op de betaalschermen en test dat in de testomgeving van Stripe.",
        "Wil je liever prijzen inclusief btw, zeg dat tegen Claude; die past de teksten op de site aan.",
        "Daarna kan ook de eenmalige websiteprijs uit een geaccepteerd websitevoorstel via hetzelfde betaalscherm worden afgerekend. Nu factureert het team die met de hand.",
      ],
      auto: false,
      ...m("stripe-btw"),
    },
    {
      id: "loonweek-grens",
      group: "Geld & bank",
      title: "Loonweek: laten beginnen om 00:00 Nederlandse tijd? (keuze nodig)",
      why: "De loonweek begint nu op maandag 00:00 UTC: dat is 01:00 of 02:00 in Nederland. Een dienst op maandag tussen middernacht en dat uur valt daardoor in de loonrun van de week ervoor. Rechtzetten kan een dienst in de overgangsweek in twee loonruns laten belanden, en dan wordt hij dubbel betaald. Daarom is het niet zomaar aangepast (gevonden op 3 nov).",
      how: [
        "Aangeraden: de grens naar 00:00 Nederlandse tijd verleggen, met een vangnet. Urenbriefjes die al in een definitieve loonrun zitten, worden overgeslagen.",
        "Of zo laten: het gaat alleen om diensten op maandag tussen 00:00 en 01:00/02:00.",
        "Zeg je keuze tegen Claude; die bouwt het met tests op de overgangsweek.",
      ],
      auto: false,
      ...m("loonweek-grens"),
    },
    {
      id: "no-show-sweep",
      group: "Geld & bank",
      title: "Automatisch 'niet opgekomen': aan of uit laten? (staat nu uit)",
      why: "Er bestaat een automatische controle die iedereen zonder check-in na 60 minuten als 'niet opgekomen' markeert. Die wist het concept-urenbriefje, verlaagt de betrouwbaarheid en biedt de opdrachtgever een claim aan. Hij staat nergens in de planning en draait dus niet. Een werker die wél werkte maar vergat in te checken, zou zo zijn uren kwijtraken.",
      how: [
        "Aangeraden: uit laten, of pas aanzetten met een veiligere regel. Dan blijft het urenbriefje bewaard en bevestigt de werker eerst.",
        "Zeg je keuze tegen Claude; die zet hem dan in de planning met die regel.",
      ],
      auto: false,
      ...m("no-show-sweep"),
    },
    {
      id: "avg-bewaartermijn",
      group: "Juridisch",
      title: "AVG: de dagelijkse opschoning van oude gegevens aanzetten? (staat nu uit)",
      why: "De opschoning die gegevens na hun bewaartermijn weghaalt of inkort, staat nergens in de planning. De bewaarregels uit de privacyverklaring worden dus niet afgedwongen. Een proef op 3 nov telde alleen en veranderde niets. Volgens die proef zou de eerste echte run 2 KYC-dossiers inkorten: de ruwe gegevens en scores gaan weg, de uitslag van de controle blijft. Dat is niet terug te draaien, daarom staat hij niet vanzelf aan.",
      how: [
        "Aangeraden: dagelijks laten draaien, zoals de andere geplande taken.",
        "Zeg het tegen Claude; die zet hem in de planning en controleert de eerste run.",
      ],
      auto: false,
      ...m("avg-bewaartermijn"),
    },
    {
      id: "terms-review",
      group: "Juridisch",
      title: "Voorwaarden snelle uitbetaling laten nakijken",
      why: "De tekst op /voorwaarden/snelle-uitbetaling is een concept; het is een cessie (overdracht van vordering).",
      how: ["Laat een jurist /voorwaarden/snelle-uitbetaling lezen.", "Bij inhoudelijke wijzigingen: versie verhogen in lib/payouts/fastpay.ts (FACTORING_TERMS_VERSION) zodat iedereen opnieuw akkoord geeft."],
      auto: false,
      ...m("terms-review"),
    },
    {
      id: "insurer",
      group: "Juridisch",
      title: "Verzekeraar koppelen voor 'Verzekeren' in de bank",
      why: "Verzekeringen staan uit tot er een echte verzekeraar is ingevuld; bemiddelen vraagt een AFM-vergunning of een samenwerking met een verzekeraar.",
      how: ["Maak afspraken met een verzekeraar of volmachtkantoor.", "Admin → Bank → Verzekeringen: vul de verzekeraar in en zet producten aan."],
      auto: true,
      done: products.some((p) => p.active && p.insurer.trim()),
    },
    {
      id: "bank-name",
      group: "Juridisch",
      title: "Naam 'ZekerFlex Bank' juridisch laten toetsen",
      why: "Het woord 'bank' is in Nederland beschermd (Wft). Je hebt dit risico bewust geaccepteerd; laat het toetsen voordat je er groot mee adverteert.",
      how: ["Laat een jurist of compliance-adviseur kijken naar naam en opzet (gelden op Stripe, geen eigen bankvergunning)."],
      auto: false,
      ...m("bank-name"),
    },
    {
      id: "domain",
      group: "Vindbaarheid & app",
      title: "Hoofddomein vastleggen (APP_BASE_URL)",
      why: "Bepaalt alle links in mails, de sitemap en Google. Kies één domein en laat de andere doorverwijzen.",
      how: ["Kies het hoofddomein (bv. https://zekerflex.com). Pagina's op www sturen nu al door naar het adres zonder www.", "Wil je een ander hoofddomein, vraag het aan Claude: die zet APP_BASE_URL op de server en past de doorverwijzing aan."],
      auto: true,
      done: /^https:\/\//.test(base) && !/localhost/.test(base),
    },
    {
      id: "search-console",
      group: "Vindbaarheid & app",
      title: "Google Search Console en Bing koppelen",
      why: "Zodat Google en Bing de site goed indexeren en je ziet waarop je gevonden wordt.",
      how: [
        "search.google.com/search-console → Eigendom toevoegen → kies 'Domein' en vul zekerflex.com in.",
        "Google geeft een TXT-record (google-site-verification=…). Zet dat bij TransIP in de DNS van zekerflex.com (naam @) en klik in Google op Verifiëren.",
        "Dien daarna https://zekerflex.com/sitemap.xml in onder Sitemaps. Bing: bing.com/webmasters → 'Importeren uit Google Search Console'.",
      ],
      auto: true,
      done: Boolean(process.env.GOOGLE_SITE_VERIFICATION) || googleDns,
      ...(googleDns ? { doneNote: "De Google-verificatie staat in de DNS van zekerflex.com. Of de sitemap is ingediend, kan deze lijst niet zien." } : {}),
    },
    {
      id: "socials",
      group: "Vindbaarheid & app",
      title: "Social-media-accounts controleren (en LinkedIn toevoegen)",
      why: "De links naar Instagram, TikTok en YouTube staan in de footer en in de Google-gegevens; een LinkedIn-bedrijfspagina helpt sterk voor zakelijke klanten.",
      how: ["Controleer dat instagram.com/zekerflex, tiktok.com/@zekerflex en youtube.com/@Zekerflex echt van jullie zijn.", "Maak een LinkedIn-bedrijfspagina en geef de link door, dan zet ik hem erbij."],
      auto: false,
      ...m("socials"),
    },
    {
      id: "videos",
      group: "Vindbaarheid & app",
      title: "Uitlegvideo's plaatsen",
      why: "De pagina /uitleg toont nu alleen foto's met 'video komt binnenkort'.",
      how: ["Maak of lever 5 korte video's: wat is ZekerFlex, klus plaatsen, uitzenden of freelance, uren goedkeuren, kosten en facturen.", "Geef ze aan mij door; ik zet ze online (bij voorkeur via een videodienst of de eigen server, niet in git)."],
      auto: true,
      done: hasVideos(),
    },
    {
      id: "product-photos",
      group: "Vindbaarheid & app",
      title: "Echte productfoto's voor de webshop",
      why: "De shopproducten gebruiken nu algemene sfeerfoto's — bij de 'Everyday Hoodie' staat bijvoorbeeld iemand in een bodywarmer. Echte foto's verkopen beter en voorkomen retouren.",
      how: ["Maak per product een foto op een lichte achtergrond plus (optioneel) één foto aan iemand.", "Upload ze in Admin → Shop → product bewerken (hoofdfoto en modelfoto), of geef ze aan Claude om ze te plaatsen."],
      auto: false,
      ...m("product-photos"),
    },
    {
      id: "3d-models",
      group: "Vindbaarheid & app",
      title: "3D-modellen van je webshopproducten maken",
      why: "Een product kan in de shop nu draaien en zoomen in 3D, en op de telefoon in je eigen kamer staan (AR). Er zijn alleen nog geen echte modellen; verzonnen modellen zetten we er bewust niet bij.",
      how: [
        "Installeer een 3D-scan-app zoals Polycam of KIRI Engine en maak rondom het product zo'n 30 foto's.",
        "Exporteer als .glb zonder compressie (geen Draco), kleiner dan 25 MB.",
        "Admin → Shop → product bewerken → 3D-model: upload het bestand en controleer het met 'Bekijk in 3D'.",
      ],
      auto: true,
      done: models3d.size > 0,
      ...(models3d.size > 0 ? { doneNote: `${models3d.size} ${models3d.size === 1 ? "product heeft" : "producten hebben"} een 3D-model` } : {}),
    },
    {
      id: "map-3d",
      group: "Vindbaarheid & app",
      title: "Kiezen waar de 3D-kaart van open diensten komt",
      why: "De 3D-kaart (vraag en aanbod per regio) staat klaar op zekerflex.com/open-diensten/3d, maar is nog verborgen voor Google en nergens gelinkt. Zonder jouw akkoord komt hij niet op de homepage.",
      how: ["Bekijk zekerflex.com/open-diensten/3d op je telefoon en op een computer.", "Zeg Claude waar hij mag komen: op de homepage, op de pagina Open diensten, of nog nergens."],
      auto: false,
      ...m("map-3d"),
    },
    {
      id: "homepage-meta",
      group: "Vindbaarheid & app",
      title: "Akkoord geven op een kortere homepage-titel voor Google",
      why: "Google toont ongeveer 60 tekens titel en 155 tekens omschrijving. Die van de homepage zijn langer, dus Google knipt ze midden in een zin af. Claude verandert marketingteksten niet zonder jouw akkoord.",
      how: ["Zeg Claude: 'maak een voorstel voor de homepage-titel'. Je krijgt eerst het voorstel te zien.", "Pas na jouw ja wordt het aangepast; vink het daarna af."],
      auto: false,
      ...m("homepage-meta"),
    },
    {
      id: "branch-cities",
      group: "Vindbaarheid & app",
      title: "Vestigingen met een onduidelijke plaatsnaam (zoals 'centrum')",
      why: "De plaatsnaam van een vestiging staat bij elke dienst en in de titel die Google toont, bijvoorbeeld 'Barmedewerker in centrum'. Dan weet een werkzoekende niet in welke stad het werk is.",
      how: ["Vraag de opdrachtgever om in zijn account bij Locaties de echte plaatsnaam in te vullen (bijv. Groningen). Gegevens van klanten passen we niet zonder hen aan.", "Deze taak vinkt zichzelf af zodra elke vestiging een echte plaatsnaam heeft."],
      auto: true,
      done: vagueBranches !== null && vagueBranches.length === 0,
      ...(vagueBranches && vagueBranches.length > 0 ? { doneNote: `Bij: ${vagueBranches.join(", ")}` } : {}),
    },
    {
      id: "play-store-app",
      group: "Vindbaarheid & app",
      title: "Android-app in de Play Store zetten",
      why: "Een echte app in de Play Store geeft betrouwbare pushmeldingen en een icoon op het beginscherm. Het ondertekende app-bestand staat al klaar.",
      how: [
        "Het bestand staat op je bureaublad: ZekerFlex-app-1.0.3.aab (ondertekend, opent zekerflex.com).",
        "Ga naar play.google.com/console (je ontwikkelaarsaccount is al betaald) → App maken → 'ZekerFlex', pakketnaam com.zekerflex → Interne test of Productie → upload dat .aab-bestand, met screenshots en een korte beschrijving.",
        "Play Console → Instellingen → App-integriteit: kopieer de SHA-256 van de 'App-ondertekeningssleutel' en geef hem aan Claude; die moet in /.well-known/assetlinks.json zodat de app zonder adresbalk opent.",
        "Zet KEYSTORE-CREDENTIALS.txt en android-release.keystore (map android-twa) ook in je wachtwoordmanager: zonder die sleutel kun je de app nooit meer bijwerken.",
      ],
      auto: false,
      ...m("play-store-app"),
    },
    {
      id: "play-rijschool-apps",
      group: "Vindbaarheid & app",
      title: "Google Play koppelen voor de apps van rijscholen",
      why: "Rijscholen zetten hun eigen app in hun eigen Google Play-account. ZekerFlex beheert die apps daarna (testen, indienen, winkelpagina) met één serviceaccount van Google. Zonder dat account kunnen rijscholen hun app wel laten bouwen, maar niet via het dashboard indienen.",
      how: [
        "Ga naar Admin → Google Play en volg de 5 stappen: Google Play Android Developer API aanzetten, serviceaccount maken, JSON-sleutel downloaden en plakken.",
        "Deze taak vinkt zichzelf af zodra de sleutel bij Google is gecontroleerd en opgeslagen.",
      ],
      auto: true,
      done: playKoppeling,
    },
    {
      id: "vacaturefeed",
      group: "Vindbaarheid & app",
      title: "Vacaturefeed aanmelden bij Indeed, Jooble en Adzuna (gratis bereik)",
      why: "Elke open klus staat automatisch in zekerflex.com/vacatures.xml. Vacaturesites halen die feed elke paar uur op en tonen je klussen gratis aan iedereen die daar zoekt.",
      how: [
        "Indeed: ga naar indeed.com/hire/xml-feed-guidelines (of mail je accountmanager) en geef de feed-URL zekerflex.com/vacatures.xml op als 'organische XML-feed'.",
        "Jooble: jooble.org/info/partners → 'Add your vacancies via XML' → feed-URL invullen.",
        "Adzuna en Careerjet: via hun partnerpagina hetzelfde (beide lezen het Indeed-formaat).",
        "Werk.nl (UWV) neemt alleen vacatures van erkende koppelpartners op; vraag dat aan via werk.nl → werkgevers → 'vacatures koppelen', of plaats grote klussen daar los.",
      ],
      auto: false,
      ...m("vacaturefeed"),
    },
    {
      id: "google-business",
      group: "Vindbaarheid & app",
      title: "Google Bedrijfsprofiel aanmaken (vindbaarheid 'uitzendbureau in de buurt')",
      why: "Voor zoekopdrachten als 'uitzendbureau' of 'uitzendbureau Amsterdam' laat Google eerst bedrijven op de kaart zien. Zonder Bedrijfsprofiel sta je daar niet tussen, hoe goed de website ook is. Reviews op dat profiel tellen zwaar mee.",
      how: ["Ga naar business.google.com en maak een profiel voor ZekerFlex (categorie 'Uitzendbureau', tweede categorie 'Arbeidsbemiddelingsbureau').", "Vul het adres van je kantoor in (of kies 'servicegebied: Nederland' als je geen bezoekadres hebt), je telefoonnummer en zekerflex.com.", "Verifieer het profiel (Google stuurt een code) en vraag je eerste opdrachtgevers en flexkrachten om een review."],
      auto: false,
      ...m("google-business"),
    },
    {
      id: "turn",
      group: "Bellen & koppelingen",
      title: "Eigen TURN-server voor bellen (aanrader)",
      why: "Zonder TURN lukken (video)gesprekken niet altijd achter strenge bedrijfsfirewalls of sommige mobiele netwerken.",
      how: ["Draait op de eigen server (VPS): de coturn-dienst met de poorten 3478 (udp+tcp) en 49160–49260/udp open (deploy/coturn/entrypoint.sh).", "Vraag Claude het op te zetten; daarna staan TURN_HOST en TURN_SHARED_SECRET op de server en vinkt deze taak zichzelf af."],
      auto: true,
      done: Boolean(env.TURN_HOST && env.TURN_SHARED_SECRET),
    },
    {
      id: "transip-api",
      group: "Bellen & koppelingen",
      title: "TransIP-sleutel maken voor ZekerFlex Mail en domeinen",
      why: "Met deze sleutel maakt ZekerFlex zelf mailadressen aan (zoals jan@zekerflex.com), koppelt het domeinen van klanten en zoekt het vrije domeinnamen op. Je mail staat al bij TransIP; de server mag alleen via TransIP mailen, dus dit is de route die echt werkt. Zonder sleutel worden aanvragen alleen bewaard.",
      how: [
        "Log in op transip.nl → Controlepaneel → Account (rechtsboven) → API.",
        "Zet de API aan en maak een nieuw sleutelpaar. Vink 'Alleen whitelisted IP-adressen' aan en voeg het IP van de server toe: 37.97.226.24.",
        "Geef Claude je TransIP-loginnaam en de privésleutel (het blok dat begint met -----BEGIN PRIVATE KEY-----). Die worden verzegeld op de server gezet; daarna vinkt deze taak zichzelf af.",
        "Domeinen registreren maakt bij TransIP een factuur. Dat gebeurt alleen als een beheerder in Admin op 'Registreer' drukt, nooit vanzelf.",
      ],
      auto: true,
      done: Boolean(env.TRANSIP_LOGIN && env.TRANSIP_PRIVATE_KEY),
    },
    {
      id: "telefonie-prijzen",
      group: "Bellen & koppelingen",
      title: "Prijzen voor zakelijke nummers bevestigen",
      why: "Opdrachtgevers en flexkrachten kunnen een nummer met opties en bundels aanvragen. De prijzen zijn een voorstel van Claude: lijn € 12,50 per maand, bundels € 14,95 / € 29,95 / € 59,95, inclusief 100 belminuten.",
      how: ["Kijk in Admin → Telefonie onder Prijzen en pas aan wat je anders wilt; klanten zien het meteen.", "Inkoop ter vergelijking: een 097-nummer kost bij Twilio ±$7,70 per maand, plus de belminuten en de AI-spraakherkenning per gesprek. Vink af als de prijzen goed zijn."],
      auto: false,
      ...m("telefonie-prijzen"),
    },
    {
      id: "telefonie-saldo",
      group: "Bellen & koppelingen",
      title: "Twilio-tegoed opwaarderen voor nieuwe nummers",
      why: "Elk 097-nummer kost bij Twilio ±$7,70 per maand en wordt van het tegoed afgeschreven. Op 2 november stond er $9,49 op: genoeg voor één nummer.",
      how: ["console.twilio.com → Billing → Add funds, of zet automatisch opwaarderen aan.", "Daarna kun je aanvragen in Admin → Telefonie leveren."],
      auto: false,
      ...m("telefonie-saldo"),
    },
    {
      id: "twilio-085",
      group: "Bellen & koppelingen",
      title: "Twilio: bellen naar 085- en 088-nummers aanzetten",
      why: "Op 3 november weigerde Twilio een oproep van de AI-beller naar een 085-nummer ('Account not authorized to call'). Bellen naar 06- en gewone netnummers werkt wel. Veel bedrijven hebben een 085- of 088-nummer, dus juist die leads kan de beller nu niet bereiken.",
      how: [
        "console.twilio.com → Voice → Settings → Geo permissions → Nederland: zet de soorten nummers aan die je wilt bellen. Betaalnummers (0900, 0906, 0909) laat je uit.",
        "Vink af als het aanstaat. Een volgende oproep naar zo'n nummer laat in Admin → Telefonie zien of het werkt.",
      ],
      auto: false,
      ...m("twilio-085"),
    },
    {
      id: "telefonie-acm",
      group: "Juridisch",
      title: "Laten checken: melding bij de ACM als aanbieder van telefonie",
      why: "Wie telefoonnummers aan klanten levert, moet zich meestal (gratis) melden bij de ACM als aanbieder van een openbare elektronische communicatiedienst. Ook de voorwaarden van Twilio voor doorverkoop en de regels voor Nederlandse nummers (adres en identiteit van de eindgebruiker) gelden.",
      how: ["Laat een jurist of adviseur bevestigen of en hoe ZekerFlex zich moet melden (acm.nl, registratie aanbieders).", "Vink af als het geregeld is of niet nodig blijkt."],
      auto: false,
      ...m("telefonie-acm"),
    },
    {
      id: "telefonie-partner",
      group: "Bellen & koppelingen",
      title: "Partner kiezen voor 06-, 085-, lokale en 0800-nummers",
      why: "Twilio levert in Nederland alleen 097-nummers. Voor echte 06-nummers, 085/088, lokale netnummers, 0800 en nummerbehoud is een Nederlandse aanbieder nodig. Tot dan staan die nummers als 'op aanvraag' en kan iedereen zijn eigen nummer houden door door te schakelen.",
      how: ["Vraag offertes bij Nederlandse VoIP-aanbieders met nummerbeheer, nummerbehoud en een koppeling (API).", "Geef Claude de documentatie; dan wordt de partner een tweede leverancier naast Twilio."],
      auto: false,
      ...m("telefonie-partner"),
    },
    {
      id: "whatsapp-live",
      group: "Bellen & koppelingen",
      title: "WhatsApp Business (live berichten) koppelen",
      why: "Importeren van WhatsApp-gesprekken werkt al; voor live sturen en ontvangen is een geverifieerd Meta-bedrijfsaccount nodig.",
      how: ["Meta Business-verificatie afronden en een zakelijk nummer aan de WhatsApp Business Cloud API koppelen.", "Lever aan: phone-number ID, een permanente (system user) token en het app secret — dan bouw en test ik de live koppeling."],
      auto: false,
      ...m("whatsapp-live"),
    },
    {
      id: "admin-2fa",
      group: "Beheer & veiligheid",
      title: "Tweestapsverificatie aan voor alle beheerders",
      why: "Beheerders kunnen bij betalingen, bankgegevens en ID-bewijzen. Met tweestapsverificatie is een gestolen wachtwoord niet genoeg om in te loggen.",
      how: ["Ga naar Admin → Beveiliging & 2FA en klik 'Tweestapsverificatie aanzetten'.", "Scan de QR-code met een authenticator-app (Google Authenticator, Microsoft Authenticator of 1Password) en vul de code in.", "Bewaar de 10 herstelcodes op een veilige plek (bijv. je wachtwoordmanager). Laat elke andere beheerder hetzelfde doen."],
      auto: true,
      done: admin2fa.total > 0 && admin2fa.on === admin2fa.total,
      doneNote: `${admin2fa.on} van ${admin2fa.total} beheerders hebben het aan`,
    },
    {
      id: "invoice-reminders",
      group: "Geld & bank",
      title: "Automatische betaalherinneringen aanzetten",
      why: "Freelancers met standaard uitbetaling krijgen hun loon pas als de opdrachtgever betaalt. Automatische herinneringen (na 3 en 10 dagen, daarna een melding bij jou) zorgen dat facturen op tijd betaald worden.",
      how: ["Ga naar Admin → Facturen en bekijk het blok 'Achterstallig' (staan er oude testfacturen tussen? Annuleer die eerst).", "Zet 'Automatische herinneringen' aan. Vanaf de volgende ochtend 09:00 gaat het vanzelf."],
      auto: true,
      done: reminders.enabled,
    },
    {
      id: "payslips-utc",
      group: "Geld & bank",
      title: "Twee oude loonstroken nakijken (toeslagen op de verkeerde klok)",
      why: "Tot 2 november rekende de loonberekening nacht-, zaterdag-, zondag- en feestdagtoeslagen met de klok van de server (UTC) in plaats van de Nederlandse tijd. Dat scheelt alleen bij uren rond de grenzen, bijvoorbeeld 22:00–23:00, 06:00–07:00 of het eerste uur van een zondag. Er staan 2 loonstroken van daarvoor; bij één zit een toeslag.",
      how: ["Open Admin → Verloning en bekijk de loonrondes van vóór 2 november.", "Begint of eindigt een dienst rond 22:00, 06:00 of middernacht? Vraag Claude dan om die strook opnieuw te berekenen. Anders kun je dit afvinken."],
      auto: false,
      ...m("payslips-utc"),
    },
    {
      id: "github-billing",
      group: "Beheer & veiligheid",
      title: "GitHub-account ontgrendelen (betaalprobleem) — anders draaien de automatische tests en de uptime-bewaking niet",
      why: "Bij elke push test GitHub nu automatisch aanmelden, verificatie, reageren en facturen, en elke 10 minuten wordt gecontroleerd of de site bereikbaar is. GitHub weigert die taken te starten: 'your account is locked due to a billing issue'.",
      how: [
        "Ga naar github.com → Settings → Billing and plans en los de betaalmelding op (vaak een verlopen kaart of een openstaande factuur).",
        "Kijk daarna bij de repository onder Actions: de run 'CI' moet groen worden.",
        "Optioneel, push op je telefoon bij storing: installeer de app 'ntfy', abonneer je op een eigen geheime naam (bijv. zekerflex-alarm-8k2q) en zet die naam als repository-secret NTFY_TOPIC (Settings → Secrets and variables → Actions).",
      ],
      auto: false,
      ...m("github-billing"),
    },
    {
      id: "smtp",
      group: "Beheer & veiligheid",
      title: "Mail echt laten versturen (SMTP)",
      why: "Zonder SMTP-instellingen worden mails (codes, welkomstmails, facturen, herinneringen) alleen in Admin → Mail bewaard en komen ze nooit bij gebruikers aan.",
      how: ["Pak de SMTP-gegevens van je mailprovider (bijv. TransIP, Mailgun, Postmark of je eigen mailserver): host, poort, gebruikersnaam, wachtwoord.", "Geef ze aan Claude; die zet SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en MAIL_FROM (bijv. no-reply@zekerflex.com) op de server.", "Controleer in Admin → Mail dat nieuwe mails als 'verstuurd' staan in plaats van alleen 'opgeslagen'."],
      auto: true,
      done: Boolean(process.env.SMTP_HOST?.trim()),
    },
    {
      id: "stripe-identity",
      group: "Geld & bank",
      title: "Stripe Identity activeren (ID-controle via Stripe)",
      why: "Freelancers maken dan op Stripe's eigen pagina een foto van hun ID en een live selfie; Stripe controleert of het document echt is en of het gezicht klopt. Meestal binnen een minuut goedgekeurd, zonder dat jij foto's hoeft na te kijken (±€1,50 per controle).",
      how: ["Stripe-dashboard (dashboard.stripe.com) → zoek 'Identity' → klik 'Aan de slag' en rond de activering af. Dit is de enige verplichte stap: daarna zien freelancers vanzelf 'Snel via Stripe' op de verificatiepagina.", "Aanrader: Stripe → Developers → Webhooks → je ZekerFlex-webhook → voeg identity.verification_session.verified, .requires_input en .canceled toe. Dan wordt de uitslag ook verwerkt als iemand de pagina niet terug opent.", "Werkt het nog niet? De optie verbergt zich 6 uur nadat Stripe een poging weigerde — probeer het daarna opnieuw. Uitzetten kan altijd: vraag Claude om STRIPE_IDENTITY_ENABLED op false te zetten."],
      auto: false,
      ...m("stripe-identity"),
    },
    {
      id: "alert-push",
      group: "Beheer & veiligheid",
      title: "Storingsmeldingen op je telefoon aanzetten",
      why: "Mislukte taken, uitbetalingen, Stripe-fouten en bank-risico's komen als pushmelding binnen — maar alleen als je telefoon meldingen van ZekerFlex toestaat. Anders krijg je ze alleen per mail. Had je dit al gedaan? Je toestellen van eind oktober waren nog aangemeld met een oude sleutel en kregen niets meer; op 3 november zijn die uitgezet. Open ZekerFlex op elk toestel één keer opnieuw, dan meldt het zich vanzelf aan met de juiste sleutel.",
      how: ["Open zekerflex.com/admin op je telefoon (zet hem eventueel op je beginscherm).", "Tik op het belletje bovenin en sta meldingen toe.", "Ga naar Admin → Systeemstatus en klik 'Testmelding sturen' om te controleren dat hij aankomt."],
      auto: true,
      done: adminPush,
    },
    {
      id: "uptime",
      group: "Beheer & veiligheid",
      title: "Bewaking of de site online is (van buitenaf)",
      why: "Als de hele site plat ligt, kan hij dat zelf niet meer melden. Een dienst van buitenaf controleert elke minuut of zekerflex.com werkt en waarschuwt je anders.",
      how: ["Snel en gratis: maak een account bij UptimeRobot of Better Stack en voeg een monitor toe op https://zekerflex.com/api/health.", "Eigen beheer kan ook (Uptime Kuma), maar zet het dan op een andere machine dan de site, anders valt de bewaking tegelijk uit.", "Laat meldingen naar je telefoon/mail sturen en vink deze taak af."],
      auto: false,
      ...m("uptime"),
    },
    {
      id: "backups",
      group: "Beheer & veiligheid",
      title: "Dagelijkse back-up met hersteltest",
      why: "Elke nacht maakt de server een back-up van de database en de uploads, en zet die op proef terug om te bewijzen dat hij bruikbaar is.",
      how: ["Dit gaat vanzelf. De stand zie je in Admin → Systeem → tab Back-ups.", "Gaat er iets mis, dan krijg je een melding. Herstellen na een storing staat in deploy/DISASTER-RECOVERY.md (of vraag Claude)."],
      auto: true,
      done: backup?.state === "ok",
      doneNote: backupNote(backup),
    },
    {
      id: "backup-offsite",
      group: "Beheer & veiligheid",
      title: "Kopie van de back-ups buiten de server",
      why: "De nachtelijke back-ups staan op dezelfde server als de site. Gaat die server stuk of wordt hij gehackt, dan ben je de back-ups ook kwijt.",
      how: [
        "Kies één van twee: elke nacht een versleutelde kopie naar deze laptop (Claude kan dat instellen met de sleutel die er al op staat), of opslag in de cloud zoals Cloudflare R2 of Backblaze B2 (een paar euro per maand): maak daar een bucket met sleutel aan en geef die aan Claude.",
        "Claude zet het aan en test één keer een terugzetting vanaf de kopie. Vink het daarna af.",
      ],
      auto: false,
      ...m("backup-offsite"),
    },
    {
      id: "test-accounts",
      group: "Beheer & veiligheid",
      title: "Oude wegwerp-testaccounts laten opruimen",
      why: "Bij het zoeken naar een inlogprobleem op 23 oktober zijn testaccounts aangemaakt (zf-…@example.com, nooit geverifieerd). Ze doen niets, maar vervuilen de gebruikerslijst en de cijfers.",
      how: ["Zeg tegen Claude: 'ruim de testaccounts op'. Alleen accounts op @example.com die met zf- beginnen worden verwijderd; echte gebruikers blijven staan."],
      auto: true,
      done: testAccounts === 0,
      ...(testAccounts ? { doneNote: `nog ${testAccounts} over` } : {}),
    },
    {
      id: "google-login-test",
      group: "Beheer & veiligheid",
      title: "Inloggen met Google één keer zelf proberen",
      why: "De knop 'Inloggen met Google' staat aan. Probeer hem één keer met het Google-account waarmee je ook op ZekerFlex staat; dan weet je zeker dat nieuwe gebruikers er ook mee binnenkomen.",
      how: ["Open een privévenster en ga naar zekerflex.com/login (zonder www).", "Klik 'Inloggen met Google'. Kom je in je account, vink dit dan af. Zie je een foutmelding, maak er een foto van en stuur die naar Claude."],
      auto: false,
      ...m("google-login-test"),
    },
    {
      id: "git-purge",
      group: "Beheer & veiligheid",
      title: "Oude videobestanden uit de git-geschiedenis halen (optioneel)",
      why: "Ongeveer 42 MB oude video's zitten nog in de geschiedenis van de repository; opruimen maakt hem kleiner en sneller.",
      how: ["Alleen als er geen open werk-branches zijn: zie de stappen in public/videos/README.md (git filter-repo plus force-push). Dit herschrijft de geschiedenis — doe het bewust."],
      auto: false,
      ...m("git-purge"),
    },
    {
      id: "old-uploads",
      group: "Overig",
      title: "Oude uploads (september–oktober) terughalen",
      why: "Toen de site nog op Vercel draaide, gingen uploads naar een aparte S3-opslag. Die 19 bestanden (onder andere de foto's van de Riem en de Thermo bodywarmer in de shop) zijn niet meeverhuisd. Nieuwe uploads staan sinds 31 oktober in je eigen database.",
      how: ["Zoek uit bij welke opslagdienst die S3-bucket staat (bijv. AWS, Cloudflare R2, Backblaze of DigitalOcean; kijk in je mail naar facturen).", "Maak daar een sleutel met alleen leesrechten en geef Claude het adres (endpoint), de bucketnaam en de sleutel; die kopieert de bestanden naar de server en koppelt de twee shopfoto's opnieuw."],
      auto: false,
      ...m("old-uploads"),
    },
    {
      id: "vercel-duplicate",
      group: "Overig",
      title: "Oude Vercel-projecten opzeggen",
      why: "Sinds 30 oktober draait de site op je eigen server; Vercel krijgt geen bezoekers meer. De projecten 'briando/zekerflex-finale' en 'briando979-netizens-projects/zekerflex-finale' kunnen weg.",
      how: ["Doe eerst 'Oude uploads terughalen': in Vercel staan nog de namen van de instellingen van die oude opslag.", "Daarna: Vercel → elk project → Settings → onderaan 'Delete Project'. Kijk onder Billing of je niets meer betaalt."],
      auto: false,
      ...m("vercel-duplicate"),
    },
  ];
}

export async function setManualDone(id: string, done: boolean, by: string): Promise<void> {
  const cur = (await kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")) ?? {};
  if (done) cur[id] = { at: new Date().toISOString(), by };
  else delete cur[id];
  await kvSet("owner-todos:done", cur);
}

export async function customTodos(): Promise<CustomTodo[]> {
  return (await kvGet<CustomTodo[]>("owner-todos:custom")) ?? [];
}

export async function addCustom(text: string): Promise<CustomTodo[]> {
  const list = [{ id: randomUUID().slice(0, 8), text: text.slice(0, 500), done: false, at: new Date().toISOString() }, ...(await customTodos())].slice(0, 200);
  await kvSet("owner-todos:custom", list);
  return list;
}

export async function updateCustom(id: string, patch: { done?: boolean | undefined; remove?: boolean | undefined }): Promise<CustomTodo[]> {
  let list = await customTodos();
  list = patch.remove ? list.filter((t) => t.id !== id) : list.map((t) => (t.id === id && patch.done !== undefined ? { ...t, done: patch.done } : t));
  await kvSet("owner-todos:custom", list);
  return list;
}
