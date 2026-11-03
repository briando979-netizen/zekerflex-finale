import { leesOndertekend, onderteken } from "@/lib/voorstel/schwarzwald-accounts";

// Ondertekende link naar het agendabestand van één reservering, zodat het ook
// zonder account werkt (bevestiging na het boeken). Het bestand bevat geen
// gastgegevens; na verzetten hoort er een nieuwe link bij (andere datum).

export const icsToken = (b: { datum: string; id: string }) => onderteken({ ics: `${b.datum}:${b.id}` });

export function leesIcsToken(token: string | null): { datum: string; id: string } | null {
  const inhoud = leesOndertekend<{ ics?: unknown }>(token ?? undefined);
  if (typeof inhoud?.ics !== "string") return null;
  const [datum, id] = inhoud.ics.split(":");
  return datum && id ? { datum, id } : null;
}

export const icsAdres = (token: string) => `/api/voorstel/schwarzwald/agenda/ics?t=${encodeURIComponent(token)}`;

// Deel-link voor de groep (/uitje/<token>): alleen het nummer, zodat hij na
// verzetten blijft werken. Eigen veld "uitje", dus nooit te gebruiken als
// sessie of als agendalink.
export const uitjeToken = (id: string) => onderteken({ uitje: id });

export function leesUitjeToken(token: string): string | null {
  const inhoud = leesOndertekend<{ uitje?: unknown }>(decodeURIComponent(token));
  return typeof inhoud?.uitje === "string" ? inhoud.uitje : null;
}

export const uitjePad = (id: string) => `/voorstel/schwarzwald/uitje/${uitjeToken(id)}`;
