// Spelletjes in de browser: uitnodigen, tekenen en zetten doorgeven. De regels zelf staan op de server.
(() => {
  const $ = (id) => document.getElementById(id);
  const { h } = window.TK;
  const LIJST = [
    ['tod', 'Doen, Durven of de Waarheid', 'Om de beurt kiezen; de ander zegt of het gelukt is'],
    ['drink', 'Proost! (drankspel)', 'Ik heb nog nooit, dobbelen, hoger of lager, categorieën'],
    ['poker', 'Poker 1 tegen 1', "Texas Hold'em met 1.000 speelfiches, zonder echt geld"],
    ['ttt', 'Boter, kaas en eieren', 'Drie op een rij op een bord van 3 bij 3'],
    ['c4', 'Vier op een rij', 'Wie heeft er het eerst vier op een rij?'],
    ['rps', 'Steen, papier, schaar', 'Wie het eerst drie rondes wint'],
  ];
  let nu = null, stoel = 0, klein = false;
  const stuur = (a, extra = {}) => window.TK.stuur({ t: 'g', a, ...extra });
  const zet = (d) => stuur('move', { d });
  const paneel = () => $('game');
  const wie = (i) => (i === stoel ? 'Jij' : 'De vreemde');
  const knop = (tekst, klik, eig = {}) => h('button', { type: 'button', class: 'knop ' + (eig.soort || ''), data: eig.f ? { f: eig.f } : null, disabled: eig.uit || false, on: { click: klik } }, tekst);

  function openMenu() {
    if (!window.TK.inGesprek()) { window.TK.sys('Een spel kan alleen tijdens een gesprek.'); return; }
    $('gmenu-list').replaceChildren(...LIJST.map(([id, naam, uitleg]) => h('button', { type: 'button', class: `spelkeus s-${id}`, on: { click: () => { stuur('invite', { game: id }); $('gmenu').close(); } } },
      h('span', { class: 'spelicoon', 'aria-hidden': 'true' }), h('b', {}, naam), h('small', {}, uitleg))));
    $('gmenu').showModal();
  }
  $('btn-games').addEventListener('click', openMenu);
  $('gmenu-close').addEventListener('click', () => $('gmenu').close());

  function onMsg(m) {
    if (m.a === 'invite') {
      const d = h('div', { class: 'uitnodiging' }, h('p', {}, 'De vreemde wil ', h('b', {}, String(m.name)), ' spelen.'),
        h('div', { class: 'rij' },
          knop('Meedoen', () => { stuur('accept'); d.remove(); }, { soort: 'hoofd' }),
          knop('Nee, bedankt', () => { stuur('decline'); d.remove(); window.TK.sys('Je hebt de uitnodiging afgeslagen.'); })));
      window.TK.voegToe(d);
    }
    if (m.a === 'invited') window.TK.sys(`Uitnodiging voor ${m.name} verstuurd. Wachten op de vreemde…`);
    if (m.a === 'declined') window.TK.sys(`De vreemde wil ${m.name} nu niet spelen.`);
    if (m.a === 'bezig') window.TK.sys('Er loopt al een spel. Stop dat eerst.');
    if (m.a === 'quit') { window.TK.sys(m.by === 'jij' ? 'Je hebt het spel gestopt.' : 'De vreemde heeft het spel gestopt.'); reset(); }
    if (m.a === 'state' && m.v && typeof m.v === 'object') {
      if (nu !== m.game) { window.TK.sys(`${m.name} is begonnen.`); klein = false; document.querySelectorAll('.uitnodiging').forEach((u) => u.remove()); }
      nu = m.game; stoel = m.seat === 1 ? 1 : 0;
      paneel().hidden = false; document.body.classList.add('speelt');
      try { teken(m.game, String(m.name), m.v); } catch (e) { console.warn('spel tekenen', e); }
    }
  }
  function reset() { nu = null; paneel().hidden = true; paneel().replaceChildren(); document.body.classList.remove('speelt'); }

  // Tekent het spel opnieuw en zet de focus terug op dezelfde knop (voor wie met het toetsenbord speelt).
  function raam(naam, stand, ...inhoud) {
    const p = paneel(), actief = p.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    p.classList.toggle('klein', klein);
    p.replaceChildren(
      h('div', { class: 'spelkop' }, h('b', {}, naam), h('span', { class: 'spelstand', 'aria-live': 'polite' }, stand || ''),
        h('button', { type: 'button', class: 'mini', data: { f: 'klein' }, 'aria-expanded': String(!klein), on: { click: () => { klein = !klein; p.classList.toggle('klein', klein); p.querySelector('[data-f=klein]').textContent = klein ? 'Toon' : 'Verberg'; p.querySelector('[data-f=klein]').setAttribute('aria-expanded', String(!klein)); } } }, klein ? 'Toon' : 'Verberg'),
        h('button', { type: 'button', class: 'mini gevaar', data: { f: 'stop' }, on: { click: async () => { if (await window.TK.vraag('Dit spel stoppen?', 'Stoppen', 'Doorspelen')) stuur('quit'); } } }, 'Stop spel')),
      h('div', { class: 'spelvlak' }, inhoud));
    if (actief) p.querySelector(`[data-f="${CSS.escape(actief)}"]:not([disabled])`)?.focus();
  }
  const score = (a, b, wat = '') => h('p', { class: 'score' }, h('span', { class: 'ik' }, `Jij ${a}`), ' – ', h('span', { class: 'zij' }, `${b} Vreemde`), wat ? h('small', {}, ' ' + wat) : null);
  const uitslag = (w) => (w === 'draw' ? 'Gelijkspel' : w === stoel ? 'Jij wint!' : 'De vreemde wint');

  function teken(g, naam, v) {
    if (g === 'ttt') {
      const stand = v.winner !== null ? uitslag(v.winner) : v.turn === stoel ? 'Jouw beurt' : 'De vreemde is aan de beurt';
      const vak = (c, i) => h('button', { type: 'button', class: `vak ${c === null ? '' : c === stoel ? 'ik' : 'zij'} ${c === 0 ? 'kruis' : c === 1 ? 'rond' : ''} ${v.line && v.line.includes(i) ? 'win' : ''}`, data: { f: 'v' + i },
        disabled: c !== null || v.winner !== null || v.turn !== stoel, 'aria-label': `Vak ${i + 1}: ${c === null ? 'leeg' : c === stoel ? 'van jou' : 'van de vreemde'}`, on: { click: () => zet({ i }) } });
      raam(naam, stand, h('div', { class: 'ttt' }, v.board.map(vak)),
        h('p', { class: 'hint' }, `Jij speelt met ${stoel === 0 ? 'het kruis' : 'het rondje'}.`), score(v.score[stoel], v.score[1 - stoel]),
        v.winner !== null ? knop('Nog een potje', () => zet({ again: true }), { soort: 'hoofd', f: 'weer' }) : null);
    }
    if (g === 'c4') {
      const stand = v.winner !== null ? uitslag(v.winner) : v.turn === stoel ? 'Jouw beurt: kies een kolom' : 'De vreemde is aan de beurt';
      const wint = (r, c) => v.cells && v.cells.some(([a, b]) => a === r && b === c);
      const kolom = (c) => h('button', { type: 'button', class: 'kolom', data: { f: 'k' + c }, disabled: v.winner !== null || v.turn !== stoel || v.grid[0][c] !== null, 'aria-label': `Kolom ${c + 1}`, on: { click: () => zet({ col: c }) } },
        v.grid.map((rij, r) => h('i', { class: `${rij[c] === null ? '' : rij[c] === stoel ? 'ik' : 'zij'} ${wint(r, c) ? 'win' : ''} ${v.last && v.last[0] === r && v.last[1] === c ? 'laatst' : ''}` })));
      raam(naam, stand, h('div', { class: 'c4' }, [0, 1, 2, 3, 4, 5, 6].map(kolom)),
        h('p', { class: 'hint' }, 'Jouw stenen zijn groen, die van de vreemde paars.'), score(v.score[stoel], v.score[1 - stoel]),
        v.winner !== null ? knop('Nog een potje', () => zet({ again: true }), { soort: 'hoofd', f: 'weer' }) : null);
    }
    if (g === 'rps') {
      const teken1 = { steen: '✊', papier: '✋', schaar: '✌️' };
      const stand = v.winner !== null ? (v.winner === stoel ? 'Jij wint!' : 'De vreemde wint') : v.chosen ? 'Wachten op de vreemde…' : `Ronde ${v.round}: kies${v.otherChosen ? ' (de vreemde heeft al gekozen)' : ''}`;
      raam(naam, stand,
        h('div', { class: 'rps' }, ['steen', 'papier', 'schaar'].map((c) => h('button', { type: 'button', class: `rpskeus ${v.chosen === c ? 'gekozen' : ''}`, data: { f: c }, disabled: !!v.chosen || v.winner !== null, on: { click: () => zet({ c }) } }, h('span', { 'aria-hidden': 'true' }, teken1[c]), h('small', {}, c)))),
        score(v.score[stoel], v.score[1 - stoel], '(wie het eerst 3 heeft)'),
        h('ul', { class: 'rondes' }, v.history.map((r) => h('li', { class: r.w === null ? '' : r.w === stoel ? 'goed' : 'fout' }, `${teken1[r.c[stoel]]} tegen ${teken1[r.c[1 - stoel]]}: ${r.w === null ? 'gelijk' : r.w === stoel ? 'gewonnen' : 'verloren'}`))),
        v.winner !== null ? knop('Opnieuw', () => zet({ again: true }), { soort: 'hoofd', f: 'weer' }) : null);
    }
    if (g === 'tod') {
      const soorten = { doen: 'Doen', durven: 'Durven', waarheid: 'Waarheid' };
      let inhoud;
      if (!v.card) {
        inhoud = v.turn === stoel
          ? [h('p', { class: 'vraag' }, 'Jouw beurt. Wat kies je?'), h('div', { class: 'tod' }, Object.entries(soorten).map(([k, n]) => h('button', { type: 'button', class: `todkeus k-${k}`, data: { f: k }, on: { click: () => zet({ kind: k }) } }, n)))]
          : [h('p', { class: 'vraag' }, 'De vreemde kiest: doen, durven of de waarheid…')];
      } else {
        const mijn = v.card.for === stoel, soort = Object.hasOwn(soorten, v.card.kind) ? v.card.kind : 'doen';
        inhoud = [h('div', { class: `speelkaart k-${soort}` }, h('small', {}, `${soorten[soort]}, voor ${mijn ? 'jou' : 'de vreemde'}`), h('p', {}, String(v.card.q))),
          mijn ? [h('p', { class: 'hint' }, 'Doe het in de chat of op video. De vreemde zegt of het gelukt is.'), knop('Ik sla over', () => zet({ skipSelf: true }), { f: 'over' })]
            : [h('p', { class: 'hint' }, 'Heeft de vreemde het gedaan?'), h('div', { class: 'rij' }, knop('Ja, gedaan (+1 punt)', () => zet({ judge: 'done' }), { soort: 'hoofd', f: 'ja' }), knop('Nee', () => zet({ judge: 'skip' }), { f: 'nee' }))]];
      }
      raam(naam, v.card ? '' : v.turn === stoel ? 'Jouw beurt' : 'De vreemde is aan de beurt', inhoud, score(v.score[stoel], v.score[1 - stoel], 'punten'));
    }
    if (g === 'drink') tekenDrank(naam, v);
    if (g === 'poker') tekenPoker(naam, v);
  }

  const dobbel = (r) => (r ? r.map((x) => '⚀⚁⚂⚃⚄⚅'[x - 1]).join(' ') : '? ?');
  function tekenDrank(naam, v) {
    const inhoud = [];
    const kaart = (kop, tekst, groot) => h('div', { class: 'speelkaart k-drank' }, h('small', {}, kop), h('p', { class: groot ? 'reuze' : '' }, tekst));
    if (v.type === 'never') {
      const n = v.never;
      inhoud.push(kaart('Ik heb nog nooit…', String(n.q)));
      if (n.reveal) inhoud.push(h('p', { class: 'onthul' }, [0, 1].map((k) => `${wie(k)}: ${n.reveal[k] === 'wel' ? 'wel gedaan' : 'nooit'}`).join(' · ')));
      else if (!n.mine) inhoud.push(h('p', { class: 'hint' }, 'Eerlijk zijn: heb jij dit wel eens gedaan?'), h('div', { class: 'rij' }, knop('Ik wel (1 slok)', () => zet({ a: 'wel' }), { soort: 'hoofd', f: 'wel' }), knop('Ik nooit', () => zet({ a: 'nooit' }), { f: 'nooit' })));
      else inhoud.push(h('p', { class: 'hint' }, n.otherAnswered ? 'Je antwoord is binnen.' : 'Je antwoord is binnen. Wachten op de vreemde…'));
    }
    if (v.type === 'dice') {
      const d = v.dice;
      inhoud.push(kaart('Dobbelen', 'De laagste worp drinkt.'),
        h('div', { class: 'dobbel' }, h('div', {}, h('small', {}, 'Jij'), h('span', {}, dobbel(d.rolls[stoel]))), h('div', {}, h('small', {}, 'Vreemde'), h('span', {}, d.rolls[1 - stoel] ? dobbel(d.rolls[1 - stoel]) : d.otherRolled ? 'gegooid' : '? ?'))),
        d.mineRolled ? (v.done ? null : h('p', { class: 'hint' }, 'Wachten op de vreemde…')) : knop('Gooien', () => zet({ roll: true }), { soort: 'hoofd', f: 'gooi' }));
    }
    if (v.type === 'hilo') {
      const k = v.hilo, mijn = k.guesser === stoel;
      inhoud.push(kaart('Hoger of lager: drie keer goed en de ander drinkt', (k.prev ? `${k.prev} → ` : '') + k.card, true));
      if (!v.done) inhoud.push(mijn ? h('div', { class: 'rij' }, knop('Hoger', () => zet({ g: 'hoger' }), { soort: 'hoofd', f: 'hoger' }), knop('Lager', () => zet({ g: 'lager' }), { f: 'lager' })) : h('p', { class: 'hint' }, 'De vreemde raadt…'));
      inhoud.push(h('p', { class: 'hint' }, `Goed geraden: ${k.streak} van 3`));
    }
    if (v.type === 'category') {
      const c = v.cat;
      inhoud.push(kaart('Categorie: noem om de beurt iets in de chat', String(c.cat)),
        h('p', { class: 'hint' }, `${c.starter === stoel ? 'Jij begint.' : 'De vreemde begint.'} Wie niets meer weet of iets herhaalt, tikt op de knop.`),
        v.done ? null : knop('Ik weet niets meer (2 slokken)', () => zet({ lose: true }), { f: 'op' }));
    }
    if (v.done) inhoud.push(h('p', { class: 'onthul' }, String(v.msg)), knop('Volgende ronde', () => zet({ next: true }), { soort: 'hoofd', f: 'volgende' }));
    else if (v.msg) inhoud.push(h('p', { class: 'hint' }, String(v.msg)));
    inhoud.push(score(v.sips[stoel], v.sips[1 - stoel], 'slokken'), h('p', { class: 'klein-grijs' }, 'Alleen voor 18+. Water of fris telt ook. Stop wanneer je wilt.'));
    raam(naam, `Ronde ${v.round}`, inhoud);
  }

  const speelkaart = (c) => {
    if (!c) return h('span', { class: 'pk rug', 'aria-label': 'dichte kaart' });
    const r = c[0] === 'T' ? '10' : { J: 'B', Q: 'V', K: 'H' }[c[0]] || c[0], s = c[1], rood = s === '♥' || s === '♦';
    const naam = { '♠': 'schoppen', '♥': 'harten', '♦': 'ruiten', '♣': 'klaveren' }[s] || '';
    return h('span', { class: `pk ${rood ? 'rood' : ''}`, 'aria-label': `${naam} ${r}` }, h('b', { 'aria-hidden': 'true' }, r), h('i', { 'aria-hidden': 'true' }, s));
  };
  let verhoogNaar = 0;
  function tekenPoker(naam, v) {
    const ik = stoel, zij = 1 - stoel, mijnBeurt = v.toAct === ik;
    const stand = v.over !== null ? (v.over === ik ? 'Jij hebt alles gewonnen!' : 'De vreemde heeft alles gewonnen') : v.result ? 'Hand afgelopen' : mijnBeurt ? 'Jouw beurt' : 'De vreemde denkt na…';
    let uit = null;
    if (v.result) {
      const w = v.result.winner;
      const kop = w === 'split' ? 'Gelijk: de pot is gedeeld' : w === ik ? `Jij wint ${v.result.pot}` : `De vreemde wint ${v.result.pot}`;
      const waarom = v.result.hands ? `Jij: ${v.result.hands[ik].name} · Vreemde: ${v.result.hands[zij].name}` : v.result.folded === ik ? 'Jij paste.' : 'De vreemde paste.';
      uit = h('div', { class: 'pkuitslag' }, h('b', {}, kop), h('small', {}, waarom),
        v.over === null ? (v.ready ? h('p', { class: 'hint' }, 'Wachten op de vreemde…') : knop(v.otherReady ? 'Volgende hand (de vreemde wacht)' : 'Volgende hand', () => zet({ next: true }), { soort: 'hoofd', f: 'volgende' })) : null);
    }
    let knoppen = null;
    if (mijnBeurt && !v.result) {
      verhoogNaar = Math.min(Math.max(verhoogNaar, v.minTo), v.maxTo);
      const woord = v.toCall > 0 ? 'Verhogen naar' : 'Inzetten:';
      const verhoogKnop = knop(`${woord} ${verhoogNaar}`, () => zet({ a: 'raise', to: verhoogNaar }), { f: 'verhoog' });
      const schuif = v.canRaise && v.maxTo > v.minTo ? h('input', { type: 'range', min: v.minTo, max: v.maxTo, step: 1, value: verhoogNaar, 'aria-label': 'Bedrag om naar te verhogen', data: { f: 'schuif' }, on: { input: (e) => {
        // in stappen van de kleine blind, maar het hoogste bedrag blijft altijd haalbaar
        const ruw = +e.target.value; verhoogNaar = ruw >= v.maxTo ? v.maxTo : Math.max(v.minTo, Math.round(ruw / v.sb) * v.sb); verhoogKnop.textContent = `${woord} ${verhoogNaar}`;
      } } }) : null;
      knoppen = h('div', { class: 'pkknoppen' },
        knop('Passen', () => zet({ a: 'fold' }), { f: 'pas' }),
        v.toCall > 0 ? knop(`Meegaan (${v.toCall})`, () => zet({ a: 'call' }), { soort: 'hoofd', f: 'mee' }) : knop('Checken', () => zet({ a: 'check' }), { soort: 'hoofd', f: 'mee' }),
        v.canRaise ? [schuif, verhoogKnop, knop(v.allIn ? 'All-in' : `Alles van de vreemde (${v.maxTo})`, () => zet({ a: 'allin' }), { soort: 'gevaar', f: 'allin' })] : null);
    }
    const plek = (wieIs, i, kaarten, mijn) => h('div', { class: `plek ${mijn ? 'ik' : 'zij'} ${v.toAct === i ? 'beurt' : ''}` },
      h('div', { class: 'plekkop' }, h('b', {}, wieIs), v.dealer === i ? h('span', { class: 'dealer', title: 'Dealer' }, 'D') : null, h('span', { class: 'fiches' }, `${v.stacks[i]} fiches`), v.bets[i] ? h('span', { class: 'inzet' }, `inzet ${v.bets[i]}`) : null),
      h('div', { class: 'kaarten' }, kaarten), mijn && v.myBest ? h('span', { class: 'beste' }, String(v.myBest)) : null);
    raam(naam, stand, h('div', { class: 'poker' },
      plek('Vreemde', zij, v.other ? v.other.map(speelkaart) : [speelkaart(null), speelkaart(null)], false),
      h('div', { class: 'tafel' }, h('div', { class: 'kaarten' }, [0, 1, 2, 3, 4].map((i) => (v.board[i] ? speelkaart(v.board[i]) : h('span', { class: 'pk leeg' })))),
        h('p', { class: 'pot' }, v.result ? `Blinds ${v.sb}/${v.bb} · hand ${v.hand}` : `Pot ${v.pot} · blinds ${v.sb}/${v.bb} · hand ${v.hand}`), uit),
      plek('Jij', ik, v.hole.map(speelkaart), true),
      knoppen,
      h('ul', { class: 'pklog' }, v.log.slice(0, 4).map((l) => h('li', {}, String(l)))),
      h('p', { class: 'klein-grijs' }, 'Speelfiches zijn niets waard: er wordt niet om geld gespeeld.')));
  }

  window.TKGames = { onMsg, reset };
})();
