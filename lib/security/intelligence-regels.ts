// Pure regels voor ZekerFlex Security Intelligence (lib/security/intelligence.ts):
// tellen en indelen van beveiligingssignalen uit het auditlogboek. Geen prisma,
// kv of netwerk, zodat het los te testen is en ook een scherm het mag gebruiken.

export interface Signaal {
  id: string;
  at: string;
  category: string;
  action: string;
  severity: string;
  summary: string;
}

export interface SignaalTelling {
  /** mislukte inlogpogingen in de laatste 24 uur */
  mislukt24u: number;
  /** accounts die in de laatste 24 uur op slot gingen na te veel pogingen */
  slot24u: number;
  /** beveiligingsgebeurtenissen (categorie SECURITY) in het hele venster */
  beveiliging: number;
  /** daarvan met ernst warning of critical */
  ernstig: number;
}

const DAG = 86_400_000;

export const isMislukteLogin = (s: Pick<Signaal, "action">): boolean => s.action === "auth.login.failed";
export const isInlogslot = (s: Pick<Signaal, "action">): boolean => s.action === "auth.login.locked";
export const isErnstig = (s: Pick<Signaal, "severity">): boolean => s.severity === "warning" || s.severity === "critical";

/** Telt de signalen. Een signaal met een onleesbare tijd telt niet mee in de 24-uurscijfers. */
export function telSignalen(signalen: Signaal[], now: number): SignaalTelling {
  const sinds = now - DAG;
  let mislukt24u = 0;
  let slot24u = 0;
  let beveiliging = 0;
  let ernstig = 0;
  for (const s of signalen) {
    const t = Date.parse(s.at);
    const vers = Number.isFinite(t) && t >= sinds;
    if (isMislukteLogin(s)) {
      if (vers) mislukt24u += 1;
      continue;
    }
    if (isInlogslot(s) && vers) slot24u += 1;
    if (s.category === "SECURITY") {
      beveiliging += 1;
      if (isErnstig(s)) ernstig += 1;
    }
  }
  return { mislukt24u, slot24u, beveiliging, ernstig };
}

/**
 * Wat in de tijdlijn komt: alles van categorie SECURITY, en mislukte logins
 * alleen als groep per uur (anders verdringen ze de rest). Nieuwste eerst.
 */
export function tijdlijn(signalen: Signaal[], max = 40): { key: string; at: string; tekst: string; ernstig: boolean }[] {
  const uit: { key: string; at: string; tekst: string; ernstig: boolean }[] = [];
  const perUur = new Map<string, { at: string; n: number }>();
  for (const s of signalen) {
    if (isMislukteLogin(s)) {
      const uur = s.at.slice(0, 13);
      const cur = perUur.get(uur);
      if (cur) cur.n += 1;
      else perUur.set(uur, { at: s.at, n: 1 });
      continue;
    }
    uit.push({ key: s.id, at: s.at, tekst: s.summary, ernstig: isErnstig(s) });
  }
  for (const [uur, g] of perUur) {
    uit.push({ key: `mislukt:${uur}`, at: g.at, tekst: g.n === 1 ? "1 mislukte inlogpoging" : `${g.n} mislukte inlogpogingen in dit uur`, ernstig: g.n >= 20 });
  }
  return uit.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}
