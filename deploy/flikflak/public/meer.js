// FlikFlak — meer functies (19 nov 2026): fotoposts met muziek, videobewerker, mappen (collecties),
// challenges, statistieken voor makers, kijkgeschiedenis, koppeling met ZekerFlex en installeren als app.
// Gebruikt de helpers uit app.js ($, $$, h, esc, ic, api, sheet, toast, need, grid, userRow, S, view, onCleanup).

// ================= installeren als app (PWA) =================
function registerPwa() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvent = e; });
}
async function installApp() {
  if (S.installEvent) { S.installEvent.prompt(); const r = await S.installEvent.userChoice.catch(() => null); if (r?.outcome === 'accepted') toast('FlikFlak is geïnstalleerd 🎉'); S.installEvent = null; }
  else toast(/iphone|ipad/i.test(navigator.userAgent) ? 'Safari: Delen → "Zet op beginscherm"' : 'Menu van je browser → "App installeren"');
}

// ================= inplannen =================
// datetime-local geeft lokale tijd zonder zone; we sturen het tijdstip als getal (ms), dan klopt het op elke server
const planMin = () => { const d = new Date(Date.now() + 5 * 60e3); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16); };
const planMs = v => { if (!v) return 0; const t = new Date(v).getTime(); return t > Date.now() + 60e3 ? t : 0; };

// ================= fotoposts =================
function fotoStage(v) {
  return `<div class="stage fotos"><div class="foto-strip">${v.fotos.map(f => `<img src="${f}" alt="" draggable="false">`).join('')}</div>
    <div class="foto-dots">${v.fotos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    ${v.sound?.file ? `<audio class="snd" data-src="${v.sound.file}" loop preload="none"></audio>` : ''}</div>`;
}
function fotoSetup(slide) {
  const strip = $('.foto-strip', slide), dots = $$('.foto-dots i', slide);
  if (!strip) return;
  let i = 0, timer = null;
  const go = n => { i = (n + dots.length) % dots.length; strip.scrollTo({ left: i * strip.clientWidth, behavior: 'smooth' }); dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
  strip.addEventListener('scroll', () => { const n = Math.round(strip.scrollLeft / strip.clientWidth); if (n !== i) { i = n; dots.forEach((d, j) => d.classList.toggle('on', j === i)); } });
  slide._fotoStart = () => { clearInterval(timer); if (S.settings?.reducedMotion) return; timer = setInterval(() => go(i + 1), 2800); };
  slide._fotoStop = () => clearInterval(timer);
  strip.addEventListener('pointerdown', () => clearInterval(timer));
  strip.addEventListener('pointerup', () => slide._fotoStart());
}
function produktKaart(p) {
  return `<a class="produkt-kaart" href="${esc(p.url)}" target="_blank" rel="noopener">${p.soort === 'klus' ? '💼' : '🛍️'}<span><b>${esc(p.titel)}</b><small>${p.soort === 'klus' ? 'Klus op ZekerFlex' : 'In de ZekerFlex Shop'} ›</small></span></a>`;
}
function muziekPicker(onPick) {
  const box = h(`<div class="muziek"><div class="sec-title" style="padding:10px 0 6px">Muziek <small>uit de FlikFlak-bibliotheek</small></div><div class="chips"></div></div>`);
  let audio = null, gekozen = null;
  api('GET', '/api/muziek').then(r => {
    const chips = $('.chips', box);
    const none = h('<button class="chip active">Geen</button>');
    none.onclick = () => { audio?.pause(); gekozen = null; $$('.chip', chips).forEach(c => c.classList.toggle('active', c === none)); onPick(null); };
    chips.append(none);
    r.muziek.forEach(m => {
      const c = h(`<button class="chip">♫ ${esc(m.name)}</button>`);
      c.onclick = () => { audio?.pause(); audio = new Audio(m.file); audio.loop = true; audio.volume = .8; audio.play().catch(() => {}); gekozen = m; $$('.chip', chips).forEach(x => x.classList.toggle('active', x === c)); onPick(m); };
      chips.append(c);
    });
  });
  onCleanup(() => audio?.pause());
  box.stop = () => audio?.pause();
  return box;
}
function pickProduktSheet(cb, huidig) {
  const s = sheet(`<div class="auth"><h3 style="font-size:17px">Koppel iets van ZekerFlex</h3><p>Plak de link van een product uit de ZekerFlex Shop of van een klus. Kijkers zien een kaartje onder je video.</p>
    <div class="segs" style="position:static;border:0"><button data-s="product" class="${huidig?.soort !== 'klus' ? 'active' : ''}">🛍️ Product</button><button data-s="klus" class="${huidig?.soort === 'klus' ? 'active' : ''}">💼 Klus</button></div>
    <input name="url" placeholder="https://zekerflex.com/shop/…" value="${esc(huidig?.url || '')}"><input name="titel" placeholder="Naam (bv. Thermo bodywarmer)" maxlength="80" value="${esc(huidig?.titel || '')}">
    <div class="err"></div><button class="btn block" data-ok>Koppelen</button>${huidig ? '<button class="btn grey block" data-weg>Koppeling weghalen</button>' : ''}</div>`);
  let soort = huidig?.soort || 'product';
  $$('[data-s]', s).forEach(b => b.onclick = () => { soort = b.dataset.s; $$('[data-s]', s).forEach(x => x.classList.toggle('active', x === b)); });
  $('[data-ok]', s).onclick = () => {
    const url = $('[name=url]', s).value.trim(), titel = $('[name=titel]', s).value.trim();
    if (!/^https:\/\/(www\.)?zekerflex\.com\//.test(url)) return ($('.err', s).textContent = 'Alleen een link van zekerflex.com');
    if (!titel) return ($('.err', s).textContent = 'Geef het een naam');
    cb({ url, titel, soort }); s.close();
  };
  $('[data-weg]', s)?.addEventListener('click', () => { cb(null); s.close(); });
}
async function shrinkFoto(f, max = 1080) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => res(b || f), 'image/jpeg', .86); };
    img.onerror = () => res(f); img.src = URL.createObjectURL(f);
  });
}
async function fotoStep(files, { tag, stop } = {}) {
  stop?.();
  files = files.slice(0, 10);
  view.innerHTML = ''; document.body.classList.add('fullscreen');
  const urls = files.map(f => URL.createObjectURL(f)); onCleanup(() => urls.forEach(u => URL.revokeObjectURL(u)));
  const ed = h(`<div class="page edit"><div class="head"><button class="ic back">${ic('back')}</button><h2>Fotopost</h2><span class="ic"></span></div>
    <div class="foto-pv"><div class="foto-strip">${urls.map(u => `<img src="${u}" alt="">`).join('')}</div><span class="foto-n">${files.length} foto${files.length > 1 ? "'s" : ''}</span></div>
    <textarea maxlength="2200" placeholder="Beschrijf je post… gebruik #hashtags en @vermeldingen" style="margin:12px 16px;width:calc(100% - 32px)">${tag ? '#' + esc(tag) + ' ' : ''}</textarea>
    <div class="muziek-wrap" style="padding:0 16px"></div>
    <div class="opt">${ic('link')}<label>ZekerFlex-koppeling</label><button class="btn small grey kies-produkt">Kiezen</button></div>
    <div class="opt"><span style="font-size:20px">📊</span><label>Peiling</label><button class="btn small grey kies-poll">Toevoegen</button></div>
    <div class="opt">${ic('lock')}<label>Wie kan dit bekijken</label><select name="privacy"><option value="public">Iedereen</option><option value="friends">Vrienden</option><option value="private">Alleen ik</option></select></div>
    <div class="opt">${ic('comment')}<label>Reacties toestaan</label><label class="switch-t"><input type="checkbox" name="allowComments" checked><span></span></label></div>
    <div class="opt">${ic('timer')}<label>Inplannen</label><input type="datetime-local" name="publishAt" min="${planMin()}"></div>
    <div class="progress" hidden><div></div></div>
    <div class="post-bar"><button class="btn grey again">Terug</button><button class="btn grey concept" title="Opslaan als concept">📝</button><button class="btn post">Plaatsen</button></div></div>`);
  view.append(ed);
  let muziek = null, produkt = null, alsConcept = false, poll = null;
  $('.kies-poll', ed).onclick = () => pollSheet(p => { poll = p; $('.kies-poll', ed).textContent = p ? '📊 ' + p.vraag.slice(0, 16) : 'Toevoegen'; }, poll);
  $('.concept', ed).onclick = () => { alsConcept = true; $('.post', ed).click(); };
  const mp = muziekPicker(m => { muziek = m; }); $('.muziek-wrap', ed).append(mp);
  $('.back', ed).onclick = $('.again', ed).onclick = () => render();
  $('.kies-produkt', ed).onclick = () => pickProduktSheet(p => { produkt = p; $('.kies-produkt', ed).textContent = p ? p.titel.slice(0, 18) : 'Kiezen'; }, produkt);
  $('.post', ed).onclick = async () => {
    const btn = $('.post', ed); btn.disabled = true; btn.textContent = 'Bezig…'; mp.stop();
    const fd = new FormData();
    for (const f of files) fd.append('fotos', await shrinkFoto(f), 'foto.jpg');
    fd.append('thumb', await shrinkFoto(files[0], 540), 'thumb.jpg');
    fd.append('caption', $('textarea', ed).value);
    fd.append('privacy', $('[name=privacy]', ed).value);
    fd.append('allowComments', $('[name=allowComments]', ed).checked);
    fd.append('allowDuet', 'false');
    if (muziek) fd.append('muziekId', muziek.id);
    if (produkt) fd.append('produkt', JSON.stringify(produkt));
    const plan = planMs($('[name=publishAt]', ed).value); if (plan) fd.append('publishAt', plan);
    if (alsConcept) fd.append('draft', 'true');
    if (poll) fd.append('poll', JSON.stringify(poll));
    $('.progress', ed).hidden = false;
    try { await api('POST', '/api/videos', fd); toast(alsConcept ? 'Bewaard als concept 📝' : plan ? 'Ingepland! ⏰' : 'Je fotopost staat erop! 🎉'); location.hash = '#/@' + S.me.username; }
    catch (e) { btn.disabled = false; btn.textContent = 'Plaatsen'; toast(e.message || 'Plaatsen mislukt'); }
  };
}

// ================= videobewerker: knippen, snelheid, tekst, muziek =================
function openEditor(file, filter) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const s = sheet(`<div class="sh-head">Bewerken<button class="x" data-close>${ic('close')}</button></div>
      <div class="sh-body editor">
        <div class="ed-pv"><video src="${url}" playsinline muted loop style="filter:${filterCss(filter)}"></video><div class="ed-tekst"></div></div>
        <div class="ed-row"><label>Knippen</label><div class="ed-trim"><input type="range" class="t0" min="0" max="1000" value="0"><input type="range" class="t1" min="0" max="1000" value="1000"></div><span class="ed-dur">—</span></div>
        <div class="ed-row"><label>Snelheid</label><div class="speed-pick">${[0.5, 1, 1.5, 2].map(x => `<button data-sp="${x}" class="${x === 1 ? 'active' : ''}">${String(x).replace('.', ',')}x</button>`).join('')}</div></div>
        <div class="ed-row"><label>Tekst</label><input class="ed-txt" maxlength="60" placeholder="Tekst op je video"><input type="color" class="ed-kleur" value="#ffffff"><select class="ed-pos"><option value="boven">Boven</option><option value="midden" selected>Midden</option><option value="onder">Onder</option></select></div>
        <div class="ed-row ed-muziek"></div>
        <div class="ed-row"><label>Volume muziek</label><input type="range" class="ed-vol" min="0" max="100" value="60"></div>
        <div class="progress" hidden><div></div></div>
      </div>
      <div class="sh-foot"><button class="btn block ed-ok">Toepassen</button></div>`, { tall: true, onClose: () => { resolve(null); } });
    const pv = $('video', s), tekst = $('.ed-tekst', s);
    let dur = 0, t0 = 0, t1 = 0, speed = 1, muziek = null;
    const mp = muziekPicker(m => { muziek = m; }); $('.ed-muziek', s).append(mp);
    const upd = () => { $('.ed-dur', s).textContent = `${(Math.max(0, t1 - t0) / speed).toFixed(1)}s`; };
    pv.addEventListener('loadedmetadata', () => { dur = pv.duration; t1 = dur; upd(); pv.play().catch(() => {}); });
    pv.addEventListener('timeupdate', () => { if (pv.currentTime >= t1 || pv.currentTime < t0 - 0.05) pv.currentTime = t0; });
    $('.t0', s).oninput = e => { t0 = Math.min(+e.target.value / 1000 * dur, t1 - 0.5); pv.currentTime = t0; upd(); };
    $('.t1', s).oninput = e => { t1 = Math.max(+e.target.value / 1000 * dur, t0 + 0.5); pv.currentTime = Math.max(t0, t1 - 1); upd(); };
    $$('[data-sp]', s).forEach(b => b.onclick = () => { speed = +b.dataset.sp; pv.playbackRate = speed; $$('[data-sp]', s).forEach(x => x.classList.toggle('active', x === b)); upd(); });
    const tekstUpd = () => { tekst.textContent = $('.ed-txt', s).value; tekst.style.color = $('.ed-kleur', s).value; tekst.className = 'ed-tekst ' + $('.ed-pos', s).value; };
    ['.ed-txt', '.ed-kleur', '.ed-pos'].forEach(q => $(q, s).oninput = tekstUpd);
    $('.ed-ok', s).onclick = async () => {
      const txt = $('.ed-txt', s).value.trim(), kleur = $('.ed-kleur', s).value, pos = $('.ed-pos', s).value, vol = +$('.ed-vol', s).value / 100;
      const niets = !txt && !muziek && speed === 1 && t0 < 0.05 && t1 > dur - 0.05;
      if (niets) { s.close(); return; }
      $('.ed-ok', s).disabled = true; $('.ed-ok', s).textContent = 'Bezig met bewerken…'; $('.progress', s).hidden = false; mp.stop(); pv.pause();
      try {
        const blob = await renderEdit(file, { t0, t1, speed, txt, kleur, pos, muziek, vol, filter }, p => { $('.progress div', s).style.width = (p * 100) + '%'; });
        s._klaar = true; s.close(); resolve(blob);
      } catch (e) { $('.ed-ok', s).disabled = false; $('.ed-ok', s).textContent = 'Toepassen'; toast('Bewerken lukt niet in deze browser'); }
    };
  });
}
function renderEdit(file, o, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const v = document.createElement('video'); v.src = URL.createObjectURL(file); v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
      const k = Math.min(1, 720 / Math.max(1, v.videoWidth)), W = Math.round(v.videoWidth * k) || 720, H = Math.round(v.videoHeight * k) || 1280;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
      const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
      const src = ac.createMediaElementSource(v); const g = ac.createGain(); g.gain.value = o.muziek ? Math.max(.25, 1 - o.vol * .6) : 1; src.connect(g).connect(dest);
      let mus = null;
      if (o.muziek) { mus = new Audio(o.muziek.file); mus.loop = true; mus.crossOrigin = 'anonymous'; const ms = ac.createMediaElementSource(mus); const mg = ac.createGain(); mg.gain.value = o.vol; ms.connect(mg).connect(dest); }
      const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : {});
      const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => { mus?.pause(); ac.close(); const b = new Blob(chunks, { type: rec.mimeType || 'video/webm' }); b.name = 'bewerkt.webm'; resolve(b); };
      v.currentTime = o.t0; await new Promise(r => { v.onseeked = r; });
      v.playbackRate = o.speed;
      const font = Math.round(W / 14);
      const teken = () => {
        ctx.filter = filterCss(o.filter) || 'none'; ctx.drawImage(v, 0, 0, W, H); ctx.filter = 'none';
        if (o.txt) {
          ctx.font = `bold ${font}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = Math.max(3, font / 8); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = o.kleur;
          const y = o.pos === 'boven' ? H * .14 : o.pos === 'onder' ? H * .86 : H / 2;
          ctx.strokeText(o.txt, W / 2, y); ctx.fillText(o.txt, W / 2, y);
        }
      };
      rec.start(250); await ac.resume(); mus?.play().catch(() => {}); await v.play();
      const loop = () => {
        if (rec.state !== 'recording') return;
        teken(); onProgress?.(Math.min(1, (v.currentTime - o.t0) / Math.max(.1, o.t1 - o.t0)));
        if (v.currentTime >= o.t1 || v.ended) { v.pause(); rec.stop(); return; }
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { reject(e); }
  });
}

// ================= mappen (collecties) =================
function saveToCollectionSheet(v) {
  const s = sheet(`<div class="sh-head">Opslaan in een map<button class="x" data-close>${ic('close')}</button></div><div class="sh-body"><div class="spinner"></div></div>
    <div class="sh-foot"><div class="cinput"><input placeholder="Nieuwe map…" maxlength="40"><button class="send btn small">Maak</button></div></div>`);
  const body = $('.sh-body', s);
  const teken = cols => {
    body.innerHTML = cols.length ? '' : '<div class="grid-empty">Nog geen mappen. Maak er hieronder een.</div>';
    cols.forEach(c => {
      const row = h(`<button class="row" style="width:100%;text-align:left">${c.thumb ? `<img class="thumb" src="${c.thumb}">` : '<span class="tag-ic">▣</span>'}<div class="grow"><div class="t1">${esc(c.name)}</div><div class="t2">${c.count} video's</div></div><span class="chk">${c.videoIds.includes(v.id) ? '✓' : ''}</span></button>`);
      row.onclick = async () => { const r = await api('POST', `/api/collections/${c.id}/toggle`, { videoId: v.id }); $('.chk', row).textContent = r.in ? '✓' : ''; toast(r.in ? `Opgeslagen in ${c.name}` : `Uit ${c.name} gehaald`); };
      body.append(row);
    });
  };
  const laad = () => api('GET', '/api/collections').then(r => teken(r.collections));
  laad();
  $('.send', s).onclick = async () => { const inp = $('input', s); const name = inp.value.trim(); if (!name) return; await api('POST', '/api/collections', { name }); inp.value = ''; laad(); };
}
function collectionsTab(container) {
  container.innerHTML = '<div class="spinner"></div>';
  api('GET', '/api/collections').then(r => {
    container.innerHTML = '';
    const nieuw = h('<div class="row" style="justify-content:center"><button class="btn small grey">+ Nieuwe map</button></div>');
    $('button', nieuw).onclick = () => { const s = sheet(`<div class="auth"><h3 style="font-size:17px">Nieuwe map</h3><input placeholder="Naam" maxlength="40"><button class="btn block" data-ok>Maken</button></div>`); $('[data-ok]', s).onclick = async () => { const name = $('input', s).value.trim(); if (!name) return; await api('POST', '/api/collections', { name }); s.close(); collectionsTab(container); }; };
    container.append(nieuw);
    if (!r.collections.length) container.append(h('<div class="grid-empty">Bewaar video\'s in mappen via Delen → "In een map". Alleen jij ziet ze.</div>'));
    const g = h('<div class="map-grid"></div>');
    r.collections.forEach(c => g.append(h(`<a class="map-card" href="#/map/${c.id}">${c.thumb ? `<img src="${c.thumb}">` : '<div class="map-leeg">▣</div>'}<b>${esc(c.name)}</b><small>${c.count} video's</small></a>`)));
    container.append(g);
  });
}
async function collectionPage(id) {
  if (!need()) return (location.hash = '#/');
  const r = await api('GET', '/api/collections/' + id);
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>${esc(r.collection.name)}</h2><button class="ic weg" title="Map verwijderen">${ic('trash')}</button></div></div>`);
  page.append(grid(r.videos, r.collection.name, 'Nog niets in deze map'));
  $('.weg', page).onclick = async () => { if (await confirmSheet(`Map "${r.collection.name}" verwijderen? De video's zelf blijven staan.`)) { await api('DELETE', '/api/collections/' + id); location.hash = '#/me'; } };
  view.append(page);
}

// ================= challenges =================
function challengeCard(c) {
  const rest = Math.max(0, Math.ceil((c.ends - Date.now()) / 864e5));
  return h(`<a class="ch-card ${c.done ? 'done' : ''}" href="#/challenge/${encodeURIComponent(c.tag)}">
    <div class="ch-thumbs">${c.top.length ? c.top.map(v => `<img src="${v.thumb || ''}" alt="">`).join('') : '<div class="map-leeg">#</div>'}</div>
    <div class="ch-body"><b>#${esc(c.tag)}</b><div class="t1">${esc(c.title)}</div><small>${c.count} video's · ${c.done ? 'afgelopen' : `nog ${rest} dag${rest === 1 ? '' : 'en'}`}</small></div></a>`);
}
function challengeStrip(list) {
  const row = h('<div class="ch-strip"></div>');
  if (!list.length) row.append(h('<a class="ch-card" href="#/challenges"><div class="ch-body"><b>Start de eerste challenge</b><small>Bedenk een hashtag en daag iedereen uit</small></div></a>'));
  list.forEach(c => row.append(challengeCard(c)));
  return row;
}
function newChallengeSheet() {
  if (!need()) return;
  const s = sheet(`<div class="auth"><h3 style="font-size:17px">Nieuwe challenge</h3><p>Een hashtag, een titel en hoe lang hij loopt. Iedereen die een video met die tag plaatst, doet mee.</p>
    <input name="tag" placeholder="#hashtag (bv. dansjeuitdaging)" maxlength="31"><input name="title" placeholder="Titel" maxlength="60"><textarea name="desc" rows="3" maxlength="300" placeholder="Wat moet je doen?"></textarea>
    <select name="days"><option value="7">1 week</option><option value="14">2 weken</option><option value="30">1 maand</option></select>
    <div class="err"></div><button class="btn block" data-ok>Starten</button></div>`);
  $('[data-ok]', s).onclick = async () => {
    try { const r = await api('POST', '/api/challenges', { tag: $('[name=tag]', s).value, title: $('[name=title]', s).value, desc: $('[name=desc]', s).value, days: $('[name=days]', s).value }); s.close(); toast('Challenge gestart! 🏁'); location.hash = '#/challenge/' + encodeURIComponent(r.challenge.tag); }
    catch (e) { $('.err', s).textContent = e.message; }
  };
}
async function challengesPage() {
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Challenges</h2><button class="ic nieuw">＋</button></div><div class="lst"><div class="spinner"></div></div></div>`);
  view.append(page);
  $('.nieuw', page).onclick = newChallengeSheet;
  const r = await api('GET', '/api/challenges');
  const lst = $('.lst', page); lst.innerHTML = '';
  if (!r.challenges.length) lst.append(h('<div class="grid-empty">Nog geen challenges.<br><br><button class="btn" onclick="newChallengeSheet()">Start de eerste</button></div>'));
  const g = h('<div class="ch-grid"></div>'); r.challenges.forEach(c => g.append(challengeCard(c))); lst.append(g);
}
async function challengePage(tag) {
  tag = decodeURIComponent(tag);
  const r = await api('GET', '/api/challenges/' + encodeURIComponent(tag));
  const c = r.challenge, rest = Math.max(0, Math.ceil((c.ends - Date.now()) / 864e5));
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>#${esc(c.tag)}</h2><span class="ic"></span></div>
    <div class="big-head"><div class="ph">🏁</div><div><h1>${esc(c.title)}</h1><p>${c.done ? 'Afgelopen' : `Nog ${rest} dag${rest === 1 ? '' : 'en'}`} · ${c.count} video's · ${fmt(c.views)} weergaven</p><p>door <a href="#/@${esc(c.by?.username)}">@${esc(c.by?.username)}</a></p></div></div>
    ${c.desc ? `<div class="bio rich" style="padding:0 16px 12px">${rich(c.desc)}</div>` : ''}
    <div class="segs"><button data-t="top" class="active">Top video's</button><button data-t="makers">Ranglijst</button></div><div class="tabc"></div></div>`);
  const tabc = $('.tabc', page);
  const show = t => {
    $$('.segs button', page).forEach(b => b.classList.toggle('active', b.dataset.t === t)); tabc.innerHTML = '';
    if (t === 'top') tabc.append(grid(r.videos, '#' + c.tag, 'Nog niemand doet mee. Wees de eerste!'));
    else { if (!r.makers.length) tabc.append(h('<div class="grid-empty">Nog geen ranglijst</div>')); r.makers.forEach((m, i) => tabc.append(userRow(m.user, `${i + 1}e · ${fmt(m.likes)} likes · ${m.videos} video${m.videos === 1 ? '' : "'s"}`))); }
  };
  $$('.segs button', page).forEach(b => b.onclick = () => show(b.dataset.t));
  show('top');
  if (!c.done) page.append(h(`<div class="float-btn"><a class="btn" href="#/upload?tag=${encodeURIComponent(c.tag)}">${ic('play')} Doe mee</a></div>`));
  view.append(page);
}

// ================= statistieken voor makers =================
async function statsPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Statistieken</h2><span class="ic"></span></div><div class="spinner"></div></div>`);
  view.append(page);
  const r = await api('GET', '/api/stats');
  $('.spinner', page).remove();
  const t = r.totals, max = Math.max(1, ...r.perDag.map(d => d.views));
  // h() geeft één element terug: alles in één omhulsel
  page.append(h(`<div><div class="kpi-grid">${[['Weergaven', t.views], ['Likes', t.likes], ['Reacties', t.comments], ['Gedeeld', t.shares], ['Volgers', r.followers], ["Video's", t.videos]].map(([l, n]) => `<div class="kpi"><b>${fmt(n)}</b><small>${l}</small></div>`).join('')}</div>
    <div class="sec-title">Weergaven per dag <small>laatste 14 dagen</small></div>
    <div class="bars">${r.perDag.map(d => `<div class="bar" title="${d.dag}: ${d.views}"><i style="height:${Math.round(d.views / max * 100)}%"></i><span>${d.dag.slice(8)}</span></div>`).join('')}</div>
    <div class="sec-title">Je video's <small>op weergaven</small></div></div>`));
  if (!r.videos.length) page.append(h('<div class="grid-empty">Plaats een video om cijfers te zien.</div>'));
  r.videos.forEach(v => page.append(h(`<a class="row" href="#/v/${v.id}">${v.thumb ? `<img class="thumb" src="${v.thumb}">` : '<span class="tag-ic">▶</span>'}<div class="grow"><div class="t1">${esc(v.caption || '(geen tekst)')}</div><div class="t2">${fmt(v.views)} weergaven · ${fmt(v.likes)} likes · ${fmt(v.comments)} reacties · ${fmt(v.shares)}× gedeeld</div></div></a>`)));
}

// ================= peilingen =================
function pollSheet(cb, huidig) {
  const s = sheet(`<div class="auth"><h3 style="font-size:17px">Peiling op je video</h3><p>Een vraag en 2 tot 4 antwoorden. Kijkers stemmen met één tik en zien dan de percentages.</p>
    <input name="vraag" placeholder="Vraag (bv. Welke outfit?)" maxlength="100" value="${esc(huidig?.vraag || '')}">
    ${[0, 1, 2, 3].map(i => `<input name="o${i}" placeholder="Antwoord ${i + 1}${i > 1 ? ' (optioneel)' : ''}" maxlength="40" value="${esc(huidig?.opties?.[i] || '')}">`).join('')}
    <div class="err"></div><button class="btn block" data-ok>Toevoegen</button>${huidig ? '<button class="btn grey block" data-weg>Peiling weghalen</button>' : ''}</div>`);
  $('[data-ok]', s).onclick = () => {
    const vraag = $('[name=vraag]', s).value.trim(), opties = [0, 1, 2, 3].map(i => $(`[name=o${i}]`, s).value.trim()).filter(Boolean);
    if (!vraag) return ($('.err', s).textContent = 'Stel een vraag');
    if (opties.length < 2) return ($('.err', s).textContent = 'Minstens twee antwoorden');
    cb({ vraag, opties }); s.close();
  };
  $('[data-weg]', s)?.addEventListener('click', () => { cb(null); s.close(); });
}
function pollBlok(v) {
  const p = v.poll, klaar = p.mijn >= 0;
  return `<div class="poll ${klaar ? 'klaar' : ''}"><b>📊 ${esc(p.vraag)}</b>${p.opties.map((o, i) => `<button data-i="${i}" class="${p.mijn === i ? 'mijn' : ''}"><i style="width:${klaar ? o.pct : 0}%"></i><span>${esc(o.tekst)}</span><em>${klaar ? o.pct + '%' : ''}</em></button>`).join('')}<small>${p.totaal} stem${p.totaal === 1 ? '' : 'men'}</small></div>`;
}
function pollSetup(slide, v) {
  $$('.poll button', slide).forEach(b => b.onclick = async e => {
    e.stopPropagation(); if (!need()) return;
    const r = await api('POST', `/api/videos/${v.id}/poll`, { i: +b.dataset.i });
    v.poll = r.poll; $('.poll', slide).outerHTML = pollBlok(v); pollSetup(slide, v);
  });
}
function antwoordChip(v) { return `<div class="antwoord-chip">📹 Antwoord aan <b>@${esc(v.antwoordOp.username)}</b>: “${esc(v.antwoordOp.text.slice(0, 60))}”</div>`; }
function serieChip(v) { return `<a class="serie-chip" href="#/serie/${v.serie.id}">📺 ${esc(v.serie.naam)} · deel ${v.serie.index}/${v.serie.totaal}</a>`; }

// ================= series (afspeellijsten van de maker) =================
function serieSheet(eigenVideos, huidig, klaar) {
  const gekozen = new Set(huidig?.videoIds || []);
  const s = sheet(`<div class="sh-head">${huidig ? 'Serie bewerken' : 'Nieuwe serie'}<button class="x" data-close>${ic('close')}</button></div>
    <div class="sh-body" style="padding:0 16px 12px"><input name="naam" placeholder="Naam van de serie (bv. Keukentips)" maxlength="50" value="${esc(huidig?.naam || '')}" style="margin:10px 0">
    <div class="sec-title" style="padding:6px 0">Kies video's <small>in deze volgorde</small></div><div class="serie-kies">${eigenVideos.map(v => `<label><input type="checkbox" value="${v.id}" ${gekozen.has(v.id) ? 'checked' : ''}><img src="${v.thumb || ''}"></label>`).join('') || '<div class="grid-empty">Plaats eerst een video</div>'}</div></div>
    <div class="sh-foot"><button class="btn block" data-ok>${huidig ? 'Opslaan' : 'Serie maken'}</button>${huidig ? '<button class="btn grey block" data-weg style="margin-top:8px">Serie verwijderen</button>' : ''}</div>`, { tall: true });
  $('[data-ok]', s).onclick = async () => {
    const naam = $('[name=naam]', s).value.trim(), videoIds = $$('input[type=checkbox]:checked', s).map(i => i.value);
    if (!naam) return toast('Geef de serie een naam');
    try { if (huidig) await api('PATCH', '/api/series/' + huidig.id, { naam, videoIds }); else await api('POST', '/api/series', { naam, videoIds }); s.close(); klaar(); } catch (e) { toast(e.message); }
  };
  $('[data-weg]', s)?.addEventListener('click', async () => { if (await confirmSheet('Serie verwijderen? De video\'s blijven staan.')) { await api('DELETE', '/api/series/' + huidig.id); s.close(); klaar(); } });
}
async function seriesTab(container, u, eigenVideos) {
  container.innerHTML = '<div class="spinner"></div>';
  const r = await api('GET', '/api/series/van/' + encodeURIComponent(u.username));
  container.innerHTML = '';
  if (u.isMe) { const nieuw = h('<div class="row" style="justify-content:center"><button class="btn small grey">+ Nieuwe serie</button></div>'); $('button', nieuw).onclick = () => serieSheet(eigenVideos, null, () => seriesTab(container, u, eigenVideos)); container.append(nieuw); }
  if (!r.series.length) return container.append(h(`<div class="grid-empty">${u.isMe ? 'Zet video\'s die bij elkaar horen in een serie; kijkers zien dan "deel 1/3".' : 'Nog geen series'}</div>`));
  const g = h('<div class="map-grid"></div>');
  r.series.forEach(s => g.append(h(`<a class="map-card" href="#/serie/${s.id}">${s.thumb ? `<img src="${s.thumb}">` : '<div class="map-leeg">📺</div>'}<b>${esc(s.naam)}</b><small>${s.count} video${s.count === 1 ? '' : "'s"}</small></a>`)));
  container.append(g);
}
async function seriePage(id) {
  const r = await api('GET', '/api/series/' + id);
  const mijn = S.me && r.serie.by === S.me.username;
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>📺 ${esc(r.serie.naam)}</h2>${mijn ? `<button class="ic bew">${ic('edit')}</button>` : '<span class="ic"></span>'}</div><p style="padding:6px 16px;color:var(--muted)">door <a href="#/@${esc(r.serie.by)}">@${esc(r.serie.by)}</a> · ${r.videos.length} delen</p></div>`);
  page.append(grid(r.videos, r.serie.naam, 'Nog geen video\'s in deze serie'));
  if (mijn) $('.bew', page).onclick = async () => { const p = await api('GET', '/api/users/' + S.me.username); serieSheet(p.videos, { id, naam: r.serie.naam, videoIds: r.videos.map(v => v.id) }, () => render()); };
  view.append(page);
}

// ================= kijkgeschiedenis =================
async function historyPage() {
  if (!need()) return (location.hash = '#/');
  const r = await api('GET', '/api/history');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Kijkgeschiedenis</h2><button class="ic wis" title="Wissen">${ic('trash')}</button></div></div>`);
  page.append(grid(r.videos, 'Kijkgeschiedenis', 'Nog niets bekeken'));
  $('.wis', page).onclick = async () => { await api('DELETE', '/api/history'); toast('Geschiedenis gewist'); render(); };
  view.append(page);
}
