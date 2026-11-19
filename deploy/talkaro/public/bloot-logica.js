// De beoordeling van de bloot-herkenning, als pure functies: ze rekenen alleen, ze kijken niet naar het scherm en
// praten met niemand. Zo kan de browser ze gebruiken (bloot.js) én kunnen de tests ze los nameten (zonder camera).
//
// NSFWJS geeft per beeld vijf kansen: Drawing (tekening), Hentai (getekend seksueel), Neutral (gewoon),
// Porn (expliciet), Sexy (schaars gekleed/suggestief). Samen tellen ze op tot ongeveer 1.
//
// Keuzes, met opzet voorzichtig:
//  - "Naaktheid" leunt op Porn + Hentai samen. Dat is het duidelijke signaal voor expliciet beeld.
//  - "Sexy" (bikini, blote schouders, suggestief maar gekleed) laten we NIET automatisch het gesprek verbreken:
//    daar zitten te veel onschuldige beelden tussen (strand, sport). We kunnen er hooguit zacht voor waarschuwen.
//  - Eén enkel raar frame verbreekt nooit: er moeten een paar metingen achter elkaar verdacht zijn. Een webcam
//    geeft soms één wazig of donker beeld; dat mag geen vals alarm worden.
// Dit is hulp, geen garantie: het model mist dingen en slaat soms vals alarm.

export const STANDAARD = {
  drempel: 0.60,        // Porn + Hentai samen hierboven = "verdacht"
  sexyDrempel: 0.90,    // alleen Sexy telt pas mee als het model er heel zeker van is (en dan nog: hooguit waarschuwen)
  nodigAchtereen: 2,    // zoveel verdachte metingen achter elkaar vóór we het gesprek verbreken
};

// Maak van de uitvoer van het model altijd hetzelfde nette object met kansen 0..1.
// Accepteert de lijst [{ className, probability }] van NSFWJS óf een gewoon object { Porn: .9, ... }.
export function naarKansen(voorspelling) {
  const uit = { drawing: 0, hentai: 0, neutral: 0, porn: 0, sexy: 0 };
  if (!voorspelling) return uit;
  const zet = (naam, kans) => {
    const sleutel = String(naam || '').toLowerCase();
    if (sleutel in uit && Number.isFinite(kans)) uit[sleutel] = Math.min(1, Math.max(0, kans));
  };
  if (Array.isArray(voorspelling)) for (const p of voorspelling) zet(p?.className, Number(p?.probability));
  else if (typeof voorspelling === 'object') for (const [k, v] of Object.entries(voorspelling)) zet(k, Number(v));
  return uit;
}

// De "expliciet"-score: hoe zeker het model is van expliciet (getekend of echt) naakt/seks.
export function blootScore(voorspelling) {
  const k = naarKansen(voorspelling);
  return k.porn + k.hentai;
}

// Is dit ene beeld verdacht genoeg om mee te tellen? (Nog niet: meteen verbreken — zie volg().)
export function isVerdacht(voorspelling, opties = {}) {
  const { drempel = STANDAARD.drempel, sexyDrempel = STANDAARD.sexyDrempel } = opties;
  const k = naarKansen(voorspelling);
  return (k.porn + k.hentai) >= drempel || k.sexy >= sexyDrempel;
}

// De kleine toestandsmachine over opeenvolgende metingen. Geef er de vorige staat en of dit beeld verdacht was;
// je krijgt de nieuwe staat terug plus wat te doen: 'niets', 'waarschuw' (eerste verdachte meting) of 'verbreek'.
// Eén schoon beeld zet de teller meteen terug op nul.
export function volg(staat, verdacht, opties = {}) {
  const { nodigAchtereen = STANDAARD.nodigAchtereen } = opties;
  const achtereen = verdacht ? (staat?.achtereen || 0) + 1 : 0;
  let actie = 'niets';
  if (achtereen >= nodigAchtereen) actie = 'verbreek';
  else if (achtereen === 1) actie = 'waarschuw';
  return { achtereen, actie };
}
