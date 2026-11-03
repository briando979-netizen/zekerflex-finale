import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekingenVanAccount } from "@/lib/voorstel/schwarzwald-boekingen";
import { publiekeNaam } from "@/lib/voorstel/review-weergave";

// ---------------------------------------------------------------------------
// Beoordelingen van gasten. Alleen wie echt geweest is (een eigen reservering
// van vandaag of eerder, niet geannuleerd) kan er één per reservering geven.
// Het team keurt goed of verbergt en kan openbaar antwoorden; alleen
// goedgekeurde beoordelingen komen op de site. KV: voorstel-schwarzwald:review:<id>
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:review:";

export type ReviewStatus = "nieuw" | "goedgekeurd" | "verborgen";

export interface GastReview {
  id: string;
  email: string;
  /** zoals op de site: voornaam + eerste letter achternaam */
  naam: string;
  boekingId: string;
  activiteit: string;
  bezoek: string;
  score: number;
  tekst: string;
  status: ReviewStatus;
  antwoord: string;
  aangemaakt: string;
}

export async function reviewsVan(email: string): Promise<GastReview[]> {
  return kvFindByField<GastReview>(PREFIX, "email", email.trim().toLowerCase(), 200);
}

export async function alleReviews(): Promise<GastReview[]> {
  return (await kvListValues<GastReview>(PREFIX, 5000)).sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
}

export async function goedgekeurdeReviews(activiteit?: string): Promise<GastReview[]> {
  return (await kvFindByField<GastReview>(PREFIX, "status", "goedgekeurd", 500))
    .filter((r) => !activiteit || r.activiteit === activiteit)
    .sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
}

export async function plaatsReview(account: { email: string; naam: string }, input: { boekingId: string; score: number; tekst: string }): Promise<GastReview> {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw AppError.validation("Kies 1 tot 5 sterren.");
  const tekst = input.tekst.trim();
  if (tekst.length < 10) throw AppError.validation("Schrijf minstens een korte zin over je uitje.");
  const vandaag = amsterdamDayKey(new Date());
  const boeking = (await boekingenVanAccount(account.email)).find((b) => b.id === input.boekingId);
  if (!boeking || boeking.status === "geannuleerd") throw AppError.notFound("Reservering niet gevonden.");
  if (boeking.datum > vandaag) throw AppError.validation("Je kunt een uitje beoordelen vanaf de dag zelf.");
  if ((await reviewsVan(account.email)).some((r) => r.boekingId === boeking.id)) throw AppError.validation("Je hebt dit uitje al beoordeeld. Dank je!");
  const r: GastReview = {
    id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    email: account.email.toLowerCase(),
    naam: publiekeNaam(account.naam),
    boekingId: boeking.id,
    activiteit: boeking.activiteit,
    bezoek: boeking.datum,
    score: input.score,
    tekst,
    status: "nieuw",
    antwoord: "",
    aangemaakt: new Date().toISOString(),
  };
  await kvSet(`${PREFIX}${r.id}`, r);
  return r;
}

export async function beoordeelReview(id: string, w: { status?: ReviewStatus | undefined; antwoord?: string | undefined }): Promise<GastReview> {
  if (!/^[a-z0-9]{6,24}$/.test(id)) throw AppError.validation("Onbekende beoordeling.");
  const r = await kvGet<GastReview>(`${PREFIX}${id}`);
  if (!r) throw AppError.notFound("Beoordeling niet gevonden.");
  const nieuw: GastReview = { ...r, ...(w.status ? { status: w.status } : {}), ...(w.antwoord !== undefined ? { antwoord: w.antwoord.trim() } : {}) };
  await kvSet(`${PREFIX}${id}`, nieuw);
  return nieuw;
}

export async function verwijderReview(id: string): Promise<void> {
  if (!/^[a-z0-9]{6,24}$/.test(id)) throw AppError.validation("Onbekende beoordeling.");
  await kvDelete(`${PREFIX}${id}`);
}
