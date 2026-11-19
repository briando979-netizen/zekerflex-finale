// Koppelen: wie in de rij past het best bij deze zoeker? Puur (geen netwerk), zodat het los te testen is.
// Een zoeker is { id, sleutel, interests[], since, partner, recent: Map<id, tijd> }.

export const schoonInteresses = (lijst) => [...new Set((Array.isArray(lijst) ? lijst : [])
  .filter((s) => typeof s === 'string').map((s) => s.toLowerCase().replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30)).filter(Boolean))].slice(0, 10);

// Een code voor een privégesprek (uit "Nodig een vriend uit"). De browser maakt hem onraadbaar; dit controleert de vorm.
// 8 tot 24 tekens, alleen kleine letters en cijfers. Zo kan de code nooit een pad, een stuurteken of iets groots zijn.
export const geldigeCode = (code) => typeof code === 'string' && /^[a-z0-9]{8,24}$/.test(code);

// Mogen deze twee aan elkaar gekoppeld worden?
export function magSamen(u, o, nu, { nietOpnieuwMs = 600000, magNietSamen = () => false } = {}) {
  if (o === u || o.id === u.id) return false;
  if (o.partner || u.partner) return false;
  // Niet twee keer achter elkaar dezelfde: ook niet als er verder niemand is. Liever even wachten.
  if ((u.recent?.get(o.id) || -Infinity) + nietOpnieuwMs > nu || (o.recent?.get(u.id) || -Infinity) + nietOpnieuwMs > nu) return false;
  // Heeft de een de ander gemeld, dan komen ze elkaar niet meer tegen.
  if (magNietSamen(u.sleutel, o.sleutel)) return false;
  return true;
}

// Geeft { partner, common } of null. Eerst wie de meeste interesses deelt; bij gelijk wie het langst wacht.
// Iemand zonder gedeelde interesse komt pas in beeld als een van de twee lang genoeg gewacht heeft,
// of als geen van beiden een interesse heeft opgegeven.
export function kiesPartner(u, rij, nu, opties = {}) {
  const wacht = opties.wachtZonderInteresseMs ?? 5000;
  let best = null, bestCommon = [];
  for (const o of rij) {
    if (!magSamen(u, o, nu, opties)) continue;
    const common = u.interests.filter((i) => o.interests.includes(i));
    const zonderMag = (!u.interests.length && !o.interests.length) || nu - u.since >= wacht || nu - o.since >= wacht;
    if (!common.length && !zonderMag) continue;
    if (!best || common.length > bestCommon.length || (common.length === bestCommon.length && o.since < best.since)) { best = o; bestCommon = common; }
  }
  return best ? { partner: best, common: bestCommon } : null;
}
