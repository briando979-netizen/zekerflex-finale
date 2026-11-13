// Puur, voor de route POST /api/inbox/:id/transcript (een route mag zelf geen hulpjes exporteren).

/**
 * Hoe lang Whisper mag over een spraakbericht doen. Gemeten 13 nov op prod: 1 s audio kostte 15 s (vooral vaste
 * opstarttijd op de cpu), dus een vaste 45 s is te krap voor een lang bericht. 45 s plus 3 s per seconde audio,
 * hooguit 240 s: ruim onder de 5 minuten die Node een verzoek geeft. Onbekende lengte: als één minuut.
 */
export function uitschrijfTijd(durationSec: number | undefined): number {
  const sec = durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 60;
  return Math.min(240_000, 45_000 + Math.ceil(sec) * 3_000);
}
