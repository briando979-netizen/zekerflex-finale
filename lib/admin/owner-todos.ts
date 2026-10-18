import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { llmConfigProblem } from "@/lib/ai/client";
import { getStripeClient } from "@/lib/billing/stripe";
import { getProducts } from "@/lib/bank/insurance";

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
  group: "AI" | "Geld & bank" | "Juridisch" | "Overig";
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
  const [webhookOk, products] = await Promise.all([stripeIssuingWebhookOk(), getProducts().catch(() => [])]);
  const m = (id: string) => ({ done: Boolean(manual[id]), ...(manual[id] ? { doneNote: `afgevinkt door ${manual[id]!.by} op ${new Date(manual[id]!.at).toLocaleDateString("nl-NL")}` } : {}) });

  return [
    {
      id: "llm",
      group: "AI",
      title: "Eigen AI-server (taalmodel) aanzetten",
      why: "Zet Jarvis, de denkende AI-teams, herschrijven/vertalen in de chat, het volle specialistenadvies en nieuwe advertentievarianten aan.",
      how: ["Huur een server met GPU (bv. Hetzner GPU) en maak een subdomein ai.zekerflex.com met een A-record naar de server.", "Kopieer deploy/ai-node/setup.sh naar de server en draai: sudo bash setup.sh ai.zekerflex.com", "Zet de waarden die het script laat zien in Vercel → Settings → Environment Variables (Production) en klik Redeploy."],
      auto: true,
      done: !llmConfigProblem(),
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
