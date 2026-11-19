// Beheerpagina: meldingen bekijken, blokkeren en deblokkeren. Het geheim gaat bij elk verzoek mee in een kop
// (nooit in het adres, nooit in een cookie) en staat alleen in dit tabblad tot je het sluit.
(() => {
  const $ = (id) => document.getElementById(id);
  const h = (tag, eig = {}, ...kinderen) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(eig)) { if (v === false || v === null || v === undefined) continue; if (k === 'class') el.className = v; else if (k === 'klik') el.addEventListener('click', v); else el.setAttribute(k, v); }
    for (const kind of kinderen.flat(Infinity)) if (kind !== null && kind !== undefined && kind !== false) el.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
    return el;
  };
  let geheim = ''; try { geheim = sessionStorage.getItem('tk_beheer') || ''; } catch (e) { /* */ }
  const tijd = (t) => new Date(t).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fout = (t) => { $('fout').textContent = t || ''; $('fout').hidden = !t; };

  async function vraag(pad, body) {
    const r = await fetch('/beheer/api/' + pad, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + geheim, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function actie(body) { try { fout(''); await vraag('actie', body); await laad(); } catch (e) { fout('Dat is niet gelukt. Ververs de pagina en probeer het opnieuw.'); } }

  async function laad() {
    let d;
    try { d = await vraag('overzicht'); }
    catch (e) {
      $('inhoud').hidden = true; $('inlog').hidden = false;
      // De server zegt bij een fout geheim alleen "niet gevonden", net als wanneer de beheerpagina uit staat.
      if (geheim) { $('inlog-fout').textContent = 'Geen toegang. Klopt het geheim? Na een paar missers moet je een kwartier wachten.'; $('inlog-fout').hidden = false; }
      geheim = ''; try { sessionStorage.removeItem('tk_beheer'); } catch (x) { /* */ }
      return;
    }
    try { sessionStorage.setItem('tk_beheer', geheim); } catch (e) { /* */ }
    $('inlog').hidden = true; $('inhoud').hidden = false; $('inlog-fout').hidden = true;
    const cijfer = (n, tekst) => h('div', { class: 'cijfer' }, h('b', {}, n), h('span', {}, tekst));
    $('cijfers').replaceChildren(cijfer(d.online, 'nu online'), cijfer(d.gesprekkenNu, 'gesprekken nu'), cijfer(d.zoekend, 'zoeken nu'), cijfer(d.vandaag.gesprekken || 0, 'gesprekken vandaag'),
      cijfer(d.vandaag.meldingen || 0, 'meldingen vandaag'), cijfer(d.openMeldingen, 'meldingen open'), cijfer(d.blokkades.length, 'nu geblokkeerd'));
    $('meldingen').replaceChildren(...(d.meldingen.length ? d.meldingen.map((m) => h('article', { class: `melding ${m.zwaar ? 'zwaar' : ''} ${m.status === 'afgehandeld' ? 'klaar' : ''}` },
      h('div', { class: 'kopregel' }, h('b', {}, m.redenTekst), h('span', {}, tijd(m.tijd)), h('span', { class: 'merkje' }, m.modus === 'video' ? 'video' : 'tekst'),
        m.zwaar ? h('span', { class: 'merkje rood' }, 'zwaar') : null, m.telt ? null : h('span', { class: 'merkje' }, 'telt niet mee'), m.gemeldGeblokkeerd ? h('span', { class: 'merkje rood' }, 'nu geblokkeerd') : null),
      h('p', {}, 'Gemeld: ', h('code', {}, m.gemeld), ' · melder: ', h('code', {}, m.melder)),
      m.toelichting ? h('p', {}, 'Toelichting: ', m.toelichting) : null,
      m.berichten ? h('div', { class: 'berichten' }, m.berichten.length ? m.berichten.map((b) => h('span', { class: b.wie }, `${b.wie === 'gemeld' ? 'Gemelde' : 'Melder'}: ${b.tekst}`)) : 'Er waren geen berichten in dit gesprek.') : h('p', { class: 'uitleg' }, 'Geen berichten meegestuurd.'),
      h('div', { class: 'rij' },
        m.gemeldGeblokkeerd ? h('button', { type: 'button', class: 'knop', klik: () => actie({ actie: 'deblokkeer', sleutel: m.gemeld }) }, 'Blokkade opheffen')
          : [h('button', { type: 'button', class: 'knop gevaar', klik: () => actie({ actie: 'blokkeer', sleutel: m.gemeld, uren: 24 }) }, 'Blokkeer 24 uur'), h('button', { type: 'button', class: 'knop gevaar', klik: () => actie({ actie: 'blokkeer', sleutel: m.gemeld, uren: 24 * 30 }) }, 'Blokkeer 30 dagen')],
        h('button', { type: 'button', class: 'knop', klik: () => actie({ actie: 'blokkeer', sleutel: m.melder, uren: 24 }) }, 'Blokkeer de melder 24 uur'),
        h('button', { type: 'button', class: 'knop', klik: () => actie({ actie: 'status', id: m.id, status: m.status === 'open' ? 'afgehandeld' : 'open' }) }, m.status === 'open' ? 'Afgehandeld' : 'Weer openzetten')))) : [h('p', { class: 'uitleg' }, 'Nog geen meldingen.')]));
    $('blokkades').replaceChildren(...(d.blokkades.length ? d.blokkades.map((b) => h('article', { class: 'melding' },
      h('div', { class: 'kopregel' }, h('code', {}, b.sleutel), h('span', {}, `tot ${tijd(b.tot)}`), h('span', { class: 'merkje' }, b.door === 'beheer' ? 'door beheer' : 'automatisch'), b.keer > 1 ? h('span', { class: 'merkje rood' }, `${b.keer}e keer`) : null),
      h('p', {}, 'Reden: ', (d.redenen[b.reden] && d.redenen[b.reden].label) || b.reden),
      h('div', { class: 'rij' }, h('button', { type: 'button', class: 'knop', klik: () => actie({ actie: 'deblokkeer', sleutel: b.sleutel }) }, 'Blokkade opheffen')))) : [h('p', { class: 'uitleg' }, 'Niemand is nu geblokkeerd.')]));
    $('dagen').replaceChildren(d.dagen.length ? h('table', {}, h('tr', {}, h('th', {}, 'Dag'), h('th', {}, 'Gesprekken'), h('th', {}, 'Meldingen')), d.dagen.slice().reverse().map((x) => h('tr', {}, h('td', {}, x.dag), h('td', {}, x.gesprekken || 0), h('td', {}, x.meldingen || 0)))) : h('p', { class: 'uitleg' }, 'Nog geen cijfers.'));
  }

  $('inlog').addEventListener('submit', (e) => { e.preventDefault(); geheim = $('token').value; $('token').value = ''; laad(); });
  $('ververs').addEventListener('click', laad);
  $('uitloggen').addEventListener('click', () => { geheim = ''; try { sessionStorage.removeItem('tk_beheer'); } catch (e) { /* */ } $('inhoud').hidden = true; $('inlog').hidden = false; });
  if (geheim) laad();
})();
