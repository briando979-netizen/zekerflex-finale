// Spellogica op de server (eerlijk: de server schudt, deelt en gooit). Elk spel heeft twee spelers: stoel 0 en stoel 1.
// Elke klasse heeft move(stoel, zet) en view(stoel). Een ongeldige zet doet niets. Teksten in een view zijn al
// geschreven voor wie kijkt ("Jij" of "De vreemde").

const pick = (a, rng = Math.random) => a[Math.floor(rng() * a.length)];
const shuffle = (a, rng = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const heel = (x, min, max) => (Number.isInteger(x) && x >= min && x <= max ? x : null);
// Een tekst voor beide kijkers: tekst((n) => `${n(0)} wint`) geeft ["Jij wint", "De vreemde wint"].
const tekst = (fn) => [0, 1].map((kijker) => fn((stoel) => (stoel === kijker ? 'Jij' : 'De vreemde')));

// ================================================================ Boter, kaas en eieren
const TTT_LIJNEN = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
class TicTacToe {
  constructor(o = {}) { this.board = Array(9).fill(null); this.start = o.start ?? (Math.random() < 0.5 ? 0 : 1); this.turn = this.start; this.winner = null; this.line = null; this.score = [0, 0]; }
  move(p, d) {
    if (this.winner !== null) {
      // nog een potje: de ander begint
      if (d.again === true) { this.board.fill(null); this.winner = null; this.line = null; this.start = 1 - this.start; this.turn = this.start; }
      return;
    }
    const i = heel(d.i, 0, 8);
    if (i === null || p !== this.turn || this.board[i] !== null) return;
    this.board[i] = p;
    const lijn = TTT_LIJNEN.find((l) => l.every((k) => this.board[k] === p));
    if (lijn) { this.winner = p; this.line = lijn; this.score[p]++; }
    else if (this.board.every((c) => c !== null)) this.winner = 'draw';
    this.turn = 1 - p;
  }
  view(p) { return { board: this.board, turn: this.turn, me: p, winner: this.winner, line: this.line, score: this.score }; }
}

// ================================================================ Vier op een rij
class ConnectFour {
  constructor(o = {}) { this.reset(); this.score = [0, 0]; this.start = o.start ?? (Math.random() < 0.5 ? 0 : 1); this.turn = this.start; }
  reset() { this.grid = Array.from({ length: 6 }, () => Array(7).fill(null)); this.winner = null; this.cells = null; this.last = null; }
  move(p, d) {
    if (this.winner !== null) { if (d.again === true) { this.reset(); this.start = 1 - this.start; this.turn = this.start; } return; }
    const c = heel(d.col, 0, 6);
    if (c === null || p !== this.turn) return;
    let r = -1; for (let k = 5; k >= 0; k--) if (this.grid[k][c] === null) { r = k; break; }
    if (r < 0) return;
    this.grid[r][c] = p; this.last = [r, c];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[r, c]];
      for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && this.grid[rr][cc] === p) { cells.push([rr, cc]); rr += dr * s; cc += dc * s; } }
      if (cells.length >= 4) { this.winner = p; this.cells = cells; this.score[p]++; break; }
    }
    if (this.winner === null && this.grid[0].every((x) => x !== null)) this.winner = 'draw';
    this.turn = 1 - p;
  }
  view(p) { return { grid: this.grid, turn: this.turn, me: p, winner: this.winner, cells: this.cells, last: this.last, score: this.score }; }
}

// ================================================================ Steen, papier, schaar (wie het eerst 3 rondes wint)
const RPS_KEUZES = ['steen', 'papier', 'schaar'];
const RPS_WINT_VAN = { steen: 'schaar', papier: 'steen', schaar: 'papier' };
class RPS {
  constructor() { this.opnieuw(); }
  opnieuw() { this.score = [0, 0]; this.choice = [null, null]; this.round = 1; this.history = []; this.winner = null; }
  move(p, d) {
    if (this.winner !== null) { if (d.again === true) this.opnieuw(); return; }
    if (!RPS_KEUZES.includes(d.c) || this.choice[p]) return;
    this.choice[p] = d.c;
    if (this.choice[0] && this.choice[1]) {
      const [a, b] = this.choice;
      const w = a === b ? null : RPS_WINT_VAN[a] === b ? 0 : 1;
      if (w !== null) this.score[w]++;
      this.history.push({ c: [a, b], w });
      this.choice = [null, null]; this.round++;
      if (this.score[0] === 3 || this.score[1] === 3) this.winner = this.score[0] === 3 ? 0 : 1;
    }
  }
  // De keuze van de ander is pas zichtbaar als allebei gekozen hebben (via history).
  view(p) { return { score: this.score, me: p, round: this.round, chosen: this.choice[p], otherChosen: !!this.choice[1 - p], history: this.history.slice(-5), winner: this.winner }; }
}

// ================================================================ Doen, Durven of de Waarheid
const TOD = {
  waarheid: [
    'Wat is het gênantste dat je ooit is overkomen?', 'Wat is je grootste angst?', 'Wat is het ergste cadeau dat je ooit kreeg?', 'Op wie was je vroeger stiekem verliefd?',
    'Wat is de grootste leugen die je ooit hebt verteld?', 'Welke rare gewoonte heb je?', 'Wat is het laatste dat je hebt opgezocht?', 'Welk liedje vind je stiekem heel goed?',
    'Wat zou je doen met een miljoen euro?', 'Wat is het domste waarvoor je ooit straf kreeg?', 'Welke app gebruik je veel te veel?', 'Wat was je slechtste afspraakje ooit?',
    'Wat is iets dat bijna niemand over je weet?', 'Heb je ooit gedaan alsof je ziek was om ergens onderuit te komen?', 'Wat is je vreemdste droom ooit?', 'Op welke bekende persoon ben je een beetje verliefd?',
    'Wat is het kinderachtigste dat je nog steeds doet?', 'Wat is de langste tijd dat je niet hebt gedoucht?', 'Waar heb je het meeste spijt van?', 'Welk gerecht kun je absoluut niet koken?',
  ],
  doen: [
    'Zing het refrein van je favoriete liedje.', 'Doe 10 kniebuigingen terwijl je telt met een ander accent.', 'Praat de komende 3 berichten alleen in rijm.', 'Doe je beste dierengeluid na.',
    'Vertel een mop: hoe slechter hoe beter.', 'Beschrijf het laatste ding dat je hebt gekocht.', 'Maak een reclamespotje voor het voorwerp dat het dichtst bij je ligt.', 'Praat 1 minuut als een nieuwslezer.',
    'Doe een beroemdheid na tot de ander raadt wie het is.', 'Dans 15 seconden zonder muziek.', 'Schrijf een gedichtje van 4 regels over de ander.', 'Beschrijf je dag met alleen emoji.',
    'Zeg 3 keer snel: "De kat krabt de krullen van de trap".', 'Laat je raarste gezichtsuitdrukking zien.', 'Vertel je beste openingszin.', 'Doe een yogahouding en houd hem 10 seconden vol.',
  ],
  durven: [
    'Durf jij je laatst gestuurde bericht voor te lezen (zonder namen)?', 'Durf jij je schermtijd van vandaag te vertellen?', 'Durf jij 30 seconden in een verzonnen taal te praten?', 'Durf jij de ander een eerlijk compliment én een eerlijk verbeterpunt te geven?',
    'Durf jij je slechtste foto te beschrijven?', 'Durf jij te zeggen wat je echt vindt van ananas op pizza, en het te verdedigen?', 'Durf jij het volgende bericht in hoofdletters te typen?', 'Durf jij te vertellen welk liedje je stiekem uit je hoofd kent?',
    'Durf jij een minuut lang geen "ja" of "nee" te zeggen?', 'Durf jij je kledingstijl in 3 woorden eerlijk te beschrijven?', 'Durf jij te vertellen waar je het laatst om hebt gehuild?', 'Durf jij een zelfbedachte rap van 4 regels te doen?',
  ],
};
class TruthOrDare {
  constructor(o = {}) { this.turn = o.start ?? (Math.random() < 0.5 ? 0 : 1); this.card = null; this.score = [0, 0]; this.used = new Set(); this.log = []; }
  klaar(wie, gedaan) { this.log.unshift({ who: wie, kind: this.card.kind, done: gedaan }); this.log = this.log.slice(0, 5); this.card = null; this.turn = 1 - this.turn; }
  move(p, d) {
    // Object.hasOwn: anders telt "constructor" als geldige soort.
    if (!this.card && p === this.turn && typeof d.kind === 'string' && Object.hasOwn(TOD, d.kind)) {
      let q, tries = 0; do { q = pick(TOD[d.kind]); } while (this.used.has(q) && tries++ < 30);
      this.used.add(q); this.card = { kind: d.kind, q, for: p };
    } else if (this.card && p !== this.card.for && (d.judge === 'done' || d.judge === 'skip')) {
      if (d.judge === 'done') this.score[this.card.for]++;
      this.klaar(this.card.for, d.judge === 'done');
    } else if (this.card && p === this.card.for && d.skipSelf === true) this.klaar(p, false);
  }
  view(p) { return { turn: this.turn, me: p, card: this.card, score: this.score, log: this.log }; }
}

// ================================================================ Drankspel "Proost!"
const NEVER = [
  'Ik heb nog nooit een vlucht gemist.', 'Ik ben nog nooit in slaap gevallen in de bioscoop.', 'Ik heb nog nooit een tatoeage laten zetten.', 'Ik heb nog nooit iemand zomaar genegeerd tot die het opgaf.',
  'Ik heb nog nooit mijn telefoon in het water laten vallen.', 'Ik heb nog nooit een verkeersboete gehad.', 'Ik heb nog nooit gelogen over mijn leeftijd.', 'Ik heb nog nooit een hele serie in één dag gekeken.',
  'Ik heb nog nooit karaoke gezongen.', 'Ik heb nog nooit op een festival geslapen.', 'Ik heb nog nooit een berichtje naar de verkeerde persoon gestuurd.', 'Ik heb nog nooit mijn sleutels binnen laten liggen.',
  'Ik heb nog nooit iemands oude foto\'s helemaal teruggekeken.', 'Ik heb nog nooit een gerecht laten aanbranden.', 'Ik heb nog nooit gedaan alsof ik iemand niet zag.', 'Ik heb nog nooit een afspraakje met een onbekende gehad.',
  'Ik heb nog nooit stiekem andermans eten opgegeten.', 'Ik heb nog nooit mijn haar zelf geknipt.', 'Ik heb nog nooit een ex een bericht gestuurd na middernacht.', 'Ik ben nog nooit verdwaald in mijn eigen stad.',
];
const CATS = ['Automerken', 'Kaassoorten', 'Landen in Afrika', 'Wat er op een pizza kan', 'Superhelden', 'Voetbalclubs', 'Dieren met 4 letters', 'Cocktails', 'Tekenfilms', 'Groenten', 'Hoofdsteden', 'Merken frisdrank'];
const CARD_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'V', 'H', 'A'];
const slok = (n) => (n === 1 ? '1 slok' : `${n} slokken`);
class DrinkGame {
  constructor(o = {}) { this.rng = o.rng || Math.random; this.sips = [0, 0]; this.round = 0; this.turn = o.start ?? (this.rng() < 0.5 ? 0 : 1); this.next(); }
  next() {
    this.round++;
    const types = ['never', 'dice', 'hilo', 'never', 'category'];
    this.type = types[(this.round - 1) % types.length];
    this.done = false; this.msg = null;
    if (this.type === 'never') this.state = { q: pick(NEVER, this.rng), ans: [null, null] };
    if (this.type === 'dice') this.state = { rolls: [null, null] };
    if (this.type === 'hilo') this.state = { card: Math.floor(this.rng() * 13), prev: null, guesser: this.turn, streak: 0 };
    if (this.type === 'category') this.state = { cat: pick(CATS, this.rng), starter: this.turn, loser: null };
  }
  move(p, d) {
    const s = this.state;
    if (this.done) { if (d.next === true) { this.turn = 1 - this.turn; this.next(); } return; }
    if (this.type === 'never' && s.ans[p] === null && (d.a === 'wel' || d.a === 'nooit')) {
      s.ans[p] = d.a;
      if (s.ans[0] && s.ans[1]) {
        for (const k of [0, 1]) if (s.ans[k] === 'wel') this.sips[k]++;
        const drinkers = [0, 1].filter((k) => s.ans[k] === 'wel');
        this.msg = tekst((n) => (drinkers.length === 2 ? 'Allebei 1 slok.' : drinkers.length === 1 ? `${n(drinkers[0])} drinkt 1 slok.` : 'Niemand drinkt.'));
        this.done = true;
      }
    } else if (this.type === 'dice' && d.roll === true && s.rolls[p] === null) {
      s.rolls[p] = [1 + Math.floor(this.rng() * 6), 1 + Math.floor(this.rng() * 6)];
      if (s.rolls[0] && s.rolls[1]) {
        const t = s.rolls.map((r) => r[0] + r[1]);
        if (t[0] === t[1]) { this.sips[0] += 2; this.sips[1] += 2; this.msg = tekst(() => 'Gelijk. Allebei 2 slokken.'); }
        else { const l = t[0] < t[1] ? 0 : 1; const n = Math.abs(t[0] - t[1]) > 5 ? 3 : 2; this.sips[l] += n; s.loser = l; this.msg = tekst((nm) => `${nm(l)} gooide het laagst: ${slok(n)}.`); }
        this.done = true;
      }
    } else if (this.type === 'hilo' && p === s.guesser && (d.g === 'hoger' || d.g === 'lager')) {
      const nc = Math.floor(this.rng() * 13);
      const goed = (d.g === 'hoger' && nc > s.card) || (d.g === 'lager' && nc < s.card);
      const zelfde = nc === s.card;
      s.prev = s.card; s.card = nc;
      if (goed) {
        s.streak++;
        if (s.streak >= 3) { this.sips[1 - p] += 3; this.msg = tekst((n) => `Drie keer goed. ${n(1 - p)} drinkt 3 slokken.`); this.done = true; }
        else this.msg = tekst(() => `Goed (${s.streak} van 3).`);
      } else {
        const n = 1 + s.streak; this.sips[p] += n;
        this.msg = tekst((nm) => `${zelfde ? 'Dezelfde kaart telt als fout' : 'Fout'}. ${nm(p)} drinkt ${slok(n)}.`); this.done = true;
      }
    } else if (this.type === 'category' && d.lose === true && s.loser === null) {
      s.loser = p; this.sips[p] += 2; this.msg = tekst((n) => `${n(p)} wist niets meer: 2 slokken.`); this.done = true;
    }
  }
  view(p) {
    const s = this.state;
    const v = { type: this.type, round: this.round, me: p, sips: this.sips, done: this.done, msg: this.msg ? this.msg[p] : '', turn: this.turn };
    if (this.type === 'never') v.never = { q: s.q, mine: s.ans[p], otherAnswered: !!s.ans[1 - p], reveal: this.done ? s.ans : null };
    // De worp van de ander zie je pas als allebei gegooid hebben.
    if (this.type === 'dice') v.dice = { rolls: this.done ? s.rolls : [p === 0 ? s.rolls[0] : null, p === 1 ? s.rolls[1] : null], mineRolled: !!s.rolls[p], otherRolled: !!s.rolls[1 - p] };
    if (this.type === 'hilo') v.hilo = { card: CARD_NAMES[s.card], prev: s.prev !== null ? CARD_NAMES[s.prev] : null, guesser: s.guesser, streak: s.streak };
    if (this.type === 'category') v.cat = { cat: s.cat, starter: s.starter, loser: s.loser };
    return v;
  }
}

// ================================================================ Poker: 1 tegen 1, Texas Hold'em met speelfiches
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = '23456789TJQKA';
const HAND_NAMES = ['Hoge kaart', 'Eén paar', 'Twee paar', 'Drie dezelfde', 'Straat', 'Flush', 'Full house', 'Vier dezelfde', 'Straight flush', 'Royal flush'];
// Waarde van precies vijf kaarten als rij getallen: eerst de soort hand, daarna wat de doorslag geeft.
function score5(cards) {
  const r = cards.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = new Set(r).size;
  let straightHigh = -1;
  if (uniq === 5 && r[0] - r[4] === 4) straightHigh = r[0];
  if (uniq === 5 && r[0] === 12 && r[1] === 3) straightHigh = 3; // A-2-3-4-5: de aas telt als 1, de 5 is de hoogste
  const counts = new Map(); for (const x of r) counts.set(x, (counts.get(x) || 0) + 1);
  const groups = [...counts].map(([k, v]) => [v, k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = groups.map((g) => g[1]);
  if (straightHigh >= 0 && flush) return [straightHigh === 12 ? 9 : 8, straightHigh];
  if (groups[0][0] === 4) return [7, ...kick];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...kick];
  if (flush) return [5, ...r];
  if (straightHigh >= 0) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...kick];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...kick];
  if (groups[0][0] === 2) return [1, ...kick];
  return [0, ...r];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
// Beste vijf uit vijf, zes of zeven kaarten.
function besteHand(cards) {
  let best = null, bestCards = null;
  const kies = (start, gekozen) => {
    if (gekozen.length === 5) { const s = score5(gekozen); if (!best || cmp(s, best) > 0) { best = s; bestCards = gekozen; } return; }
    for (let i = start; i <= cards.length - (5 - gekozen.length); i++) kies(i + 1, [...gekozen, cards[i]]);
  };
  kies(0, []);
  return { score: best, name: HAND_NAMES[best[0]], cards: bestCards };
}
const best7 = besteHand;
const nieuwDek = () => SUITS.flatMap((s) => [...RANKS].map((r) => r + s));

class Poker {
  // Opties (voor tests): dek(handNr) geeft een vast dek (de laatste kaart wordt het eerst gedeeld), dealer, stapels, blinds.
  constructor(o = {}) {
    this.maakDek = o.dek || (() => shuffle(nieuwDek()));
    this.stacks = o.stapels ? [...o.stapels] : [1000, 1000];
    this.dealer = o.dealer ?? (Math.random() < 0.5 ? 0 : 1);
    this.sb = o.sb || 10; this.bb = o.bb || 20;
    this.hand = 0; this.over = null; this.log = [];
    this.newHand();
  }
  say(fn) { this.log.unshift(tekst(fn)); this.log = this.log.slice(0, 8); }
  newHand() {
    this.hand++;
    if (this.hand % 8 === 0) { this.sb *= 2; this.bb *= 2; this.say(() => `De blinds gaan omhoog: ${this.sb}/${this.bb}.`); }
    this.deck = [...this.maakDek(this.hand)];
    this.hole = [[this.deck.pop(), this.deck.pop()], [this.deck.pop(), this.deck.pop()]];
    this.board = []; this.pot = 0; this.bets = [0, 0]; this.folded = null; this.result = null; this.street = 'preflop'; this.klaar = [false, false];
    this.dealer = 1 - this.dealer;
    const sbP = this.dealer, bbP = 1 - this.dealer;
    this.post(sbP, Math.min(this.sb, this.stacks[sbP])); this.post(bbP, Math.min(this.bb, this.stacks[bbP]));
    this.minRaise = this.bb; this.acted = [false, false];
    this.toAct = sbP; // 1 tegen 1: de dealer legt de kleine blind en begint vóór de flop
    this.say((n) => `Hand ${this.hand}. Dealer: ${n(sbP).toLowerCase()}.`);
    // Kan iemand door de blinds al niets meer doen, dan gaat de hand vanzelf naar de showdown.
    if (this.stacks[sbP] === 0 || (this.stacks[bbP] === 0 && this.bets[sbP] >= this.bets[bbP])) { this.returnExcess(); this.endStreet(); }
  }
  // De pot telt alle inzetten van deze hand, ook die van de lopende ronde.
  post(p, n) { this.stacks[p] -= n; this.bets[p] += n; this.pot += n; }
  toCall(p) { return Math.max(0, this.bets[1 - p] - this.bets[p]); }
  // Wat de ander niet kan bijleggen, gaat terug naar wie te veel inzette.
  returnExcess() {
    const hi = this.bets[0] > this.bets[1] ? 0 : 1, diff = this.bets[hi] - this.bets[1 - hi];
    if (diff > 0) { this.bets[hi] -= diff; this.stacks[hi] += diff; this.pot -= diff; }
  }
  dealStreet() {
    this.bets = [0, 0]; this.acted = [false, false]; this.minRaise = this.bb;
    if (this.board.length === 0) { this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop()); this.street = 'flop'; }
    else if (this.board.length === 3) { this.board.push(this.deck.pop()); this.street = 'turn'; }
    else if (this.board.length === 4) { this.board.push(this.deck.pop()); this.street = 'river'; }
    this.toAct = 1 - this.dealer; // na de flop begint de grote blind
  }
  move(p, d) {
    if (this.over !== null) return;
    if (this.result) {
      // De volgende hand begint pas als allebei de uitslag hebben gezien.
      if (d.next === true) { this.klaar[p] = true; if (this.klaar[0] && this.klaar[1]) this.newHand(); }
      return;
    }
    if (p !== this.toAct) return;
    const o = 1 - p, call = this.toCall(p);
    let actie = d.a;
    if (actie === 'raise' || actie === 'allin') {
      const eigenMax = this.bets[p] + this.stacks[p];
      // Meer inzetten dan de ander kan bijleggen heeft geen zin: het hoogste nuttige bedrag is zijn inzet plus zijn stapel.
      const plafond = Math.min(eigenMax, this.bets[o] + this.stacks[o]);
      let total = actie === 'allin' ? plafond : Math.floor(Number(d.to));
      if (!Number.isFinite(total)) return;
      total = Math.min(total, plafond);
      if (total <= this.bets[o]) {
        // Verhogen kan niet (te weinig fiches, of de ander is al all-in): dan is het meegaan.
        if (call <= 0) return;
        actie = 'call';
      } else {
        if (total < this.bets[o] + this.minRaise && total < plafond) return; // onder de minimale verhoging mag alleen als het alles is
        const raiseBy = total - this.bets[o];
        if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
        this.post(p, total - this.bets[p]);
        this.acted[o] = false;
        this.say((n) => (this.stacks[p] === 0 ? `${n(p)} gaat all-in met ${total}.` : `${n(p)} ${call ? 'verhoogt naar' : 'zet in:'} ${total}.`));
      }
    }
    if (actie === 'fold') { this.folded = p; this.say((n) => `${n(p)} past.`); return this.finish(o); }
    else if (actie === 'check') { if (call > 0) return; this.say((n) => `${n(p)} checkt.`); }
    else if (actie === 'call') {
      const n = Math.min(call, this.stacks[p]); if (n <= 0) return;
      this.post(p, n);
      this.say((nm) => (this.stacks[p] === 0 ? `${nm(p)} gaat mee en is all-in (${n}).` : `${nm(p)} gaat mee (${n}).`));
    } else if (actie !== 'raise' && actie !== 'allin') return;
    this.acted[p] = true;
    this.toAct = o;
    let complete = false;
    if (this.bets[0] === this.bets[1]) complete = (this.acted[0] && this.acted[1]) || this.stacks[0] === 0 || this.stacks[1] === 0;
    else if (this.bets[p] < this.bets[o] && this.stacks[p] === 0) { this.returnExcess(); complete = true; } // all-in voor minder dan de inzet
    if (complete) this.endStreet();
  }
  endStreet() {
    // Is iemand all-in, dan valt er niets meer in te zetten: de rest van de kaarten komt in één keer.
    if (this.stacks[0] === 0 || this.stacks[1] === 0) { while (this.board.length < 5) this.dealStreet(); return this.showdown(); }
    if (this.board.length === 5) return this.showdown();
    this.dealStreet();
  }
  finish(w, split = false) {
    if (split) {
      // Gelijk: ieder de helft. Een oneven fiche gaat naar wie niet de dealer is.
      const h = Math.floor(this.pot / 2), rest = this.pot - 2 * h;
      this.stacks[0] += h; this.stacks[1] += h; this.stacks[1 - this.dealer] += rest;
    } else this.stacks[w] += this.pot;
    this.result = { winner: split ? 'split' : w, pot: this.pot, folded: this.folded, hands: null };
    this.pot = 0; this.bets = [0, 0]; this.toAct = null;
    if (this.stacks[0] === 0 || this.stacks[1] === 0) {
      this.over = this.stacks[0] > 0 ? 0 : 1;
      this.say((n) => (n(this.over) === 'Jij' ? 'Jij hebt alle fiches gewonnen.' : 'De vreemde heeft alle fiches gewonnen.'));
    }
  }
  showdown() {
    const h = [besteHand([...this.hole[0], ...this.board]), besteHand([...this.hole[1], ...this.board])];
    const c = cmp(h[0].score, h[1].score), pot = this.pot;
    if (c === 0) { this.say(() => `Gelijk met ${h[0].name}: de pot (${pot}) wordt gedeeld.`); this.finish(null, true); }
    else { const w = c > 0 ? 0 : 1; this.say((n) => `${n(w)} wint ${pot} met ${h[w].name}.`); this.finish(w); }
    this.result.hands = h.map((x) => ({ name: x.name, cards: x.cards }));
  }
  view(p) {
    const o = 1 - p, toon = !!(this.result && this.result.hands);
    const kaarten = [...this.hole[p], ...this.board];
    const eigenMax = this.bets[p] + this.stacks[p], plafond = Math.min(eigenMax, this.bets[o] + this.stacks[o]);
    return {
      me: p, hole: this.hole[p], other: toon ? this.hole[o] : null, board: this.board, pot: this.pot,
      stacks: this.stacks, bets: this.bets, toAct: this.result ? null : this.toAct, dealer: this.dealer, street: this.street,
      toCall: Math.min(this.toCall(p), this.stacks[p]),
      // verhogen kan alleen als er boven de inzet van de ander nog iets te bieden valt
      canRaise: !this.result && plafond > this.bets[o],
      minTo: Math.min(this.bets[o] + this.minRaise, plafond), maxTo: plafond, allIn: plafond === eigenMax,
      bb: this.bb, sb: this.sb, result: this.result, over: this.over, hand: this.hand,
      ready: this.klaar[p], otherReady: this.klaar[o],
      log: this.log.map((l) => l[p]),
      myBest: kaarten.length >= 5 ? besteHand(kaarten).name : this.hole[p][0][0] === this.hole[p][1][0] ? 'Eén paar' : 'Hoge kaart',
    };
  }
}

export const GAMES = {
  tod: { name: 'Doen, Durven of de Waarheid', make: () => new TruthOrDare() },
  drink: { name: 'Proost! (drankspel)', make: () => new DrinkGame() },
  poker: { name: 'Poker 1 tegen 1', make: () => new Poker() },
  ttt: { name: 'Boter, kaas en eieren', make: () => new TicTacToe() },
  c4: { name: 'Vier op een rij', make: () => new ConnectFour() },
  rps: { name: 'Steen, papier, schaar', make: () => new RPS() },
};
export { best7, besteHand, score5, cmp, TicTacToe, ConnectFour, RPS, TruthOrDare, DrinkGame, Poker };
