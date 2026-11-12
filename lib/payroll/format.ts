// Client-safe formatting helpers for payroll figures. No Node imports — safe to
// use from "use client" components.

export function euro(cents: number, intl = "nl-NL"): string {
  return `€ ${(cents / 100).toLocaleString(intl, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
