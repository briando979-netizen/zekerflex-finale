import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { recordLoginFailure } from "@/lib/metrics";
import { clientIp } from "@/lib/http/request";
import { fixedWindow } from "@/lib/rate-limit";
import { hasTwoFactor } from "@/lib/auth/two-factor";
import { checkLoginAllowed, clearLoginFailures, registerLoginFailure, MAX_FAILURES } from "@/lib/auth/login-throttle";
import { PasskeyFout } from "@/lib/auth/passkey/fout";
import { inlogJson, vanB64u } from "@/lib/auth/passkey/json";
import { passkeyBron } from "@/lib/auth/passkey/omgeving";
import { bewaarInlogUitdaging, INLOG_COOKIE, nieuweCeremonieId, nieuweUitdaging, pakInlogUitdaging, UITDAGING_SECONDEN } from "@/lib/auth/passkey/uitdaging";
import { verifieerInlog } from "@/lib/auth/passkey/webauthn";

// ---------------------------------------------------------------------------
// Inloggen met een passkey, zonder e-mailadres vooraf (discoverable
// credentials, ook via de suggestie in het e-mailveld). Twee stappen:
//
//   1. POST /api/auth/passkey  → challenge (eenmalig, 5 min, in Redis) + cookie
//   2. de server-actie op /login → signIn("passkey") → authorizePasskey hieronder
//
// Stap 2 doet dezelfde controles als het wachtwoord-inloggen (lib/auth/nextauth.ts):
// uitgeschakeld/gewist account, inlogslot per e-mailadres (faalt open bij een
// Redis-storing), mislukte pogingen tellen mee, audit, lastLoginAt; en de
// sessie is precies dezelfde (zelfde jwt.encode, "ingelogd blijven" inbegrepen).
//
// Tweestapsverificatie: een passkey met UV-vlag (vingerafdruk, gezicht of
// pincode op het toestel) is zelf al twee factoren — iets wat je hebt (het
// toestel met de geheime sleutel) en iets wat je bent of weet — en werkt
// alleen op zekerflex.com, dus een nepsite kan hem niet afvangen. Staat 2FA
// aan, dan is die UV-vlag verplicht; zonder UV wordt de inlog geweigerd en
// log je in met wachtwoord + code. Een passkey toevoegen vraagt bij 2FA ook de
// code (lib/auth/passkey/beheer.ts), dus 2FA is nergens te omzeilen.
// ---------------------------------------------------------------------------

/**
 * Aanvraaglimieten per IP: het begin (challenge) en het einde (controle). Het
 * begin ruimer: /login vraagt bij elk bezoek een challenge voor de suggestie in
 * het e-mailveld, en op mobiel delen veel mensen één IP-adres (CGNAT).
 */
export const START_LIMIET = { max: 60, seconden: 10 * 60 };
export const EINDE_LIMIET = { max: 30, seconden: 10 * 60 };

/** De opties voor navigator.credentials.get (JSON-vorm, base64url). */
export interface InlogOpties {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: "preferred";
  allowCredentials: never[];
}

/** Stap 1: een challenge voor dit verzoek. Gooit PasskeyFout (nooit 403). */
export async function startPasskeyInlog(ip: string): Promise<{ opties: InlogOpties; ceremonieId: string }> {
  const bron = passkeyBron(env.APP_BASE_URL);
  if (!bron) throw new PasskeyFout("PASSKEY_NIET_HIER", "Inloggen met een passkey kan alleen op de eigen site van ZekerFlex.", 400);
  const gate = await fixedWindow(`rl:passkey-start:${ip}`, START_LIMIET.max, START_LIMIET.seconden);
  if (!gate.ok) throw new PasskeyFout("TE_VAAK", "Te veel pogingen. Wacht even en probeer het dan opnieuw.", 429);

  const ceremonieId = nieuweCeremonieId();
  const challenge = nieuweUitdaging();
  try {
    await bewaarInlogUitdaging(ceremonieId, challenge);
  } catch (err) {
    logger.warn("passkey: challenge bewaren mislukt", { error: (err as Error).message });
    throw new PasskeyFout("PASSKEY_STORING", "Inloggen met een passkey lukt nu even niet. Log in met je wachtwoord.", 503);
  }
  return {
    ceremonieId,
    opties: { challenge, rpId: bron.rpId, timeout: UITDAGING_SECONDEN * 1000, userVerification: "preferred", allowCredentials: [] },
  };
}

/** Uitkomst van stap 2; de code gaat (als CredentialsSignin-code) naar het inlogscherm. */
export type PasskeyInlogUitkomst =
  | { ok: true; user: { id: string; email: string; name: string; remember: boolean } }
  | { ok: false; code: PasskeyInlogCode };

export type PasskeyInlogCode =
  | "passkey_mislukt" // kapot verzoek of geweigerde controle
  | "passkey_verlopen" // challenge weg: te lang gewacht of al gebruikt
  | "passkey_onbekend" // deze passkey kennen we niet (meer)
  | "passkey_uv" // 2FA staat aan, maar het toestel bevestigde niet met vingerafdruk/gezicht/pincode
  | "passkey_storing" // challenge kon niet worden gelezen: nooit doorlaten
  | "passkey_te_vaak" // aanvraaglimiet per IP
  | "locked"; // zelfde inlogslot als het wachtwoord

function cookieUit(headers: Headers, naam: string): string | null {
  for (const deel of (headers.get("cookie") ?? "").split(";")) {
    const i = deel.indexOf("=");
    if (i > 0 && deel.slice(0, i).trim() === naam) return deel.slice(i + 1).trim();
  }
  return null;
}

/** Stap 2 (authorize van de passkey-provider in lib/auth/nextauth.ts). */
export async function authorizePasskey(raw: Partial<Record<string, unknown>>, request: Request, now: Date = new Date()): Promise<PasskeyInlogUitkomst> {
  const bron = passkeyBron(env.APP_BASE_URL);
  if (!bron) return { ok: false, code: "passkey_mislukt" };

  const ip = clientIp(request);
  const gate = await fixedWindow(`rl:passkey-inloggen:${ip}`, EINDE_LIMIET.max, EINDE_LIMIET.seconden);
  if (!gate.ok) return { ok: false, code: "passkey_te_vaak" };

  // eenmalig: de challenge is vanaf hier weg, wat er verder ook gebeurt
  const opgehaald = await pakInlogUitdaging(cookieUit(request.headers, INLOG_COOKIE));
  if (opgehaald.status === "storing") {
    logger.warn("passkey: challenge niet te lezen, inlog geweigerd (fail-closed)");
    return { ok: false, code: "passkey_storing" };
  }
  if (opgehaald.status === "weg") return { ok: false, code: "passkey_verlopen" };
  const challenge = opgehaald.waarde;

  let json: unknown;
  try {
    json = JSON.parse(typeof raw.response === "string" ? raw.response : "");
  } catch {
    return { ok: false, code: "passkey_mislukt" };
  }
  const parsed = inlogJson.safeParse(json);
  if (!parsed.success || parsed.data.id !== parsed.data.rawId) return { ok: false, code: "passkey_mislukt" };
  const c = parsed.data;

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: vanB64u(c.rawId).toString("base64url") },
    select: {
      id: true,
      publicKey: true,
      algorithm: true,
      signCount: true,
      userHandle: true,
      user: { select: { id: true, email: true, fullName: true, disabledAt: true } },
    },
  });
  // onbekend, of het account is uitgeschakeld of gewist (dat zet disabledAt)
  if (!passkey || passkey.user.disabledAt) {
    logger.warn("passkey: onbekende passkey of uitgeschakeld account", { ip });
    return { ok: false, code: "passkey_onbekend" };
  }
  const user = passkey.user;
  const email = user.email.toLowerCase();

  const slot = await checkLoginAllowed(email);
  if (!slot.allowed) {
    await recordAudit({
      category: "SECURITY",
      action: "auth.login.locked",
      severity: "warning",
      summary: `Inlogpoging met passkey voor ${email} geweigerd - tijdelijk geblokkeerd`,
      targetType: "email",
      targetId: email,
      metadata: { retryAfterSeconds: slot.retryAfterSeconds, methode: "passkey" },
    });
    return { ok: false, code: "locked" };
  }

  // 2FA aan → de passkey moet zelf ook de tweede factor zijn (UV)
  const tweestaps = await hasTwoFactor(user.id).catch(() => true);
  const uit = verifieerInlog(
    {
      clientDataJSON: vanB64u(c.response.clientDataJSON),
      authenticatorData: vanB64u(c.response.authenticatorData),
      signature: vanB64u(c.response.signature),
      userHandle: c.response.userHandle ? vanB64u(c.response.userHandle) : null,
    },
    { publicKey: Buffer.from(passkey.publicKey), algorithm: passkey.algorithm, signCount: Number(passkey.signCount), userHandle: passkey.userHandle },
    { challenge, origin: bron.origin, rpId: bron.rpId, uvVerplicht: tweestaps },
  );

  if (!uit.ok) {
    const { failures, locked } = await registerLoginFailure(email);
    recordLoginFailure();
    logger.warn("passkey: inlog geweigerd", { reden: uit.reden, failures, locked });
    await recordAudit({
      category: locked || uit.reden === "teller" ? "SECURITY" : "AUTH",
      action: locked ? "auth.login.locked" : "auth.login.failed",
      severity: locked || uit.reden === "teller" ? "warning" : "info",
      summary: locked
        ? `${email} geblokkeerd na ${MAX_FAILURES} mislukte inlogpogingen`
        : uit.reden === "teller"
          ? `Passkey van ${email} geweigerd: de teller liep terug (mogelijk een gekopieerd toestel)`
          : `Mislukte inlogpoging met passkey voor ${email}`,
      actorUserId: user.id,
      targetType: "email",
      targetId: email,
      metadata: { failures, methode: "passkey", reden: uit.reden, passkeyId: passkey.id },
    });
    if (locked) return { ok: false, code: "locked" };
    return { ok: false, code: uit.reden === "uv" ? "passkey_uv" : "passkey_mislukt" };
  }

  // teller vastleggen als compare-and-set: twee gelijktijdige inlogs met dezelfde stand gaan niet allebei door
  const bijgewerkt = await prisma.passkey.updateMany({
    where: { id: passkey.id, signCount: passkey.signCount },
    data: { signCount: BigInt(uit.signCount), lastUsedAt: now, backedUp: uit.backedUp },
  });
  if (bijgewerkt.count !== 1) return { ok: false, code: "passkey_mislukt" };

  await clearLoginFailures(email);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  await recordAudit({
    category: "AUTH",
    action: "auth.login.succeeded",
    actorUserId: user.id,
    actorLabel: "user",
    summary: `Inloggen geslaagd met passkey: ${email}`,
    targetType: "user",
    targetId: user.id,
    metadata: { methode: "passkey", passkeyId: passkey.id, uv: uit.uv },
  });

  return { ok: true, user: { id: user.id, email: user.email, name: user.fullName, remember: raw.remember === "1" } };
}
