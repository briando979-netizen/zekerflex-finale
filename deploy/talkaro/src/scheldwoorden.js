// Een eenvoudig scheldwoordenfilter voor de tekstchat. Puur (geen netwerk, geen opslag), zodat het los te testen is.
// Het vangt alleen héle woorden uit een vaste lijst (Nederlands + Engels) en vervangt die door sterretjes.
// Bewust eenvoudig: we matchen geen delen van woorden (zo blijven "lullig", "assistent" of "Scunthorpe" heel),
// en we proberen niet slim te zijn met spaties of cijfers ("f u c k", "sh1t"). Liever iets missen dan onschuldige
// woorden blokkeren. Dit is hulp tegen de ergste woorden, geen sluitend filter.
//
// Niet in de lijst, met opzet: gewone identiteitswoorden ("homo", "hetero") en twijfelgevallen die ook onschuldig
// zijn ("lullen" = kletsen, "del", "damn"). Een scheldwoord censureren mag; iemands identiteit censureren niet.

// De lijst: duidelijke scheldwoorden en scheldsoorten. Houd hem kort en eenduidig; geen twijfelgevallen.
// Alles in kleine letters; de match zelf let niet op hoofdletters.
export const SCHELDWOORDEN = [
  // Nederlands
  'kut', 'kutwijf', 'lul', 'eikel', 'klootzak', 'hoer', 'hoerenzoon', 'slet', 'sloerie', 'teef',
  'mongool', 'debiel', 'flikker', 'flikkers',
  // scheldziekten worden in het Nederlands als zwaar scheldwoord gebruikt, los en als -lijer
  'kanker', 'kankerlijer', 'kankerhoer', 'tering', 'teringlijer', 'tyfus', 'tyfuslijer',
  'klere', 'klerelijer', 'pleuris', 'pleurislijer',
  // Engels
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bitches',
  'asshole', 'cunt', 'dick', 'dickhead', 'pussy', 'whore', 'slut', 'bastard', 'wanker', 'twat', 'prick', 'cock',
  // racistische en andere zware scheldwoorden
  'nigger', 'nigga', 'faggot', 'retard',
];

// Bouw één regex met woordgrenzen. De langste woorden eerst, zodat "motherfucker" of "kankerlijer" heel gevangen
// wordt en niet half ("fucker", "kanker") blijft staan.  \b is op ASCII gebaseerd; de lijst is ASCII, dus dat klopt.
const woorden = [...new Set(SCHELDWOORDEN.map((w) => w.toLowerCase()))].sort((a, b) => b.length - a.length);
const regex = new RegExp(`\\b(?:${woorden.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

// Vervang elk gevonden scheldwoord door evenveel sterretjes. De lengte blijft gelijk, het woord zelf is weg.
export function filterTekst(tekst) {
  if (typeof tekst !== 'string' || !tekst) return tekst;
  return tekst.replace(regex, (match) => '*'.repeat(match.length));
}

// Alleen kijken of er een scheldwoord in staat, zonder te vervangen (handig voor tellen of tests).
export function bevatScheldwoord(tekst) {
  if (typeof tekst !== 'string') return false;
  regex.lastIndex = 0;
  return regex.test(tekst);
}
