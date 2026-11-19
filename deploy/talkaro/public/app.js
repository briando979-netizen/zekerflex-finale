// Client: verbinden met de server, koppelen, tekstgesprek, video (WebRTC), onderwerpen en melden.
(() => {
  const $ = (id) => document.getElementById(id);
  const NAAM = document.querySelector('meta[name="application-name"]')?.content || 'Talkaroo';
  // Bouwt een element zonder innerHTML: tekst van een vreemde kan zo nooit als opmaak of script uitgevoerd worden.
  const h = (tag, eig = {}, ...kinderen) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(eig)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v; else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'data') for (const [d, w] of Object.entries(v)) el.dataset[d] = w;
      else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
    }
    for (const kind of kinderen.flat(Infinity)) if (kind !== null && kind !== undefined && kind !== false) el.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
    return el;
  };
  const opslag = { lees(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, zet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* dan onthouden we het niet */ } } };

  let ws = null, wachtMs = 1000, verbondenGeweest = false;
  let mode = 'text', state = 'idle'; // idle | searching | chatting | ended
  let stopStap = 0;                  // 0 = Stop, 1 = Zeker?, 2 = Volgende
  let interests = [];
  let priveCode = null;              // gezet tijdens een privégesprek met een vriend (via een deelbare code)
  // Bloot-controle (helemaal op dit toestel): monitors + vlaggen zodat we niet blijven herhalen.
  let blootVreemde = null, blootEigen = null, blootGemeld = false, eigenGewaarschuwd = false, blootUitGemeld = false;
  let typTimer = null, typVerstuurd = false, rustigTimer = null, laatsteTempoMelding = 0;
  let akkoord = false; try { akkoord = sessionStorage.getItem('tk_akkoord') === '1'; } catch (e) { /* */ }
  const transcript = [];
  try { const bewaard = JSON.parse(opslag.lees('tk_interests')); if (Array.isArray(bewaard)) interests = bewaard.filter((x) => typeof x === 'string').slice(0, 10); } catch (e) { interests = []; }

  // ------------------------------------------------------------ verbinding met de server
  function balk(tekst) { const b = $('balk'); b.textContent = tekst || ''; b.hidden = !tekst; }
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      wachtMs = 1000; balk('');
      // Viel de verbinding weg tijdens het zoeken, dan zoeken we gewoon verder (ook in een privégesprek, met dezelfde code).
      if (verbondenGeweest && state === 'searching') stuur(zoekBoodschap());
      verbondenGeweest = true;
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m && typeof m === 'object') onMsg(m); };
    ws.onclose = () => {
      if (state === 'chatting') { sys('De verbinding met de server viel weg. Dit gesprek is gestopt.'); endChat(true); }
      balk('Geen verbinding met de server. We proberen het opnieuw…');
      setTimeout(connect, wachtMs); wachtMs = Math.min(wachtMs * 2, 15000);
    };
  }
  const stuur = (o) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; };

  function onMsg(m) {
    switch (m.t) {
      case 'count': if (Number.isFinite(m.n)) $('count').textContent = m.n.toLocaleString('nl-NL'); break;
      case 'matched': onMatched(m); break;
      case 'msg': if (state === 'chatting' && typeof m.text === 'string') { regel('zij', m.text); zetTypt(false); } break;
      case 'typing': zetTypt(m.on === true && state === 'chatting'); break;
      case 'end': if (state === 'chatting') { sys('De vreemde heeft het gesprek verlaten.'); endChat(true); } break;
      case 'signal': onSignal(m.data); break;
      case 'g': if (window.TKGames) window.TKGames.onMsg(m); break;
      case 'reported': onReported(m); break;
      case 'banned': geblokkeerd(m.minutes); break;
      case 'pauze': onPauze(m.aan === true); break;
      case 'prive-verlopen': onPriveVerlopen(); break;
      case 'fout':
        if (m.code === 'akkoord') { akkoord = false; goHome(); }
        else if (m.code === 'tempo' && Date.now() - laatsteTempoMelding > 4000) { laatsteTempoMelding = Date.now(); sys('Rustig aan: je gaat te snel. Wacht even.'); }
        break;
      case 'server': balk('De server wordt herstart. Even geduld…'); break;
    }
  }
  function geblokkeerd(minuten) {
    const duur = minuten >= 120 ? `ongeveer ${Math.round(minuten / 60)} uur` : `${Math.max(1, minuten | 0)} minuten`;
    if ($('chat').hidden) { balk(`Je kunt nu niet praten: er zijn meldingen over je gedaan. Dit duurt nog ${duur}.`); return; }
    sys(`Je kunt nu niet praten: er zijn meldingen over je gedaan. Dit duurt nog ${duur}. Klopt dit volgens jou niet, kijk dan op de pagina Misbruik melden.`, 'fout');
    endChat(false); status('Geblokkeerd'); $('btn-stop').disabled = true;
  }

  // ------------------------------------------------------------ onderwerpen
  function tekenTags() {
    const vak = $('tags');
    vak.querySelectorAll('.tag').forEach((t) => t.remove());
    for (const it of interests) {
      vak.insertBefore(h('span', { class: 'tag' }, it, h('button', { type: 'button', 'aria-label': `${it} weghalen`, on: { click: () => { interests = interests.filter((x) => x !== it); bewaarTags(); tekenTags(); $('tag-input').focus(); } } }, '×')), $('tag-input'));
    }
  }
  function bewaarTags() { opslag.zet('tk_interests', JSON.stringify(interests)); }
  function voegTagToe() {
    const inp = $('tag-input'), v = inp.value.replace(/[,<>]/g, '').trim().toLowerCase().slice(0, 30);
    inp.value = '';
    if (v && !interests.includes(v) && interests.length < 10) { interests.push(v); bewaarTags(); tekenTags(); }
  }
  $('tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); voegTagToe(); }
    else if (e.key === 'Backspace' && !e.target.value && interests.length) { interests.pop(); bewaarTags(); tekenTags(); }
  });
  $('tag-input').addEventListener('blur', voegTagToe);
  $('tags').addEventListener('click', (e) => { if (e.target === $('tags')) $('tag-input').focus(); });

  // ------------------------------------------------------------ vensters
  const sluit = (d) => { if (d.open) d.close(); };
  // Ja/nee-vraag in de stijl van de site (geen venster van de browser).
  function vraag(tekst, ja = 'Ja', nee = 'Nee') {
    return new Promise((klaar) => {
      const d = $('vraag'); $('vraag-kop').textContent = tekst; $('vraag-ja').textContent = ja; $('vraag-nee').textContent = nee;
      const af = (antwoord) => { $('vraag-ja').onclick = $('vraag-nee').onclick = d.onclose = null; sluit(d); klaar(antwoord); };
      $('vraag-ja').onclick = () => af(true); $('vraag-nee').onclick = () => af(false); d.onclose = () => af(false);
      d.showModal(); $('vraag-nee').focus();
    });
  }
  function metAkkoord(fn) {
    if (akkoord) return fn();
    const d = $('terms'), vinkjes = ['c1', 'c2', 'c3'].map($);
    const bij = () => { $('terms-ok').disabled = !vinkjes.every((b) => b.checked); };
    vinkjes.forEach((b) => { b.onchange = bij; }); bij();
    $('terms-cancel').onclick = () => sluit(d);
    $('terms-ok').onclick = () => { akkoord = true; try { sessionStorage.setItem('tk_akkoord', '1'); } catch (e) { /* */ } sluit(d); fn(); };
    d.showModal();
  }

  // ------------------------------------------------------------ starten en stoppen
  $('btn-text').addEventListener('click', () => metAkkoord(() => start('text')));
  $('btn-video').addEventListener('click', () => metAkkoord(() => start('video')));
  $('btn-home').addEventListener('click', async () => { if (state !== 'chatting' || await vraag('Het gesprek stoppen en terug naar de startpagina?', 'Stoppen', 'Blijven')) goHome(); });
  $('logo').addEventListener('click', (e) => { if (!$('chat').hidden) { e.preventDefault(); $('btn-home').click(); } });

  const status = (t) => { $('status').textContent = t; };
  function toonChat(aan) {
    $('home').hidden = aan; $('chat').hidden = !aan;
    document.body.classList.toggle('in-gesprek', aan);
  }
  async function start(m, code = null) {
    priveCode = code;
    voegTagToe();
    mode = m; toonChat(true);
    $('chat').classList.toggle('alleen-tekst', mode === 'text');
    $('log').replaceChildren(); $('btn-stop').disabled = false;
    if (mode === 'video' && !lokaal) {
      status('Camera aanzetten…');
      if (!(await zetCameraAan())) return;
    }
    zoek();
  }
  // De find-boodschap: met een privécode gaat het buiten de willekeurige rij om (en zonder onderwerpen).
  function zoekBoodschap() {
    const b = { t: 'find', mode, akkoord: true };
    if (priveCode) b.code = priveCode; else b.interests = $('use-interests').checked ? interests : [];
    return b;
  }
  function zoek() {
    if (window.TKGames) window.TKGames.reset();
    sluitPeer();
    $('log').replaceChildren(); transcript.length = 0;
    state = 'searching'; zetStop(0); zetInvoer(false); $('btn-report').disabled = true;
    blootGemeld = false; eigenGewaarschuwd = false; wisBlootWaarschuwing();
    clearTimeout(rustigTimer);
    if (priveCode) {
      wachtBeeld('Wachten op je vriend…'); status('Wachten op je vriend…');
      sys('We wachten tot je vriend de link opent. Deel de link als je dat nog niet deed.');
      rustigTimer = setTimeout(() => { if (state === 'searching') sys('Je vriend is er nog niet. De uitnodiging blijft ongeveer tien minuten geldig.'); }, 20000);
    } else {
      wachtBeeld('Zoeken…'); status('Zoeken…');
      sys('We zoeken iemand om mee te praten…');
      rustigTimer = setTimeout(() => { if (state === 'searching') sys('Het is rustig op dit moment. We blijven zoeken; je hoeft niets te doen.'); }, 15000);
    }
    if (!stuur(zoekBoodschap())) sys('Er is nog geen verbinding met de server. Zodra die er is, zoeken we verder.');
  }
  function onMatched(m) {
    if (state !== 'searching') return;
    clearTimeout(rustigTimer);
    // Een privégesprek wordt video alleen als allebei video koos; stel de modus zo nodig bij (camera uit bij tekst).
    if (m.mode === 'text' || m.mode === 'video') zetModus(m.mode);
    $('log').replaceChildren();
    state = 'chatting'; zetStop(0); zetInvoer(true); $('btn-report').disabled = false;
    blootGemeld = false; eigenGewaarschuwd = false; wisBlootWaarschuwing();
    status('In gesprek');
    if (m.prive) sys('Je bent nu verbonden met je vriend. Zeg eens hallo!', 'welkom');
    else sys('Je praat nu met een willekeurige vreemde. Zeg eens hallo!', 'welkom');
    if (Array.isArray(m.common) && m.common.length) sys(`Jullie kozen allebei: ${m.common.join(', ')}.`, 'gedeeld');
    if (matchMedia('(pointer: fine)').matches) $('msg').focus();
    if (mode === 'video') { wachtBeeld('Verbinden…'); startPeer(m.initiator === true); startBlootControle(); }
  }
  // De modus halverwege bijstellen (alleen bij een privégesprek dat op tekst uitkomt).
  function zetModus(nieuw) {
    if (nieuw === mode) return;
    mode = nieuw;
    $('chat').classList.toggle('alleen-tekst', mode === 'text');
    if (mode === 'text') { sluitPeer(); stopCamera(); $('btn-wissel').hidden = true; }
  }
  function endChat(metVolgende) {
    if (window.TKGames) window.TKGames.reset();
    clearTimeout(rustigTimer);
    priveCode = null; // een privégesprek is eenmalig; "Volgende" is daarna weer een willekeurig gesprek
    state = 'ended'; zetInvoer(false); zetTypt(false); zetStop(2); sluitPeer();
    wachtBeeld(''); status('Gestopt');
    if (metVolgende) {
      $('log').append(h('div', { class: 'na' },
        h('button', { type: 'button', class: 'knop hoofd', on: { click: zoek } }, 'Volgende gesprek'),
        h('button', { type: 'button', class: 'knop', on: { click: bewaarGesprek } }, 'Gesprek opslaan')));
      naarBeneden();
    }
  }
  function stopGesprek() {
    stuur({ t: 'stop' });
    sys(state === 'chatting' ? 'Je hebt het gesprek gestopt.' : 'Zoeken gestopt.');
    const wasGesprek = state === 'chatting';
    endChat(true);
    $('btn-report').disabled = !wasGesprek; // kort na afloop kun je de ander nog melden
  }
  function goHome() {
    if (state === 'chatting' || state === 'searching') stuur({ t: 'stop' });
    clearTimeout(rustigTimer);
    if (window.TKGames) window.TKGames.reset();
    priveCode = null;
    state = 'idle'; sluitPeer(); stopCamera();
    toonChat(false);
  }

  // Stop → Zeker? → Volgende. Zo stop je nooit per ongeluk een goed gesprek.
  function zetStop(stap) {
    stopStap = stap;
    const b = $('btn-stop');
    b.className = 'stop' + (stap === 1 ? ' zeker' : stap === 2 ? ' volgende' : '');
    b.textContent = stap === 0 ? 'Stop' : stap === 1 ? 'Zeker?' : 'Volgende';
  }
  function stopGedrukt() {
    if ($('btn-stop').disabled) return;
    if (stopStap === 2 || state === 'ended') return zoek();
    if (state === 'searching') return stopGesprek();
    if (stopStap === 0) return zetStop(1);
    stopGesprek();
  }
  $('btn-stop').addEventListener('click', stopGedrukt);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('chat').hidden || document.querySelector('dialog[open]')) return;
    e.preventDefault(); stopGedrukt();
  });

  // ------------------------------------------------------------ berichten
  function zetInvoer(aan) { $('msg').disabled = !aan; $('btn-send').disabled = !aan; if (!aan) { $('msg').value = ''; pasHoogteAan(); } }
  function naarBeneden() { const l = $('log'); l.scrollTop = l.scrollHeight; }
  function sys(tekst, soort = '') {
    if (!tekst) return;
    // Een foutmelding wordt meteen voorgelezen (role="alert"); gewone regels volgen het logboek.
    $('log').append(h('p', { class: `sys ${soort}`, role: soort === 'fout' ? 'alert' : null }, tekst));
    transcript.push(tekst); naarBeneden();
  }
  function regel(wie, tekst) {
    const naam = wie === 'ik' ? 'Jij' : 'Vreemde';
    $('log').append(h('div', { class: `bel ${wie}` }, h('span', { class: 'sr' }, `${naam}: `), tekst));
    transcript.push(`${naam}: ${tekst}`); naarBeneden();
  }
  function pasHoogteAan() { const t = $('msg'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }
  function verstuur() {
    const t = $('msg').value.trim();
    if (!t || state !== 'chatting') return;
    if (!stuur({ t: 'msg', text: t })) { sys('Niet verstuurd: er is geen verbinding.', 'fout'); return; }
    regel('ik', t);
    $('msg').value = ''; pasHoogteAan(); zetStop(0);
    if (typVerstuurd) { stuur({ t: 'typing', on: false }); typVerstuurd = false; }
  }
  $('bar').addEventListener('submit', (e) => { e.preventDefault(); verstuur(); $('msg').focus(); });
  $('msg').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); verstuur(); }
  });
  $('msg').addEventListener('input', () => {
    pasHoogteAan();
    if (state !== 'chatting') return;
    if (!typVerstuurd) { stuur({ t: 'typing', on: true }); typVerstuurd = true; }
    clearTimeout(typTimer);
    typTimer = setTimeout(() => { if (typVerstuurd) { stuur({ t: 'typing', on: false }); typVerstuurd = false; } }, 2500);
    if (stopStap === 1) zetStop(0);
  });
  function zetTypt(aan) { $('typing').hidden = !aan; if (aan) naarBeneden(); }
  function bewaarGesprek() {
    const blob = new Blob([`${NAAM}-gesprek, ${new Date().toLocaleString('nl-NL')}\n\n` + transcript.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${NAAM.toLowerCase()}-gesprek.txt` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  $('btn-save').addEventListener('click', bewaarGesprek);

  // ------------------------------------------------------------ melden
  $('btn-report').addEventListener('click', () => {
    const d = $('meld'); $('meld-form').reset(); $('meld-fout').hidden = true;
    d.showModal();
  });
  $('meld-annuleer').addEventListener('click', () => sluit($('meld')));
  $('meld-form').addEventListener('change', () => { $('meld-fout').hidden = true; });
  $('meld-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const reden = new FormData($('meld-form')).get('reden');
    const fout = (t) => { $('meld-fout').textContent = t; $('meld-fout').hidden = false; };
    if (!reden) return fout('Kies eerst wat er aan de hand is.');
    if (!stuur({ t: 'report', reden, toelichting: $('meld-tekst').value.trim().slice(0, 300), metBerichten: $('meld-berichten').checked })) return fout('Er is geen verbinding met de server. Probeer het zo nog eens.');
    sluit($('meld')); $('btn-report').disabled = true;
  });
  function onReported(m) {
    const tekst = {
      gemeld: 'Bedankt, je melding is binnen. Je komt deze persoon niet meer tegen.',
      dubbel: 'Je had deze persoon al gemeld. Je komt hem of haar niet meer tegen.',
      'te-veel': 'Je hebt kort na elkaar veel meldingen gedaan. Deze is niet opgeslagen; probeer het later opnieuw.',
      niemand: 'Er is niemand meer om te melden: het gesprek is te lang geleden gestopt.',
    }[m.code] || 'De melding is niet gelukt.';
    sys(tekst, m.ok ? '' : 'fout');
    if (state === 'chatting') endChat(true);
  }

  // ------------------------------------------------------------ camera
  let lokaal = null, camAan = true, micAan = true, cameraNr = 0, wisselBezig = false;
  const wachtBeeld = (tekst) => { $('vspin').hidden = !tekst; $('vtekst').textContent = tekst; };
  function cameraFout(e) {
    if (!navigator.mediaDevices || !window.isSecureContext) return 'Je browser geeft op dit adres geen toegang tot de camera. Dat kan alleen via een beveiligde verbinding (https).';
    switch (e && e.name) {
      case 'NotAllowedError': case 'SecurityError': return 'Je hebt de camera of microfoon geweigerd. Tik op het slotje of camera-icoon in de adresbalk, sta ze toe en probeer het opnieuw.';
      case 'NotFoundError': case 'OverconstrainedError': return 'We vinden geen camera of microfoon op dit apparaat.';
      case 'NotReadableError': case 'AbortError': return 'De camera is in gebruik door een andere app of een ander tabblad. Sluit die en probeer het opnieuw.';
      default: return 'De camera aanzetten is niet gelukt.';
    }
  }
  async function zetCameraAan() {
    try {
      if (!navigator.mediaDevices || !window.isSecureContext) throw new Error('onveilig');
      lokaal = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      status('Geen camera');
      sys(cameraFout(e), 'fout');
      $('log').append(h('div', { class: 'na' },
        h('button', { type: 'button', class: 'knop hoofd', on: { click: () => start('video') } }, 'Opnieuw proberen'),
        h('button', { type: 'button', class: 'knop', on: { click: () => start('text') } }, 'Verder met tekst')));
      state = 'ended'; zetStop(2); $('btn-stop').disabled = true; wachtBeeld('');
      return false;
    }
    camAan = micAan = true; toonLokaal(); knopStand();
    // Vast beginnen met het laden van de bloot-controle, zodat het model klaar is tegen de tijd dat er beeld is.
    if (window.TKBloot) window.TKBloot.laad();
    // Pas na toestemming weten we hoeveel camera's er zijn.
    try { const lijst = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); $('btn-wissel').hidden = lijst.length < 2; } catch (e) { $('btn-wissel').hidden = true; }
    return true;
  }
  function toonLokaal() {
    $('local').srcObject = lokaal;
    const stand = lokaal?.getVideoTracks()[0]?.getSettings?.().facingMode;
    $('local').classList.toggle('spiegel', stand !== 'environment'); // jezelf zie je gespiegeld, de camera achterop niet
  }
  function stopCamera() { if (lokaal) { lokaal.getTracks().forEach((t) => t.stop()); lokaal = null; } $('local').srcObject = null; }
  function knopStand() {
    $('btn-mic').setAttribute('aria-pressed', String(micAan)); $('btn-mic').setAttribute('aria-label', micAan ? 'Microfoon uitzetten' : 'Microfoon aanzetten');
    $('btn-cam').setAttribute('aria-pressed', String(camAan)); $('btn-cam').setAttribute('aria-label', camAan ? 'Camera uitzetten' : 'Camera aanzetten');
  }
  $('btn-mic').addEventListener('click', () => { if (!lokaal) return; micAan = !micAan; lokaal.getAudioTracks().forEach((t) => { t.enabled = micAan; }); knopStand(); });
  $('btn-cam').addEventListener('click', () => { if (!lokaal) return; camAan = !camAan; lokaal.getVideoTracks().forEach((t) => { t.enabled = camAan; }); knopStand(); });
  // Andere camera (op een telefoon: voor/achter). De nieuwe beelden gaan zonder opnieuw verbinden naar de ander.
  $('btn-wissel').addEventListener('click', async () => {
    if (!lokaal || wisselBezig) return; wisselBezig = true;
    const oud = lokaal.getVideoTracks()[0];
    try {
      const lijst = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const stand = oud?.getSettings?.().facingMode;
      let eis;
      if (stand === 'user' || stand === 'environment') eis = { facingMode: { exact: stand === 'user' ? 'environment' : 'user' } };
      else { cameraNr = (Math.max(0, lijst.findIndex((d) => d.deviceId === oud?.getSettings?.().deviceId)) + 1) % lijst.length; eis = { deviceId: { exact: lijst[cameraNr].deviceId } }; }
      if (oud) oud.stop(); // veel telefoons geven de tweede camera pas vrij als de eerste gestopt is
      const nieuw = (await navigator.mediaDevices.getUserMedia({ video: { ...eis, width: { ideal: 640 }, height: { ideal: 480 } } })).getVideoTracks()[0];
      nieuw.enabled = camAan;
      if (oud) lokaal.removeTrack(oud);
      lokaal.addTrack(nieuw);
      const zender = pc && pc.getSenders().find((s) => s.track === oud || (s.track && s.track.kind === 'video'));
      if (zender) await zender.replaceTrack(nieuw);
      toonLokaal();
    } catch (e) {
      sys('Wisselen van camera is niet gelukt.', 'fout');
      // De oude camera is gestopt: probeer de gewone weer aan te zetten, anders heeft de ander geen beeld meer.
      try { const terug = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0]; terug.enabled = camAan; if (oud) lokaal.removeTrack(oud); lokaal.addTrack(terug); const z = pc && pc.getSenders().find((s) => !s.track || s.track.kind === 'video'); if (z) await z.replaceTrack(terug); toonLokaal(); } catch (x) { /* dan blijft het beeld uit */ }
    }
    wisselBezig = false;
  });

  // ------------------------------------------------------------ video (WebRTC)
  // De servers die helpen een verbinding te leggen komen van onze eigen server (/ice), nooit van een dienst van buiten.
  let pc = null, initiator = false, wachtIce = [], iceLijst = { servers: [], tot: 0 }, hapertTimer = null, herstarts = 0, haperde = false;
  async function haalIce() {
    if (iceLijst.tot > Date.now()) return iceLijst.servers;
    try {
      const r = await fetch('/ice', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); iceLijst = { servers: Array.isArray(j.iceServers) ? j.iceServers : [], tot: Date.now() + Math.max(60, (j.geldigSec || 600) / 2) * 1000 }; }
    } catch (e) { /* zonder lijst proberen we het rechtstreeks */ }
    return iceLijst.servers;
  }
  async function startPeer(isInitiator) {
    sluitPeer();
    initiator = isInitiator; wachtIce = []; herstarts = 0; haperde = false;
    const servers = await haalIce();
    if (state !== 'chatting' || !lokaal) return;
    const deze = pc = new RTCPeerConnection({ iceServers: servers });
    // Signalen die binnenkwamen terwijl we de lijst ophaalden, verwerken we nu alsnog.
    const gemist = vroegeSignalen; vroegeSignalen = [];
    lokaal.getTracks().forEach((t) => deze.addTrack(t, lokaal));
    deze.ontrack = (e) => { if (pc !== deze) return; $('remote').srcObject = e.streams[0]; wachtBeeld(''); };
    deze.onicecandidate = (e) => { if (pc === deze && e.candidate) stuur({ t: 'signal', data: { ice: e.candidate.toJSON() } }); };
    deze.oniceconnectionstatechange = () => {
      if (pc !== deze) return;
      const s = deze.iceConnectionState;
      if (s === 'connected' || s === 'completed') { clearTimeout(hapertTimer); if (haperde) { haperde = false; sys('De video is weer verbonden.'); } if ($('remote').srcObject) wachtBeeld(''); }
      else if (s === 'disconnected') { haperde = true; wachtBeeld('De verbinding hapert…'); clearTimeout(hapertTimer); hapertTimer = setTimeout(() => herstartIce(deze), 3000); }
      else if (s === 'failed') { haperde = true; herstartIce(deze); }
    };
    if (initiator) await bied(deze, false);
    for (const d of gemist) await onSignal(d);
  }
  async function bied(deze, herstart) {
    try {
      if (deze.signalingState !== 'stable') return;
      await deze.setLocalDescription(await deze.createOffer({ iceRestart: herstart }));
      stuur({ t: 'signal', data: { sdp: { type: deze.localDescription.type, sdp: deze.localDescription.sdp } } });
    } catch (e) { console.warn('aanbod mislukt', e); }
  }
  // Hapert de video, dan zoeken de twee browsers een nieuwe weg (ICE-herstart). Alleen de starter doet het aanbod;
  // de ander vraagt erom. Na drie pogingen geven we het op en blijft de tekstchat over.
  function herstartIce(deze) {
    clearTimeout(hapertTimer);
    if (pc !== deze || state !== 'chatting') return;
    if (deze.iceConnectionState === 'connected' || deze.iceConnectionState === 'completed') return;
    if (++herstarts > 3) { wachtBeeld(''); sys('De video komt niet tot stand; waarschijnlijk houdt een van de netwerken het tegen. Typen kan nog wel.', 'fout'); return; }
    wachtBeeld('Opnieuw verbinden…');
    if (initiator) bied(deze, true); else stuur({ t: 'signal', data: { herstart: true } });
    hapertTimer = setTimeout(() => herstartIce(deze), 8000);
  }
  let vroegeSignalen = [];
  async function onSignal(d) {
    if (!d || typeof d !== 'object' || mode !== 'video' || state !== 'chatting') return;
    if (!pc) { if (vroegeSignalen.length < 60) vroegeSignalen.push(d); return; }
    const deze = pc;
    try {
      if (d.herstart) { if (initiator) await bied(deze, true); }
      else if (d.sdp) {
        if (d.sdp.type === 'offer' && initiator) return; // alleen de starter biedt aan: zo botsen twee aanbiedingen nooit
        await deze.setRemoteDescription(d.sdp);
        for (const c of wachtIce) await deze.addIceCandidate(c).catch(() => {}); wachtIce = [];
        if (d.sdp.type === 'offer') {
          await deze.setLocalDescription(await deze.createAnswer());
          stuur({ t: 'signal', data: { sdp: { type: deze.localDescription.type, sdp: deze.localDescription.sdp } } });
        }
      } else if (d.ice) {
        if (deze.remoteDescription) await deze.addIceCandidate(d.ice); else if (wachtIce.length < 60) wachtIce.push(d.ice);
      }
    } catch (e) { console.warn('signaal', e); }
  }
  function sluitPeer() {
    clearTimeout(hapertTimer); vroegeSignalen = [];
    stopBlootControle();
    if (pc) { const oud = pc; pc = null; oud.ontrack = oud.onicecandidate = oud.oniceconnectionstatechange = null; oud.close(); }
    $('remote').srcObject = null;
  }
  // Verlaat je de pagina, dan gaat de camera uit.
  addEventListener('pagehide', () => { stopCamera(); });

  // ------------------------------------------------------------ bloot-controle (alles op dit toestel, niets wordt verstuurd)
  async function startBlootControle() {
    if (!window.TKBloot || mode !== 'video') return;
    const uitslag = await window.TKBloot.laad();
    if (state !== 'chatting' || mode !== 'video') return;
    if (uitslag !== 'klaar') {
      // Fail-open: werkt het model niet (oud toestel, WebGL uit), dan gaat de videochat gewoon door, met een nette melding (één keer).
      if (!blootUitGemeld) { blootUitGemeld = true; sys('De automatische controle op ongepast beeld kon op dit toestel niet starten. Het gesprek gaat gewoon door; let zelf op en gebruik Melden als het nodig is.'); }
      return;
    }
    stopBlootControle();
    blootVreemde = window.TKBloot.volg($('remote'), { onBloot: () => blootGevonden() });
    // Ook de eigen camera: alleen jou waarschuwen, nooit verbreken.
    blootEigen = window.TKBloot.volg($('local'), { eigen: true, onBloot: () => {
      if (eigenGewaarschuwd || state !== 'chatting') return; eigenGewaarschuwd = true;
      sys('Let op: je eigen camera laat mogelijk naakt zien. Anderen kunnen je hierom melden en blokkeren.', 'fout');
    } });
  }
  function stopBlootControle() { if (blootVreemde) blootVreemde.stop(); if (blootEigen) blootEigen.stop(); blootVreemde = blootEigen = null; }
  function wisBlootWaarschuwing() { $('videos').classList.remove('verdacht'); $('vwaarschuw').hidden = true; }
  function blootGevonden() {
    if (blootGemeld || state !== 'chatting') return; blootGemeld = true;
    stopBlootControle();
    $('videos').classList.add('verdacht'); $('vwaarschuw').hidden = false; // beeld meteen onscherp maken
    stuur({ t: 'stop' });
    sys('Mogelijk ongepast beeld. Het gesprek is automatisch gestopt. Wil je het melden?', 'fout');
    endChat(true);
    $('btn-report').disabled = false; // melden blijft kunnen
  }

  // ------------------------------------------------------------ pauze en verlopen uitnodiging
  function onPauze(aan) {
    if (!aan) { if (state === 'idle' || state === 'ended') balk(''); return; }
    balk('Talkaroo is even dicht. Probeer het later nog eens.');
    if (state === 'chatting' || state === 'searching') {
      clearTimeout(rustigTimer); sluitPeer();
      sys('Talkaroo is even dicht. De beheerder heeft de site op pauze gezet. Dit gesprek is gestopt; probeer het later opnieuw.', 'fout');
      state = 'ended'; zetInvoer(false); zetTypt(false); zetStop(2); status('Even dicht'); wachtBeeld('');
      $('btn-stop').disabled = true; $('btn-report').disabled = true;
    }
  }
  function onPriveVerlopen() {
    if (state !== 'searching') return;
    priveCode = null;
    sys('Je vriend is niet gekomen en de uitnodiging is verlopen. Maak een nieuwe uitnodiging of start een gewoon gesprek.', 'fout');
    endChat(true);
  }

  // ------------------------------------------------------------ nodig een vriend uit (privégesprek via een deelbare link)
  // Een onraadbare code: 14 tekens uit een alfabet zonder makkelijk te verwarren letters/cijfers.
  function maakCode() {
    const alf = 'abcdefghijkmnpqrstuvwxyz23456789';
    const b = new Uint8Array(14); crypto.getRandomValues(b);
    return Array.from(b, (x) => alf[x % alf.length]).join('');
  }
  function leesCodeUitHash() {
    const m = (location.hash || '').match(/^#r=([a-z0-9]{8,24})$/i);
    return m ? m[1].toLowerCase() : null;
  }
  let vriendModus = 'maak', vriendCode = null;
  function openVriend(soort) {
    vriendModus = soort;
    const d = $('vriend');
    if (soort === 'maak') {
      vriendCode = maakCode();
      $('vriend-kop').textContent = 'Nodig een vriend uit';
      $('vriend-uitleg').textContent = 'Deel deze link met één iemand. Wie de link opent, komt rechtstreeks bij jou terecht in een privégesprek, buiten de willekeurige wachtrij om.';
      $('vriend-deel').hidden = false;
      $('vriend-link').value = `${location.origin}/#r=${vriendCode}`;
      $('vriend-tekst').textContent = 'Wachten met tekst'; $('vriend-video').textContent = 'Wachten met video';
    } else {
      $('vriend-kop').textContent = 'Je bent uitgenodigd';
      $('vriend-uitleg').textContent = 'Een vriend heeft je uitgenodigd voor een privégesprek. Kies hoe je meedoet.';
      $('vriend-deel').hidden = true;
      $('vriend-tekst').textContent = 'Doe mee met tekst'; $('vriend-video').textContent = 'Doe mee met video';
    }
    d.showModal();
  }
  $('btn-vriend').addEventListener('click', () => metAkkoord(() => openVriend('maak')));
  $('vriend-annuleer').addEventListener('click', () => sluit($('vriend')));
  $('vriend-kopieer').addEventListener('click', async () => {
    const inp = $('vriend-link');
    try { await navigator.clipboard.writeText(inp.value); $('vriend-kopieer').textContent = 'Gekopieerd'; setTimeout(() => { $('vriend-kopieer').textContent = 'Kopieer'; }, 2000); }
    catch (e) { inp.focus(); inp.select(); try { document.execCommand('copy'); $('vriend-kopieer').textContent = 'Gekopieerd'; } catch (x) { /* dan maar met de hand kopiëren */ } }
  });
  const startVriend = (m) => { const code = vriendCode; sluit($('vriend')); start(m, code); };
  $('vriend-tekst').addEventListener('click', () => startVriend('text'));
  $('vriend-video').addEventListener('click', () => startVriend('video'));

  window.TK = { stuur, sys, h, vraag, inGesprek: () => state === 'chatting', voegToe: (el) => { $('log').append(el); naarBeneden(); } };
  tekenTags();
  // Kwam je via een uitnodigingslink (#r=...), open dan meteen het meedoen-venster (na akkoord op 18+ en de regels).
  const inkomend = leesCodeUitHash();
  if (inkomend) { vriendCode = inkomend; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } setTimeout(() => metAkkoord(() => openVriend('join')), 300); }
  connect();
})();
