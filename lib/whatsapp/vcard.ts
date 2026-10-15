// ---------------------------------------------------------------------------
// vCard (.vcf) reader for a phone's contacts export — versions 2.1, 3.0 and
// 4.0, including folded lines and Android's QUOTED-PRINTABLE names. Keeps
// what a staffing desk needs: name, phone numbers, e-mail, organisation.
// ---------------------------------------------------------------------------

export interface ImportedContact {
  name: string;
  phones: string[];
  emails: string[];
  organization: string | null;
}

function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = [];
  const s = value.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(s.charCodeAt(i) & 0xff);
    }
  }
  return new TextDecoder(/utf-?8/i.test(charset) ? "utf-8" : "latin1").decode(new Uint8Array(bytes));
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Dutch-friendly E.164: 06… → +316…, 0031… → +31…; other formats kept with + and digits only. */
export function normalizePhone(raw: string): string | null {
  // "+31 (0)20 …": the bracketed trunk zero is only dialled from inside the country
  const s = raw.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s.length >= 8 ? `+${s.slice(1).replace(/\+/g, "")}` : null;
  if (s.startsWith("00")) return s.length >= 10 ? `+${s.slice(2)}` : null;
  if (s.startsWith("0") && s.length === 10) return `+31${s.slice(1)}`;
  return s.length >= 6 ? s : null;
}

export function parseVCards(source: string): ImportedContact[] {
  // unfold: a line starting with space/tab continues the previous one (QP soft breaks end in "=")
  const unfolded = source.replace(/\r?\n[ \t]/g, "").replace(/=\r?\n(?=[^\r\n]*)/g, "=\n");
  const lines = unfolded.split(/\r?\n/);
  const out: ImportedContact[] = [];
  let cur: { fn: string | null; n: string | null; phones: string[]; emails: string[]; org: string | null } | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    // vCard 2.1 quoted-printable values may continue on the next physical line after a trailing "="
    while (/ENCODING=QUOTED-PRINTABLE/i.test(line) && line.endsWith("=") && i + 1 < lines.length) {
      line = `${line.slice(0, -1)}${lines[++i]}`;
    }
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VCARD") {
      cur = { fn: null, n: null, phones: [], emails: [], org: null };
      continue;
    }
    if (upper === "END:VCARD") {
      if (cur) {
        // N = family;given;additional — Dutch "de" in additional: "Jan de Vries"
        const [family = "", given = "", additional = ""] = (cur.n ?? "").split(";").map(unescapeText);
        const fromN = [given, additional, family].filter(Boolean).join(" ");
        const name = cur.fn || fromN || cur.emails[0] || cur.phones[0] || "";
        if (name && (cur.phones.length || cur.emails.length)) {
          out.push({ name, phones: [...new Set(cur.phones)], emails: [...new Set(cur.emails)], organization: cur.org });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const head = line.slice(0, sep);
    let value = line.slice(sep + 1);
    const [propRaw, ...params] = head.split(";");
    const prop = (propRaw ?? "").replace(/^item\d+\./i, "").toUpperCase();
    const qp = params.some((p) => /QUOTED-PRINTABLE/i.test(p));
    const charset = params.find((p) => /^CHARSET=/i.test(p))?.split("=")[1] ?? "utf-8";
    if (qp) value = decodeQuotedPrintable(value, charset);

    if (prop === "FN") cur.fn = unescapeText(value);
    else if (prop === "N") cur.n = value;
    else if (prop === "ORG") cur.org = unescapeText(value.split(";")[0] ?? "") || null;
    else if (prop === "TEL") {
      const phone = normalizePhone(value.replace(/^tel:/i, ""));
      if (phone) cur.phones.push(phone);
    } else if (prop === "EMAIL") {
      const email = value.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) cur.emails.push(email);
    }
  }
  return out;
}
