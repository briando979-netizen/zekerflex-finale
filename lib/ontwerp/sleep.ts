// Verslepen in de Site-ontwerper (13 nov 2026, eigenaar: "alles moet ik kunnen verslepen"). Puur: de rekenregels van het slepen,
// los van de browser, zodat ze te testen zijn. Het slepen zelf (aanwijzer, toetsen) staat in components/admin/ontwerper/Sleep.tsx.

/** De lijst met het onderdeel van plek `van` op plek `naar`; een plek buiten de lijst of dezelfde plek geeft de lijst ongewijzigd terug. */
export function verplaatsNaar<T>(lijst: readonly T[], van: number, naar: number): T[] {
  const n = [...lijst];
  if (!Number.isInteger(van) || !Number.isInteger(naar) || van < 0 || van >= n.length || naar < 0 || naar >= n.length || van === naar) return n;
  const [x] = n.splice(van, 1);
  if (x !== undefined) n.splice(naar, 0, x);
  return n;
}

/**
 * Op welke plek een gesleepte rij terechtkomt. `middens` is het midden (in pixels, van boven naar beneden of van links naar
 * rechts) van elke rij in de huidige volgorde, `plek` is waar de aanwijzer nu is, `van` de rij die gesleept wordt. De rij komt
 * na alle andere rijen waarvan het midden vóór de aanwijzer ligt.
 */
export function doelIndex(middens: readonly number[], plek: number, van: number): number {
  let doel = 0;
  middens.forEach((midden, i) => {
    if (i !== van && midden < plek) doel += 1;
  });
  return Math.min(Math.max(doel, 0), Math.max(middens.length - 1, 0));
}
