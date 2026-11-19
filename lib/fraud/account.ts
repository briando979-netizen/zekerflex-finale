import { prisma } from "@/lib/prisma";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { analyseCollusion } from "@/lib/fraud/collusion";
import { LEEG, anderenPerAccount, niveau, redenen, risicoScore, type AccountSignalen, type Reden, type RisicoNiveau } from "@/lib/fraud/account-regels";

// ---------------------------------------------------------------------------
// ZekerFlex FraudShield (19 nov 2026): één risicoscore per account uit signalen
// die al los werden bijgehouden maar nergens samenkwamen: een toestel dat door
// meer accounts wordt gebruikt (DeviceFingerprint.sharedWithUserIds, nooit
// getoond), hetzelfde identiteitsbewijs of rekeningnummer bij meer accounts,
// een gewijzigd rekeningnummer, de zwarte lijst en de collusiescore.
// Er komen geen rekeningnummers of documentnummers uit: alleen aantallen.
// Een signaal voor een mens; niemand wordt vanzelf geblokkeerd.
// ---------------------------------------------------------------------------

export interface RisicoAccount {
  userId: string;
  naam: string;
  score: number;
  niveau: RisicoNiveau;
  redenen: Reden[];
}

export interface FraudeOverzicht {
  accounts: RisicoAccount[];
  hoog: number;
  verhoogd: number;
  bekeken: number;
}

export async function fraudeOverzicht(limit = 50): Promise<FraudeOverzicht> {
  const [apparaten, documenten, profielen, paren] = await Promise.all([
    prisma.deviceFingerprint.findMany({ where: { NOT: { sharedWithUserIds: { isEmpty: true } } }, select: { userId: true, sharedWithUserIds: true }, take: 2000 }).catch(() => []),
    prisma.identityVerification.findMany({ where: { documentNumberHash: { not: null } }, select: { userId: true, documentNumberHash: true }, take: 20_000 }).catch(() => []),
    prisma.freelancerProfile
      .findMany({ where: { OR: [{ payoutIban: { not: null } }, { isBlacklisted: true }, { payoutIbanPendingVerification: true }] }, select: { id: true, userId: true, payoutIban: true, isBlacklisted: true, payoutIbanPendingVerification: true }, take: 20_000 })
      .catch(() => []),
    analyseCollusion({ minScore: 50, limit: 200 }).catch(() => []),
  ]);

  const perDocument = new Map<string, string[]>();
  for (const d of documenten) if (d.documentNumberHash) perDocument.set(d.documentNumberHash, [...(perDocument.get(d.documentNumberHash) ?? []), d.userId]);
  const perIban = new Map<string, string[]>();
  for (const p of profielen) {
    const iban = p.payoutIban?.replace(/\s+/g, "").toUpperCase();
    if (iban) perIban.set(iban, [...(perIban.get(iban) ?? []), p.userId]);
  }
  const dubbelDocument = anderenPerAccount([...perDocument.values()]);
  const gedeeldIban = anderenPerAccount([...perIban.values()]);
  const gedeeldApparaat = anderenPerAccount(apparaten.map((a) => [a.userId, ...a.sharedWithUserIds]));

  const userVanProfiel = new Map(profielen.map((p) => [p.id, p.userId]));
  const collusie = new Map<string, number>();
  const ontbrekend = paren.map((p) => p.freelancerId).filter((id) => !userVanProfiel.has(id));
  if (ontbrekend.length) {
    const extra = await prisma.freelancerProfile.findMany({ where: { id: { in: ontbrekend } }, select: { id: true, userId: true } }).catch(() => []);
    for (const e of extra) userVanProfiel.set(e.id, e.userId);
  }
  for (const p of paren) {
    const userId = userVanProfiel.get(p.freelancerId);
    if (userId) collusie.set(userId, Math.max(collusie.get(userId) ?? 0, p.score));
  }

  const signalen = new Map<string, AccountSignalen>();
  const zet = (userId: string, patch: Partial<AccountSignalen>) => signalen.set(userId, { ...(signalen.get(userId) ?? LEEG), ...patch });
  for (const [id, n] of dubbelDocument) zet(id, { dubbelDocument: n });
  for (const [id, n] of gedeeldIban) zet(id, { gedeeldIban: n });
  for (const [id, n] of gedeeldApparaat) zet(id, { gedeeldApparaat: n });
  for (const [id, n] of collusie) zet(id, { collusie: n });
  for (const p of profielen) {
    if (p.isBlacklisted) zet(p.userId, { geblokkeerd: true });
    if (p.payoutIbanPendingVerification) zet(p.userId, { ibanWachtOpControle: true });
  }

  const ids = [...signalen.keys()];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true, disabledAt: true } }).catch(() => []) : [];
  const accounts: RisicoAccount[] = [];
  for (const u of users) {
    // testaccounts delen bewust toestellen en gegevens; die horen hier niet
    if (isReservedTestAddress(u.email)) continue;
    const s = signalen.get(u.id);
    if (!s) continue;
    const score = risicoScore(s);
    if (score <= 0) continue;
    accounts.push({ userId: u.id, naam: u.fullName, score, niveau: niveau(score), redenen: redenen(s) });
  }
  accounts.sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam));
  return {
    accounts: accounts.slice(0, limit),
    hoog: accounts.filter((a) => a.niveau === "hoog").length,
    verhoogd: accounts.filter((a) => a.niveau === "verhoogd").length,
    bekeken: accounts.length,
  };
}
