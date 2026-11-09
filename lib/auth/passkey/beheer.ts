import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { fixedWindow } from "@/lib/rate-limit";
import { hasTwoFactor, verifySecondFactor } from "@/lib/auth/two-factor";
import { checkLoginAllowed, registerLoginFailure } from "@/lib/auth/login-throttle";
import { ONDERSTEUNDE_ALGORITMES } from "@/lib/auth/passkey/cose";
import { PasskeyFout } from "@/lib/auth/passkey/fout";
import { netteTransports, vanB64u, type RegistratieJson } from "@/lib/auth/passkey/json";
import { controleerPasskeyMailcode, meldPasskeyWijziging, stuurPasskeyMailcode } from "@/lib/auth/passkey/mail";
import { netteNaam } from "@/lib/auth/passkey/naam";
import { passkeyBron, type PasskeyBron } from "@/lib/auth/passkey/omgeving";
import { bewaarRegistratieUitdaging, nieuweUitdaging, pakRegistratieUitdaging, UITDAGING_SECONDEN, wisRegistratieUitdaging } from "@/lib/auth/passkey/uitdaging";
import { verifieerRegistratie } from "@/lib/auth/passkey/webauthn";

// ---------------------------------------------------------------------------
// Passkeys beheren vanuit de eigen accountinstellingen (werker en werkgever):
// lijst, toevoegen, verwijderen. Toevoegen gaat NOOIT met alleen een sessie:
// wie een sessiecookie steelt, mag er geen eigen passkey bij zetten en zo
// blijvend binnenkomen. Daarom opnieuw bevestigen:
//   - met wachtwoord: het wachtwoord;
//   - zonder wachtwoord (alleen Google): een eenmalige code per mail naar het
//     bekende adres (lib/auth/passkey/mail.ts, zelfde regels als de IBAN-wijziging);
//   - tweestapsverificatie aan: daarbovenop de code uit de app.
// Een mislukte herbevestiging telt mee in het inlogslot (lib/auth/login-throttle.ts)
// en komt in de audit. Het toestel moet altijd bevestigen met vingerafdruk,
// gezicht of pincode (UV): een passkey telt daardoor zelf als tweestaps.
// Bij toevoegen en verwijderen gaat er altijd een melding naar het bekende adres;
// na een wachtwoordherstel gaan alle passkeys weg (wisPasskeysNaHerstel).
// Let op: inloggen met Google controleert 2FA níét (bestaand gedrag in
// lib/auth/nextauth.ts, buiten passkeys).
// ---------------------------------------------------------------------------

export const MAX_PASSKEYS = 10;
const RP_NAAM = "ZekerFlex";

export interface PasskeyRij {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  backedUp: boolean;
}

export interface PasskeyStatus {
  /** passkeys kunnen op dit domein (APP_BASE_URL) */
  beschikbaar: boolean;
  /** opnieuw bevestigen met het wachtwoord (het account heeft er een) */
  vraagtWachtwoord: boolean;
  /** opnieuw bevestigen met de authenticator-code (tweestapsverificatie staat aan) */
  vraagtCode: boolean;
  /** opnieuw bevestigen met een code per mail (het account heeft geen wachtwoord) */
  vraagtMailcode: boolean;
  passkeys: PasskeyRij[];
}

export function bronUitOmgeving(): PasskeyBron | null {
  return passkeyBron(env.APP_BASE_URL);
}

function eisBron(): PasskeyBron {
  const bron = bronUitOmgeving();
  if (!bron) throw new PasskeyFout("PASSKEY_NIET_HIER", "Passkeys werken alleen op de eigen site van ZekerFlex.", 400);
  return bron;
}

/** Aanvraaglimiet per gebruiker; faalt DICHT bij een Redis-storing (dan kan er toch geen challenge bewaard worden). */
async function limiet(naam: string, userId: string, max: number): Promise<void> {
  const gate = await fixedWindow(`rl:${naam}:${userId}`, max, 15 * 60, { failOpen: false });
  if (!gate.ok) throw new PasskeyFout("TE_VAAK", "Te veel pogingen. Wacht een kwartier en probeer het dan opnieuw.", 429);
}

export async function lijstPasskeys(userId: string): Promise<PasskeyRij[]> {
  return prisma.passkey.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function passkeyStatus(userId: string): Promise<PasskeyStatus> {
  const [user, passkeys, tweestaps] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    lijstPasskeys(userId),
    hasTwoFactor(userId).catch(() => true),
  ]);
  return {
    beschikbaar: bronUitOmgeving() !== null,
    vraagtWachtwoord: Boolean(user?.passwordHash),
    vraagtCode: tweestaps,
    vraagtMailcode: !user?.passwordHash,
    passkeys,
  };
}

/** De opties voor navigator.credentials.create (JSON-vorm, base64url). */
export interface AanmaakOpties {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  attestation: "none";
  authenticatorSelection: { residentKey: "required"; requireResidentKey: true; userVerification: "required" };
  excludeCredentials: { type: "public-key"; id: string; transports: string[] }[];
}

/**
 * Stap 1: opnieuw bevestigen en een challenge voor een nieuwe passkey geven.
 * Zonder wachtwoord en zonder `mailcode` stuurt dit eerst de code (en gooit
 * PASSKEY_MAILCODE_GESTUURD); de volgende aanroep met de code gaat verder.
 */
export async function beginRegistratie(
  userId: string,
  bevestiging: { wachtwoord?: string | undefined; code?: string | undefined; mailcode?: string | undefined },
  now = Date.now(),
): Promise<AanmaakOpties> {
  const bron = eisBron();
  await limiet("passkey-registreren", userId, 10);

  const user = await prisma.user.findFirst({
    where: { id: userId, disabledAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      emailVerifiedAt: true,
      passkeys: { select: { credentialId: true, transports: true, userHandle: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) throw new PasskeyFout("UNAUTHENTICATED", "Je bent niet (meer) ingelogd. Log opnieuw in.", 401);
  if (!user.emailVerifiedAt) throw new PasskeyFout("EMAIL_ONBEVESTIGD", "Bevestig eerst je e-mailadres.", 423);
  if (user.passkeys.length >= MAX_PASSKEYS) throw new PasskeyFout("PASSKEY_MAX", `Je hebt al ${MAX_PASSKEYS} passkeys. Verwijder er eerst een.`, 400);

  // zelfde inlogslot als het wachtwoord-inloggen (faalt open bij een Redis-storing)
  const email = user.email.toLowerCase().trim();
  if (!(await checkLoginAllowed(email)).allowed) {
    throw new PasskeyFout("INLOG_GEBLOKKEERD", "Te veel pogingen — je account is ongeveer 15 minuten geblokkeerd. Probeer het daarna opnieuw.", 423);
  }

  // één vaste, willekeurige user handle per gebruiker (geen e-mailadres of id): zo
  // vervangt een toestel zijn oude passkey voor dit account in plaats van er een bij te maken
  const userHandle = user.passkeys[0]?.userHandle ?? randomBytes(32).toString("base64url");
  const challenge = nieuweUitdaging();
  // eerst de challenge bewaren, pas daarna iets controleren: een storing geeft
  // dan een 503 vóór de herbevestiging, zodat het antwoord nooit verraadt of het wachtwoord klopte
  try {
    await bewaarRegistratieUitdaging(user.id, { challenge, userHandle });
  } catch (err) {
    logger.warn("passkey: challenge bewaren mislukt", { error: (err as Error).message });
    throw new PasskeyFout("PASSKEY_STORING", "Een passkey toevoegen lukt nu even niet. Probeer het later opnieuw.", 503);
  }
  try {
    await herbevestig({ id: user.id, email, passwordHash: user.passwordHash }, bevestiging, now);
  } catch (err) {
    await wisRegistratieUitdaging(user.id);
    throw err;
  }

  return {
    rp: { id: bron.rpId, name: RP_NAAM },
    user: { id: userHandle, name: user.email, displayName: user.fullName },
    challenge,
    pubKeyCredParams: ONDERSTEUNDE_ALGORITMES.map((alg) => ({ type: "public-key" as const, alg })),
    timeout: UITDAGING_SECONDEN * 1000,
    attestation: "none",
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
    excludeCredentials: user.passkeys.map((p) => ({ type: "public-key" as const, id: p.credentialId, transports: p.transports })),
  };
}

/**
 * Opnieuw bevestigen, nooit alleen de sessie: het wachtwoord, of zonder
 * wachtwoord een code per mail; bij 2FA daarbovenop de code uit de app. Elke
 * fout telt mee in het inlogslot en komt in de audit. Gooit een PasskeyFout.
 */
async function herbevestig(
  user: { id: string; email: string; passwordHash: string | null },
  bevestiging: { wachtwoord?: string | undefined; code?: string | undefined; mailcode?: string | undefined },
  now: number,
): Promise<void> {
  const mislukt = async (via: "wachtwoord" | "2fa" | "mail", fout: PasskeyFout): Promise<never> => {
    const { failures, locked } = await registerLoginFailure(user.email);
    await recordAudit({
      category: "SECURITY",
      action: "auth.passkey.reconfirm_failed",
      severity: "warning",
      actorUserId: user.id,
      actorLabel: "user",
      summary: `Passkey toevoegen geweigerd: opnieuw bevestigen mislukt (${via === "wachtwoord" ? "wachtwoord" : via === "2fa" ? "code uit de app" : "code per mail"})`,
      targetType: "user",
      targetId: user.id,
      metadata: { via, failures, locked },
    });
    throw fout;
  };

  const mailcode = (bevestiging.mailcode ?? "").trim();
  if (user.passwordHash) {
    const ok = typeof bevestiging.wachtwoord === "string" && bevestiging.wachtwoord.length > 0 && (await bcrypt.compare(bevestiging.wachtwoord, user.passwordHash));
    if (!ok) await mislukt("wachtwoord", new PasskeyFout("WACHTWOORD_ONJUIST", "Dat wachtwoord klopt niet.", 400));
  } else if (!mailcode) {
    await stuurPasskeyMailcode(user.id, now); // gooit altijd: code gestuurd (423), te vaak (429) of mislukt (503)
  }
  if (await hasTwoFactor(user.id).catch(() => true)) {
    const code = (bevestiging.code ?? "").trim();
    if (code.length < 6 || !(await verifySecondFactor(user.id, code)).ok) {
      await mislukt("2fa", new PasskeyFout("CODE_ONJUIST", "Die code klopt niet (of is al gebruikt). Probeer de nieuwste code uit je app.", 400));
    }
  }
  if (!user.passwordHash) {
    try {
      await controleerPasskeyMailcode(user.id, mailcode, now);
    } catch (err) {
      if (err instanceof PasskeyFout && err.code === "PASSKEY_MAILCODE_ONGELDIG") await mislukt("mail", err);
      throw err;
    }
  }
}

/** Stap 2: het antwoord van het toestel controleren en de passkey bewaren. */
export async function voltooiRegistratie(userId: string, invoer: { naam: string; credential: RegistratieJson }, now: Date = new Date()): Promise<PasskeyRij[]> {
  const bron = eisBron();
  await limiet("passkey-registreren-klaar", userId, 10);

  // eenmalig: meteen gewist, ook als de controle hieronder faalt
  const opgehaald = await pakRegistratieUitdaging(userId);
  if (opgehaald.status === "storing") throw new PasskeyFout("PASSKEY_STORING", "Een passkey toevoegen lukt nu even niet. Probeer het later opnieuw.", 503);
  if (opgehaald.status === "weg") throw new PasskeyFout("PASSKEY_VERLOPEN", "Dat duurde te lang. Begin opnieuw.", 400);
  const { challenge, userHandle } = opgehaald.waarde;

  const c = invoer.credential;
  if (c.id !== c.rawId) throw new PasskeyFout("PASSKEY_GEWEIGERD", "Dit toestel kon niet als passkey worden toegevoegd.", 400);
  const uit = verifieerRegistratie(
    { clientDataJSON: vanB64u(c.response.clientDataJSON), attestationObject: vanB64u(c.response.attestationObject), rawId: vanB64u(c.rawId) },
    // UV verplicht: een passkey zonder vingerafdruk/gezicht/pincode kan later toch niet inloggen
    { challenge, origin: bron.origin, rpId: bron.rpId, uvVerplicht: true },
  );
  if (!uit.ok) {
    logger.warn("passkey: registratie geweigerd", { userId, reden: uit.reden });
    throw new PasskeyFout("PASSKEY_GEWEIGERD", "Dit toestel kon niet als passkey worden toegevoegd.", 400);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, disabledAt: null },
    select: { id: true, email: true, fullName: true, memberships: { select: { role: true } }, _count: { select: { passkeys: true } } },
  });
  if (!user) throw new PasskeyFout("UNAUTHENTICATED", "Je bent niet (meer) ingelogd. Log opnieuw in.", 401);
  if (user._count.passkeys >= MAX_PASSKEYS) throw new PasskeyFout("PASSKEY_MAX", `Je hebt al ${MAX_PASSKEYS} passkeys. Verwijder er eerst een.`, 400);

  const naam = netteNaam(invoer.naam);
  let id: string;
  try {
    const rij = await prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: uit.credentialId.toString("base64url"),
        publicKey: uit.publicKey,
        algorithm: uit.algorithm,
        signCount: BigInt(uit.signCount),
        userHandle,
        transports: netteTransports(c.response.transports),
        name: naam,
        backedUp: uit.backedUp,
      },
      select: { id: true },
    });
    id = rij.id;
  } catch (err) {
    // credentialId is uniek: een passkey hoort bij precies één gebruiker
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PasskeyFout("PASSKEY_BESTAAT", "Deze passkey is al toegevoegd.", 409);
    }
    throw err;
  }

  await recordAudit({
    category: "SECURITY",
    action: "auth.passkey.added",
    actorUserId: user.id,
    actorLabel: "user",
    summary: `Passkey toegevoegd (${naam})`,
    targetType: "user",
    targetId: user.id,
    metadata: { passkeyId: id, algoritme: uit.algorithm, gesynchroniseerd: uit.backedUp, uv: uit.uv },
  });
  await meldPasskeyWijziging({ wat: "toegevoegd", email: user.email, fullName: user.fullName, toestel: naam, rollen: user.memberships.map((m) => m.role), tijdstip: now });
  return lijstPasskeys(user.id);
}

/** Een eigen passkey verwijderen. Alleen van jezelf: de id van een ander vindt niets. */
export async function verwijderPasskey(userId: string, passkeyId: string, now: Date = new Date()): Promise<PasskeyRij[]> {
  const rij = await prisma.passkey.findFirst({ where: { id: passkeyId, userId }, select: { id: true, name: true } });
  if (!rij) throw new PasskeyFout("PASSKEY_ONBEKEND", "Die passkey staat niet (meer) in je lijst.", 404);
  await prisma.passkey.deleteMany({ where: { id: rij.id, userId } });
  await recordAudit({
    category: "SECURITY",
    action: "auth.passkey.removed",
    severity: "warning",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Passkey verwijderd (${rij.name})`,
    targetType: "user",
    targetId: userId,
    metadata: { passkeyId: rij.id },
  });
  // de melding mag het verwijderen (al gebeurd) niet laten mislukken
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, fullName: true, memberships: { select: { role: true } } } })
    .catch(() => null);
  if (user) await meldPasskeyWijziging({ wat: "verwijderd", email: user.email, fullName: user.fullName, toestel: rij.name, rollen: user.memberships.map((m) => m.role), tijdstip: now });
  return lijstPasskeys(userId);
}

/**
 * Na een wachtwoordherstel gaan ALLE passkeys van de gebruiker weg: wie een
 * account terugpakt, moet ook een passkey kwijt die een ander er (met een
 * gestolen sessie) bij heeft gezet. Met auditregel en een mail. Geeft het aantal.
 */
export async function wisPasskeysNaHerstel(userId: string, now: Date = new Date()): Promise<number> {
  const rijen = await prisma.passkey.findMany({ where: { userId }, select: { name: true }, orderBy: { createdAt: "asc" } });
  if (rijen.length === 0) return 0;
  const { count } = await prisma.passkey.deleteMany({ where: { userId } });
  await recordAudit({
    category: "SECURITY",
    action: "auth.passkey.removed_on_reset",
    severity: "warning",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Alle passkeys verwijderd na wachtwoordherstel (${count})`,
    targetType: "user",
    targetId: userId,
    metadata: { aantal: count },
  });
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, fullName: true, memberships: { select: { role: true } } } })
    .catch(() => null);
  if (user) {
    await meldPasskeyWijziging({ wat: "herstel", email: user.email, fullName: user.fullName, toestel: rijen.map((r) => r.name).join(", "), rollen: user.memberships.map((m) => m.role), tijdstip: now });
  }
  return count;
}

/**
 * Tweestapsverificatie is net aangezet: de passkeys blijven staan (een passkey
 * vraagt altijd vingerafdruk, gezicht of pincode en telt zelf als tweestaps),
 * maar de gebruiker krijgt een mail welke passkeys er nog zijn. Faalt nooit.
 */
export async function meldPasskeysNaTweestaps(userId: string, now: Date = new Date()): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, memberships: { select: { role: true } }, passkeys: { select: { name: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!user || user.passkeys.length === 0) return;
    await meldPasskeyWijziging({ wat: "tweestaps", email: user.email, fullName: user.fullName, toestel: user.passkeys.map((p) => p.name).join(", "), rollen: user.memberships.map((m) => m.role), tijdstip: now });
  } catch (err) {
    logger.warn("passkey: melding bij tweestapsverificatie mislukt", { error: (err as Error).message });
  }
}
