import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount, inloggen, registreer, uitloggen, wijzigProfiel } from "@/lib/voorstel/schwarzwald-accounts";
import { annuleerEigen, boekingenVanAccount } from "@/lib/voorstel/schwarzwald-boekingen";
import { aanvragenVan, klantkaart, tijdlijn, voegItemToe, wijzigKlantkaart } from "@/lib/voorstel/schwarzwald-crm";
import { plaatsReview, reviewsVan } from "@/lib/voorstel/schwarzwald-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Klantaccount van de Schwarzwald-site (eigen sessie-cookie, los van
// ZekerFlex-login; openbaar in lib/auth/public-routes.ts).
// GET  → ingelogd account + eigen reserveringen, aanvragen, berichten en wensen
// POST {actie: registreren | inloggen | uitloggen | profiel | annuleren | wensen | bericht}

export async function GET(): Promise<NextResponse> {
  try {
    const account = await huidigAccount();
    if (!account) return NextResponse.json({ account: null, boekingen: [] });
    const [boekingen, aanvragen, lijn, kaart, reviews] = await Promise.all([
      boekingenVanAccount(account.email),
      aanvragenVan(account.email),
      tijdlijn(account.email),
      klantkaart(account.email),
      reviewsVan(account.email),
    ]);
    // de klant ziet alleen berichten, nooit interne notities of taken
    const berichten = lijn.filter((i) => i.soort === "bericht-klant" || i.soort === "bericht-team").map(({ id, soort, tekst, door, datum }) => ({ id, soort, tekst, door, datum }));
    return NextResponse.json({
      account,
      boekingen,
      aanvragen: aanvragen.map(({ id, programma, gelegenheid, datum, personen, status, aangemaakt }) => ({ id, programma, gelegenheid, datum, personen, status, aangemaakt })),
      berichten,
      wensen: kaart?.wensen ?? "",
      reviews: reviews.map(({ id, boekingId, score, tekst, status, antwoord }) => ({ id, boekingId, score, tekst, status, antwoord })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

const WACHTWOORD = z.string().min(8, "Wachtwoord: minimaal 8 tekens.").max(200);

const schema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("registreren"),
    email: z.string().trim().email().max(200),
    naam: z.string().trim().min(2).max(120),
    telefoon: z.string().trim().min(6).max(40),
    wachtwoord: WACHTWOORD,
  }),
  z.object({ actie: z.literal("inloggen"), email: z.string().trim().email().max(200), wachtwoord: z.string().min(1).max(200) }),
  z.object({ actie: z.literal("uitloggen") }),
  z.object({
    actie: z.literal("profiel"),
    naam: z.string().trim().min(2).max(120),
    telefoon: z.string().trim().min(6).max(40),
    nieuwWachtwoord: z.union([WACHTWOORD, z.literal("")]).optional(),
  }),
  z.object({ actie: z.literal("annuleren"), datum: z.string().max(10), id: z.string().max(8) }),
  z.object({ actie: z.literal("wensen"), wensen: z.string().trim().max(1000) }),
  z.object({ actie: z.literal("bericht"), tekst: z.string().trim().min(1, "Schrijf eerst een bericht.").max(2000) }),
  z.object({ actie: z.literal("review"), boekingId: z.string().max(8), score: z.number().int().min(1).max(5), tekst: z.string().trim().max(1500) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const eerste = parsed.error.issues[0]?.message;
      throw AppError.validation(eerste && !eerste.startsWith("Invalid") ? eerste : "Controleer je gegevens.", parsed.error.flatten());
    }
    const d = parsed.data;
    const ip = clientIp(request);

    if (d.actie === "registreren") {
      await enforceRateLimit({ name: "voorstel-schwarzwald-registreren", identifier: ip, limit: 5, windowSeconds: 3600, message: "Te veel nieuwe accounts. Probeer het later opnieuw." });
      return NextResponse.json({ account: await registreer(d) });
    }
    if (d.actie === "inloggen") {
      await enforceRateLimit({ name: "voorstel-schwarzwald-inloggen", identifier: ip, limit: 10, windowSeconds: 600, message: "Te veel inlogpogingen. Wacht even en probeer het opnieuw." });
      return NextResponse.json({ account: await inloggen(d.email, d.wachtwoord) });
    }
    if (d.actie === "uitloggen") {
      await uitloggen();
      return NextResponse.json({ ok: true });
    }

    const account = await huidigAccount();
    if (!account) throw AppError.forbidden("Log eerst in.");
    if (d.actie === "profiel") {
      return NextResponse.json({ account: await wijzigProfiel(account.email, { naam: d.naam, telefoon: d.telefoon, nieuwWachtwoord: d.nieuwWachtwoord || undefined }) });
    }
    if (d.actie === "wensen") {
      return NextResponse.json({ wensen: (await wijzigKlantkaart(account.email, { wensen: d.wensen })).wensen });
    }
    if (d.actie === "review") {
      const r = await plaatsReview(account, { boekingId: d.boekingId, score: d.score, tekst: d.tekst });
      return NextResponse.json({ review: { id: r.id, boekingId: r.boekingId, score: r.score, tekst: r.tekst, status: r.status, antwoord: r.antwoord } });
    }
    if (d.actie === "bericht") {
      await enforceRateLimit({ name: "voorstel-schwarzwald-bericht", identifier: account.email, limit: 20, windowSeconds: 3600, message: "Je hebt veel berichten gestuurd. Probeer het later opnieuw." });
      const b = await voegItemToe({ email: account.email, soort: "bericht-klant", tekst: d.tekst, door: account.naam });
      return NextResponse.json({ bericht: { id: b.id, soort: b.soort, tekst: b.tekst, door: b.door, datum: b.datum } });
    }
    return NextResponse.json({ boeking: await annuleerEigen(d.datum, d.id, account.email) });
  } catch (err) {
    return jsonError(err);
  }
}
