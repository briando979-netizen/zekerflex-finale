export function formatHm(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}u ${String(m).padStart(2, "0")}m`;
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(2)} u`;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// Altijd Nederlandse tijd: de server draait in UTC, de browser niet. Zonder vaste
// tijdzone toont de pagina twee verschillende tijden en mislukt de hydratatie.
const TZ = "Europe/Amsterdam";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}
