import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// De officiële koppeling met het Alibaba.com Open Platform (16 nov 2026, eigenaar stuurde de documentatie van
// /auth/token/create). Een link van Alibaba lezen werkt maar half (captcha op /product-detail/, zie
// lib/shop/link-product*.ts); met een app op het Open Platform haalt Winkel-AI producten officieel op.
// Zo werkt het (Open Platform, "IOP"):
//  1. de beheerder gaat naar de autorisatiepagina (client_id = app key, redirect_uri = onze terug-route);
//  2. Alibaba stuurt een code terug (30 minuten geldig);
//  3. /auth/token/create ruilt die code voor een access_token en refresh_token; /auth/token/refresh vernieuwt.
// Elk verzoek: app_key, timestamp (ms), sign_method=sha256 en sign = HMAC-SHA256(app secret, API-pad + de
// parameters op naam gesorteerd, naam en waarde aan elkaar), in hoofdletters. Puur bestand (alleen node:crypto).
// ---------------------------------------------------------------------------

/** De handtekening van een verzoek: API-pad + gesorteerde parameters (zonder sign), HMAC-SHA256, hoofdletters. */
export function tekenAlibaba(apiPad: string, params: Readonly<Record<string, string>>, secret: string): string {
  const reeks =
    apiPad +
    Object.keys(params)
      .filter((k) => k !== "sign")
      .sort()
      .map((k) => `${k}${params[k] ?? ""}`)
      .join("");
  return createHmac("sha256", secret).update(reeks, "utf8").digest("hex").toUpperCase();
}

/** Alle parameters van een verzoek, met de systeemparameters en de handtekening erbij. */
export function verzoekParams(apiPad: string, zaak: Readonly<Record<string, string>>, opts: { appKey: string; secret: string; accessToken?: string | undefined; nu?: number }): Record<string, string> {
  const params: Record<string, string> = {
    ...zaak,
    app_key: opts.appKey,
    timestamp: String(opts.nu ?? Date.now()),
    sign_method: "sha256",
    ...(opts.accessToken ? { access_token: opts.accessToken } : {}),
  };
  return { ...params, sign: tekenAlibaba(apiPad, params, opts.secret) };
}

/** De autorisatiepagina waar de beheerder ZekerFlex toestemming geeft (redirect_uri moet gelijk zijn aan die in de app). */
export function autorisatieAdres(basis: string, appKey: string, terug: string, state: string): string {
  const u = new URL(basis);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("force_auth", "true");
  u.searchParams.set("redirect_uri", terug);
  u.searchParams.set("client_id", appKey);
  u.searchParams.set("state", state);
  return u.toString();
}

export interface AlibabaToken {
  access: string;
  refresh: string;
  /** ISO-tijd waarop het access_token verloopt */
  verlooptOp: string;
  /** ISO-tijd waarop het refresh_token verloopt; null = niet te vernieuwen (refresh_expires_in 0) */
  refreshVerlooptOp: string | null;
  /** de accountnaam bij Alibaba, als die meekomt */
  account: string | null;
}

const getal = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/**
 * Het antwoord van /auth/token/create of /auth/token/refresh, soepel gelezen: soms staat alles bovenaan, soms onder een
 * omhulsel. Een foutantwoord (code ≠ "0", of geen token) geeft { fout } met de melding van Alibaba.
 */
export function leesTokenAntwoord(raw: unknown, nu: number): AlibabaToken | { fout: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const binnen = Object.values(r).find((v) => v && typeof v === "object" && "access_token" in (v as object)) as Record<string, unknown> | undefined;
  const d = typeof r.access_token === "string" ? r : (binnen ?? r);
  const code = d.code ?? r.code;
  if (typeof d.access_token !== "string" || !d.access_token || (code !== undefined && String(code) !== "0")) {
    const melding = [d.message, r.message, d.msg, r.msg, d.error_code, r.error_code].find((x) => typeof x === "string" && x) as string | undefined;
    return { fout: melding ?? "Alibaba gaf geen toegangstoken terug." };
  }
  const verloopt = getal(d.expires_in) ?? 0;
  const refreshVerloopt = getal(d.refresh_expires_in);
  return {
    access: d.access_token,
    refresh: typeof d.refresh_token === "string" ? d.refresh_token : "",
    verlooptOp: new Date(nu + verloopt * 1000).toISOString(),
    refreshVerlooptOp: refreshVerloopt && refreshVerloopt > 0 ? new Date(nu + refreshVerloopt * 1000).toISOString() : null,
    account: typeof d.account === "string" && d.account ? d.account : null,
  };
}
