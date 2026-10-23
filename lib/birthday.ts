// Is a stored geboortedatum (YYYY-MM-DD) today? Month+day match only — the year
// is irrelevant for a birthday. Returns false for missing/malformed dates.
export function isBirthdayToday(birthDate: string | null | undefined, now = new Date()): boolean {
  if (!birthDate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return false;
  return Number(m[2]) === now.getMonth() + 1 && Number(m[3]) === now.getDate();
}
