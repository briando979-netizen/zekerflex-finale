import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Een dienst van buiten valt uit: netwerkfout, time-out of een 5xx. Dat is nooit een kale 500 of een hangende
// pagina, maar een nette melding (AppError.upstream: 503, code UPSTREAM_UNAVAILABLE, geen 403). Een 4xx van de
// dienst ("zij zeggen nee") is iets anders en blijft een eigen fout. Pure hulpjes, geen netwerk hier.
// ---------------------------------------------------------------------------

/** "<dienst> is nu niet bereikbaar, probeer het later." als AppError.upstream. */
export function nietBereikbaar(dienst: string): AppError {
  return AppError.upstream(`${dienst} is nu niet bereikbaar, probeer het later.`);
}

/** Een statuscode die op uitval van de dienst wijst (5xx). */
export function isServerFout(status: number): boolean {
  return status >= 500;
}

/** fetch waarvan een netwerkfout of time-out een nette melding wordt; het antwoord zelf (ook een 5xx) komt ongewijzigd terug. */
export async function fetchOfUitval(dienst: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // geen details: de fout kan een adres met een token bevatten
    throw nietBereikbaar(dienst);
  }
}
