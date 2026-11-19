// FlikFlak — ronde C (19 nov 2026): instellingen, privé account met volgverzoeken, thema (donker/licht),
// pauze-herinnering, prestaties, concepten. Gebruikt de helpers uit app.js (global scope).

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

// ================= instellingen =================
async function settingsPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Instellingen</h2><span class="ic"></span></div><div class="spinner"></div></div>`);
  view.append(page);
  const r = await api('GET', '/api/settings'); const s = r.settings;
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
    <div class="sec-title">Je gegevens</div>
    <button class="opt export" style="width:100%;text-align:left">${ic('download')}<label>Download mijn gegevens<small>Alles wat FlikFlak van jou bewaart, als bestand</small></label></button>
    <button class="opt regels" style="width:100%;text-align:left">${ic('flag')}<label>Huisregels &amp; privacy</label></button>
    <button class="opt weg" style="width:100%;text-align:left;color:#ff4d6d">${ic('trash')}<label>Account verwijderen<small>Al je video's, reacties en berichten gaan weg</small></label></button>
    <div class="err" style="padding:8px 16px;color:var(--accent);font-size:13px"></div></div>`));
  const stuur = async (patch) => {
    try { const r2 = await api('PATCH', '/api/settings', patch); S.settings = r2.settings; toast('Opgeslagen'); }
    catch (e) { $('.err', page).textContent = e.message; }
  };
  $$('input[type=checkbox]', page).forEach(i => i.onchange = async () => { await stuur({ [i.name]: i.checked }); if (i.name === 'reducedMotion') applyA11y(S.settings); });
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
