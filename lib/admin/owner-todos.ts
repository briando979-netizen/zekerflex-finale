import { smsIngericht, whatsappIngericht } from "@/lib/spoed/kanalen";
import { randomUUID } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { llmGezondheidGecachet } from "@/lib/ai/gezondheid";
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
import { geminiBeeldGelukt, geminiSlot } from "@/lib/ai/gemini-media";
import { platformPartij } from "@/lib/efactuur/instellingen";
import { BANK_AAN } from "@/lib/app-mode";
import { cscaStand } from "@/lib/kyc/chip/csca";
import { stripeFotoSleutelInfo } from "@/lib/kyc/stripe-fotos";
import { actieveWeigering } from "@/lib/kyc/stripe-weigering";
import { accountStand } from "@/lib/billing/stripe-betalen";
import { appleConfig } from "@/lib/auth/apple";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { platformnaamTodo, type PlatformnaamStand } from "@/lib/admin/todo-platformnaam";
import { stripeAccountTodos } from "@/lib/admin/todo-stripe-account";
import { werkrechtEisTodo } from "@/lib/admin/todo-werkrecht";
import { aiTraderTodo } from "@/lib/admin/todo-ai-trader";
import { alpacaSleutelInfo } from "@/lib/trader/alpaca";
import { featureEnabled } from "@/lib/flags";
import { getGratisStand } from "@/lib/ai/gratis";
import { WISSEL_VERWIJZING, betalenUitEerst, betalenUitVoorzin, webhookHandtekeningStand } from "@/lib/admin/todo-stripe-wissel";
import type { Eerst } from "@/lib/admin/te-doen-eerst";
import { kvkTegoedTodo } from "@/lib/admin/todo-kvk-tegoed";
import { stripeKopieTodo } from "@/lib/admin/todo-stripe-kopie";
import { stripeKopieStand } from "@/lib/kyc/stripe-kopie";
import { leesKvkTegoed, wachtendeKvkControles } from "@/lib/kvk/tegoed-opslag";

/** Bij taken die alleen voor ZekerFlex Bank nodig waren. */
const BANK_UIT = "niet meer nodig: ZekerFlex Bank staat uit (7 nov)";

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
  /** Alleen bij taken die echt blokkeren: ze komen bovenaan in het blok "Begin hier". Een datum alleen als die vastligt. */
  eerst?: Eerst;
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

/**
 * Het DMARC-record van het hoofddomein (_dmarc.<domein>, TXT "v=DMARC1; p=…"): het beleid, of null als het er niet
 * staat. Microsoft (Hotmail, Outlook) kijkt er streng naar; de meldingen van SNDS/JMRP kan de lijst niet zien.
 */
async function dmarcBeleid(base: string): Promise<string | null> {
  let host = "";
  try {
    host = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host.includes(".")) return null;
  try {
    const records = await new Resolver({ timeout: 2500, tries: 1 }).resolveTxt(`_dmarc.${host}`);
    const dmarc = records.map((r) => r.join("")).find((r) => /^v=DMARC1/i.test(r.trim()));
    if (!dmarc) return null;
    return /\bp=([a-z]+)/i.exec(dmarc)?.[1]?.toLowerCase() ?? "none";
  } catch {
    return null;
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

/**
 * Website proposals made but still not sent after 2 days and not expired (lib/sales/website-proposal.ts);
 * null = couldn't look. The maker also gets a push, but an owner without a push device would never see it.
 */
async function unsentProposals(now = Date.now()): Promise<number | null> {
  try {
    const { listWebsiteProposals } = await import("@/lib/sales/website-proposal");
    return (await listWebsiteProposals()).filter((p) => p.status === "concept" && now - Date.parse(p.createdAt) >= 2 * 86_400_000 && Date.parse(p.expiresAt) > now).length;
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

/**
 * De naam van de platformorganisatie en de facturen die hij als afzender uitgaf (uitgegeven of betaald); alleen de telling,
 * nooit ontvangers. null = niet kunnen tellen. Zie lib/admin/todo-platformnaam.ts.
 */
async function platformnaamStand(): Promise<PlatformnaamStand | null> {
  try {
    const t = await prisma.tenant.findFirst({ where: { type: "PLATFORM" }, select: { id: true, name: true } });
    if (!t) return null;
    const som = await prisma.invoice.aggregate({
      where: { issuerTenantId: t.id, status: { in: ["ISSUED", "PAID"] } },
      _count: { _all: true },
      _sum: { totalCents: true },
    });
    return { naam: t.name, aantal: som._count._all, totaalCents: som._sum.totalCents ?? 0 };
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

/** Een adres op een eigen naam: er is een adres en het is niet de technische sslip.io-naam van de server. */
const eigenNaam = (url: string | undefined): boolean => Boolean(url) && !/sslip\.io/i.test(url ?? "");

export async function ownerTodos(): Promise<OwnerTodo[]> {
  const manual = (await kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")) ?? {};
  const base = env.APP_BASE_URL ?? "";
  const [webhookEvents, products, issuing, llm, admin2fa, adminPush, reminders, backup, models3d, googleDns, testAccounts, vagueBranches, playKoppeling, bouwer, unsent] = await Promise.all([
    stripeWebhookEvents(),
    getProducts().catch(() => []),
    stripeIssuingActive(),
    llmGezondheidGecachet(),
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
    unsentProposals(),
  ]);
  const [beeldGelukt, beeldSlot, dmarc, gratis] = await Promise.all([geminiBeeldGelukt(), geminiSlot("beeld"), dmarcBeleid(base), getGratisStand().catch(() => null)]);
  // de kennisbank (lib/kennisbank/outline.ts): staat de API-sleutel erin en is hij gevuld?
  const kennisbank = await import("@/lib/kennisbank/outline").then((m) => m.leesStand()).catch(() => null);
  // de overheidscertificaten voor het chiplezen (lib/kyc/chip/csca.ts)
  const csca = await cscaStand().catch(() => null);
  // de beperkte Stripe-sleutel voor de foto's van Stripe-controles (lib/kyc/stripe-fotos.ts)
  const stripeFotoSleutel = await stripeFotoSleutelInfo().catch(() => null);
  // ZekerFlex Mail-adressen van gewiste accounts (AVG) die bij TransIP nog een mailbox hebben
  const zfMailOpheffen = await import("@/lib/mail/zf-accounts").then((m) => m.teOpheffenBijTransip()).catch((): string[] => []);
  // weigerde Stripe Identity voor het hele account (lib/kyc/stripe-weigering.ts)? Dan staat ZekerFlex het 24 uur uit
  const stripeWeigering = await actieveWeigering().catch(() => null);
  // het live Stripe-account: kan het betalingen ontvangen en uitbetalen (elke 15 min gemeten, lib/billing/stripe-betalen.ts)?
  const stripeStand = await accountStand().catch(() => null);
  const stripeDicht = stripeStand !== null && (!stripeStand.betalen || !stripeStand.uitbetalen);
  // de nachtelijke AVG-opschoning (cron 03:40): gelukt binnen de grens van de bewaking (lib/ops/heartbeat.ts)?
  const avgOpschoning = (await cronHeartbeats().catch(() => [])).find((h) => h.job === "retention-sweep") ?? null;
  const avgOk = Boolean(avgOpschoning?.lastRunAt && avgOpschoning.lastRunOk && !avgOpschoning.stale);
  // facturen met de oude naam van de platformorganisatie als afzender (13 nov): eerst de accountant, dan de naam
  const platformnaam = platformnaamTodo(await platformnaamStand());
  // betalen via Zekerflex, Inc. (13 nov): het account uit Beheer → Stripe-account; een leesfout = geen taak
  const stripeStandUitBeheer = await import("@/lib/billing/stripe-account").then((mod) => mod.stripeAccountInfo()).catch(() => undefined);
  const stripeAccount = stripeAccountTodos(stripeStandUitBeheer);
  // de twee andere Stripe-taken volgen dezelfde stand (lib/admin/todo-stripe-wissel.ts); een leesfout (undefined) verandert niets
  const webhookStand = webhookHandtekeningStand(stripeStandUitBeheer);
  const betalenEerst = betalenUitEerst(stripeStandUitBeheer);
  // het tegoed bij KVKBase (13 nov): op of bijna op = KVK-controles wachten op een herkansing (lib/kvk/tegoed.ts)
  const kvkTegoed = kvkTegoedTodo(await leesKvkTegoed(), (await wachtendeKvkControles().catch(() => [])).length);
  // de ID-foto's en gegevens uit het oude Stripe-account kopiëren (14 nov, lib/kyc/stripe-kopie.ts)
  const stripeKopie = stripeKopieTodo(await stripeKopieStand());
  // de vlag werkrecht-eis (lib/admin/todo-werkrecht.ts): de taak vinkt zichzelf af zodra hij aan staat; een leesfout geeft geen taak
  const aiTrader = aiTraderTodo(await alpacaSleutelInfo().then((i) => i.aanwezig, () => undefined));
  const werkrechtEis = werkrechtEisTodo(await featureEnabled("werkrecht-eis").catch(() => undefined));
  const m = (id: string) => ({ done: Boolean(manual[id]), ...(manual[id] ? { doneNote: `afgevinkt door ${manual[id]!.by} op ${new Date(manual[id]!.at).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}` } : {}) });

  return [
    ...(platformnaam ? [platformnaam] : []),
    ...stripeAccount,
    ...(kvkTegoed ? [kvkTegoed] : []),
    ...(stripeKopie ? [stripeKopie] : []),
    ...(werkrechtEis ? [werkrechtEis] : []),
    ...(aiTrader ? [aiTrader] : []),
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
      title: "Betalen aanzetten bij Google voor AI-foto's en AI-video (Nano Banana, Veo)",
      why: "De Studio en de video-editor maken foto's met Google Nano Banana 2 en Nano Banana Pro, en videoclips met Veo. Op de gratis laag geeft Google daarvoor geen tegoed: elke foto geeft nu 'quota 0'. De gratis laag mag in de EER ook niet zakelijk gebruikt worden. Met betalen aan kost een foto ongeveer 4 tot 25 cent en een Veo-clip van 8 seconden een paar euro. De video-editor zelf, de AI-scenario's, de eigen muziek en de eigen foto's werken ook zonder.",
      how: [
        "Ga naar aistudio.google.com en log in met het Google-account van de Gemini-sleutel.",
        "Klik op Get API key en kies bij het project van de sleutel Set up billing. Koppel een betaalkaart.",
        "Zet in Google Cloud bij Billing een budgetwaarschuwing, bijvoorbeeld € 25 per maand.",
        "Test in Admin → Video-editor → AI met één foto. Uitrollen is niet nodig; dit punt vinkt zichzelf af zodra er een foto gelukt is.",
      ],
      auto: true,
      // "alles gratis" (Admin → Alles gratis, keuze eigenaar 6 nov): dan betalen we niets aan Google en is dit geen taak meer
      done: env.IMAGE_ENABLED || Boolean(beeldGelukt && !beeldSlot) || Boolean(gratis?.aan),
      doneNote: env.IMAGE_ENABLED
        ? "eigen beeldserver gekoppeld"
        : beeldGelukt && !beeldSlot
          ? `laatste AI-foto gelukt op ${new Date(beeldGelukt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
          : gratis?.aan
            ? "niet nodig: 'alles gratis' staat aan (keuze 6 nov); de gratis bronnen staan in de taak hieronder"
            : "nog niet: Google geeft deze sleutel geen beeldtegoed (gratis laag)",
    },
    {
      id: "gratis-ai-bronnen",
      group: "AI",
      title: "Gratis AI-bronnen voor video en foto's: kies wat je wilt (nog niets gekozen)",
      why: "Onderzocht op 5 november 2026. Hieronder staat alles wat gratis is, met wat het geeft en wat ervoor nodig is. Er is nog niets gekozen of gebouwd behalve wat erbij staat. Zeg aan Claude welke je wilt; dan wordt die gekoppeld. Niet gratis (betalen per clip): Seedance 2.5, Veo 3.1, Kling, Higgsfield (credits) en Puter (de gebruiker betaalt).",
      how: [
        "VIDEO — LTX-2.3 (Lightricks via Hugging Face): al ingebouwd. Zonder account ongeveer 2 clips per dag, met een gratis Hugging Face-account ongeveer 5 minuten rekentijd per dag (±4 clips), met PRO ($9 per maand) 40 minuten (±30 clips). HD met geluid, foto laten bewegen kan.",
        "VIDEO — LTX-Video 0.9.8 distilled (Lightricks, Hugging Face): sneller en kost minder rekentijd per clip, dus meer clips uit hetzelfde gratis tegoed; iets minder mooi dan LTX-2.3. Nog niet gebouwd.",
        "VIDEO — Wan 2.2 14B Fast (Hugging Face): foto naar video met goede beweging, uit hetzelfde Hugging Face-tegoed. Nog niet gebouwd.",
        "VIDEO — Wan 2.2 5B (Hugging Face): 720p, 2 tot 3 minuten per clip, uit hetzelfde tegoed. Nog niet gebouwd.",
        "VIDEO — Modal: $30 per maand gratis tegoed (waarschijnlijk zonder creditcard) voor een eigen videoserver met LTX of Wan. Honderden clips per maand. Nodig: een account op modal.com. Nog niet gebouwd.",
        "VIDEO — Kaggle: ongeveer 30 uur gratis videokaart per week (P100/T4), LTX-2.3 kan via Wan2GP. Alleen in batches (opstarten duurt lang). Nodig: Kaggle-account met telefoonnummer. Nog niet gebouwd.",
        "VIDEO — Google Colab (gratis T4): Wan 2.2 werkt, maar alleen met de hand, niet automatisch vanuit ZekerFlex.",
        "VIDEO — niet bruikbaar: HunyuanVideo 1.5 (licentie sluit de EU uit) en Wan2GP/Pinokio op deze pc (geen NVIDIA-kaart).",
        "FOTO — Cloudflare Workers AI (FLUX.1 schnell): 10.000 neurons per dag gratis, ongeveer 170 foto's. Al ingebouwd, wacht op de sleutel (zie het punt hieronder).",
        "FOTO — Together AI (FLUX.1 schnell Free): gratis met een sleutel, lagere limiet. Licentie Apache 2.0 (zakelijk gebruik lijkt toegestaan, nog nakijken). Nog niet gebouwd.",
        "FOTO — Pollinations: zonder account, 1 foto per 15 seconden, soms met watermerk; zakelijk gebruik onduidelijk. Nog niet gebouwd.",
      ],
      auto: false,
      ...m("gratis-ai-bronnen"),
    },
    {
      id: "cloudflare-ai",
      group: "AI",
      title: "Gratis AI-foto's via Cloudflare koppelen (aanrader)",
      why: "Google geeft je sleutel geen beeldtegoed, dus de Studio en de video-editor maken nu geen AI-foto's. Cloudflare geeft elk account 10.000 neurons per dag gratis voor AI; dat is genoeg voor ongeveer 170 foto's per dag met FLUX. Zodra Google wel tegoed geeft, gaat Nano Banana weer voor en blijft Cloudflare de gratis reserve.",
      how: [
        "Log in op dash.cloudflare.com (of maak een gratis account).",
        "Ga naar AI → Workers AI → REST API en klik Create a Workers AI API Token.",
        "Kopieer de sleutel en je Account ID (staat op dezelfde pagina) en geef ze aan Claude; die zet CLOUDFLARE_AI_TOKEN en CLOUDFLARE_ACCOUNT_ID op de server.",
      ],
      auto: true,
      done: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN),
      ...(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN ? { doneNote: "sleutel staat op de server" } : {}),
    },
    {
      id: "spoed-kanalen",
      group: "Bellen & koppelingen",
      title: "Spoedoproep per sms en WhatsApp aanzetten (optioneel)",
      why: "Een opdrachtgever die vandaag nog iemand mist, stuurt een spoedoproep naar geschikte krachten in de buurt (Werkgever → Dienst → Spoedoproep). De melding in de app werkt altijd; sms en WhatsApp bereiken ook wie de app niet open heeft, en 'antwoord 1' plant meteen in. Sms loopt via het Twilio-account van de AI-beller (per bericht het Twilio-tarief). WhatsApp loopt via een eigen brug met een los nummer (deploy/whatsapp-brug): gratis, maar WhatsApp kan zo'n nummer blokkeren bij veel berichten. Gebruik dus een apart nummer; krachten kunnen met STOP afmelden.",
      how: [
        "Sms: zet TWILIO_SMS_FROM (een Twilio-nummer dat sms mag versturen) in .env.production; leeg = TWILIO_FROM_NUMBER. Zet in Twilio bij dat nummer de sms-webhook op https://zekerflex.com/api/telephony/sms (POST).",
        "WhatsApp: koop een prepaid simkaart, draai op de VPS deploy/whatsapp-brug/installeer.sh en scan de QR-code uit het log met WhatsApp op die telefoon (Gekoppelde apparaten).",
        "Daarna staan sms en WhatsApp vanzelf aan in het spoedoproep-paneel.",
      ],
      auto: true,
      done: smsIngericht() || whatsappIngericht(),
      ...(smsIngericht() || whatsappIngericht() ? { doneNote: [smsIngericht() ? "sms" : null, whatsappIngericht() ? "WhatsApp" : null].filter(Boolean).join(" en ") + " ingericht" } : {}),
    },
    {
      id: "hf-token",
      group: "AI",
      title: "Gratis Hugging Face-sleutel voor meer gratis AI-video (optioneel)",
      why: "De video-editor maakt gratis echte AI-clips met LTX-2.3 op de videokaarten van Lightricks (Hugging Face). Zonder account is het tegoed klein: op 4 november waren 2 clips per dag mogelijk vanaf de server. Met een gratis Hugging Face-account krijg je elke dag meer, met een PRO-account (ongeveer $ 9 per maand) veel meer.",
      how: [
        "Maak een gratis account op huggingface.co.",
        "Ga naar Settings → Access Tokens → Create new token, kies Read en kopieer de sleutel (begint met hf_).",
        "Geef de sleutel aan Claude; die zet HF_TOKEN op de server.",
      ],
      auto: true,
      done: Boolean(env.HF_TOKEN),
      ...(env.HF_TOKEN ? { doneNote: "sleutel staat op de server" } : {}),
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
      why: "Zonder deze gegevens kunnen freelancers niet op hun eigen IBAN worden uitbetaald.",
      how: ["Geef Claude de zakelijke IBAN en de naam van de rekeninghouder precies zoals de bank hem kent (bijv. Zekerflex, Inc.); die worden SEPA_CREDITOR_IBAN en SEPA_CREDITOR_NAME op de server.", "Daarna komt elke ochtend automatisch een SEPA-bestand klaar (je krijgt een mail)."],
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
      // niet nodig zolang ZekerFlex Bank uit staat (lib/app-mode.ts, BANK_AAN)
      auto: issuing !== null || !BANK_AAN,
      ...(!BANK_AAN ? { done: true, doneNote: BANK_UIT } : { done: issuing === true, ...(issuing === null ? m("issuing-active") : {}) }),
    },
    {
      id: "stripe-webhook-handtekening",
      group: "Geld & bank",
      title: "Stripe-webhook: de handtekening klopt niet (webhook-secret controleren)",
      why: WISSEL_VERWIJZING + "Het foutenlogboek (Systeem → Foutmeldingen) toont sinds 6 november herhaald 'No signatures found matching the expected signature' op POST /api/webhooks/stripe. Dan verwerkt ZekerFlex die Stripe-gebeurtenissen (betalingen, terugboekingen) niet. Meestal staat in Stripe een tweede endpoint of is het secret opnieuw gemaakt, zodat STRIPE_WEBHOOK_SECRET op de server niet meer bij dat endpoint hoort.",
      how: [
        "Ga in Stripe naar Developers → Webhooks en kijk welke endpoints naar zekerflex.com wijzen; verwijder dubbele of oude.",
        "Open het endpoint https://zekerflex.com/api/webhooks/stripe, klik 'Reveal signing secret' (whsec_…) en vergelijk met STRIPE_WEBHOOK_SECRET in .env.production op de server.",
        "Wijkt het af: zet het juiste secret in .env.production en herstart de app-container (de live-zetter: Onderhoud → herstart-app).",
        "Controleer in Stripe bij het endpoint of nieuwe gebeurtenissen daarna op 200 staan; de melding verdwijnt dan uit het foutenlogboek.",
      ],
      auto: webhookStand.achterhaald,
      ...(webhookStand.achterhaald ? { done: true, ...(webhookStand.doneNote ? { doneNote: webhookStand.doneNote } : {}) } : m("stripe-webhook-handtekening")),
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
      id: "stripe-agentische-handel",
      group: "Geld & bank",
      title: "Webshop verkopen via AI-assistenten (Stripe) aanzetten",
      why: "ZekerFlex stuurt de productlijst van de webshop elk kwartier naar Stripe (Admin → Verkoop via AI). Stripe deelt die met AI-assistenten zoals ChatGPT en Copilot, regelt daar het afrekenen en meldt de bestelling bij ons; die komt binnen als gewone webshopbestelling. Pas na deze stappen in het Stripe-dashboard zien assistenten de producten.",
      how: [
        "Ga naar dashboard.stripe.com/agentic-commerce, kies bij 'Agentic commerce for retail' Get started en meld je aan als verkoper.",
        "Vul het Stripe-profiel in met de voorwaarden (zekerflex.com/voorwaarden), de privacyverklaring (zekerflex.com/privacy) en het retourbeleid (30 dagen retour).",
        "Zet de btw goed: Instellingen → Belastingen, Nederland met het btw-nummer (de prijzen in de lijst zijn inclusief btw). Dit hoort ook bij de taak 'Btw op abonnementen'.",
        "Kijk bij Feed history of de productlijst binnen is (Admin → Verkoop via AI → 'Productlijst nu naar Stripe sturen'), test één product met View feed → Test.",
        "Kies per AI-assistent ⋯ → Request connection. Vink deze taak af zodra er één op 'Enabled' staat.",
      ],
      auto: false,
      ...m("stripe-agentische-handel"),
    },
    {
      id: "stripe-connect-profiel",
      group: "Geld & bank",
      title: "Stripe Connect aanzetten (platformprofiel invullen)",
      why: "Rijscholen laten leerlingen met iDEAL betalen naar hun eigen bankrekening, horecagasten rekenen aan tafel af met iDEAL (geld naar het eigen account van de zaak), en freelancers krijgen hun geld via een eigen Stripe-account. Daarvoor maakt ZekerFlex voor hen een Stripe-account aan (Connect). Stripe weigert dat nu: 'You must complete your platform profile to use Connect'. Op 3 november getest met een tijdelijke testrijschool.",
      how: [
        "Ga naar dashboard.stripe.com/connect/accounts/overview en vul de vragenlijst van het platformprofiel in.",
        "Antwoorden die passen: ZekerFlex is een platform/marktplaats; accounts zijn Express; jullie verbonden accounts zijn rijscholen, horecazaken en zzp'ers in Nederland; geld loopt via 'destination charges' (de klant betaalt op ZekerFlex, het geld gaat meteen naar het account van de rijschool of zaak); ZekerFlex houdt alleen de transactiekosten in.",
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
      id: "loonheffingennummer",
      group: "Geld & bank",
      title: "Loonheffingennummer op de loonstrook (van de accountant)",
      why: "Op een loonstrook hoort het loonheffingennummer van de werkgever. ZekerFlex zet het op elke loonstrook zodra het op de server staat; tot dan blijft die regel weg, er wordt niets verzonnen. Zekerflex, Inc. heeft geen KvK-nummer (Delaware), dus dat veld blijft ook weg.",
      how: [
        "Vraag de accountant om het loonheffingennummer van Zekerflex, Inc. (bijvoorbeeld 123456789L01), zodra de inschrijving als werkgever bij de Belastingdienst rond is.",
        "Geef het aan Claude; die zet PLATFORM_LOONHEFFINGENNUMMER op de server. Een adres op de loonstrook kan ook: PLATFORM_STREET, PLATFORM_POSTAL_CODE en PLATFORM_CITY.",
        "Deze taak vinkt zichzelf af zodra het nummer er staat.",
      ],
      auto: true,
      done: Boolean(env.PLATFORM_LOONHEFFINGENNUMMER?.trim()),
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
      id: "kosten-bevestigen",
      group: "Geld & bank",
      title: "Kosten bevestigen: twee posten zijn nog niet helemaal zeker",
      why: "Beheer → Kosten (/admin/kosten) telt de vaste maandlasten op en geeft ze door aan Financiën & winst. Twee posten daarin zijn niet rond: bij het Twilio-nummer 097 ($ 7,70 per maand) staat geen datum van de prijs, en de eenmalige post \"TransIP onbekende post\" (€ 1) is niet toegelicht, dus we weten niet of hij terugkomt. Die laatste telt daarom niet mee in het maand- en jaartotaal. Gemini, Stripe-kosten, Atlas-kosten, Google Play en het Twilio-gebruik staan op \"bedrag onbekend\" en tellen ook niet mee, dus de totalen zijn minimaal.",
      how: [
        "Open Beheer → Kosten (/admin/kosten). Zoek bij het Twilio-nummer de datum van de prijs op in je Twilio-account en vul die in bij die post (Bewerken).",
        "Kijk op je TransIP-factuur wat de post van € 1 is. Komt hij elke maand of elk jaar terug, zet hem dan op Maand of Jaar; is hij eenmalig, laat hem dan staan.",
        "Vul waar je kunt de onbekende bedragen in (Gemini, Stripe, Atlas, Google Play, Twilio-gebruik), met bron en datum. Laat je boekhouder de schattingen (Delaware) bevestigen.",
      ],
      auto: false,
      ...m("kosten-bevestigen"),
    },
    {
      id: "wtta-aanmelden",
      group: "Juridisch",
      title: "Wtta: controleer dat Zekerflex, Inc. is aangemeld, uiterlijk 31 december 2026",
      why: "Voor het uitzenden van personeel moet Zekerflex, Inc. zich bij de Wtta aanmelden. In de projectnotities staat dat dat kan tot en met 31 december 2026.",
      how: [
        "Vraag de accountant of de aanmelding voor de Wtta voor Zekerflex, Inc. al is gedaan en wanneer.",
        "Is dat nog niet gebeurd, laat de accountant of een adviseur het regelen en spreek een datum af ruim voor 31 december 2026.",
        "Bewaar het bewijs van de aanmelding (bevestiging of registratienummer) bij je administratie en vink deze taak daarna af.",
      ],
      auto: false,
      eerst: { reden: "wettelijk", uiterlijk: "2026-12-31" },
      ...m("wtta-aanmelden"),
    },
    {
      id: "irs-83b",
      group: "Juridisch",
      title: "Controleer of de 83(b)-verklaring is verstuurd en bewaar het bewijs",
      why: "De 83(b)-verklaring moet binnen 30 dagen na 9 november 2026 bij de IRS zijn ingediend: uiterlijk 9 december 2026 (de datum komt uit de Atlas-documenten van de eigenaar).",
      how: [
        "Kijk eerst in het Stripe Atlas-dashboard of Atlas de 83(b)-verklaring al voor je heeft ingediend; Atlas biedt dat soms aan, maar controleer dat zelf.",
        "Zoek het bewijs van verzending op (de verzendbevestiging of het ontvangstbewijs van de IRS) en kijk of de datum voor 9 december 2026 ligt.",
        "Is de verklaring nog niet verstuurd, laat dat dan meteen doen (met een verzendmethode waarmee je een bewijs krijgt) en vraag zo nodig hulp aan de accountant of aan Atlas.",
        "Bewaar het bewijs bij je Atlas-documenten en vink deze taak daarna af.",
      ],
      auto: false,
      eerst: { reden: "wettelijk", uiterlijk: "2026-12-09" },
      ...m("irs-83b"),
    },
    {
      id: "accountant-kiezen",
      group: "Juridisch",
      title: "Een accountant kiezen voor Nederland en de Verenigde Staten",
      why: "Zekerflex, Inc. is een Amerikaanse Inc. die vanuit Nederland werkt. Dat vraagt twee kanten aan aangifte en administratie: in Nederland de btw en de Wtta, en in de Verenigde Staten de aangifte over 2026 (voor een vennootschap met een buitenlandse eigenaar gaat dat om Form 1120 met Form 5472). Ook de structuur zelf en de inschrijving bij de KvK horen bij zo iemand. Zonder accountant weet niemand zeker welke termijnen gelden.",
      how: [
        "Zoek een accountant (of twee, een voor Nederland en een voor de Verenigde Staten) met ervaring met een Amerikaanse Inc. die vanuit Nederland werkt, en leg de structuur uit: Zekerflex, Inc., met de eigenaar in Nederland.",
        "Vraag de accountant de btw-positie, de Wtta en de inschrijving bij de KvK door te nemen, en de Amerikaanse aangifte over 2026 (Form 1120 met Form 5472) in te plannen.",
        "Laat de accountant de datums bevestigen: de termijnen in Beheer → Te doen komen uit de projectnotities, niet van een adviseur.",
        "Zet de gekozen accountant en de afspraken in Beheer → Accountant (/admin/accountant) en vink deze taak daarna af.",
      ],
      auto: false,
      eerst: { reden: "wettelijk" },
      ...m("accountant-kiezen"),
    },
    {
      id: "avg-bewaartermijn",
      group: "Juridisch",
      title: "AVG: elke nacht oude gegevens opschonen (bewaartermijnen)",
      why: avgOk
        ? "De opschoning draait elke nacht om 03:40 en haalt gegevens na hun bewaartermijn weg of kort ze in, zoals de privacyverklaring belooft (onder meer selfies van de ID-controle na 30 dagen, oude GPS-punten en verlopen resetcodes). Deze taak vinkt zichzelf af zolang dat lukt."
        : "De opschoning hoort elke nacht om 03:40 te draaien en haalt gegevens na hun bewaartermijn weg of kort ze in, zoals de privacyverklaring belooft. ZekerFlex zag het afgelopen etmaal geen geslaagde run, dus de bewaarregels worden nu niet afgedwongen.",
      how: [
        "Kijk in Admin → Systeem → Taken bij 'AVG-bewaartermijnen (opruimen)' wanneer hij laatst draaide en of dat lukte.",
        "Draait hij niet of mislukt hij: zeg het tegen Claude; die zoekt het uit in het foutenlogboek en de cron-container.",
        "Deze taak vinkt zichzelf af zodra de nachtelijke run weer lukt.",
      ],
      auto: true,
      done: avgOk,
      doneNote: avgOpschoning?.lastRunAt
        ? `${avgOpschoning.lastRunOk ? "laatst gedraaid" : "laatste run mislukt"} op ${new Date(avgOpschoning.lastRunAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" })}`
        : "nog geen run gezien",
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
      done: !BANK_AAN || products.some((p) => p.active && p.insurer.trim()),
      ...(!BANK_AAN ? { doneNote: BANK_UIT } : {}),
    },
    {
      id: "bank-name",
      group: "Juridisch",
      title: "Naam 'ZekerFlex Bank' juridisch laten toetsen",
      why: "Het woord 'bank' is in Nederland beschermd (Wft). Je hebt dit risico bewust geaccepteerd; laat het toetsen voordat je er groot mee adverteert.",
      how: ["Laat een jurist of compliance-adviseur kijken naar naam en opzet (gelden op Stripe, geen eigen bankvergunning)."],
      auto: !BANK_AAN,
      ...(!BANK_AAN ? { done: true, doneNote: BANK_UIT } : m("bank-name")),
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
      id: "mail-microsoft",
      group: "Beheer & veiligheid",
      title: "Bevestigingsmail bij Hotmail en Outlook: DMARC en Microsoft-meldingen aanzetten",
      why: "Bij Hotmail en Outlook blijft een account vaker onbevestigd (6 van 16 in 30 dagen) dan bij Gmail (3 van 46), terwijl de mail overal door onze mailserver is geaccepteerd. Het domein zekerflex.com heeft geen DMARC-record, en Microsoft kijkt daar streng naar. Met de gratis meldingen van Microsoft zie je of mail daar in de spam belandt.",
      how: [
        "Zet bij TransIP in de DNS van zekerflex.com een TXT-record met naam _dmarc en waarde: v=DMARC1; p=none; rua=mailto:postmaster@zekerflex.com. Begin met p=none; pas na een paar weken zonder problemen p=quarantine.",
        "Meld het verzendende adres aan bij Microsoft SNDS (sendersupport.olc.protection.outlook.com/snds) en JMRP (sendersupport.olc.protection.outlook.com/pm/junk-mail-reporting-program.aspx). Beide zijn gratis en tonen of Microsoft onze mail als spam ziet.",
        "Kom je er niet uit: zeg het tegen Claude. Die controleert daarna het DMARC-record en de aflevering.",
      ],
      auto: true,
      done: dmarc !== null || Boolean(manual["mail-microsoft"]),
      ...(dmarc !== null
        ? { doneNote: `DMARC staat (p=${dmarc}); of SNDS en JMRP zijn aangemeld kan deze lijst niet zien${dmarc === "none" ? "; na een paar weken zonder problemen p=quarantine" : ""}` }
        : { eerst: { reden: "bezorging" }, ...m("mail-microsoft") }),
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
      id: "social-meta",
      group: "Vindbaarheid & app",
      title: "Facebook en Instagram koppelen (Admin → Sales & groei → Sociale media)",
      why: "Zonder koppeling zet ZekerFlex berichten voor sociale media alleen klaar en plaats jij ze zelf. Met een paginatoken van Meta (gratis, geen goedkeuring nodig voor je eigen pagina) plaatst ZekerFlex goedgekeurde berichten zelf op Facebook en Instagram.",
      how: [
        "Maak een Facebook-bedrijfspagina en zet het Instagram-account om naar zakelijk, gekoppeld aan die pagina.",
        "Maak op developers.facebook.com een app (blijft in ontwikkelmodus) en voeg jezelf toe als beheerder.",
        "Maak in de Graph API Explorer een paginatoken met pages_manage_posts, pages_read_engagement, pages_manage_engagement, instagram_content_publish en instagram_manage_comments, en plak dat bij Sociale media → Kanalen. Zet daarna in dat scherm de autopilot aan (staat standaard aan) en kijk bij Reacties of er iets binnenkomt.",
      ],
      auto: false,
      ...m("social-meta"),
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
      why: "De 3D-kaart (vraag en aanbod per regio) staat op zekerflex.com/open-diensten/3d en is gelinkt vanaf de pagina Open diensten ('Bekijk vraag en aanbod in 3D'). Op de homepage komt hij alleen na jouw ja.",
      how: ["Wil je hem ook op de homepage? Zeg het tegen Claude.", "Bekijk zekerflex.com/open-diensten/3d op je telefoon en op een computer als je hem nog niet zag."],
      // achterhaald (13 nov): de keuze is gemaakt, de kaart staat op de pagina Open diensten (app/(marketing)/open-diensten/page.tsx)
      auto: true,
      done: true,
      doneNote: "staat op de pagina Open diensten; homepage alleen op verzoek",
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
      // achterhaald (13 nov): versie 1.0.5 vervangt 1.0.3; de stappen staan bij de taak 'app-105'
      auto: true,
      done: true,
      doneNote: "vervangen door de taak voor app 1.0.5 (hieronder)",
    },
    {
      id: "app-105",
      group: "Vindbaarheid & app",
      title: "Nieuwe Android-app 1.0.5 (chip lezen, meldingen van Google opgelost) in Google Play zetten",
      why: "Versie 1.0.5 kan met NFC de chip van een paspoort of ID-kaart lezen en vraagt eerst 'Ben jij dit?' met de naam van het account. Ook zijn de meldingen van Google Play bij 1.0.2 opgelost: het scherm loopt door tot de randen (Android 15) en de app draait mee op tablets en vouwtelefoons (Android 16). Aan de website verandert niets.",
      how: [
        "Wacht met uploaden tot Claude meldt dat de servercode van het chiplezen live staat (die geeft de naam bij 'Ben jij dit?'). Zonder die code toont de app een vraagteken in plaats van de naam.",
        "Het bestand staat op je bureaublad: ZekerFlex-app-1.0.5.aab (versiecode 6, ondertekend met dezelfde sleutel als de vorige versies). Hetzelfde bestand staat in de map android-twa als ZekerFlex-1.0.5-v6.aab.",
        "Zet hem eerst alleen bij Interne tests (alleen voor jou): play.google.com/console → ZekerFlex → Testen → Interne tests → Nieuwe release maken, en sleep het bestand erin.",
        "Releasenotitie: 'Nieuw: lees de chip van je ID-kaart of paspoort met je telefoon. De app werkt nu ook goed op tablets en liggend.' Dan Opslaan → Release beoordelen → Uitrollen. NFC is geen gevoelige toestemming, er is geen extra verklaring nodig.",
        "Productie (of Gesloten testen voor andere testers) pas als Claude meldt dat de chipcontrole op de server helemaal klaar is: Productie → Nieuwe release → Toevoegen uit bibliotheek → versie 6.",
        "Kan een melding over 'verouderde API's' blijven staan? Die komt uit een onderdeel van Google zelf (androidbrowserhelper), niet uit onze code, en houdt de release niet tegen.",
        "Wil je dat Claude een volgende versie zelf uploadt: koppel Google Play (taak 'Google Play koppelen', Admin → Google Play) en geef dat serviceaccount in Play Console bij Gebruikers en rechten toegang tot ZekerFlex met het recht om releases te beheren.",
        "Staat de app openbaar in de Play Store (Productie)? Laat het Claude weten: dan kan in de ID-scan in een Android-browser de regel 'Met de ZekerFlex-app voor Android gaat het sneller via de chip van je document' terug, met een link naar de app. Tot dan beloven we die chip in de browser niet (13 nov).",
        "Vink deze taak af zodra de release in Google Play live staat.",
      ],
      auto: false,
      ...m("app-105"),
    },
    {
      id: "forgejo-inloggen",
      group: "Beheer & veiligheid",
      title: "Inloggen op je eigen Git-server (Forgejo) en je wachtwoord kiezen",
      why: "ZekerFlex heeft een eigen GitHub op de eigen server: een kopie van alle code die elke 10 minuten bijwerkt, gratis en zonder GitHub nodig te hebben. Alleen accounts die Claude aanmaakt kunnen erin; niemand kan zich zelf aanmelden.",
      how: [
        "Ga naar git.37-97-226-24.sslip.io en log in met gebruiker 'eigenaar'.",
        "Het eenmalige wachtwoord staat op de server in /root/forgejo-eigenaar.txt. Lezen: TransIP-controlepaneel → je VPS → Console, inloggen en dan: sudo cat /root/forgejo-eigenaar.txt. Claude gaf het je op 10 november ook in de chat.",
        "Bij de eerste keer inloggen kies je een nieuw wachtwoord; zet dat in je wachtwoordmanager.",
        "Wis daarna het bestand, in dezelfde console: sudo rm /root/forgejo-eigenaar.txt.",
        "Je code staat onder zekerflex → zekerflex-finale. Vink deze taak af als je bent ingelogd en het bestand weg is.",
      ],
      auto: false,
      ...m("forgejo-inloggen"),
    },
    {
      id: "ios-app",
      group: "Vindbaarheid & app",
      title: "ZekerFlex in de App Store (iPhone): Apple-ontwikkelaarsaccount en sleutels",
      why: "De iPhone-app staat klaar (map ios-app): de site in app-modus met pushmeldingen via Apple, het chiplezen van je ID-kaart via NFC en passkeys. Digitale abonnementen en inloggen met Google staan in de iPhone-app uit, zoals Apple eist. Bouwen gebeurt op een Mac in de cloud, dus je hebt zelf geen Mac nodig.",
      how: [
        "Neem het Apple Developer Program (€ 99 per jaar) op developer.apple.com, het liefst als organisatie op naam van Zekerflex, Inc. Daarvoor is een D-U-N-S-nummer nodig: gratis, Apple helpt bij het aanvragen, het duurt meestal 1 à 2 weken.",
        "Maak daarna in App Store Connect bij Gebruikers en toegang → Integraties → App Store Connect API een teamsleutel met de rol App Manager. Geef Claude het .p8-bestand, de Key ID en de Issuer ID, plus de Team ID (Membership-pagina).",
        "Maak ook bij Certificates, Identifiers & Profiles → Keys een sleutel met 'Apple Push Notifications service' en geef Claude dat .p8-bestand en de Key ID. Claude zet die op de server (APNS_*, APPLE_TEAM_ID).",
        "Bouwen gebeurt bij Codemagic (gratis tot 500 minuten per maand): maak een account op codemagic.io (inloggen met GitHub), voeg de repository toe en zet bij Integrations → App Store Connect dezelfde sleutel met de naam ZekerFlex. Claude maakt eerst het App-ID met de juiste rechten aan; daarna klik je in Codemagic bij Code signing identities → iOS certificates op Generate certificate. Claude zorgt voor het profiel en start de bouw; de app komt in TestFlight.",
        "Heb je een iPhone? Installeer TestFlight en test de app eerst zelf (inloggen, meldingen, chip lezen). Daarna vult Claude de gegevens voor de App Store in en stuur jij hem ter keuring in.",
        "Vink deze taak af zodra de app in de App Store staat.",
      ],
      auto: false,
      ...m("ios-app"),
    },
    {
      id: "apple-inloggen",
      group: "Vindbaarheid & app",
      title: "Inloggen met Apple aanzetten (site en iPhone-app)",
      why: "Met de knop 'Inloggen met Apple' maakt iemand met een iPhone in twee tikken een account, zonder wachtwoord. In de iPhone-app is het de enige snelle inlog: Google weigert inloggen in een app-venster. De knop staat klaar en verschijnt vanzelf zodra de sleutel op de server staat.",
      how: [
        "Ga naar developer.apple.com → Certificates, Identifiers & Profiles → Identifiers en open het App ID com.zekerflex.app. Vink 'Sign in with Apple' aan (Enable as a primary App ID) en klik op Save.",
        "Klik bij Identifiers op + → Services IDs → Continue. Beschrijving: ZekerFlex web, Identifier: com.zekerflex.web → Continue → Register.",
        "Open com.zekerflex.web, vink 'Sign in with Apple' aan en klik op Configure. Primary App ID: com.zekerflex.app. Domains and Subdomains: zekerflex.com. Return URLs: https://zekerflex.com/api/auth/callback/apple. Klik op Next, Done, Continue en Save.",
        "Ga naar Keys → + . Naam: zekerflex inloggen. Vink 'Sign in with Apple' aan, klik op Configure, kies com.zekerflex.app en klik op Save → Continue → Register. Download het .p8-bestand (dat kan maar één keer) en noteer de Key ID.",
        "Zet het .p8-bestand in de map Documenten\\apple-sleutels op je pc, niet in de chat. Claude zet het met de Services ID en de Key ID op de server (APPLE_SIWA_SERVICES_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_KEY_P8).",
        "Zodat mail aankomt bij wie 'Verberg mijn e-mailadres' kiest: ga naar Services → Sign in with Apple for Email Communication → Configure en voeg het domein zekerflex.com en het adres noreply@zekerflex.com toe. Anders stuurt Apple onze mail niet door.",
        "Deze taak vinkt zichzelf af zodra de sleutel op de server staat en klopt; na de volgende uitrol staat de knop op /login en /register.",
      ],
      auto: true,
      done: appleConfig() !== null,
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
      id: "netwerk-vpn-dns",
      group: "Bellen & koppelingen",
      title: "VPN-server (Headscale) een adres geven: vpn.zekerflex.com",
      why: "Het pakket 'Veilige werkplek (VPN)' werkt pas als de Tailscale-apps van klanten onze eigen VPN-server kunnen vinden. Die draait op de eigen server; hij heeft alleen een naam nodig.",
      how: [
        "Maak bij TransIP (of in Admin → Domeinen) een A-record vpn.zekerflex.com → 37.97.226.24 (en een AAAA-record als de server IPv6 heeft).",
        "Vraag Claude daarna de headscale-dienst aan te zetten (deploy/netwerk); de sleutels HEADSCALE_URL en HEADSCALE_API_KEY komen dan op de server.",
        "Deze taak vinkt zichzelf af zodra de koppeling werkt.",
      ],
      auto: true,
      done: Boolean(env.HEADSCALE_URL && env.HEADSCALE_API_KEY),
    },
    {
      id: "netwerk-radius",
      group: "Bellen & koppelingen",
      title: "Wifi-server (RADIUS) aanzetten voor 'Wifi op de werkvloer'",
      why: "Klanten die het wifi-pakket willen, zetten zich nu op de lijst. De wifi-server (FreeRADIUS) op de eigen server beslist per inlogpoging via het rooster of iemand mag; zonder die server kan niemand betalen of aansluiten.",
      how: [
        "Vraag Claude de freeradius-dienst aan te zetten (deploy/netwerk) en de poort 1812/udp open te zetten op de server (de VPN-relay gebruikt 3490/udp).",
        "De sleutel NETWERK_RADIUS_TOKEN komt dan in .env.production; deze taak vinkt zichzelf af.",
      ],
      auto: true,
      done: Boolean(env.NETWERK_RADIUS_TOKEN),
    },
    {
      id: "netwerk-5g",
      group: "Bellen & koppelingen",
      title: "Eigen 5G-netwerk: vergunning en apparatuur regelen vóór de eerste klant",
      why: "Een eigen 5G-netwerk op een terrein vraagt een lokale frequentievergunning (3,5 GHz) van de Rijksinspectie Digitale Infrastructuur per locatie, plus apparatuur ter plaatse (antenne/small cell en simkaarten). De software (Open5GS) is gratis en draait op de eigen server; de vergunning en apparatuur kosten wel geld en tijd. Aanvragen van klanten komen binnen als lead (Admin → Pijplijn) en op Admin → Verbinding.",
      how: [
        "Lees op rdi.nl hoe een lokale vergunning in de 3,5 GHz-band werkt (aanvraag per locatie, jaarlijkse kosten).",
        "Kies een leverancier voor small cells en simkaarten (bijvoorbeeld via een Nederlandse integrator) en spreek een inkoopprijs af; die rekenen we door met een opslag.",
        "Vink af als je weet hoe je de eerste aanvraag oppakt.",
      ],
      auto: false,
      ...m("netwerk-5g"),
    },
    {
      id: "webshop-leverancier",
      group: "Bellen & koppelingen",
      title: "Een leverancier kiezen die de webshop automatisch van producten kan voorzien (AliExpress of een dropshipper)",
      why: "Je wilt producten van bijvoorbeeld AliExpress met foto en omschrijving in je webshop zetten. Een link plakken werkt daar niet: AliExpress, Temu en Amazon geven een programma een lege pagina (gemeten 13 november). Het kan wel via de officiële koppeling van een leverancier, en daarvoor is een account op jouw naam nodig. Tot die tijd werkt Winkel-AI met een link van een gewone leverancier of met geplakte tekst.",
      how: [
        "Kies één leverancier om mee te beginnen: AliExpress (koppeling voor webwinkels, aanmelden als ontwikkelaar op hun Open Platform) of een dropshipper met een magazijn in Europa, zoals CJdropshipping (sneller leveren, minder gedoe met invoer).",
        "Maak daar een account aan en vraag de sleutel voor de koppeling aan (bij CJdropshipping: My CJ, Authorization, API). Kijk of het gratis is voordat je iets afsluit.",
        "Geef de sleutel aan Claude; die sluit hem aan op Winkel-AI, zodat een product met foto, omschrijving en inkoopprijs als uitgezet concept in je webshop komt.",
        "Let op: wie producten van buiten Europa hier verkoopt is zelf verantwoordelijk voor veiligheid en keurmerken (zeker bij speelgoed), en foto's zijn van de leverancier.",
        "Vink af als de sleutel bij Claude ligt.",
      ],
      auto: false,
      ...m("webshop-leverancier"),
    },
    {
      id: "locatie-prijzen",
      group: "Bellen & koppelingen",
      title: "Prijzen bepalen voor de Op locatie-modules (portofoon, toegang op kenteken, sleutelkluis, badges printen)",
      why: "De vier modules staan klaar en werken; een bedrijf zet ze aan onder Werkgever → Op locatie. Omdat er nog geen prijs is, staat op de site 'op aanvraag' en komt elke eerste activering bij een betalend bedrijf als lead in de pijplijn. Met een prijs per module per maand (of per vestiging) kan het net als de netwerkpakketten via een abonnement lopen.",
      how: [
        "Kijk op Admin → Op locatie welke bedrijven wat aanzetten en hoe vaak ze het gebruiken.",
        "Kies per module een maandprijs (bijvoorbeeld per vestiging) en geef die aan Claude; de koppeling met Stripe bestaat al voor de netwerkpakketten en kan worden hergebruikt.",
        "Vink af als de prijzen op de site staan.",
      ],
      auto: false,
      ...m("locatie-prijzen"),
    },
    {
      id: "locatie-toegang-kastje",
      group: "Bellen & koppelingen",
      title: "Een toegangskastje samenstellen voor de eerste klant met kentekenherkenning",
      why: "'Toegang op kenteken' beslist op het rooster, maar het lezen van het kenteken en het aansturen van de slagboom gebeurt op het terrein zelf: een klein kastje (Raspberry Pi 4 of mini-pc) met de camera en een relais. De software ervoor staat klaar (deploy/toegang, gratis), de apparatuur niet.",
      how: [
        "Koop een Raspberry Pi 4 (4 GB) of mini-pc, een IP-camera met RTSP (bijvoorbeeld Reolink of Hikvision, gericht op de inrit) en een usb-relaisbord voor de slagboom.",
        "Volg deploy/toegang/README.md: token maken onder Werkgever → Op locatie → Toegang, invullen, starten. Test met 'Proef met een kenteken' in dat scherm.",
        "Vink af als het eerste kastje bij een klant draait.",
      ],
      auto: false,
      ...m("locatie-toegang-kastje"),
    },
    {
      id: "locatie-printer",
      group: "Bellen & koppelingen",
      title: "Een labelprinter kiezen en de printagent proberen",
      why: "'Badges en labels printen' werkt vanuit de browser (afdrukpagina of Bluetooth) en via de printagent op een computer op locatie (deploy/printen). Om klanten een werkend advies te geven moet één printer echt getest zijn.",
      how: [
        "Koop een Brother QL-820NWB (62 mm, wifi en Bluetooth) of een goedkope 58 mm Bluetooth-bonprinter (ESC/POS).",
        "Maak een printopdracht onder Werkgever → Op locatie → Badges en labels en print hem via de afdrukpagina, via Bluetooth vanaf een telefoon (Chrome op Android) en via de printagent.",
        "Vink af als een badge netjes uit de printer komt.",
      ],
      auto: false,
      ...m("locatie-printer"),
    },
    {
      id: "locatie-portofoon-proef",
      group: "Bellen & koppelingen",
      title: "De portofoon één keer proberen met twee telefoons op mobiel internet",
      why: "De portofoon gebruikt dezelfde spraakverbinding als bellen in de chat (met onze eigen TURN-server als tussenstation). Op kantoor-wifi werkt dat; een echte test met twee telefoons op 4G/5G op een locatie laat zien of het ook daar vlot genoeg is.",
      how: [
        "Zet 'Portofoon in de app' aan onder Werkgever → Op locatie en open op twee telefoons het kanaal van een vestiging (Werkgever → Op locatie → Portofoon, of in de werker-app via Account → Portofoon).",
        "Houd de knop ingedrukt en praat; de ander moet je binnen een seconde horen. Laat ook een spraakbericht achter als een van de twee het kanaal verlaat.",
        "Vink af als het goed werkt; meld anders aan Claude wat je hoorde (haperen, vertraging, geen geluid).",
      ],
      auto: false,
      ...m("locatie-portofoon-proef"),
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
      id: "smtp",
      group: "Beheer & veiligheid",
      title: "Mail echt laten versturen (SMTP)",
      why: "Zonder SMTP-instellingen worden mails (codes, welkomstmails, facturen, herinneringen) alleen in Admin → Mail bewaard en komen ze nooit bij gebruikers aan.",
      how: ["Pak de SMTP-gegevens van je mailprovider (bijv. TransIP, Mailgun, Postmark of je eigen mailserver): host, poort, gebruikersnaam, wachtwoord.", "Geef ze aan Claude; die zet SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en MAIL_FROM (bijv. no-reply@zekerflex.com) op de server.", "Controleer in Admin → Mail dat nieuwe mails als 'verstuurd' staan in plaats van alleen 'opgeslagen'."],
      auto: true,
      done: Boolean(process.env.SMTP_HOST?.trim()),
    },
    {
      id: "chip-csca",
      group: "Beheer & veiligheid",
      title: "Overheidscertificaten (CSCA) voor het chiplezen op de server zetten",
      why: "De Android-app kan de chip van een paspoort of ID-kaart lezen. De server controleert dan of de gegevens door de overheid zijn ondertekend. De laatste schakel is het certificaat van de overheid zelf (CSCA). Zonder die bestanden is een chip nooit 'echt bevonden' en kijkt er altijd een medewerker mee.",
      how: [
        "Wacht met de certificaten tot Claude meldt dat de controle van de chip klaar is (de review van 9 november vroeg nog een paar reparaties). Zolang er geen CSCA staat, telt een chip nooit als echt.",
        "Eerst ALLEEN de Nederlandse CSCA-certificaten (RvIG, zoek op 'CSCA certificaten'), niet de ICAO-masterlijst: het land van de ondertekenaar wordt nog niet tegen de gegevens op de chip gecontroleerd en er is nog geen intrekkingslijst (CRL).",
        "Geef de bestanden (.pem, .crt, .cer of .der) aan Claude. Die zet ze in de map storage/csca van de app (het opslagvolume, blijft bij een uitrol staan).",
        "Daarna eerst testen met een echte Nederlandse chip (je eigen ID-kaart, via app 1.0.5 bij Interne tests) voordat werkers het zien.",
        "Deze taak vinkt zichzelf af zodra er een Nederlands CSCA-certificaat staat.",
      ],
      auto: true,
      done: (csca?.landen ?? []).includes("NL"),
      ...(csca ? { doneNote: `${csca.aantal} certificaten${csca.landen.length ? `, landen: ${csca.landen.join(", ")}` : ""}` } : {}),
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
      id: "stripe-betalen-uit",
      group: "Geld & bank",
      title: stripeDicht
        ? `Stripe ontvangt geen betalingen meer${stripeStand?.uitSinds ? ` sinds ${new Date(stripeStand.uitSinds).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" })}` : ""}`
        : "Stripe-account: betalingen en uitbetalingen staan aan",
      why: stripeDicht
        ? `${betalenUitVoorzin(stripeStandUitBeheer)}Het live Stripe-account (de stichting) ${!stripeStand?.betalen ? "kan geen betalingen ontvangen" : ""}${!stripeStand?.betalen && !stripeStand?.uitbetalen ? " en " : ""}${!stripeStand?.uitbetalen ? "betaalt niet uit" : ""}. Daardoor werkt inloggen bij de bank (iDEAL) voor werkers niet; ZekerFlex toont hun meteen het bankafschrift. Ook betalingen via Stripe elders (webshop, facturen, abonnementen, domeinen) lukken niet zolang dit zo is.`
        : "ZekerFlex kijkt elke 15 minuten of het live Stripe-account betalingen kan ontvangen en uitbetalen. Staat dat uit, dan krijg je meteen een melding en opent deze taak zich met wat je moet doen.",
      how: [
        "Log in op dashboard.stripe.com met het live account en lees de melding bovenaan (bijvoorbeeld: account onder controle, gegevens of documenten nodig).",
        "Vul aan wat Stripe vraagt bij Instellingen → Bedrijfsgegevens of bij de melding zelf.",
        "Staat er geen melding of is het onduidelijk: neem contact op met Stripe (support.stripe.com/contact) en vraag waarom betalingen en uitbetalingen zijn uitgezet.",
        "Deze taak vinkt zichzelf af zodra ZekerFlex ziet dat betalingen weer aan staan (binnen 15 minuten).",
      ],
      auto: true,
      ...(betalenEerst ? { eerst: betalenEerst } : {}),
      done: !stripeDicht,
      ...(stripeStand ? { doneNote: `laatst gemeten ${new Date(stripeStand.gemeten).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" })}` } : {}),
    },
    {
      id: "stripe-identity-account",
      group: "Geld & bank",
      title: "Stripe weigert de ID-controle via Stripe (Stripe Identity) voor het live account",
      why: stripeWeigering
        ? `Stripe zei op ${new Date(stripeWeigering.op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" })}: "${stripeWeigering.melding}". Werkers kunnen hun ID dan niet via Stripe laten controleren, en de uitslag van lopende Stripe-controles komt niet binnen. ZekerFlex verbergt de knop 'Snel via Stripe' en probeert het 24 uur niet opnieuw; werkers gebruiken intussen de eigen ID-scan van ZekerFlex.`
        : "Weigert Stripe de ID-controle voor het hele account (bijvoorbeeld omdat Identity niet aanstaat voor het live account van de stichting, of het account beperkt is), dan verschijnt deze taak met de melding van Stripe. ZekerFlex stopt dan 24 uur met proberen.",
      how: [
        "Log in op dashboard.stripe.com met het live account (de stichting) en kijk bovenaan en bij Instellingen of Stripe een melding geeft: account beperkt, gegevens nodig, of Identity niet geactiveerd.",
        "Staat Identity niet aan: zoek in het dashboard 'Identity' en rond de activering af. Vraagt Stripe om gegevens of documenten: vul die aan.",
        "Kom je er niet uit: neem contact op met Stripe (support.stripe.com/contact) en geef de melding hierboven door.",
        "Wil je de ID-controle via Stripe niet meer gebruiken: zeg het tegen Claude, die zet STRIPE_IDENTITY_ENABLED op false. De eigen ID-scan van ZekerFlex blijft gewoon werken.",
        "Deze taak vinkt zichzelf af zodra Stripe 24 uur niet meer heeft geweigerd (na 24 uur probeert ZekerFlex het opnieuw).",
      ],
      auto: true,
      done: stripeWeigering === null,
      ...(stripeWeigering ? {} : { doneNote: "Stripe weigerde de afgelopen 24 uur niet" }),
    },
    {
      id: "stripe-identity-fotos",
      group: "Beheer & veiligheid",
      title: "Foto's van Stripe-controles in het beheer zien (beperkte Stripe-sleutel)",
      why: "De meeste werkers verifiëren zich via Stripe. Hun voorkant, achterkant en selfie staan dan bij Stripe, en Stripe geeft die alleen aan een aparte, beperkte sleutel. Zonder die sleutel zie je in Admin → Gebruikers bij zo'n werker geen ID-foto's en geen selfie in het rondje bovenaan.",
      how: [
        "Stripe-dashboard → Ontwikkelaars → API-sleutels → 'Beperkte sleutel maken' (dashboard.stripe.com/apikeys/create), in de live-modus.",
        "Rechten: Identity Verification Results op Lezen, Recent Detailed Verification Results op Lezen en Files op Schrijven. De rest blijft op Geen.",
        "Ook controles van langer dan 48 uur geleden zien: bij de sleutel 'IP-beperkingen beheren' → 37.97.226.24 (onze server), daarna ook All Detailed Verification Results op Lezen.",
        "Open in Admin → Gebruikers een werker die via Stripe is gecontroleerd, klik bij Identiteitscontroles op 'Instellen' en plak de sleutel (rk_live_…). Hij wordt eerst bij Stripe gecontroleerd en daarna verzegeld bewaard. Deze taak vinkt zichzelf dan af.",
      ],
      auto: true,
      done: stripeFotoSleutel !== null,
      ...(stripeFotoSleutel ? { doneNote: `sleutel eindigt op ${stripeFotoSleutel.eind}, gezet door ${stripeFotoSleutel.door}` } : {}),
    },
    {
      id: "zfmail-opheffen",
      group: "Beheer & veiligheid",
      title: "ZekerFlex Mail-adres opheffen bij TransIP",
      why: "Het account van een werkgever met een eigen ZekerFlex-mailadres is gewist (AVG). In ZekerFlex staat de mailbox al op geblokkeerd, zonder naam of herstel-adres, en het adres blijft vergrendeld. De mailbox zelf bestaat bij TransIP nog en kan nog mail ontvangen.",
      how: [
        "Log in bij TransIP → Domeinen → zekerflex.com → E-mail.",
        ...(zfMailOpheffen.length ? [`Hef deze mailbox(en) op: ${zfMailOpheffen.join(", ")}.`] : []),
        "Laat het adres in ZekerFlex staan zoals het is: zo kan niemand het opnieuw claimen. Deze taak vinkt zichzelf af zodra TransIP de mailbox niet meer heeft.",
      ],
      auto: true,
      done: zfMailOpheffen.length === 0,
    },
    {
      id: "internal-cron-token",
      group: "Beheer & veiligheid",
      title: "INTERNAL_CRON_TOKEN vernieuwen",
      why: "Met deze sleutel roept de cron-container de interne taken van de app aan (de nachtelijke rondgang, orchestratie, herinneringen). De waarde is op 13 november buiten de server zichtbaar geweest, alleen op de eigen pc en niet naar buiten. Vernieuwen is veiliger. Doe het overdag, met tijd om na te kijken: zolang app en cron niet dezelfde nieuwe waarde hebben, krijgen de taken een 401 en lopen ze niet.",
      how: [
        "Kijk eerst wie de sleutel gebruikt: in de map van ZekerFlex op de server `grep -rl INTERNAL_CRON_TOKEN .` (alleen bestandsnamen). Verwacht: de app en de cron-container. Gebruikt een eigen script of de laptop hem ook, zet de nieuwe waarde daar mee.",
        "Maak een kopie: `sudo cp -p .env.production .env.production.voor-token`.",
        "Maak een nieuwe waarde (`openssl rand -hex 32`) en zet die met sudo op de regel INTERNAL_CRON_TOKEN= in .env.production. Druk de waarde of het bestand nooit af.",
        "Start alleen app en cron opnieuw: `sudo docker compose -f docker-compose.vps.yml --env-file .env.production up -d --no-deps app cron`.",
        "Controleer met één rondgang: laat Claude de rondgang één keer via de cron-container aanroepen. In Beheer → Systeem → Taken staat dan een nieuwe uitslag, de hartslagen blijven groen en het foutenlogboek toont geen 401 van /api/internal.",
        "Werkt alles, vink dit dan af en verwijder de kopie `.env.production.voor-token` (sudo rm). Werkt het niet, zet dan de kopie terug en start app en cron opnieuw.",
      ],
      auto: false,
      ...m("internal-cron-token"),
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
      id: "efactuur-platform",
      group: "Geld & bank",
      title: "Bedrijfsgegevens voor e-facturen (UBL / Peppol) invullen",
      why: "Elke factuur is nu ook een e-factuur die boekhoudpakketten direct inlezen. Op de platformfacturen (platformkosten, uitzendfacturen) staat ZekerFlex als verkoper: daarvoor zijn het KVK-nummer, btw-nummer en adres nodig. Zonder die gegevens werkt downloaden en mailen wel, maar verzenden via het Peppol-netwerk niet.",
      how: [
        "Zekerflex, Inc. (Delaware) heeft geen KVK-nummer en (nog) geen Nederlands btw-nummer. Vraag eerst de accountant of er een Nederlands btw-nummer of een Nederlandse vestiging komt; pas daarna kan dit.",
        "Geef Claude dan het KVK-nummer (als er een Nederlandse vestiging is), het btw-nummer (NL…B01) en het vestigingsadres; die worden PLATFORM_KVK, PLATFORM_VAT, PLATFORM_STREET, PLATFORM_POSTAL_CODE en PLATFORM_CITY op de server.",
        "Wil je echt via Peppol versturen? Kies dan een Peppol-toegangspunt (zelf hosten met Oxalis/phase4 vraagt een OpenPeppol-certificaat; een Nederlandse dienst zoals eConnect, Storecove of Tradeinterop geeft een API-sleutel). Geef Claude de URL en sleutel (PEPPOL_AP_URL, PEPPOL_AP_TOKEN) en ons Peppol-adres (PEPPOL_SENDER_ID, meestal 0106:KVK-nummer).",
        "Tot die tijd gaan e-facturen per mail als UBL-bijlage; bedrijven zetten dat zelf aan onder Werkgever → Facturen → E-facturen.",
      ],
      auto: true,
      done: platformPartij().compleet,
      ...(platformPartij().compleet ? {} : { doneNote: "KVK, btw-nummer of adres ontbreekt nog" }),
    },
    {
      id: "piper-stem",
      group: "Beheer & veiligheid",
      title: "Eigen stem aanzetten (Piper), zodat voorlezen niets meer kost",
      why: "De AI-console, de AI-beller en de stem onder een video liepen via Google Text-to-Speech, dat per teken afrekent. Piper is een klein spraakmodel dat op onze eigen VPS draait: geen sleutel, geen kosten per keer, en de tekst verlaat onze server niet.",
      how: [
        "Dit staat aan sinds 6 november: de piper-container draait met de Nederlandse stem nl_BE-nathalie-medium en in Admin → Alles gratis staat 'Tekst naar spraak' op 'van ons zelf'.",
        "Luister een keer of de stem je bevalt (Admin → ZekerFlex AI, laat een antwoord voorlezen). Een andere stem? Vraag Claude; de lijst staat in deploy/piper/haal-stem.sh.",
        "Wil je toch weer Google: Admin → Alles gratis → Tekst naar spraak → 'Betaalde dienst'.",
      ],
      auto: true,
      done: Boolean(env.PIPER_URL),
      ...(env.PIPER_URL ? {} : { doneNote: "PIPER_URL nog niet gezet" }),
    },
    {
      id: "apm-glitchtip",
      group: "Beheer & veiligheid",
      title: "Fouten en prestaties bewaken met eigen GlitchTip en Grafana",
      why: "De site meet nu zelf hoe lang elk verzoek en elke databasequery duurt (Admin → Prestaties) en bewaart fouten in het eigen logboek. Dat geheugen begint bij elke uitrol opnieuw. Een eigen GlitchTip (open source, zoals Sentry) en Grafana op dezelfde server bewaren de geschiedenis, met zoeken en meldingen, zonder abonnement.",
      how: [
        "Zeg tegen Claude: 'zet GlitchTip en Grafana aan'. Hij start de extra containers uit infra/docker/docker-compose.observability.yml (±600 MB geheugen; de VPS heeft 16 GB), maakt een beheerder aan en zet GLITCHTIP_DSN in .env.production.",
        "Kies een adres (bijv. fouten.zekerflex.com en grafana.zekerflex.com, beide alleen voor jou met wachtwoord) of laat ze intern; Claude zet de Caddy-regel erbij.",
        "Daarna komt elke nieuwe soort fout vanzelf in GlitchTip en zie je in Grafana de responstijden per route en het geheugen van de server.",
      ],
      auto: true,
      done: Boolean(env.GLITCHTIP_DSN),
      ...(env.GLITCHTIP_DSN ? {} : { doneNote: "GLITCHTIP_DSN nog niet gezet" }),
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
      title: "Versleutelde kopie van de back-ups buiten de server",
      why: "De nachtelijke back-ups staan op dezelfde server als de site. Gaat die server stuk of wordt hij gehackt, dan ben je de back-ups ook kwijt. De server kan elke nacht zelf een versleutelde kopie wegzetten en controleert bij de wekelijkse hersteltest of die kopie er echt staat en te ontcijferen is.",
      how: [
        "Kies een plek: een eigen reserveserver (scp) of WebDAV-opslag zoals TransIP STACK, Hetzner Storage Box of Nextcloud (gratis of een paar euro per maand). Geef Claude het adres en de inloggegevens.",
        "Claude zet in .env.production op de VPS: BACKUP_PASSPHRASE (een lange wachtwoordzin; bewaar die óók in je wachtwoordmanager, want zonder is de kopie waardeloos) en BACKUP_OFFSITE (scp://gebruiker@host/pad of https://host/pad/), en herstart de back-updienst.",
        "Of zonder extra dienst: je eigen pc haalt elke dag de versleutelde kopie op (een eigen sleutel die alleen mag ophalen, en een taak in Taakplanner; deploy/backup/OPHALEN.md). Dan is alleen BACKUP_PASSPHRASE nodig.",
        "Dit item vinkt zichzelf af zodra de nachtelijke kopie slaagt. De hersteltest (Admin → Systeem → Back-ups) bewijst daarna wekelijks dat de kopie klopt.",
      ],
      auto: true,
      eerst: { reden: "gegevens kwijt" },
      done: (backup?.status?.offsite?.ok === true || backup?.ophaal?.state === "ok") && backup?.status?.encrypted === true,
      ...(backup?.status?.offsite?.configured
        ? { doneNote: backup.status.offsite?.ok ? `laatste kopie gelukt naar ${backup.status.offsite?.target}` : `laatste kopie mislukt: ${backup.status.offsite?.error}` }
        : backup?.ophaal?.status
          ? { doneNote: `laatst naar de pc gehaald: set ${backup.ophaal.status.set}${backup.ophaal.state === "oud" ? " (te lang geleden)" : ""}` }
          : {}),
    },
    {
      id: "diensten-dns",
      group: "Beheer & veiligheid",
      title: "Eigen namen voor rapportages en kennisbank (bi. en kennis.zekerflex.com)",
      why: "Metabase (rapportages) en Outline (kennisbank) draaien op de eigen server en zijn nu bereikbaar op een technische naam (…sslip.io). Met twee DNS-regels krijgen ze een nette naam op zekerflex.com.",
      how: [
        "Zet bij je domeinbeheer twee A-records naar het IP van de VPS (37.97.226.24): bi.zekerflex.com en kennis.zekerflex.com.",
        "Zeg het tegen Claude; die zet METABASE_HOST en OUTLINE_HOST in .env.production en herstart de webserver. Certificaten komen vanzelf.",
      ],
      auto: true,
      done: (eigenNaam(env.METABASE_PUBLIC_URL) && eigenNaam(env.OUTLINE_PUBLIC_URL)) || Boolean(manual["diensten-dns"]),
      ...(eigenNaam(env.METABASE_PUBLIC_URL) && eigenNaam(env.OUTLINE_PUBLIC_URL) ? {} : { doneNote: "nog een technische naam (sslip.io)" }),
    },
    {
      id: "kennisbank-api",
      group: "Beheer & veiligheid",
      title: "Kennisbank: één keer inloggen en een API-sleutel maken",
      why: "De kennisbank (Outline) vult zichzelf met de handleidingen uit de code, maar daarvoor is een API-sleutel nodig die alleen een ingelogde beheerder kan maken.",
      how: [
        "Open Admin → AI & automatisering → Kennisbank en klik op het adres; log in met je ZekerFlex-account (de eerste wordt beheerder).",
        "In Outline: Instellingen → API-sleutels → Nieuwe sleutel. Plak hem in Admin → Kennisbank en klik 'Kennisbank vullen'.",
      ],
      auto: true,
      done: Boolean(kennisbank?.apiGezet && kennisbank.laatstGevuld) || Boolean(manual["kennisbank-api"]),
      ...(kennisbank?.apiGezet && !kennisbank.laatstGevuld ? { doneNote: "de sleutel staat erin; klik nog op 'Kennisbank vullen'" } : {}),
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
    {
      id: "websitevoorstellen-versturen",
      group: "Overig",
      title: unsent ? `${unsent} websitevoorstel${unsent === 1 ? " staat" : "len staan"} klaar om te versturen` : "Websitevoorstellen versturen",
      why: "ZekerFlex maakt websitevoorstellen voor leads, maar alleen een mens verstuurt ze. Een voorstel dat langer dan 2 dagen als concept blijft liggen, verloopt na 30 dagen zonder dat het bedrijf het ooit zag. Wie het maakte krijgt ook een pushmelding, maar alleen op een toestel met meldingen aan.",
      how: [
        "Open Beheer → Websitevoorstellen (of Sales → Websitevoorstellen).",
        "Bekijk het voorstel, kopieer de klaarstaande mailtekst, stuur hem vanuit je eigen mail en zet het voorstel op 'Verstuurd'.",
        "Past een voorstel niet (meer), trek het dan in. Deze taak vinkt zichzelf af als er geen voorstel meer ligt te wachten.",
      ],
      auto: true,
      done: unsent === 0,
      ...(unsent === null ? { doneNote: "kon de voorstellen nu niet tellen" } : {}),
    },
    {
      id: "bonnetjes-alias",
      group: "Beheer & veiligheid",
      title: "Alias bonnetjes@zekerflex.com aanmaken (bonnen per mail)",
      why: "Bonnetjes en inkoopfacturen kunnen per mail naar de boekhouding. Daarvoor stuurt een alias bonnetjes@zekerflex.com alles door naar info@zekerflex.com; ZekerFlex herkent aan het oorspronkelijke adres dat het een bonnetje is. Zonder alias komt zo'n mail gewoon als gewone mail binnen en wordt hij niet als bon gelezen. Alleen mail van afzenders op de lijst eigen afzenders (met geslaagde SPF en DKIM) wordt vanzelf geboekt; al het andere komt bij 'even kijken'.",
      how: [
        "Ga bij TransIP naar Domeinen → zekerflex.com → E-mail en maak een alias (doorstuuradres) bonnetjes@zekerflex.com dat doorstuurt naar info@zekerflex.com.",
        "Stuur een testbonnetje naar bonnetjes@zekerflex.com en kijk of het in de Postvak in van info@ aankomt.",
        "Het scherm om eigen afzenders te beheren en de bonnen na te kijken komt later; tot die tijd staat de lijst leeg en komt elke bon bij 'even kijken'.",
      ],
      auto: false,
      ...m("bonnetjes-alias"),
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

/**
 * Notities met precies dezelfde tekst (de orchestratie zette op 21, 27 okt en 1 nov dezelfde investering meerdere keren
 * neer): de id's van alle exemplaren behalve het oudste, zodat de eigenaar ze weg kan doen. Puur; verwijdert niets.
 */
export function dubbeleNotities(lijst: readonly CustomTodo[]): string[] {
  const eerste = new Map<string, CustomTodo>();
  const dubbel: string[] = [];
  for (const t of [...lijst].sort((a, b) => a.at.localeCompare(b.at))) {
    const sleutel = t.text.replace(/\s+/g, " ").trim().toLowerCase();
    const bestaand = eerste.get(sleutel);
    if (bestaand) dubbel.push(t.id);
    else eerste.set(sleutel, t);
  }
  return dubbel;
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

/** Ids die een mens in Te doen op klaar zette, zonder de (trage) automatische controles van ownerTodos(). */
export async function handmatigKlaar(): Promise<Set<string>> {
  return new Set(Object.keys((await kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")) ?? {}));
}
