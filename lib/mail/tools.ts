import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Personal mail tools for the in-app mailboxes: reusable templates with
// placeholders and a signature that's appended when sending.
//   key "mail-tools:<userId>"
// ---------------------------------------------------------------------------

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}
export interface MailTools {
  signature: string;
  appendSignature: boolean;
  templates: MailTemplate[];
}

export const STARTER_TEMPLATES: MailTemplate[] = [
  { id: "bevestiging", name: "Dienst bevestigd", subject: "Bevestiging dienst {datum}", body: "Beste {naam},\n\nBedankt! Hierbij bevestig ik de dienst op {datum}. Meld je bij aankomst bij de receptie.\n\nMet vriendelijke groet," },
  { id: "uren", name: "Uren goedgekeurd", subject: "Je uren zijn goedgekeurd", body: "Beste {naam},\n\nJe uren zijn goedgekeurd — dank je wel voor je inzet. De uitbetaling volgt via ZekerFlex.\n\nMet vriendelijke groet," },
  { id: "offerte", name: "Kennismaking / offerte", subject: "Flexibel personeel via ZekerFlex", body: "Beste {naam},\n\nLeuk je te spreken. Zoals besproken: via ZekerFlex plaats je diensten en betaal je alleen per gewerkt uur, met staffelkorting bij meer uren.\n\nZal ik een account voor je klaarzetten?\n\nMet vriendelijke groet," },
];

const DEFAULTS: MailTools = { signature: "", appendSignature: true, templates: STARTER_TEMPLATES };

export async function getMailTools(userId: string): Promise<MailTools> {
  return { ...DEFAULTS, ...((await kvGet<Partial<MailTools>>(`mail-tools:${userId}`)) ?? {}) };
}

export async function setMailTools(userId: string, tools: MailTools): Promise<MailTools> {
  await kvSet(`mail-tools:${userId}`, tools);
  return tools;
}

/** Fills {datum}, {mijnnaam}, {bedrijf}; {naam} stays for the sender to complete. */
export function fillTemplate(text: string, vars: { mijnnaam: string; bedrijf: string; datum?: string }): string {
  const datum = vars.datum ?? new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  return text.replace(/\{datum\}/g, datum).replace(/\{mijnnaam\}/g, vars.mijnnaam).replace(/\{bedrijf\}/g, vars.bedrijf);
}

/** Body as sent: the signature appended once, separated the usual way. */
export function withSignature(body: string, tools: Pick<MailTools, "signature" | "appendSignature">): string {
  const sig = tools.signature.trim();
  if (!tools.appendSignature || !sig || body.includes(sig)) return body;
  return `${body.trimEnd()}\n\n-- \n${sig}`;
}
