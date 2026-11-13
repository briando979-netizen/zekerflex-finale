import { CompanyStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { cached, withCircuitBreaker } from "@/lib/redis";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { limietUitAntwoord, tegoedUitAntwoord } from "@/lib/kvk/tegoed";
import { bewaarKvkTegoed } from "@/lib/kvk/tegoed-opslag";
import { registerVers, type RegisterUitkomst } from "@/lib/kvk/register-cache";
import type {
  CompanyActivity,
  CompanyProfile,
  CompanySearchHit,
  CompanyVat,
  VatValidation,
} from "@/types/company";

// ---------------------------------------------------------------------------
// KVKBase integration — https://api.kvkbase.nl/v1
//
//   GET /v1/lookup/{kvk}[?enrich=true]     company profile (enrich adds VAT + activities)
//   GET /v1/search?q=&pageSize=            full search
//   GET /v1/autocomplete?q=&limit=         type-ahead
//   GET /v1/validate/vat/{vatNumber}       VIES-backed VAT validation
//   GET /v1/health                         (no auth)
//
// Auth: `Authorization: Bearer <KVKBASE_API_KEY>`.
// Errors: { "error": { "code": "NOT_FOUND" | "UNAUTHORIZED" | "RATE_LIMITED" | … , "message": "…" } }
//
// The vendor payload is normalised through `normalizeCompany()` / `normalizeHit()`
// — the ONLY place that knows KVKBase's field names.
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 60 * 60 * 12;

export function isKvkBaseEnabled(): boolean {
  return Boolean(env.KVKBASE_API_KEY);
}

function normalizeKvkNumber(input: string): string {
  return input.replace(/\D/g, "");
}

interface KvkBaseError {
  error?: { code?: string; message?: string };
}

async function kvkbaseFetch<T>(path: string): Promise<T> {
  if (!env.KVKBASE_API_KEY) {
    throw AppError.upstream("KVKBASE_API_KEY is not configured");
  }
  const base = env.KVKBASE_API_URL.replace(/\/$/, "");
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await withCircuitBreaker("kvkbase", () =>
      fetch(url, {
        headers: {
          authorization: `Bearer ${env.KVKBASE_API_KEY}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }),
    );
  } catch (err) {
    logger.error("kvkbase transport error", {
      path,
      error: (err as Error).message,
    });
    throw AppError.upstream("De KVK-dienst is tijdelijk niet bereikbaar.");
  }

  // het tegoed en de limiet staan bij elk antwoord in de headers: bewaren, zodat Beheer het ziet (lib/kvk/tegoed.ts)
  const meetTegoed = (code: string | null) => {
    const t = tegoedUitAntwoord(res.headers, code, new Date());
    if (t) void bewaarKvkTegoed(t);
  };

  if (res.ok) {
    meetTegoed(null);
    return (await res.json()) as T;
  }

  const body = (await res.json().catch(() => ({}))) as KvkBaseError;
  const code = body.error?.code ?? `HTTP_${res.status}`;
  const message = body.error?.message ?? `KVKBase responded ${res.status}`;
  meetTegoed(body.error?.code ?? null);

  switch (res.status) {
    case 400:
      throw AppError.validation(message);
    case 401:
    case 403:
      logger.error("kvkbase auth rejected", { code });
      throw AppError.upstream("De KVK-dienst weigert de sleutel van ZekerFlex.");
    case 404:
      throw AppError.notFound("Geen inschrijving gevonden voor dit KVK-nummer.");
    case 402:
    case 429: {
      // 13 nov 2026: QUOTA_EXCEEDED (maandtegoed op) en RATE_LIMIT_EXCEEDED (te veel deze minuut) zijn allebei 429; vroeger
      // heette alles "rate limit", ook een tegoed dat de hele maand op bleef. De soort gaat mee (details.kvkLimiet).
      const limiet = limietUitAntwoord(res.status, body.error?.code ?? null, res.headers.get("retry-after"));
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        limiet?.soort === "tegoed" ? "Het tegoed van de KVK-dienst is op." : "De KVK-dienst krijgt nu te veel vragen.",
        503,
        { kvkLimiet: limiet ?? { soort: "minuut", naSeconden: 60 } },
      );
    }
    default:
      logger.error("kvkbase http error", { path, status: res.status, code });
      throw AppError.upstream(message);
  }
}

// --- normalisation ------------------------------------------------------

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : null;
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};

const COUNTRY_ALIASES: Record<string, string> = {
  nederland: "NL",
  netherlands: "NL",
  "the netherlands": "NL",
};

function normalizeCountry(v: unknown): string {
  const c = str(v);
  if (!c) return "NL";
  return COUNTRY_ALIASES[c.toLowerCase()] ?? c;
}

function normalizeAddress(raw: Raw): CompanyProfile["address"] {
  const a = (raw.address as Raw) ?? {};
  return {
    street: str(a.street),
    houseNumber: str(a.houseNumber),
    postalCode: str(a.postalCode),
    city: str(a.city),
    country: normalizeCountry(a.country),
  };
}

const UNKNOWN_LEGAL_FORMS = new Set(["onbekend", "unknown", "n/a", "-"]);
function normalizeLegalForm(v: unknown): string | null {
  const s = str(v);
  return s && !UNKNOWN_LEGAL_FORMS.has(s.toLowerCase()) ? s : null;
}

function normalizeActivities(raw: Raw): CompanyActivity[] {
  const list = raw.activities;
  if (!Array.isArray(list)) return [];
  return list
    .filter((i): i is Raw => typeof i === "object" && i !== null)
    .map((i) => ({
      sbiCode: str(i.sbiCode) ?? "",
      description: str(i.description),
      isMain: bool(i.isMain) ?? false,
    }))
    .filter((a) => a.sbiCode !== "");
}

function normalizeVat(raw: Raw): CompanyVat | null {
  const v = raw.vat as Raw | undefined;
  if (!v || typeof v !== "object") return null;
  return {
    number: str(v.number),
    valid: bool(v.valid) ?? false,
    status: str(v.status),
    validatedAt: isoDate(v.validatedAt),
    checksumValid: bool(v.checksumValid),
  };
}

export function normalizeCompany(raw: Raw): CompanyProfile {
  const activities = normalizeActivities(raw);
  const tradingNames = raw.tradingNames;
  const legalName =
    str(raw.statutoryName) ?? str(raw.name) ?? "Onbekend";
  // Prefer a trading name that is not just the legal name repeated.
  const tradeName = Array.isArray(tradingNames)
    ? (tradingNames.map(str).find((t) => t && t !== legalName) ?? str(tradingNames[0]))
    : null;

  const enriched = raw.enriched === true;
  const insolvent = Boolean(raw.insolvency) || Boolean(raw.insolvencyType);
  const activeFlag = bool(raw.isActive);

  let status: CompanyStatus;
  if (activeFlag === true) status = CompanyStatus.ACTIVE;
  else if (activeFlag === false || insolvent) status = CompanyStatus.DISSOLVED;
  else status = enriched ? CompanyStatus.ACTIVE : CompanyStatus.UNKNOWN;

  const employees = raw.employees as Raw | undefined;

  return {
    kvkNumber: normalizeKvkNumber(str(raw.kvkNumber) ?? ""),
    legalName,
    tradeName,
    legalForm: normalizeLegalForm(raw.legalForm),
    status,
    isActive: status === CompanyStatus.ACTIVE,
    insolvent,
    establishmentNumber: str(raw.mainBranchNumber ?? raw.branchNumber),
    address: normalizeAddress(raw),
    activities,
    sbiCodes: activities.map((a) => a.sbiCode),
    registrationDate: isoDate(raw.registrationDate),
    employeeCount: int(employees?.total) ?? int(raw.employeeCount),
    vat: normalizeVat(raw),
    raw,
  };
}

function normalizeHit(raw: Raw): CompanySearchHit {
  return {
    kvkNumber: normalizeKvkNumber(str(raw.kvkNumber) ?? ""),
    legalName: str(raw.name) ?? "Onbekend",
    city: str(raw.city),
    isActive: bool(raw.isActive) ?? false,
  };
}

// --- public API --------------------------------------------------------

export interface LookupOptions {
  /** Enriched lookup: adds VAT validation + SBI activities (costs more tokens). */
  enrich?: boolean;
}

export async function lookupCompany(
  kvkNumberInput: string,
  opts: LookupOptions = {},
): Promise<CompanyProfile> {
  const kvkNumber = normalizeKvkNumber(kvkNumberInput);
  if (kvkNumber.length !== 8) {
    throw AppError.validation("Een KVK-nummer bestaat uit 8 cijfers");
  }
  const enrich = opts.enrich ? "1" : "0";

  // eerst de bewaarde uitkomst (Postgres-KV; gevonden 30 dagen, "niet gevonden" 1 dag, lib/kvk/register-cache.ts): een
  // opvraging kost tegoed, en een inschrijving verandert zelden. Wie met enrich vraagt, mag ook het antwoord met enrich van eerder gebruiken.
  const register = await leesRegister(kvkNumber, enrich);
  if (register?.nietGevonden) throw AppError.notFound("Geen inschrijving gevonden voor dit KVK-nummer.");
  if (register?.profiel) return register.profiel;

  try {
    const profiel = await cached(
      `kvkbase:lookup:v3:${kvkNumber}:${enrich}`,
      CACHE_TTL_SECONDS,
      async () => {
        const path = opts.enrich
          ? `/v1/lookup/${kvkNumber}?enrich=true`
          : `/v1/lookup/${kvkNumber}`;
        const raw = await kvkbaseFetch<Raw>(path);
        return normalizeCompany(raw);
      },
    );
    await bewaarRegister(kvkNumber, enrich, { profiel });
    return profiel;
  } catch (err) {
    if (err instanceof AppError && err.status === 404) await bewaarRegister(kvkNumber, enrich, { nietGevonden: true });
    throw err;
  }
}

// --- register-cache (gevonden 30 dagen, niet gevonden 1 dag; lib/kvk/register-cache.ts) --------------------------------
// Sleutel per KVK-nummer: een openbaar register, geen persoonsgegeven (basislijn in tests/kv-avg-bewaker.test.ts).

const REGISTER_PREFIX = "kvk-register:v1:";

async function leesRegister(kvkNumber: string, enrich: "0" | "1"): Promise<RegisterUitkomst | null> {
  const vers = (u: RegisterUitkomst | null) => registerVers(u, Date.now());
  const met = vers(await kvGet<RegisterUitkomst>(`${REGISTER_PREFIX}${kvkNumber}:1`).catch(() => null));
  if (met || enrich === "1") return met;
  return vers(await kvGet<RegisterUitkomst>(`${REGISTER_PREFIX}${kvkNumber}:0`).catch(() => null));
}

async function bewaarRegister(kvkNumber: string, enrich: "0" | "1", u: Omit<RegisterUitkomst, "at">): Promise<void> {
  await kvSet(`${REGISTER_PREFIX}${kvkNumber}:${enrich}`, { ...u, at: new Date().toISOString() }).catch(() => undefined);
}

export async function searchCompanies(
  query: string,
  pageSize = 15,
): Promise<CompanySearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  return cached(
    `kvkbase:search:v3:${q.toLowerCase()}:${pageSize}`,
    CACHE_TTL_SECONDS,
    async () => {
      const raw = await kvkbaseFetch<Raw>(
        `/v1/search?q=${encodeURIComponent(q)}&pageSize=${pageSize}`,
      );
      const results = Array.isArray(raw.results) ? raw.results : [];
      const seen = new Set<string>();
      const hits: CompanySearchHit[] = [];
      for (const item of results) {
        if (typeof item !== "object" || item === null) continue;
        const hit = normalizeHit(item as Raw);
        if (hit.kvkNumber.length !== 8 || seen.has(hit.kvkNumber)) continue;
        seen.add(hit.kvkNumber);
        hits.push(hit);
      }
      return hits;
    },
  );
}

export async function autocompleteCompanies(
  query: string,
  limit = 8,
): Promise<{ kvkNumber: string; name: string; city: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const raw = await kvkbaseFetch<Raw>(
    `/v1/autocomplete?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  const results = Array.isArray(raw.results) ? raw.results : [];
  return results
    .filter((i): i is Raw => typeof i === "object" && i !== null)
    .map((i) => ({
      kvkNumber: normalizeKvkNumber(str(i.kvkNumber) ?? ""),
      name: str(i.name) ?? "",
      city: str(i.city),
    }))
    .filter((r) => r.kvkNumber.length === 8);
}

/**
 * VIES-backed VAT validation via KVKBase. Cached 12h.
 */
export async function validateVat(vatNumberInput: string): Promise<VatValidation> {
  const vatNumber = vatNumberInput.replace(/[\s.-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vatNumber)) {
    return {
      vatNumber,
      valid: false,
      name: null,
      address: null,
      status: "malformed",
      checksumValid: false,
      validatedAt: null,
    };
  }

  return cached(
    `kvkbase:vat:v1:${vatNumber}`,
    CACHE_TTL_SECONDS,
    async () => {
      const raw = await kvkbaseFetch<Raw>(`/v1/validate/vat/${vatNumber}`);
      return {
        vatNumber: str(raw.vatNumber) ?? vatNumber,
        valid: bool(raw.valid) ?? false,
        name: str(raw.name),
        address: str(raw.address),
        status: str(raw.status),
        checksumValid: bool(raw.checksumValid),
        validatedAt: isoDate(raw.validatedAt),
      };
    },
  );
}

export interface KvkBaseHealth {
  status: string;
  services: Record<string, string>;
  timestamp: string;
}

export async function kvkbaseHealth(): Promise<KvkBaseHealth> {
  const base = env.KVKBASE_API_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw AppError.upstream(`KVKBase health ${res.status}`);
  return (await res.json()) as KvkBaseHealth;
}
