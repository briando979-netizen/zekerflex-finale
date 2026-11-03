// Regels voor inzage en verwijdering (AVG) op de Schwarzwald-site, los van de
// opslag zodat ze zonder database te testen zijn.

/** Hoort een opgeslagen rij bij dit e-mailadres (als contact of als account)? */
export function hoortBij(waarde: { email?: unknown; account?: unknown }, email: string): boolean {
  const e = email.trim().toLowerCase();
  const gelijk = (v: unknown) => typeof v === "string" && v.trim().toLowerCase() === e;
  return gelijk(waarde.email) || gelijk(waarde.account);
}

/** Eerste reservering van vandaag of later die nog doorgaat: die houdt wissen tegen. */
export function komendeReservering<T extends { datum: string; tijd: string; status: string }>(boekingen: T[], vandaag: string): T | undefined {
  return boekingen
    .filter((b) => b.status !== "geannuleerd" && b.datum >= vandaag)
    .sort((a, b) => `${a.datum}${a.tijd}`.localeCompare(`${b.datum}${b.tijd}`))[0];
}
