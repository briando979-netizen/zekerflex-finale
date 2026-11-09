import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { fixedWindow } from "@/lib/rate-limit";
import { hasTwoFactor, verifySecondFactor } from "@/lib/auth/two-factor";
import { ONDERSTEUNDE_ALGORITMES } from "@/lib/auth/passkey/cose";
import { PasskeyFout } from "@/lib/auth/passkey/fout";
import { netteTransports, vanB64u, type RegistratieJson } from "@/lib/auth/passkey/json";
import { netteNaam } from "@/lib/auth/passkey/naam";
import { passkeyBron, type PasskeyBron } from "@/lib/auth/passkey/omgeving";
import { bewaarRegistratieUitdaging, nieuweUitdaging, pakRegistratieUitdaging, UITDAGING_SECONDEN } from "@/lib/auth/passkey/uitdaging";
import { verifieerRegistratie } from "@/lib/auth/passkey/webauthn";

// ---------------------------------------------------------------------------
// Passkeys beheren vanuit de eigen accountinstellingen (werker en werkgever):
// lijst, toevoegen, verwijderen. Toevoegen vraagt een ingelogde sessie én
// opnieuw bevestigen met wat je ook bij het inloggen gebruikt: je wachtwoord
// (als je er een hebt) en je authenticator-code (als tweestapsverificatie aan
// staat). Zo kan wie alleen een gestolen sessie heeft geen eigen passkey
// toevoegen en daarmee later zonder wachtwoord en code binnenkomen.
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

/** Aanvraaglimiet per gebruiker; faalt open bij een Redis-storing (dan houdt de challenge het tegen). */
async function limiet(naam: string, userId: string, max: number): Promise<void> {
  const gate = await fixedWindow(`rl:${naam}:${userId}`, max, 15 * 60);
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
  return { beschikbaar: bronUitOmgeving() !== null, vraagtWachtwoord: Boolean(user?.passwordHash), vraagtCode: tweestaps, passkeys };
}

/** De opties voor navigator.credentials.create (JSON-vorm, base64url). */
export interface AanmaakOpties {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  attestation: "none";
  authenticatorSelection: { residentKey: "required"; requireResidentKey: true; userVerification: "preferred" };
  excludeCredentials: { type: "public-key"; id: string; transports: string[] }[];
}

/** Stap 1: opnieuw bevestigen en een challenge voor een nieuwe passkey geven. */
export async function beginRegistratie(userId: string, bevestiging: { wachtwoord?: string | undefined; code?: string | undefined }): Promise<AanmaakOpties> {
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

  // opnieuw bevestigen: wat je ook bij het inloggen gebruikt
  if (user.passwordHash) {
    const ok = typeof bevestiging.wachtwoord === "string" && bevestiging.wachtwoord.length > 0 && (await bcrypt.compare(bevestiging.wachtwoord, user.passwordHash));
    if (!ok) throw new PasskeyFout("WACHTWOORD_ONJUIST", "Dat wachtwoord klopt niet.", 400);
  }
  if (await hasTwoFactor(user.id).catch(() => true)) {
    const code = (bevestiging.code ?? "").trim();
    if (code.length < 6 || !(await verifySecondFactor(user.id, code)).ok) {
      throw new PasskeyFout("CODE_ONJUIST", "Die code klopt niet (of is al gebruikt). Probeer de nieuwste code uit je app.", 400);
    }
  }

  // één vaste, willekeurige user handle per gebruiker (geen e-mailadres of id): zo
  // vervangt een toestel zijn oude passkey voor dit account in plaats van er een bij te maken
  const userHandle = user.passkeys[0]?.userHandle ?? randomBytes(32).toString("base64url");
  const challenge = nieuweUitdaging();
  try {
    await bewaarRegistratieUitdaging(user.id, { challenge, userHandle });
  } catch (err) {
    logger.warn("passkey: challenge bewaren mislukt", { error: (err as Error).message });
    throw new PasskeyFout("PASSKEY_STORING", "Een passkey toevoegen lukt nu even niet. Probeer het later opnieuw.", 503);
  }

  return {
    rp: { id: bron.rpId, name: RP_NAAM },
    user: { id: userHandle, name: user.email, displayName: user.fullName },
    challenge,
    pubKeyCredParams: ONDERSTEUNDE_ALGORITMES.map((alg) => ({ type: "public-key" as const, alg })),
    timeout: UITDAGING_SECONDEN * 1000,
    attestation: "none",
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
    excludeCredentials: user.passkeys.map((p) => ({ type: "public-key" as const, id: p.credentialId, transports: p.transports })),
  };
}

/** Stap 2: het antwoord van het toestel controleren en de passkey bewaren. */
export async function voltooiRegistratie(userId: string, invoer: { naam: string; credential: RegistratieJson }): Promise<PasskeyRij[]> {
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
    { challenge, origin: bron.origin, rpId: bron.rpId, uvVerplicht: false },
  );
  if (!uit.ok) {
    logger.warn("passkey: registratie geweigerd", { userId, reden: uit.reden });
    throw new PasskeyFout("PASSKEY_GEWEIGERD", "Dit toestel kon niet als passkey worden toegevoegd.", 400);
  }

  const user = await prisma.user.findFirst({ where: { id: userId, disabledAt: null }, select: { id: true, _count: { select: { passkeys: true } } } });
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
  return lijstPasskeys(user.id);
}

/** Een eigen passkey verwijderen. Alleen van jezelf: de id van een ander vindt niets. */
export async function verwijderPasskey(userId: string, passkeyId: string): Promise<PasskeyRij[]> {
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
  return lijstPasskeys(userId);
}
