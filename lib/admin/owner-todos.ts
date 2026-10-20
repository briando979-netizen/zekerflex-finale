import { randomUUID } from "node:crypto";
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

// ---------------------------------------------------------------------------
// "Te doen voor jou" — the things only the owner can do (accounts, payment
// details, legal sign-off). Where the platform can see it, an item checks
// itself (env set, model reachable, Stripe webhook configured); the rest is
// ticked off by hand. Plus free-form notes/todos of the owner's own.
//   key "owner-todos:done"   → { [id]: { at, by } }
//   key "owner-todos:custom" → CustomTodo[]
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

const hasVideos = () => {
  try {
    return existsSync(path.join(process.cwd(), "public", "videos", "wat-is-zekerflex.mp4"));
  } catch {
    return false;
  }
};

async function stripeIssuingWebhookOk(): Promise<boolean | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  try {
    const list = await getStripeClient().webhookEndpoints.list({ limit: 100 });
    return list.data.some((w) => w.status === "enabled" && (w.enabled_events.includes("*") || ISSUING_EVENTS.every((e) => w.enabled_events.includes(e as never))));
  } catch {
    return null;
  }
}

export async function ownerTodos(): Promise<OwnerTodo[]> {
  const manual = (await kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")) ?? {};
  const [webhookOk, products, issuing, llm, admin2fa, adminPush, reminders] = await Promise.all([stripeIssuingWebhookOk(), getProducts().catch(() => []), stripeIssuingActive(), llmHealth(), adminTwoFactor(), adminHasPush(), getReminderSettings().catch(() => ({ enabled: false }))]);
  const base = env.APP_BASE_URL ?? "";
  const m = (id: string) => ({ done: Boolean(manual[id]), ...(manual[id] ? { doneNote: `afgevinkt door ${manual[id]!.by} op ${new Date(manual[id]!.at).toLocaleDateString("nl-NL")}` } : {}) });

  return [
    {
      id: "llm",
      group: "AI",
      title: "Eigen AI-server (taalmodel) aanzetten",
      why: "Zet Jarvis, de denkende AI-teams, herschrijven/vertalen in de chat, het volle specialistenadvies en nieuwe advertentievarianten aan.",
      how: ["Huur een server met GPU — hoe meer videogeheugen, hoe slimmer de AI (24 GB of meer aangeraden, 48 GB voor de beste kwaliteit) — en maak een subdomein ai.zekerflex.com met een A-record naar de server.", "Kopieer deploy/ai-node/setup.sh naar de server en draai: sudo bash setup.sh ai.zekerflex.com", "Zet de waarden die het script laat zien in Vercel → Settings → Environment Variables (Production) en klik Redeploy."],
      auto: true,
      done: llm.ok,
      doneNote: llm.ok ? `AI-server antwoordt (model ${llm.model})` : `nog niet: ${llm.detail ?? "niet bereikbaar"}`,
    },
    {
      id: "image",
      group: "AI",
      title: "Beeldserver voor de Studio koppelen (optioneel)",
      why: "Nodig om in admin → Studio beelden te laten maken.",
      how: ["Draai ComfyUI of AUTOMATIC1111 op dezelfde GPU-server (zie deploy/ai-node/README.md).", "Zet IMAGE_ENABLED=true, IMAGE_BACKEND, IMAGE_BASE_URL en IMAGE_API_KEY in Vercel en redeploy."],
      auto: true,
      done: env.IMAGE_ENABLED,
    },
    {
      id: "sepa",
      group: "Geld & bank",
      title: "Zakelijke rekening van ZekerFlex invullen (SEPA)",
      why: "Zonder deze gegevens kunnen freelancers niet op hun eigen IBAN worden uitbetaald en kunnen opnames van ZekerFlex Bank niet worden verwerkt.",
      how: ["Vercel → Environment Variables: SEPA_CREDITOR_IBAN = jullie zakelijke IBAN, SEPA_CREDITOR_NAME = ZekerFlex B.V.", "Redeploy. Daarna komt elke ochtend automatisch een SEPA-bestand klaar (je krijgt een mail)."],
      auto: true,
      done: Boolean(env.SEPA_CREDITOR_IBAN && env.SEPA_CREDITOR_NAME),
    },
    {
      id: "stripe-webhook",
      group: "Geld & bank",
      title: "Stripe-webhook uitbreiden voor betaalpassen",
      why: "Zonder deze events wordt elke betaling met een ZekerFlex-pas geweigerd.",
      how: ["Stripe Dashboard → Developers → Webhooks → jullie endpoint (…/api/webhooks/stripe).", `Voeg toe: ${ISSUING_EVENTS.join(", ")}.`],
      auto: webhookOk !== null,
      done: webhookOk === true,
      ...(webhookOk === null ? { doneNote: "kon Stripe niet controleren — vink handmatig af als het klaar is" } : {}),
      ...(webhookOk === null ? m("stripe-webhook") : {}),
    },
    {
      id: "stripe-pk",
      group: "Geld & bank",
      title: "Stripe publishable key invullen",
      why: "Nodig om in de app het volledige kaartnummer en de CVC van een ZekerFlex-pas te tonen.",
      how: ["Stripe Dashboard → Developers → API keys → Publishable key (pk_live_…).", "Vercel → STRIPE_PUBLISHABLE_KEY = die sleutel, en redeploy."],
      auto: true,
      done: Boolean(env.STRIPE_PUBLISHABLE_KEY),
    },
    {
      id: "issuing-wallets",
      group: "Geld & bank",
      title: "Apple Pay / Google Pay aanzetten voor de passen",
      why: "Zodat gebruikers hun ZekerFlex-pas in hun telefoon kunnen zetten.",
      how: ["Stripe Dashboard → Issuing → Settings → Digital wallets: aanzetten (kan goedkeuring van Stripe vragen)."],
      auto: false,
      ...m("issuing-wallets"),
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
      id: "issuing-active",
      group: "Geld & bank",
      title: "Stripe Issuing (betaalpassen) laten activeren",
      why: "Pas als 'card_issuing' actief is op je Stripe-account kunnen gebruikers echt een pas krijgen.",
      how: ["Stripe Dashboard → Issuing: rond de aanvraag af (bedrijfsgegevens, gebruik, eventueel extra documenten).", "Wacht op de goedkeuring van Stripe; deze taak vinkt zichzelf af zodra het actief is."],
      auto: issuing !== null,
      done: issuing === true,
      ...(issuing === null ? m("issuing-active") : {}),
    },
    {
      id: "domain",
      group: "Vindbaarheid & app",
      title: "Hoofddomein vastleggen (APP_BASE_URL)",
      why: "Bepaalt alle links in mails, de sitemap en Google. De site draait op www.zekerflex.com, eerder was zekerflex.nl gekozen — kies er één en laat de andere doorverwijzen.",
      how: ["Kies het hoofddomein (bv. https://www.zekerflex.com).", "Vercel: APP_BASE_URL = dat adres (met https://), en zet het andere domein in Vercel → Domains op doorverwijzen.", "Redeploy."],
      auto: true,
      done: /^https:\/\//.test(base) && !/localhost/.test(base),
    },
    {
      id: "search-console",
      group: "Vindbaarheid & app",
      title: "Google Search Console en Bing koppelen",
      why: "Zodat Google en Bing de site goed indexeren en je ziet waarop je gevonden wordt.",
      how: ["search.google.com/search-console → eigendom toevoegen → kies 'HTML-tag' en kopieer de code achter content=.", "Vercel: GOOGLE_SITE_VERIFICATION = die code (en BING_SITE_VERIFICATION via Bing Webmaster Tools). Redeploy en klik daarna op Verifiëren.", "Dien /sitemap.xml in bij beide."],
      auto: true,
      done: Boolean(process.env.GOOGLE_SITE_VERIFICATION),
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
      id: "play-store",
      group: "Vindbaarheid & app",
      title: "App publiceren in de Google Play Store",
      why: "De app (PWA) is klaar om als Android-app te verschijnen; de koppeling (assetlinks) staat al.",
      how: ["Volg docs/MOBILE-APP.md: bubblewrap build met jullie ondertekeningssleutel.", "Maak een Google Play Console-account (eenmalig 25 dollar) en upload het .aab-bestand met screenshots en beschrijving."],
      auto: false,
      ...m("play-store"),
    },
    {
      id: "videos",
      group: "Vindbaarheid & app",
      title: "Uitlegvideo's plaatsen",
      why: "De pagina /uitleg toont nu alleen foto's met 'video komt binnenkort'.",
      how: ["Maak of lever 5 korte video's: wat is ZekerFlex, klus plaatsen, uitzenden of freelance, uren goedkeuren, kosten en facturen.", "Geef ze aan mij door; ik zet ze online (bij voorkeur via een videodienst of Vercel Blob, niet in git)."],
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
      id: "turn",
      group: "Bellen & koppelingen",
      title: "Eigen TURN-server voor bellen (aanrader)",
      why: "Zonder TURN lukken (video)gesprekken niet altijd achter strenge bedrijfsfirewalls of sommige mobiele netwerken.",
      how: ["Op je eigen server: TURN_SHARED_SECRET maken (deploy/scripts/gen-secrets.mjs) en poorten 3478 (udp+tcp) en 49160–49200/udp openzetten.", "Start met docker compose --profile turn (zie docker-compose.prod.yml).", "Vercel: TURN_HOST en TURN_SHARED_SECRET invullen en redeploy."],
      auto: true,
      done: Boolean(env.TURN_HOST && env.TURN_SHARED_SECRET),
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
      id: "google-business",
      group: "Vindbaarheid & app",
      title: "Google Bedrijfsprofiel aanmaken (vindbaarheid 'uitzendbureau in de buurt')",
      why: "Voor zoekopdrachten als 'uitzendbureau' of 'uitzendbureau Amsterdam' laat Google eerst bedrijven op de kaart zien. Zonder Bedrijfsprofiel sta je daar niet tussen, hoe goed de website ook is. Reviews op dat profiel tellen zwaar mee.",
      how: ["Ga naar business.google.com en maak een profiel voor ZekerFlex (categorie 'Uitzendbureau', tweede categorie 'Arbeidsbemiddelingsbureau').", "Vul het adres van je kantoor in (of kies 'servicegebied: Nederland' als je geen bezoekadres hebt), je telefoonnummer en www.zekerflex.com.", "Verifieer het profiel (Google stuurt een code) en vraag je eerste opdrachtgevers en flexkrachten om een review."],
      auto: false,
      done: false,
    },
    {
      id: "smtp",
      group: "Beheer & veiligheid",
      title: "Mail echt laten versturen (SMTP)",
      why: "Zonder SMTP-instellingen worden mails (codes, welkomstmails, facturen, herinneringen) alleen in Admin → Mail bewaard en komen ze nooit bij gebruikers aan.",
      how: ["Pak de SMTP-gegevens van je mailprovider (bijv. TransIP, Mailgun, Postmark of je eigen mailserver): host, poort, gebruikersnaam, wachtwoord.", "Vercel → Settings → Environment Variables: zet SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS en MAIL_FROM (bijv. no-reply@zekerflex.com) en deploy opnieuw.", "Controleer in Admin → Mail dat nieuwe mails als 'verstuurd' staan in plaats van alleen 'opgeslagen'."],
      auto: true,
      done: Boolean(process.env.SMTP_HOST?.trim()),
    },
    {
      id: "stripe-identity",
      group: "Geld & bank",
      title: "ID-controle via Stripe Identity aanzetten",
      why: "Freelancers maken dan op Stripe's eigen pagina een foto van hun ID en een live selfie; Stripe controleert of het document echt is en of het gezicht klopt. Meestal binnen een minuut goedgekeurd, zonder dat jij foto's hoeft na te kijken (±€1,50 per controle).",
      how: ["Stripe-dashboard → Identity → activeer Identity voor je account.", "Stripe → Developers → Webhooks → je bestaande ZekerFlex-webhook → voeg de events identity.verification_session.verified, identity.verification_session.requires_input en identity.verification_session.canceled toe.", "Vercel → Settings → Environment Variables: zet STRIPE_IDENTITY_ENABLED = true en deploy opnieuw. Vanaf dan krijgen freelancers 'Snel via Stripe' als aanbevolen keuze; zelf foto's uploaden blijft mogelijk."],
      auto: true,
      done: process.env.STRIPE_IDENTITY_ENABLED === "true",
    },
    {
      id: "alert-push",
      group: "Beheer & veiligheid",
      title: "Storingsmeldingen op je telefoon aanzetten",
      why: "Mislukte taken, uitbetalingen, Stripe-fouten en bank-risico's komen als pushmelding binnen — maar alleen als je telefoon meldingen van ZekerFlex toestaat. Anders krijg je ze alleen per mail.",
      how: ["Open www.zekerflex.com/admin op je telefoon (zet hem eventueel op je beginscherm).", "Tik op het belletje bovenin en sta meldingen toe.", "Ga naar Admin → Systeemstatus en klik 'Testmelding sturen' om te controleren dat hij aankomt."],
      auto: true,
      done: adminPush,
    },
    {
      id: "uptime",
      group: "Beheer & veiligheid",
      title: "Bewaking of de site online is (van buitenaf)",
      why: "Als de hele site plat ligt, kan hij dat zelf niet meer melden. Een dienst van buitenaf controleert elke minuut of www.zekerflex.com werkt en waarschuwt je anders.",
      how: ["Eigen beheer (past bij je voorkeur): installeer Uptime Kuma op je AI-server (docker run -d -p 3001:3001 louislam/uptime-kuma) en voeg een monitor toe op https://www.zekerflex.com/api/health.", "Of snel en gratis: een uptime-dienst zoals UptimeRobot of Better Stack met dezelfde URL.", "Laat meldingen naar je telefoon/mail sturen en vink deze taak af."],
      auto: false,
      ...m("uptime"),
    },
    {
      id: "backups",
      group: "Beheer & veiligheid",
      title: "Back-ups en een hersteltest",
      why: "Zorg dat je bij een storing echt alles terugkrijgt — test het één keer echt.",
      how: ["Controleer bij je databaseprovider dat dagelijkse back-ups aan staan en hoe lang ze bewaard worden.", "Doe één keer een hersteltest op een testdatabase (zie deploy/scripts/restore.sh)."],
      auto: false,
      ...m("backups"),
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
      id: "vercel-access",
      group: "Overig",
      title: "Claude toegang geven tot Vercel (optioneel)",
      why: "Dan kan Claude omgevingsvariabelen en deploys voortaan zelf regelen.",
      how: ["Start een interactieve Claude Code-sessie en autoriseer de Vercel-koppeling via /mcp."],
      auto: false,
      ...m("vercel-access"),
    },
    {
      id: "vercel-duplicate",
      group: "Overig",
      title: "Dubbel Vercel-project opruimen",
      why: "Het project 'briando979-netizens-projects/zekerflex-finale' faalt bij elke push (oude dubbele koppeling); het echte project is 'briando/zekerflex-finale'.",
      how: ["Vercel → dat project → Settings → Git: ontkoppelen, of het project verwijderen als je het niet gebruikt."],
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
