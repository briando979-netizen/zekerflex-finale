// FlikFlak — ronde C (19 nov 2026): instellingen, privé account met volgverzoeken, thema (donker/licht),
// pauze-herinnering, prestaties, concepten. Gebruikt de helpers uit app.js (global scope).

// ================= uitnodigingslink (?ref=gebruikersnaam) =================
(() => { try { const ref = new URLSearchParams(location.search).get('ref'); if (ref) { localStorage.setItem('ff_ref', ref.replace(/^@/, '').slice(0, 24)); history.replaceState(null, '', location.pathname + location.hash); } } catch {} })();
function inviteLink() { return location.origin + '/?ref=' + encodeURIComponent(S.me.username); }
async function deelUitnodiging() {
  const l = inviteLink(), tekst = `Kom ook op FlikFlak! Korte video's, chat en LIVE. Meld je aan via mijn link: ${l}`;
  if (navigator.share) { try { await navigator.share({ title: 'FlikFlak', text: tekst, url: l }); return; } catch {} }
  try { await navigator.clipboard.writeText(l); toast('Uitnodigingslink gekopieerd'); } catch { prompt('Je uitnodigingslink:', l); }
}

// ================= geblokkeerde accounts =================
async function blockedPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Geblokkeerd</h2><span class="ic"></span></div><div class="lst"><div class="spinner"></div></div></div>`);
  view.append(page);
  const r = await api('GET', '/api/blocked');
  const lst = $('.lst', page); lst.innerHTML = r.users.length ? '' : '<div class="grid-empty">Je hebt niemand geblokkeerd.</div>';
  r.users.forEach(u => {
    const row = h(`<div class="row"><img class="av" src="${avatar(u)}"><div class="grow"><div class="t1">${esc(u.name || u.username)}</div><div class="t2">@${esc(u.username)}</div></div><button class="btn small grey">Deblokkeren</button></div>`);
    $('button', row).onclick = async () => { await api('POST', `/api/users/${u.id}/block`); row.remove(); toast(`@${u.username} gedeblokkeerd`); if (!$('.row', lst)) lst.innerHTML = '<div class="grid-empty">Je hebt niemand geblokkeerd.</div>'; };
    lst.append(row);
  });
}
function wachtwoordSheet() {
  const s = sheet(`<div class="auth"><h3 style="font-size:17px">Wachtwoord wijzigen</h3><input name="oud" type="password" placeholder="Huidig wachtwoord" autocomplete="current-password"><input name="nieuw" type="password" placeholder="Nieuw wachtwoord (min. 6 tekens)" autocomplete="new-password"><input name="nieuw2" type="password" placeholder="Nieuw wachtwoord nog een keer"><div class="err"></div><button class="btn block" data-ok>Opslaan</button></div>`);
  $('[data-ok]', s).onclick = async () => {
    const oud = $('[name=oud]', s).value, nieuw = $('[name=nieuw]', s).value;
    if (nieuw !== $('[name=nieuw2]', s).value) return ($('.err', s).textContent = 'De nieuwe wachtwoorden zijn niet gelijk');
    try { await api('POST', '/api/account/wachtwoord', { oud, nieuw }); s.close(); toast('Wachtwoord gewijzigd; andere apparaten zijn uitgelogd'); } catch (e) { $('.err', s).textContent = e.message; }
  };
}

// ================= thema =================
function applyTheme(t) {
  const licht = t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = licht ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', licht ? '#ffffff' : '#000000');
  try { localStorage.setItem('ff_theme', t); } catch {}
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if ((S.settings?.theme || localStorage.getItem('ff_theme') || 'dark') === 'system') applyTheme('system'); });

// ================= toegankelijkheid =================
function applyA11y(s) {
  document.documentElement.dataset.text = s?.textSize === 'groot' ? 'groot' : 'normaal';
  document.documentElement.dataset.motion = s?.reducedMotion ? 'minder' : 'normaal';
}

// ================= pauze-herinnering =================
function startBreakReminder(min) {
  clearInterval(S._pauze); S._pauzeStart = Date.now();
  if (!min) return;
  S._pauze = setInterval(() => {
    const m = Math.round((Date.now() - S._pauzeStart) / 60e3);
    const s = sheet(`<div class="auth"><h3 style="font-size:20px">☕ Tijd voor een pauze?</h3><p>Je bent al ${m} minuten op FlikFlak. Even de benen strekken?</p><button class="btn block" data-close>Nog heel even</button><button class="btn grey block" data-stop>Herinner me niet meer vandaag</button></div>`);
    $('[data-stop]', s).onclick = () => { clearInterval(S._pauze); s.close(); };
  }, min * 60e3);
}

// ================= prestaties =================
function achievementsBlock(list) {
  const wrap = h('<div class="prestaties"></div>');
  (list || []).forEach(a => wrap.append(h(`<span class="prestatie ${a.earned ? 'on' : ''}" title="${esc(a.title)}${a.earned ? '' : ' (nog niet)'}"><i>${a.icon}</i><small>${esc(a.title)}</small></span>`)));
  return wrap;
}

// ================= concepten & gepland (alleen jezelf) =================
function pendingTab(container, list) {
  container.innerHTML = '';
  if (!list.length) return container.append(h('<div class="grid-empty">Geen concepten of geplande posts.<br>Kies bij het plaatsen "Concept" of een tijdstip.</div>'));
  list.forEach(v => {
    const row = h(`<div class="row">${v.thumb ? `<img class="thumb" src="${v.thumb}">` : '<span class="tag-ic">▶</span>'}<div class="grow"><div class="t1">${esc(v.caption || '(geen tekst)')}</div><div class="t2">${v.draft ? '📝 Concept' : '⏰ Gepland: ' + new Date(v.publishAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><button class="btn small pub">Nu plaatsen</button><button class="ic del" title="Verwijderen">${ic('trash')}</button></div>`);
    $('.pub', row).onclick = async () => { await api('POST', `/api/videos/${v.id}/publish`); toast('Geplaatst! 🎉'); render(); };
    $('.del', row).onclick = async () => { if (await confirmSheet('Verwijderen?')) { await api('DELETE', '/api/videos/' + v.id); render(); } };
    container.append(row);
  });
}

// ================= volgverzoeken =================
async function followRequestsPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Volgverzoeken</h2><span class="ic"></span></div><div class="lst"><div class="spinner"></div></div></div>`);
  view.append(page);
  const laad = async () => {
    const r = await api('GET', '/api/follow-requests');
    const lst = $('.lst', page); lst.innerHTML = r.users.length ? '' : '<div class="grid-empty">Geen open verzoeken.</div>';
    r.users.forEach(u => {
      const row = h(`<div class="row"><a href="#/@${esc(u.username)}"><img class="av" src="${avatar(u)}"></a><div class="grow"><div class="t1">${esc(u.name || u.username)}</div><div class="t2">@${esc(u.username)} wil je volgen</div></div><button class="btn small ok">Toestaan</button><button class="btn small grey nee">Weigeren</button></div>`);
      const doe = async approve => { const r2 = await api('POST', '/api/follow-requests/' + u.id, { approve }); S.followRequests = r2.open; row.remove(); if (!$('.row', lst)) lst.innerHTML = '<div class="grid-empty">Geen open verzoeken.</div>'; };
      $('.ok', row).onclick = () => doe(true); $('.nee', row).onclick = () => doe(false);
      lst.append(row);
    });
  };
  laad();
}

// ================= meldingen op het apparaat (web push) =================
// De browser maakt een abonnement (een geheim adres bij Google/Apple/Mozilla) en wij
// bewaren dat bij je account; de server stuurt er alleen korte meldingen heen als je
// niet in de app zit. Uitzetten kan hier of in je browser; dan vergeten we het adres.
const pushKan = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function pushAbonnement() {
  if (!pushKan()) return null;
  // `ready` wacht tot de service worker actief is; dat mag de instellingenpagina nooit ophouden (max. 1,5 s)
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 1500))]);
  return reg ? reg.pushManager.getSubscription() : null;
}
function b64ToBytes(s) {
  const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function pushAan() {
  if (!pushKan()) { toast(/iphone|ipad/i.test(navigator.userAgent) ? 'Zet FlikFlak eerst op je beginscherm (Delen → Zet op beginscherm)' : 'Je browser kan geen meldingen tonen'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Meldingen staan uit in je browser'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const { sleutel } = await api('GET', '/api/push/sleutel');
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(sleutel) });
    await api('POST', '/api/push/abonneer', { subscription: sub.toJSON() });
    toast('Meldingen op dit apparaat staan aan 🔔');
    return true;
  } catch (e) { toast('Aanzetten lukte niet: ' + (e.message || e)); return false; }
}
async function pushUit() {
  try {
    const sub = await pushAbonnement();
    if (sub) { await api('DELETE', '/api/push/abonneer', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    toast('Meldingen op dit apparaat staan uit');
    return true;
  } catch { return false; }
}

// ================= QR-code delen =================
// Een QR-code van een eigen pagina (profiel, video, uitnodiging): de server tekent hem, zonder derde partij.
function qrSheet(pad, titel, link) {
  const s = sheet(`<div class="sh-head">${esc(titel)}<button class="x" data-close>${ic('close')}</button></div>
    <div class="sh-body" style="text-align:center;padding:8px 16px 20px">
      <div style="display:inline-block;background:#fff;padding:12px;border-radius:16px"><img src="/api/qr?pad=${encodeURIComponent(pad)}" alt="QR-code" width="220" height="220" style="display:block"></div>
      <div style="margin-top:10px;font-size:13px;color:var(--muted);word-break:break-all">${esc(link)}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><button class="btn grey kopieer">Link kopiëren</button><a class="btn grey" href="/api/qr?pad=${encodeURIComponent(pad)}" download="flikflak-qr.svg">QR opslaan</a></div>
    </div>`);
  $('.kopieer', s).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link gekopieerd'); } catch { prompt('Kopieer deze link:', link); } };
  return s;
}

// ================= instellingen =================
async function settingsPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Instellingen</h2><span class="ic"></span></div><div class="spinner"></div></div>`);
  view.append(page);
  const r = await api('GET', '/api/settings'); const s = r.settings;
  const pushAanOpDitApparaat = !!(await pushAbonnement().catch(() => null));
  $('.spinner', page).remove();
  const keuze = (naam, opties, waarde) => `<select name="${naam}">${opties.map(([k, l]) => `<option value="${k}" ${k === waarde ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const schakel = (naam, aan) => `<label class="switch-t"><input type="checkbox" name="${naam}" ${aan ? 'checked' : ''}><span></span></label>`;
  page.append(h(`<div>
    <div class="sec-title">Privacy</div>
    <div class="opt">${ic('lock')}<label>Privé account<small>Alleen goedgekeurde volgers zien je video's</small></label>${schakel('privateAccount', s.privateAccount)}</div>
    <a class="opt" href="#/verzoeken">${ic('addUser')}<label>Volgverzoeken</label><span class="badge-n">${S.followRequests || ''}</span><span style="color:var(--muted)">›</span></a>
    <div class="opt">${ic('comment')}<label>Wie mag reageren</label>${keuze('whoComments', [['all', 'Iedereen'], ['friends', 'Vrienden'], ['none', 'Niemand']], s.whoComments)}</div>
    <div class="opt">${ic('inbox')}<label>Wie mag je een bericht sturen</label>${keuze('whoMessages', [['all', 'Iedereen'], ['friends', 'Vrienden'], ['none', 'Niemand']], s.whoMessages)}</div>
    <div class="opt">${ic('download')}<label>Anderen mogen mijn video's opslaan</label>${schakel('allowDownload', s.allowDownload)}</div>
    <div class="opt opt-kolom">${ic('flag')}<label>Geblokkeerde woorden in reacties<small>Komma's ertussen. Reacties met zo'n woord worden geweigerd.</small></label><textarea name="commentFilter" rows="2" placeholder="bv. spam, link in bio">${esc(s.commentFilter.join(', '))}</textarea></div>
    <div class="sec-title">Account</div>
    <div class="opt"><span style="font-size:20px">🏢</span><label>Soort account<small>Een bedrijfsaccount krijgt een 🏢-label, een website-link en een "Werk bij ons"-knop</small></label>${keuze('accountType', [['persoon', 'Persoon'], ['bedrijf', 'Bedrijf']], s.accountType)}</div>
    <div class="opt opt-kolom">${ic('link')}<label>Website<small>Alleen https-links</small></label><input type="url" name="website" placeholder="https://jouwbedrijf.nl" value="${esc(s.website)}"></div>
    <div class="opt opt-kolom"><span style="font-size:20px">💼</span><label>"Werk bij ons"-link<small>Bijvoorbeeld je klussen of vacatures op zekerflex.com</small></label><input type="url" name="werkLink" placeholder="https://zekerflex.com/…" value="${esc(s.werkLink)}"></div>
    <div class="sec-title">Weergave</div>
    <div class="opt">${ic('magic')}<label>Thema</label>${keuze('theme', [['dark', 'Donker'], ['light', 'Licht'], ['system', 'Zoals je telefoon']], s.theme)}</div>
    <div class="opt"><span style="font-size:20px">🔠</span><label>Tekstgrootte</label>${keuze('textSize', [['normaal', 'Normaal'], ['groot', 'Groot']], s.textSize)}</div>
    <div class="opt"><span style="font-size:20px">🌀</span><label>Minder beweging<small>Geen animaties, foto's schuiven niet vanzelf</small></label>${schakel('reducedMotion', s.reducedMotion)}</div>
    <div class="sec-title">Welzijn</div>
    <div class="opt">${ic('timer')}<label>Pauze-herinnering</label>${keuze('breakReminder', [[0, 'Uit'], [15, 'Elke 15 min'], [30, 'Elke 30 min'], [60, 'Elk uur']], s.breakReminder)}</div>
    <div class="sec-title">Meldingen</div>
    <div class="opt">${ic('inbox')}<label>Meldingen op dit apparaat<small>Ook als FlikFlak dicht is: likes, reacties, volgers, berichten en LIVE</small></label>${schakel('pushDevice', pushAanOpDitApparaat)}</div>
    ${[['like', 'Likes'], ['comment', 'Reacties en antwoorden'], ['mention', 'Vermeldingen'], ['follow', 'Nieuwe volgers en verzoeken'], ['repost', 'Reposts'], ['post', "Nieuwe video's van wie je volgt"], ['live', 'Iemand gaat LIVE']].map(([k, l]) => `<div class="opt">${ic('inbox')}<label>${l}</label>${schakel('notif.' + k, s.notif[k] !== false)}</div>`).join('')}
    <div class="sec-title">Account &amp; veiligheid</div>
    <button class="opt ww" style="width:100%;text-align:left">${ic('lock')}<label>Wachtwoord wijzigen</label></button>
    <button class="opt overal" style="width:100%;text-align:left">${ic('back')}<label>Overal uitloggen<small>Behalve op dit apparaat</small></label></button>
    <a class="opt" href="#/geblokkeerd">${ic('nope')}<label>Geblokkeerde accounts</label><span style="color:var(--muted)">›</span></a>
    <button class="opt uitnodig" style="width:100%;text-align:left">${ic('addUser')}<label>Vrienden uitnodigen<small>Deel je link; wie zich zo aanmeldt, staat als "uitgenodigd door jou"</small></label></button>
    <div class="sec-title">Je gegevens</div>
    <button class="opt export" style="width:100%;text-align:left">${ic('download')}<label>Download mijn gegevens<small>Alles wat FlikFlak van jou bewaart, als bestand</small></label></button>
    <button class="opt regels" style="width:100%;text-align:left">${ic('flag')}<label>Huisregels &amp; privacy</label></button>
    <button class="opt weg" style="width:100%;text-align:left;color:#ff4d6d">${ic('trash')}<label>Account verwijderen<small>Al je video's, reacties en berichten gaan weg</small></label></button>
    <div class="err" style="padding:8px 16px;color:var(--accent);font-size:13px"></div></div>`));
  const stuur = async (patch) => {
    try { const r2 = await api('PATCH', '/api/settings', patch); S.settings = r2.settings; toast('Opgeslagen'); }
    catch (e) { $('.err', page).textContent = e.message; }
  };
  $$('input[type=checkbox]', page).forEach(i => i.onchange = async () => {
    if (i.name === 'pushDevice') { const ok = i.checked ? await pushAan() : !(await pushUit()); i.checked = i.checked ? ok : false; return; }
    if (i.name.startsWith('notif.')) return stuur({ notif: { [i.name.slice(6)]: i.checked } });
    await stuur({ [i.name]: i.checked }); if (i.name === 'reducedMotion') applyA11y(S.settings);
  });
  $('.ww', page).onclick = wachtwoordSheet;
  $('.overal', page).onclick = async () => { if (await confirmSheet('Op alle andere apparaten uitloggen?', 'Uitloggen')) { const r2 = await api('POST', '/api/account/uitloggen-overal'); toast(`${r2.sessies} andere sessie${r2.sessies === 1 ? '' : 's'} uitgelogd`); } };
  $('.uitnodig', page).onclick = deelUitnodiging;
  $$('input[type=url]', page).forEach(i => i.onblur = async () => { await stuur({ [i.name]: i.value.trim() }); i.value = S.settings?.[i.name] || ''; if (i.value === '' && i.defaultValue === '' ) return; if (!i.value) toast('Alleen een https-link wordt bewaard'); });
  $$('select', page).forEach(i => i.onchange = async () => {
    const v = i.name === 'breakReminder' ? +i.value : i.value;
    await stuur({ [i.name]: v });
    if (i.name === 'theme') applyTheme(i.value);
    if (i.name === 'breakReminder') startBreakReminder(+i.value);
    if (i.name === 'textSize') applyA11y(S.settings);
  });
  $('[name=commentFilter]', page).onblur = e => stuur({ commentFilter: e.target.value.split(/[,\n]/).map(x => x.trim()).filter(Boolean) });
  $('.export', page).onclick = async () => {
    const r2 = await fetch('/api/export', { headers: { 'x-token': S.token } }); const blob = await r2.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `flikflak-${S.me.username}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('.regels', page).onclick = huisregels;
  $('.weg', page).onclick = async () => {
    if (!await confirmSheet('Je account en alles wat je plaatste definitief verwijderen? Dit kan niet ongedaan worden.', 'Ja, verwijderen')) return;
    await api('DELETE', '/api/account'); S.token = null; S.me = null; localStorage.removeItem('ff_token'); reconnectWs(); setUnread(0);
    toast('Je account is verwijderd'); location.hash = '#/';
  };
}
