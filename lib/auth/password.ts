import { createHash, randomInt } from "node:crypto";

// ---------------------------------------------------------------------------
// Password helpers for account creation:
//   generatePassword()  — a strong suggested password
//   scorePassword()     — 0–4 strength + hints (client-safe, no I/O)
//   isBreached()        — checks the HaveIBeenPwned Pwned Passwords range API
//                         (k-anonymity: only the SHA-1 prefix leaves the box),
//                         with a bundled common-password fallback when offline.
// ---------------------------------------------------------------------------

// The few hundred most common leaked passwords, for an offline check when the
// HIBP range API is unreachable. Lowercased.
const COMMON_LEAKED = new Set(
  `123456 123456789 12345678 password qwerty 12345 123123 111111 1234567 1234567890
   1234 qwerty123 000000 1q2w3e aa12345678 abc123 password1 1234561 qwertyuiop 123321
   password123 1q2w3e4r5t 654321 123qwe 666666 987654321 123 1q2w3e4r 7777777 123abc
   112233 abcabc123 azerty 555555 dragon 1qaz2wsx qazwsx 123654 zxcvbnm iloveyou
   welcome monkey 121212 555666 888888 121314 wachtwoord welkom welkom01 welkom123
   admin admin123 root toor letmein passw0rd p@ssw0rd trustno1 sunshine princess
   football baseball master hello123 whatever qwe123 asd123 test test123 changeme
   secret summer winter spring autumn ajax feyenoord psv oranje amsterdam rotterdam
   liverpool arsenal chelsea barcelona realmadrid pokemon superman batman starwars
   google facebook internet computer samsung michael jordan hunter buster jennifer
   thomas robert daniel andrew joshua matthew ashley bailey charlie 09876543
   michelle nicole hannah 123123123 asdfghjkl a123456 a12345678 1234554321 qq123456`
    .split(/\s+/)
    .filter(Boolean),
);

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SYMBOLS = "!@#$%^&*-_=+";

export function generatePassword(length = 16): string {
  const pool = ALPHABET + SYMBOLS;
  let out = "";
  for (let i = 0; i < length; i++) out += pool[randomInt(0, pool.length)];
  // guarantee at least one of each class
  const put = (chars: string, at: number) => {
    out = out.slice(0, at) + chars[randomInt(0, chars.length)] + out.slice(at + 1);
  };
  put("abcdefghijkmnpqrstuvwxyz", 0);
  put("ABCDEFGHJKLMNPQRSTUVWXYZ", 1);
  put("23456789", 2);
  put(SYMBOLS, 3);
  return out;
}

export interface PasswordScore {
  /** 0 (very weak) … 4 (strong) */
  score: number;
  label: "zeer zwak" | "zwak" | "matig" | "goed" | "sterk";
  warnings: string[];
}

const LABELS: PasswordScore["label"][] = ["zeer zwak", "zwak", "matig", "goed", "sterk"];

export function scorePassword(pw: string, extraBad: string[] = []): PasswordScore {
  const warnings: string[] = [];
  if (!pw) return { score: 0, label: "zeer zwak", warnings: ["Vul een wachtwoord in."] };

  const lower = pw.toLowerCase();
  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/\d/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (pw.length >= 16 && classes >= 3) score += 1;

  if (pw.length < 8) warnings.push("Minimaal 8 tekens.");
  if (classes < 3) warnings.push("Gebruik hoofd- en kleine letters, cijfers en een teken.");
  if (/^(.)\1+$/.test(pw) || /^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/.test(lower)) {
    warnings.push("Vermijd herhalingen en toetsenbordreeksen.");
    score = Math.min(score, 1);
  }
  if (COMMON_LEAKED.has(lower) || extraBad.map((s) => s.toLowerCase()).includes(lower)) {
    warnings.push("Dit is een veelgebruikt wachtwoord.");
    score = 0;
  }
  if (extraBad.some((s) => s && lower.includes(s.toLowerCase()) && s.length >= 3)) {
    warnings.push("Gebruik je naam of e-mailadres niet in je wachtwoord.");
    score = Math.min(score, 1);
  }

  score = Math.max(0, Math.min(4, score));
  return { score, label: LABELS[score]!, warnings };
}

/**
 * True when the password appears in a known breach corpus. Uses the HIBP
 * Pwned Passwords range endpoint (only the first 5 hex chars of the SHA-1 are
 * sent). Any network failure → falls back to the bundled common list, never
 * throws.
 */
export async function isBreached(pw: string): Promise<boolean> {
  if (!pw) return false;
  if (COMMON_LEAKED.has(pw.toLowerCase())) return true;

  const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: ctrl.signal,
      headers: { "Add-Padding": "true" },
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false; // offline / blocked — the common-list check above already ran
  }
}
