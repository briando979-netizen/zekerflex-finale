import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { bezetVan, boekingenOp } from "@/lib/voorstel/schwarzwald-boekingen";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { plekVrij, wachtlijstFout, type WachtSlot } from "@/lib/voorstel/wachtlijst-regels";

// ---------------------------------------------------------------------------
// Wachtlijst voor een vol tijdslot. Er gaat geen mail uit: Mijn account en het
// beheer rekenen live uit of er weer plek is (wachtlijst-regels.ts). Voorbije
// datums vallen vanzelf weg. KV: voorstel-schwarzwald:wachtlijst:<id>
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:wachtlijst:";

export interface Wachtplek extends WachtSlot {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  /** e-mail van het ingelogde account dat zich aanmeldde */
  account?: string;
  aangemaakt: string;
}

export type WachtplekMetStatus = Wachtplek & { plekVrij: boolean };

const geldigId = (id: string) => /^[a-z0-9]{6,24}$/.test(id);

export async function zetOpWachtlijst(input: WachtSlot & { naam: string; email: string; telefoon: string }, account?: string | undefined): Promise<Wachtplek> {
  const email = input.email.trim().toLowerCase();
  const fout = wachtlijstFout(input, amsterdamDayKey(new Date()), bezetVan(await boekingenOp(input.datum)), await agendaConfig());
  if (fout) throw AppError.validation(fout);
  const dubbel = (await kvFindByField<Wachtplek>(PREFIX, "email", email, 200)).some(
    (w) => w.activiteit === input.activiteit && w.datum === input.datum && w.tijd === input.tijd,
  );
  if (dubbel) throw AppError.validation("Je staat al op de wachtlijst voor dit tijdstip.");
  const w: Wachtplek = {
    id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    activiteit: input.activiteit,
    datum: input.datum,
    tijd: input.tijd,
    personen: input.personen,
    naam: input.naam.trim(),
    email,
    telefoon: input.telefoon.trim(),
    ...(account ? { account: account.toLowerCase() } : {}),
    aangemaakt: new Date().toISOString(),
  };
  await kvSet(`${PREFIX}${w.id}`, w);
  return w;
}

/** Met live "is er weer plek?"; voorbije datums worden meteen gewist. */
async function metStatus(rijen: { key: string; value: Wachtplek }[]): Promise<WachtplekMetStatus[]> {
  const vandaag = amsterdamDayKey(new Date());
  await Promise.all(rijen.filter((r) => r.value.datum < vandaag).map((r) => kvDelete(r.key)));
  const actueel = rijen.map((r) => r.value).filter((w) => w.datum >= vandaag);
  const cfg = await agendaConfig();
  const perDag = new Map<string, ReturnType<typeof bezetVan>>();
  for (const d of new Set(actueel.map((w) => w.datum))) perDag.set(d, bezetVan(await boekingenOp(d)));
  return actueel
    .map((w) => ({ ...w, plekVrij: plekVrij(w, perDag.get(w.datum) ?? [], cfg) }))
    .sort((a, b) => `${a.datum}${a.tijd}${a.aangemaakt}`.localeCompare(`${b.datum}${b.tijd}${b.aangemaakt}`));
}

export async function alleWachtplekken(): Promise<WachtplekMetStatus[]> {
  return metStatus(await kvListEntries<Wachtplek>(PREFIX, 5000));
}

export async function wachtplekkenVan(email: string): Promise<WachtplekMetStatus[]> {
  const e = email.trim().toLowerCase();
  const rijen = (await kvListEntries<Wachtplek>(PREFIX, 5000)).filter((r) => r.value.email === e || r.value.account === e);
  return metStatus(rijen);
}

/** Van de wachtlijst halen: door het team, of door de gast zelf (alleen de eigen plek). */
export async function haalVanWachtlijst(id: string, alleenVan?: string | undefined): Promise<void> {
  if (!geldigId(id)) throw AppError.validation("Onbekende wachtlijstplek.");
  const w = await kvGet<Wachtplek>(`${PREFIX}${id}`);
  if (!w) throw AppError.notFound("Wachtlijstplek niet gevonden.");
  if (alleenVan) {
    const e = alleenVan.toLowerCase();
    if (w.email !== e && w.account !== e) throw AppError.notFound("Wachtlijstplek niet gevonden.");
  }
  await kvDelete(`${PREFIX}${id}`);
}
