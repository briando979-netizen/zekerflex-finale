// ---------------------------------------------------------------------------
// Een "Range"-kop lezen (RFC 9110 §14): welk stuk van een bestand vraagt de browser? Nodig om video's af te spelen:
// Safari (en dus elke iPhone) speelt een <video> alleen af als de server stukken kan geven (206 Partial Content).
// Puur: geen request, geen bestand. Alleen één bereik ("bytes=0-1023", "bytes=500-", "bytes=-500"); meerdere
// bereiken of een andere eenheid negeren we, en dan krijgt de browser gewoon het hele bestand (dat mag volgens de norm).
// ---------------------------------------------------------------------------

export type Bereik = { start: number; eind: number };

/**
 * null = geen (bruikbaar) bereik gevraagd: het hele bestand, status 200. "ongeldig" = een bereik dat buiten het
 * bestand valt: status 416 met `Content-Range: bytes *\/<grootte>`. Anders start en eind (allebei inclusief).
 */
export function leesBereik(kop: string | null | undefined, grootte: number): Bereik | "ongeldig" | null {
  if (!kop) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(kop.trim());
  if (!m) return null;
  const a = m[1] ?? "";
  const b = m[2] ?? "";
  if (a === "" && b === "") return "ongeldig";
  let start: number;
  let eind: number;
  if (a === "") {
    // "bytes=-500": de laatste 500 bytes
    const n = Number(b);
    if (n === 0) return "ongeldig";
    start = Math.max(0, grootte - n);
    eind = grootte - 1;
  } else {
    start = Number(a);
    eind = b === "" ? grootte - 1 : Math.min(Number(b), grootte - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(eind) || grootte <= 0 || start >= grootte || start > eind) return "ongeldig";
  return { start, eind };
}
