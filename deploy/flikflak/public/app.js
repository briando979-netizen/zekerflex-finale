// FlikFlak — voorkant
'use strict';

// ================= hulpjes =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + 'K' : String(n);
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'nu';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'u';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  if (s < 2592000) return Math.floor(s / 604800) + 'w';
  const d = new Date(ts); return d.getDate() + '-' + (d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '-' + d.getFullYear() : '');
}
const rich = t => esc(t)
  .replace(/#([\p{L}0-9_]+)/gu, (m, x) => `<a href="#/tag/${encodeURIComponent(x.toLowerCase())}">#${x}</a>`)
  .replace(/(^|[^\w])@([a-zA-Z0-9_.]+)/g, (m, p, x) => `${p}<a href="#/@${x}">@${x}</a>`);

const COLORS = ['#8b5cf6', '#ff7a1a', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#eab308', '#14b8a6'];
function avatar(u) {
  if (u?.avatar) return u.avatar;
  const name = u?.username || '?';
  const c = COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length];
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${c}"/><text x="20" y="27" font-size="19" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${esc(name[0].toUpperCase())}</text></svg>`);
}
const check = u => u?.verified ? '<span class="verified">✓</span>' : '';

const P = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  friends: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  inbox: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  heartO: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  comment: 'M12 2C6.48 2 2 6.03 2 11c0 2.45 1.1 4.67 2.88 6.28L4 22l4.96-2.26C9.9 19.91 10.93 20 12 20c5.52 0 10-4.03 10-9S17.52 2 12 2zM7 12.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
  bookmark: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
  share: 'M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z',
  music: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  play: 'M8 5v14l11-7z',
  back: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
  volOff: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  volOn: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  flip: 'M9 12c0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3-3 1.34-3 3zM8 10V8H5.09C6.47 5.61 9.05 4 12 4c3.72 0 6.85 2.56 7.74 6h2.06c-.93-4.56-4.96-8-9.8-8-3.27 0-6.18 1.58-8 4.01V4H2v6h6zm8 4v2h2.91c-1.38 2.39-3.96 4-6.91 4-3.72 0-6.85-2.56-7.74-6H2.2c.93 4.56 4.96 8 9.8 8 3.27 0 6.18-1.58 8-4.01V20h2v-6h-6z',
  timer: 'M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0012 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  magic: 'M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 000-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  grid: 'M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z',
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  nope: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.9 7.9 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.9 7.9 0 0120 12c0 4.42-3.58 8-8 8z',
  duet: 'M3 4h8v16H3zM13 4h8v16h-8z',
  pin: 'M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z',
  clear: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
  addUser: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  eyeOff: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27z',
  speed: 'M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44zm-9.79 6.84a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z',
};
const ic = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}"><path d="${P[name]}"/></svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = ic(el.dataset.icon));

const FILTERS = {
  none: ['Normaal', ''], levendig: ['Levendig', 'saturate(1.6) contrast(1.1)'], warm: ['Warm', 'sepia(.35) saturate(1.4) hue-rotate(-10deg)'],
  koel: ['Koel', 'saturate(1.1) hue-rotate(15deg) brightness(1.05)'], zw: ['Z/W', 'grayscale(1) contrast(1.15)'],
  vintage: ['Vintage', 'sepia(.6) contrast(.9) brightness(1.05)'], drama: ['Drama', 'contrast(1.5) saturate(.8) brightness(.9)'],
  droom: ['Droom', 'brightness(1.15) saturate(1.3) blur(.6px)'], neon: ['Neon', 'hue-rotate(90deg) saturate(2)'],
};
const filterCss = f => FILTERS[f]?.[1] || '';

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ================= staat & api =================
const S = {
  token: localStorage.getItem('ff_token'), me: null, unread: 0,
  muted: localStorage.getItem('ff_muted') === '1', needGesture: false, gestureJust: false, speed: 1, autoscroll: localStorage.getItem('ff_auto') === '1',
  ctx: null, // lijst video's om vanuit een raster door te scrollen
  ws: null, chatWith: null,
};
// ---- geluid: standaard AAN. Blokkeert de browser dat, dan gaat het aan bij je eerste tik/toets ----
const muteLabel = () => (S.muted || S.needGesture) ? `${ic('volOff')}<span>${S.needGesture && !S.muted ? 'Tik voor geluid' : 'Geluid aan'}</span>` : ic('volOn');
function applySound() {
  $$('video.snd, audio.snd').forEach(v => { v.muted = S.muted || S.needGesture; });
  $$('.mute-btn').forEach(b => b.innerHTML = muteLabel());
}
function setMuted(m) { S.muted = m; localStorage.setItem('ff_muted', m ? '1' : '0'); applySound(); }
function playWithSound(v) {
  v.muted = S.muted || S.needGesture;
  return v.play().catch(() => {
    if (v.muted) return;
    // automatisch afspelen met geluid geblokkeerd: eerst zonder geluid, geluid aan bij eerste tik
    S.needGesture = true; v.muted = true; v.play().catch(() => {}); applySound();
  });
}
const onGesture = () => {
  if (!S.needGesture) return;
  S.needGesture = false; S.gestureJust = true; setTimeout(() => S.gestureJust = false, 450);
  applySound();
};
document.addEventListener('pointerdown', onGesture, true);
document.addEventListener('keydown', onGesture, true);

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (S.token) opts.headers['x-token'] = S.token;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { askLogin(); throw new Error(data.error || 'Log eerst in'); }
  if (!r.ok) throw new Error(data.error || 'Er ging iets mis');
  return data;
}
const need = () => { if (!S.me) { askLogin(); return false; } return true; };

async function loadMe() {
  if (!S.token) { S.me = null; connectWs(); return; }
  const r = await api('GET', '/api/me').catch(() => ({}));
  S.me = r.user || null;
  if (!S.me) { S.token = null; localStorage.removeItem('ff_token'); }
  setUnread(r.unread || 0);
  connectWs();
}
function setUnread(n) {
  S.unread = Math.max(0, n);
  const b = $('#tabbar .badge'); b.hidden = !S.unread; b.textContent = S.unread > 99 ? '99+' : S.unread;
}
function connectWs() {
  if (S.ws) return;
  S.conn = null;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + (S.token || ''));
  S.ws = ws;
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'hello') S.conn = m.conn;
    if (m.type.startsWith('live:')) document.dispatchEvent(new CustomEvent('ff:live', { detail: m }));
    if (m.type === 'notification') {
      if (route.path !== '/inbox') setUnread(S.unread + 1);
      const n = m.notification;
      if (n.type !== 'post') toast(n.type === 'live' ? `🔴 @${n.from?.username} is nu LIVE!` : `@${n.from?.username} ${notifText(n)}`);
      document.dispatchEvent(new CustomEvent('ff:notif', { detail: n }));
    }
    if (m.type === 'message') {
      const other = m.message.from === S.me?.id ? m.message.to : m.message.from;
      if (S.chatWith && S.chatWith.id === other) document.dispatchEvent(new CustomEvent('ff:msg', { detail: m.message }));
      else if (m.message.from !== S.me?.id) { setUnread(S.unread + 1); toast(`💬 @${m.from.username}: ${m.message.text || 'stuurde een video'}`); }
    }
    if (m.type === 'typing' && S.chatWith?.username === m.from) document.dispatchEvent(new CustomEvent('ff:typing'));
  };
  ws.onclose = () => { if (S.ws === ws) { S.ws = null; setTimeout(connectWs, 2000); } };
}
function reconnectWs() { const old = S.ws; S.ws = null; old?.close(); connectWs(); }
function wsReady() {
  connectWs();
  return new Promise(res => {
    const check = () => S.ws?.readyState === 1 && S.conn ? res() : setTimeout(check, 80);
    check();
  });
}
const wsSend = m => S.ws?.readyState === 1 && S.ws.send(JSON.stringify(m));

// ================= sheets =================
function sheet(inner, { tall = false, onClose } = {}) {
  const wrap = h(`<div class="sheet-wrap"><div class="sheet ${tall ? 'tall' : ''}">${inner}</div></div>`);
  const close = () => { wrap.remove(); onClose?.(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  $('#sheets').append(wrap);
  wrap.close = close;
  return wrap;
}
function confirmSheet(text, okText = 'Verwijderen') {
  return new Promise(res => {
    const s = sheet(`<div class="auth"><h3 style="font-size:17px">${esc(text)}</h3><button class="btn block" data-ok>${esc(okText)}</button><button class="btn grey block" data-close>Annuleren</button></div>`, { onClose: () => res(false) });
    $('[data-ok]', s).onclick = () => { res(true); s.remove(); };
  });
}

function huisregels() {
  sheet(`<div class="auth" style="text-align:left">
    <h3 style="text-align:center">Huisregels &amp; privacy</h3>
    <p>FlikFlak is een korte-video app en onderdeel van <b>ZekerFlex</b>. Houd het leuk en netjes: geen haat, geweld, naaktheid, pesten, spam of inhoud van iemand anders zonder toestemming.</p>
    <p><b>Wat we bewaren.</b> Je gebruikersnaam en naam, wat je plaatst (video’s, bijschriften, reacties en berichten) en je <b>IP-adres met tijdstip</b> bij het aanmelden, plaatsen en melden.</p>
    <p><b>Waarom.</b> Om de app te laten werken, om misbruik en nep-accounts tegen te gaan, en om meldingen te kunnen behandelen.</p>
    <p><b>Moderatie.</b> ZekerFlex kan video’s of accounts die de regels overtreden verwijderen. Met de knop “Melden” bij een video geef je iets door.</p>
    <p><b>Jouw keuze.</b> Je kunt je eigen video’s verwijderen en je account laten verwijderen; vraag dit via ZekerFlex. Dan verdwijnen ook je gegevens, behalve wat we voor de wet even moeten bewaren.</p>
    <p class="muted">Vragen? Neem contact op via zekerflex.com.</p>
    <button class="btn block" data-close>Begrepen</button>
  </div>`);
}

function askLogin(mode = 'login') {
  if ($('.auth-sheet')) return;
  const s = sheet(`<div class="auth auth-sheet">
    <div class="logo-big"><img src="/logo.svg" alt=""></div>
    <h3>${mode === 'login' ? 'Inloggen bij FlikFlak' : 'Account maken'}</h3>
    <p>${mode === 'login' ? 'Beheer je account, bekijk meldingen, reageer op video\'s en meer.' : 'Maak een profiel, volg anderen en plaats je eigen video\'s.'}</p>
    ${mode === 'register' ? '<input name="name" placeholder="Naam" maxlength="30">' : ''}
    <input name="username" placeholder="Gebruikersnaam" autocomplete="username" autocapitalize="off">
    <input name="password" type="password" placeholder="Wachtwoord" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
    <div class="err"></div>
    <button class="btn block" data-go>${mode === 'login' ? 'Inloggen' : 'Registreren'}</button>
    ${mode === 'register' ? '<p class="fineprint">Door een account te maken ga je akkoord met de <button data-regels class="linkbtn">huisregels &amp; privacy</button>. FlikFlak bewaart je gebruikersnaam, wat je plaatst en je IP-adres om de app te laten werken en misbruik tegen te gaan.</p>' : ''}
    <div class="switch">${mode === 'login' ? 'Heb je nog geen account? <button data-sw>Registreren</button>' : 'Heb je al een account? <button data-sw>Inloggen</button>'}</div>
  </div>`);
  $('[data-regels]', s)?.addEventListener('click', huisregels);
  const go = async () => {
    const body = Object.fromEntries($$('input', s).map(i => [i.name, i.value]));
    try {
      const r = await api('POST', mode === 'login' ? '/api/login' : '/api/register', body);
      S.token = r.token; localStorage.setItem('ff_token', r.token); S.me = r.user;
      s.close(); reconnectWs(); await loadMe();
      toast(mode === 'login' ? `Welkom terug, ${r.user.name}!` : 'Account gemaakt! 🎉');
      render();
    } catch (e) { $('.err', s).textContent = e.message; }
  };
  $('[data-go]', s).onclick = go;
  $$('input', s).forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  $('[data-sw]', s).onclick = () => { s.remove(); askLogin(mode === 'login' ? 'register' : 'login'); };
  setTimeout(() => $('input', s).focus(), 50);
}

// ================= router =================
let route = { path: '/', params: new URLSearchParams() };
let cleanups = [];
const onCleanup = fn => cleanups.push(fn);

async function render() {
  cleanups.forEach(f => { try { f(); } catch {} }); cleanups = [];
  $$('#sheets .sheet-wrap').forEach(s => s.remove());
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  route = { path: decodeURI(path) || '/', params: new URLSearchParams(qs) };
  const p = route.path;
  const tab = p === '/' || p === '/following' ? 'home' : p === '/friends' ? 'friends' : p === '/upload' ? 'upload' : p.startsWith('/inbox') ? 'inbox' : (S.me && p === '/@' + S.me.username) || p === '/me' ? 'me' : '';
  $$('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  document.body.classList.toggle('fullscreen', p === '/upload' || p === '/golive' || p.startsWith('/live/') || p.startsWith('/chat/'));
  view.innerHTML = '';
  S.chatWith = null;
  let m;
  try {
    if (p === '/' || p === '/following') return await feedPage(p === '/' ? 'foryou' : 'following');
    if (p === '/friends') return await feedPage('friends');
    if (p === '/discover') return await discoverPage();
    if (p === '/live') return await liveListPage();
    if (p === '/golive') return await goLivePage();
    if ((m = p.match(/^\/live\/(.+)$/))) return await watchLivePage(m[1]);
    if ((m = p.match(/^\/search\/(.*)$/))) return await searchPage(m[1]);
    if (p === '/upload') return await uploadPage();
    if (p === '/inbox') return await inboxPage();
    if ((m = p.match(/^\/chat\/(.+)$/))) return await chatPage(m[1]);
    if (p === '/me') { if (!need()) return (location.hash = '#/'); return (location.hash = '#/@' + S.me.username); }
    if (p === '/edit') return await editProfilePage();
    if ((m = p.match(/^\/@([^/]+)\/(followers|following)$/))) return await followListPage(m[1], m[2]);
    if ((m = p.match(/^\/@([^/]+)$/))) return await profilePage(m[1]);
    if ((m = p.match(/^\/tag\/(.+)$/))) return await tagPage(m[1]);
    if ((m = p.match(/^\/sound\/(.+)$/))) return await soundPage(m[1]);
    if ((m = p.match(/^\/v\/(.+)$/))) return await singlePage(m[1]);
    if (p === '/challenges') return await challengesPage();
    if ((m = p.match(/^\/challenge\/(.+)$/))) return await challengePage(m[1]);
    if ((m = p.match(/^\/map\/(.+)$/))) return await collectionPage(m[1]);
    if (p === '/stats') return await statsPage();
    if (p === '/geschiedenis') return await historyPage();
    location.hash = '#/';
  } catch (e) {
    view.innerHTML = `<div class="empty"><h3>Oeps</h3><div>${esc(e.message)}</div><a class="btn" href="#/">Naar home</a></div>`;
  }
}
window.addEventListener('hashchange', render);
$('#tabbar a[data-tab="me"]').addEventListener('click', e => { if (!S.me) { e.preventDefault(); askLogin(); } });
$('#tabbar a[data-tab="upload"]').addEventListener('click', e => { if (!S.me) { e.preventDefault(); askLogin(); } });
$('#tabbar a[data-tab="inbox"]').addEventListener('click', e => { if (!S.me) { e.preventDefault(); askLogin(); } });

const backBtn = () => `<button class="ic" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${ic('back')}</button>`;

// ================= FEED =================
async function feedPage(tab) {
  const page = h(`<div class="page" style="padding:0;overflow:hidden">
    <div class="topbar">
      ${tab === 'friends' ? '<span class="tab active">Vrienden</span>' : `
      <a class="tab ${tab === 'following' ? 'active' : ''}" href="#/following">Volgend</a>
      <a class="tab ${tab === 'foryou' ? 'active' : ''}" href="#/">Voor jou</a>`}
      ${tab === 'friends' ? '' : '<a class="ic left live-ic" href="#/live">LIVE</a>'}
      <a class="ic right" href="#/discover">${ic('search')}</a>
    </div>
    <div class="feed-holder" style="position:absolute;inset:0"><div class="spinner"></div></div>
  </div>`);
  view.append(page);
  const r = await api('GET', '/api/feed?tab=' + tab);
  const holder = $('.feed-holder', page);
  if (!r.videos.length) {
    if (r.needLogin) holder.innerHTML = `<div class="empty">${ic(tab === 'friends' ? 'friends' : 'user')}<h3>${tab === 'friends' ? 'Vind je vrienden' : 'Video\'s van mensen die je volgt'}</h3><div>Log in om ${tab === 'friends' ? 'video\'s van je vrienden' : 'video\'s van accounts die je volgt'} te zien.</div><button class="btn" onclick="askLogin()">Inloggen</button></div>`;
    else {
      holder.innerHTML = `<div class="empty" style="justify-content:flex-start;padding-top:80px;overflow-y:auto">${ic(tab === 'foryou' ? 'play' : 'friends')}<h3>${tab === 'foryou' ? 'Nog geen video\'s' : tab === 'friends' ? 'Nog geen video\'s van vrienden' : 'Nog niemand gevolgd'}</h3><div>${tab === 'foryou' ? 'Wees de eerste die iets plaatst!' : tab === 'friends' ? 'Vrienden zijn mensen die jij volgt en die jou terug volgen.' : 'Volg accounts om hun nieuwste video\'s hier te zien.'}</div>${tab === 'foryou' ? '<a class="btn" href="#/upload">Video maken</a>' : ''}<div class="sugg" style="width:100%;text-align:left"></div></div>`;
      if (tab !== 'foryou') {
        const t = await api('GET', '/api/trending');
        $('.sugg', holder).innerHTML = t.users.length ? `<div class="sec-title">Voorgestelde accounts</div>` : '';
        t.users.forEach(u => $('.sugg', holder).append(userRow(u)));
      }
    }
    return;
  }
  holder.innerHTML = '';
  mountFeed(holder, r.videos, 0);
}

async function singlePage(vid) {
  let list, start = 0;
  if (S.ctx && S.ctx.list.some(v => v.id === vid)) { list = S.ctx.list; start = list.findIndex(v => v.id === vid); }
  else list = [(await api('GET', '/api/videos/' + vid)).video];
  const page = h(`<div class="page" style="padding:0;overflow:hidden">
    <div class="topbar" style="justify-content:flex-start">${backBtn().replace('class="ic"', 'class="ic left"')}${S.ctx?.title && list === S.ctx.list ? `<span style="margin-left:56px;font-weight:600">${esc(S.ctx.title)}</span>` : ''}</div>
    <div class="feed-holder" style="position:absolute;inset:0"></div></div>`);
  view.append(page);
  mountFeed($('.feed-holder', page), list, start);
}

function openList(list, id, title) { S.ctx = { list, title }; location.hash = '#/v/' + id; }

function mountFeed(holder, videos, start) {
  const feed = h('<div class="feed"></div>');
  holder.append(feed);
  const mute = h(`<button class="mute-btn">${muteLabel()}</button>`);
  holder.append(mute);
  const setMute = m => setMuted(m);
  mute.onclick = () => { if (S.gestureJust) return; setMute(!S.muted); };

  videos.forEach(v => feed.append(makeSlide(v)));
  let current = null;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio > 0.6) activate(e.target);
      else if (e.target === current && e.intersectionRatio < 0.4) deactivate(e.target);
    }
  }, { root: feed, threshold: [0, 0.4, 0.6, 1] });
  $$('.slide', feed).forEach(s => io.observe(s));

  function load(slide) {
    if (!slide) return;
    $$('video, audio.snd', slide).forEach(v => { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.preload = 'auto'; } });
  }
  function activate(slide) {
    if (current === slide) return;
    if (current) deactivate(current);
    current = slide;
    load(slide); load(slide.nextElementSibling); load(slide.nextElementSibling?.nextElementSibling);
    const [main, other] = $$('video', slide);
    if (main) {
      main.currentTime = 0; if (other) other.currentTime = 0;
      main.playbackRate = S.speed; if (other) other.playbackRate = S.speed;
      main.loop = !S.autoscroll;
    }
    $('.speed-tag', slide).hidden = S.speed === 1 || !main; $('.speed-tag', slide).textContent = S.speed + 'x';
    play(slide);
    slide._fotoStart?.();
    slide._viewTimer = setTimeout(() => api('POST', `/api/videos/${slide.dataset.id}/view`).catch(() => {}), 1500);
  }
  function deactivate(slide) {
    $$('video, audio.snd', slide).forEach(v => v.pause());
    slide._fotoStop?.();
    clearTimeout(slide._viewTimer);
    slide.classList.remove('clear');
    if (current === slide) current = null;
  }
  function play(slide) {
    slide.classList.remove('paused');
    $('.big-play', slide).hidden = true;
    $$('video, audio.snd', slide).forEach(v => {
      playWithSound(v);
    });
    slide._fotoStart?.();
  }
  function pause(slide) {
    slide.classList.add('paused');
    $('.big-play', slide).hidden = false;
    $$('video, audio.snd', slide).forEach(v => v.pause());
    slide._fotoStop?.();
  }

  function makeSlide(v) {
    const a = v.author;
    const duet = v.duetOf;
    const slide = h(`<section class="slide ${v.fotos?.length ? 'is-foto' : ''}" data-id="${v.id}">
      ${v.fotos?.length ? fotoStage(v) : `<div class="stage ${duet ? 'duet' : ''}">
        <video class="snd" data-src="${v.url}" playsinline muted preload="none" poster="${v.thumb || ''}" style="filter:${filterCss(v.filter)}"></video>
        ${duet ? `<video class="snd" data-src="${duet.url}" playsinline muted preload="none" style="filter:${filterCss(duet.filter)}"></video>` : ''}
      </div>`}
      <div class="shade"></div>
      <div class="tap"></div>
      <div class="big-play" hidden>${ic('play')}</div>
      <div class="speed-tag" hidden></div>
      <div class="rail">
        <div class="av-wrap">
          <a href="${a.liveId ? '#/live/' + a.liveId : '#/@' + esc(a.username)}" class="${a.liveId ? 'is-live' : ''}"><img src="${avatar(a)}" alt="">${a.liveId ? '<span class="live-tag">LIVE</span>' : ''}</a>
          ${a.isMe ? '' : `<button class="follow-plus ${a.isFollowing ? 'done' : ''}" ${a.isFollowing ? 'hidden' : ''}>+</button>`}
        </div>
        <button class="act like ${v.liked ? 'on' : ''}">${ic('heart')}<span>${fmt(v.likes)}</span></button>
        <button class="act cm">${ic('comment')}<span>${v.allowComments ? fmt(v.comments) : '—'}</span></button>
        <button class="act fav ${v.faved ? 'on' : ''}">${ic('bookmark')}<span>${fmt(v.favs)}</span></button>
        <button class="act sh">${ic('share')}<span>${fmt(v.shares)}</span></button>
        <a class="disc" href="#/sound/${v.sound.id}"><img src="${avatar(a)}" alt=""></a>
      </div>
      <div class="info">
        ${duet ? `<div class="duet-tag">Duet met <a href="#/@${esc(duet.author.username)}">@${esc(duet.author.username)}</a></div>` : ''}
        <div><a class="uname" href="#/@${esc(a.username)}">${esc(a.name || a.username)} ${check(a)}</a> <span class="date">· ${ago(v.created)}</span>${v.privacy !== 'public' ? ` <span class="date">· ${v.privacy === 'friends' ? '👥 Vrienden' : '🔒 Privé'}</span>` : ''}</div>
        ${v.caption ? `<div class="cap">${rich(v.caption)}</div>` : '<div style="height:8px"></div>'}
        ${v.produkt ? produktKaart(v.produkt) : ''}
        <a class="music" href="#/sound/${v.sound.id}">${ic('music')}<div class="ticker"><span>${esc(v.sound.name)} &nbsp;·&nbsp; ${esc(v.sound.name)} &nbsp;·&nbsp;</span></div></a>
      </div>
      <input type="range" class="seek" min="0" max="1000" value="0" ${v.fotos?.length ? 'hidden' : ''}>
    </section>`);
    slide._v = v;
    const [main, other] = $$('video', slide);
    if (!main) fotoSetup(slide);
    if (other) {
      // duet: origineel rechts, loopt gelijk met de opname
      main.addEventListener('timeupdate', () => { if (Math.abs(other.currentTime - main.currentTime) > 0.35 && main.currentTime < (other.duration || 1e9)) other.currentTime = main.currentTime; });
      main.addEventListener('seeked', () => { other.currentTime = main.currentTime; });
    }
    const seek = $('.seek', slide);
    if (main) {
      main.addEventListener('timeupdate', () => { if (main.duration && isFinite(main.duration) && !seek._drag) seek.value = main.currentTime / main.duration * 1000; });
      seek.addEventListener('input', () => { seek._drag = true; if (main.duration && isFinite(main.duration)) main.currentTime = seek.value / 1000 * main.duration; });
      seek.addEventListener('change', () => { seek._drag = false; });
      main.addEventListener('ended', () => { if (S.autoscroll && slide === current) next(); });
    }

    // tikken: 1x pauze, 2x like, lang drukken = opties
    const tap = $('.tap', slide);
    let lastTap = 0, tapTimer, press, pressed = false;
    tap.addEventListener('pointerdown', () => { pressed = false; press = setTimeout(() => { pressed = true; openShare(slide); }, 550); });
    const cancelPress = () => clearTimeout(press);
    tap.addEventListener('pointerup', cancelPress); tap.addEventListener('pointerleave', cancelPress); tap.addEventListener('pointermove', e => { if (Math.abs(e.movementY) > 3) cancelPress(); });
    tap.addEventListener('click', e => {
      if (pressed) return;
      if (slide.classList.contains('clear')) { slide.classList.remove('clear'); return; }
      const t = Date.now();
      if (t - lastTap < 300) {
        clearTimeout(tapTimer); lastTap = t;
        heartBurst(slide, e.offsetX, e.offsetY);
        if (need() && !slide._v.liked) doLike(slide, true);
      } else {
        lastTap = t;
        tapTimer = setTimeout(() => {
          if (S.gestureJust) return; // deze tik zette alleen het geluid aan
          slide.classList.contains('paused') ? play(slide) : pause(slide);
        }, 300);
      }
    });
    $('.like', slide).onclick = () => need() && doLike(slide);
    $('.fav', slide).onclick = async () => {
      if (!need()) return;
      const r = await api('POST', `/api/videos/${v.id}/fav`);
      v.faved = r.faved; v.favs = r.favs;
      $('.fav', slide).classList.toggle('on', r.faved); $('.fav span', slide).textContent = fmt(r.favs);
      toast(r.faved ? 'Toegevoegd aan Favorieten' : 'Verwijderd uit Favorieten');
    };
    $('.cm', slide).onclick = () => openComments(slide);
    $('.sh', slide).onclick = () => openShare(slide);
    $('.cap', slide)?.addEventListener('click', e => { if (e.target.tagName !== 'A') e.currentTarget.classList.toggle('open'); });
    const fp = $('.follow-plus', slide);
    if (fp) fp.onclick = async () => {
      if (!need()) return;
      const r = await api('POST', `/api/users/${a.id}/follow`);
      $$('.slide', feed).filter(s => s._v.author.id === a.id).forEach(s => {
        s._v.author.isFollowing = r.user.isFollowing;
        const b = $('.follow-plus', s); b.classList.add('done'); b.textContent = '✓';
        setTimeout(() => { b.hidden = r.user.isFollowing; b.textContent = '+'; b.classList.toggle('done', r.user.isFollowing); }, 700);
      });
      toast(r.user.isFollowing ? `Je volgt nu @${a.username}` : `Ontvolgd`);
    };
    return slide;
  }

  async function doLike(slide, force = false) {
    const v = slide._v;
    // meteen tonen, daarna bevestigen
    const want = force ? true : !v.liked;
    v.liked = want; v.likes += want ? 1 : -1;
    $('.like', slide).classList.toggle('on', want); $('.like span', slide).textContent = fmt(v.likes);
    try {
      const r = await api('POST', `/api/videos/${v.id}/like`, { force });
      v.liked = r.liked; v.likes = r.likes;
      $('.like', slide).classList.toggle('on', r.liked); $('.like span', slide).textContent = fmt(r.likes);
    } catch {}
  }
  function heartBurst(slide, x, y) {
    const hp = h(`<div class="heart-pop" style="left:${x}px;top:${y}px;--r:${Math.round(Math.random() * 40 - 20)}deg">${ic('heart')}</div>`);
    slide.append(hp); setTimeout(() => hp.remove(), 900);
  }
  const next = () => feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' });
  const prev = () => feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' });

  // ---- reacties ----
  async function openComments(slide) {
    const v = slide._v;
    const s = sheet(`<div class="sh-head"><span class="cnt">${fmt(v.comments)} reacties</span><button class="x" data-close>${ic('close')}</button></div>
      <div class="sh-body"><div class="spinner"></div></div>
      <div class="sh-foot">${v.allowComments ? `
        <div class="reply-to" hidden><span></span><button>${ic('close')}</button></div>
        <div class="emoji-bar">${['😂', '😍', '🔥', '👏', '😭', '🥰', '😮', '💯'].map(e => `<button>${e}</button>`).join('')}</div>
        <div class="cinput"><img class="av" style="width:32px;height:32px;border:0" src="${avatar(S.me)}"><input placeholder="Reactie toevoegen..." maxlength="150"><button class="send">${ic('send')}</button></div>`
        : '<div style="text-align:center;color:var(--muted);padding:10px">Reacties zijn uitgeschakeld</div>'}
      </div>`, { tall: true });
    const body = $('.sh-body', s);
    let parentId = null;
    const input = $('.cinput input', s);
    async function load() {
      const r = await api('GET', `/api/videos/${v.id}/comments`);
      v.comments = r.comments.length;
      $('.cnt', s).textContent = fmt(v.comments) + ' reacties';
      $('.cm span', slide).textContent = fmt(v.comments);
      body.innerHTML = r.comments.length ? '' : '<div class="grid-empty">Nog geen reacties.<br>Begin het gesprek!</div>';
      const top = r.comments.filter(c => !c.parentId);
      for (const c of top) {
        body.append(commentEl(c));
        const reps = r.comments.filter(x => x.parentId === c.id).sort((a, b) => a.created - b.created);
        if (reps.length) {
          const more = h(`<button class="more-replies">— Bekijk ${reps.length} ${reps.length === 1 ? 'antwoord' : 'antwoorden'} ⌄</button>`);
          const box = h('<div hidden></div>');
          reps.forEach(x => box.append(commentEl(x, true)));
          more.onclick = () => { box.hidden = !box.hidden; more.textContent = box.hidden ? `— Bekijk ${reps.length} ${reps.length === 1 ? 'antwoord' : 'antwoorden'} ⌄` : '— Verbergen ⌃'; };
          if (reps.some(x => x._new)) box.hidden = false;
          body.append(more, box);
        }
      }
    }
    function commentEl(c, isReply = false) {
      const el = h(`<div class="comment ${isReply ? 'reply' : ''}">
        <a href="#/@${esc(c.user.username)}"><img class="av" src="${avatar(c.user)}"></a>
        <div class="body">
          <div class="who">${esc(c.user.name || c.user.username)} ${check(c.user)} ${c.byCreator ? '<em>· Maker</em>' : ''}</div>
          <div class="txt rich">${rich(c.text)}</div>
          <div class="meta"><span>${ago(c.created)}</span>${v.allowComments ? '<button class="rp">Beantwoorden</button>' : ''}${c.canDelete ? '<button class="del">Verwijderen</button>' : ''}
          ${c.likedByCreator && !c.byCreator ? `<span class="creator-like">${ic('heart')} door maker</span>` : ''}</div>
        </div>
        <button class="clike ${c.liked ? 'on' : ''}">${ic(c.liked ? 'heart' : 'heartO')}<span>${c.likes || ''}</span></button>
      </div>`);
      $('.clike', el).onclick = async () => {
        if (!need()) return;
        const r = await api('POST', `/api/comments/${c.id}/like`);
        $('.clike', el).classList.toggle('on', r.liked); $('.clike', el).innerHTML = `${ic(r.liked ? 'heart' : 'heartO')}<span>${r.likes || ''}</span>`;
      };
      $('.rp', el) && ($('.rp', el).onclick = () => {
        parentId = c.parentId || c.id;
        const rt = $('.reply-to', s); rt.hidden = false; $('span', rt).textContent = 'Antwoord aan @' + c.user.username;
        input.value = isReply ? `@${c.user.username} ` : ''; input.focus();
      });
      $('.del', el) && ($('.del', el).onclick = async () => { if (await confirmSheet('Reactie verwijderen?')) { await api('DELETE', '/api/comments/' + c.id); load(); } });
      return el;
    }
    if (v.allowComments) {
      $('.reply-to button', s).onclick = () => { parentId = null; $('.reply-to', s).hidden = true; };
      $$('.emoji-bar button', s).forEach(b => b.onclick = () => { input.value += b.textContent; input.focus(); });
      const send = async () => {
        if (!need()) return;
        const text = input.value.trim(); if (!text) return;
        input.value = '';
        try { await api('POST', `/api/videos/${v.id}/comments`, { text, parentId }); } catch (e) { return toast(e.message); }
        parentId = null; $('.reply-to', s).hidden = true;
        await load();
        if (!parentId) body.scrollTop = 0;
      };
      $('.send', s).onclick = send;
      input.onkeydown = e => { if (e.key === 'Enter') send(); };
    }
    load();
  }

  // ---- delen / opties ----
  async function openShare(slide) {
    const v = slide._v;
    const own = v.author.isMe;
    const s = sheet(`<div class="sh-head">Delen met<button class="x" data-close>${ic('close')}</button></div>
      <div class="sh-body">
        <div class="share-row friends-row">${S.me ? '<div style="color:var(--muted);font-size:13px;padding:14px">Laden…</div>' : '<div style="color:var(--muted);font-size:13px;padding:14px">Log in om naar vrienden te sturen</div>'}</div>
        <div class="share-sep"></div>
        <div class="share-row">
          <button class="it" data-a="copy"><span class="circ" style="background:#3b82f6">${ic('link')}</span>Link kopiëren</button>
          ${navigator.share ? `<button class="it" data-a="native"><span class="circ" style="background:#10b981">${ic('share')}</span>Meer…</button>` : ''}
          <button class="it" data-a="download"><span class="circ">${ic('download')}</span>Opslaan</button>
          ${v.allowDuet && !v.duetOf ? `<button class="it" data-a="duet"><span class="circ">${ic('duet')}</span>Duet</button>` : ''}
          <button class="it" data-a="sound"><span class="circ">${ic('music')}</span>Gebruik geluid</button>
          <button class="it" data-a="fav"><span class="circ">${ic('bookmark')}</span>${v.faved ? 'Uit favorieten' : 'Favoriet'}</button>
        </div>
        <div class="share-sep"></div>
        <div class="share-row">
          <button class="it" data-a="auto"><span class="circ" ${S.autoscroll ? 'style="background:#fff;color:#000"' : ''}>${ic('down')}</span>Automatisch scrollen</button>
          <button class="it" data-a="clear"><span class="circ">${ic('clear')}</span>Scherm leegmaken</button>
          ${own ? `
          <button class="it" data-a="privacy"><span class="circ">${ic('lock')}</span>Privacy</button>
          <button class="it" data-a="map"><span class="circ">${ic('bookmark')}</span>In een map</button>
          <button class="it" data-a="pin"><span class="circ">${ic('pin')}</span>${v.pinned ? 'Losmaken' : 'Vastpinnen'}</button>
          <button class="it" data-a="comments"><span class="circ">${ic('comment')}</span>Reacties ${v.allowComments ? 'uit' : 'aan'}</button>
          <button class="it" data-a="caption"><span class="circ">${ic('edit')}</span>Tekst wijzigen</button>
          <button class="it" data-a="delete"><span class="circ" style="color:#ff4d6d">${ic('trash')}</span>Verwijderen</button>` : `
          <button class="it" data-a="map"><span class="circ">${ic('bookmark')}</span>In een map</button>
          <button class="it" data-a="nope"><span class="circ">${ic('nope')}</span>Niet geïnteresseerd</button>
          <button class="it" data-a="report"><span class="circ">${ic('flag')}</span>Melden</button>`}
        </div>
        <div style="padding:4px 16px 2px;font-size:13px;color:var(--muted)">Afspeelsnelheid</div>
        <div class="speed-pick">${[0.5, 1, 1.5, 2].map(x => `<button data-speed="${x}" class="${S.speed === x ? 'active' : ''}">${String(x).replace('.', ',')}x</button>`).join('')}</div>
      </div>`);
    if (S.me) {
      api('GET', `/api/users/${S.me.username}/following`).then(r => {
        const row = $('.friends-row', s);
        row.innerHTML = r.users.length ? '' : '<div style="color:var(--muted);font-size:13px;padding:14px">Volg mensen om video\'s naar ze te sturen</div>';
        r.users.forEach(u => {
          const b = h(`<button class="it"><span class="circ"><img src="${avatar(u)}"></span>${esc(u.name || u.username)}</button>`);
          b.onclick = async () => {
            if (b.classList.contains('sent')) return;
            const r2 = await api('POST', `/api/videos/${v.id}/share`, { to: u.username });
            b.classList.add('sent'); b.lastChild.textContent = 'Verstuurd ✓';
            v.shares = r2.shares; $('.sh span', slide).textContent = fmt(v.shares);
          };
          row.append(b);
        });
      });
    }
    const link = location.origin + '/s/' + v.id; // deel-link met voorbeeld (titel + foto) in WhatsApp en social
    const countShare = async () => { const r = await api('POST', `/api/videos/${v.id}/share`); v.shares = r.shares; $('.sh span', slide).textContent = fmt(v.shares); };
    $$('[data-speed]', s).forEach(b => b.onclick = () => {
      S.speed = +b.dataset.speed;
      $$('video', slide).forEach(x => x.playbackRate = S.speed);
      $('.speed-tag', slide).hidden = S.speed === 1; $('.speed-tag', slide).textContent = S.speed + 'x';
      s.close(); toast('Snelheid: ' + S.speed + 'x');
    });
    $$('[data-a]', s).forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      s.close();
      if (a === 'copy') { try { await navigator.clipboard.writeText(link); } catch { prompt('Kopieer deze link:', link); } countShare(); toast('Link gekopieerd'); }
      if (a === 'native') { try { await navigator.share({ title: 'FlikFlak', text: v.caption, url: link }); countShare(); } catch {} }
      if (a === 'map') { if (need()) saveToCollectionSheet(v); }
      if (a === 'download') {
        if (!v.url) return toast('Alleen bij video\'s');
        toast('Downloaden…');
        const blob = await (await fetch(v.url)).blob();
        const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob);
        aEl.download = `flikflak_${v.author.username}_${v.id}${v.url.match(/\.\w+$/)?.[0] || '.mp4'}`; aEl.click();
        setTimeout(() => URL.revokeObjectURL(aEl.href), 5000); countShare();
      }
      if (a === 'duet') { if (need()) location.hash = '#/upload?duet=' + v.id; }
      if (a === 'sound') { if (need()) location.hash = '#/upload?sound=' + v.sound.id; }
      if (a === 'fav') $('.fav', slide).click();
      if (a === 'auto') {
        S.autoscroll = !S.autoscroll; localStorage.setItem('ff_auto', S.autoscroll ? '1' : '0');
        $$('.slide video:first-child', feed).forEach(x => x.loop = !S.autoscroll);
        toast(S.autoscroll ? 'Automatisch scrollen aan' : 'Automatisch scrollen uit');
      }
      if (a === 'clear') { slide.classList.add('clear'); toast('Tik om de knoppen terug te zien'); }
      if (a === 'nope') {
        if (S.me) api('POST', `/api/videos/${v.id}/nope`).catch(() => {});
        toast('We laten je minder van dit soort video\'s zien');
        next(); setTimeout(() => { io.unobserve(slide); slide.remove(); }, 500);
      }
      if (a === 'report') {
        const rs = sheet(`<div class="sh-head">Melden<button class="x" data-close>${ic('close')}</button></div><div class="sh-body">${['Geweld of gevaarlijk', 'Intimidatie of pesten', 'Haatdragend', 'Naakt of seksueel', 'Spam of oplichting', 'Valse informatie', 'Auteursrecht', 'Iets anders'].map(r => `<button class="row" style="width:100%;text-align:left" data-r="${r}"><span class="grow">${r}</span>›</button>`).join('')}</div>`);
        $$('[data-r]', rs).forEach(x => x.onclick = async () => { if (!need()) return; await api('POST', `/api/videos/${v.id}/report`, { reason: x.dataset.r }); rs.close(); toast('Bedankt voor je melding'); });
      }
      if (a === 'privacy') {
        const ps = sheet(`<div class="sh-head">Wie kan deze video bekijken?<button class="x" data-close>${ic('close')}</button></div><div class="sh-body">${[['public', 'Iedereen'], ['friends', 'Vrienden'], ['private', 'Alleen ik']].map(([k, l]) => `<button class="row" style="width:100%;text-align:left" data-p="${k}"><span class="grow">${l}</span>${v.privacy === k ? '✓' : ''}</button>`).join('')}</div>`);
        $$('[data-p]', ps).forEach(x => x.onclick = async () => { await api('PATCH', '/api/videos/' + v.id, { privacy: x.dataset.p }); v.privacy = x.dataset.p; ps.close(); toast('Privacy bijgewerkt'); });
      }
      if (a === 'pin') { await api('PATCH', '/api/videos/' + v.id, { pinned: !v.pinned }); v.pinned = !v.pinned; toast(v.pinned ? 'Vastgepind op je profiel' : 'Losgemaakt'); }
      if (a === 'comments') {
        await api('PATCH', '/api/videos/' + v.id, { allowComments: !v.allowComments }); v.allowComments = !v.allowComments;
        $('.cm span', slide).textContent = v.allowComments ? fmt(v.comments) : '—'; toast(v.allowComments ? 'Reacties aan' : 'Reacties uit');
      }
      if (a === 'caption') {
        const cs = sheet(`<div class="auth"><h3 style="font-size:17px">Tekst wijzigen</h3><textarea rows="4" maxlength="2200">${esc(v.caption)}</textarea><button class="btn block" data-ok>Opslaan</button></div>`);
        $('[data-ok]', cs).onclick = async () => {
          const r = await api('PATCH', '/api/videos/' + v.id, { caption: $('textarea', cs).value });
          v.caption = r.video.caption; const cap = $('.cap', slide);
          if (cap) cap.innerHTML = rich(v.caption); cs.close(); toast('Opgeslagen');
        };
      }
      if (a === 'delete') {
        if (!(await confirmSheet('Weet je zeker dat je deze video wilt verwijderen?'))) return;
        await api('DELETE', '/api/videos/' + v.id);
        toast('Video verwijderd'); io.unobserve(slide); slide.remove();
        if (!$('.slide', feed)) history.back();
      }
    });
  }

  // toetsenbord (computer)
  const onKey = e => {
    if (e.target.closest('input,textarea') || $('.sheet-wrap')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); next(); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); prev(); }
    if (e.key === ' ' && current) { e.preventDefault(); current.classList.contains('paused') ? play(current) : pause(current); }
    if (e.key === 'm') setMute(!S.muted);
    if (e.key === 'l' && current && need()) doLike(current);
    if (e.key === 'c' && current) openComments(current);
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => { document.removeEventListener('keydown', onKey); io.disconnect(); $$('video', feed).forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); });

  if (start) requestAnimationFrame(() => { feed.scrollTop = start * feed.clientHeight; });
}

// ================= raster / rijen =================
function cell(v, list, title, opts = {}) {
  const c = h(`<div class="cell">
    ${v.thumb ? `<img src="${v.thumb}" loading="lazy" style="filter:${filterCss(v.filter)}">` : `<video src="${v.url}#t=0.5" preload="metadata" muted playsinline style="filter:${filterCss(v.filter)}"></video>`}
    ${opts.pins && v.pinned ? '<span class="pin">Vastgepind</span>' : ''}
    ${v.privacy === 'private' ? '<span class="lock">🔒</span>' : v.privacy === 'friends' ? '<span class="lock">👥</span>' : ''}
    <span class="views">${ic(opts.likes ? 'heartO' : 'play')}${fmt(opts.likes ? v.likes : v.views)}</span>
  </div>`);
  c.onclick = () => openList(list, v.id, title);
  return c;
}
function grid(list, title, empty = 'Nog geen video\'s', opts) {
  if (!list.length) return h(`<div class="grid-empty">${empty}</div>`);
  const g = h('<div class="grid"></div>');
  list.forEach(v => g.append(cell(v, list, title, opts)));
  return g;
}
function followBtn(u, small = true) {
  if (u.isMe) return h('<span></span>');
  const b = h(`<button class="btn ${small ? 'small' : ''} ${u.isFollowing ? 'grey' : ''}"></button>`);
  const label = () => b.textContent = u.isFollowing ? (u.followsYou ? 'Vrienden' : 'Volgend') : (u.followsYou ? 'Terugvolgen' : 'Volgen');
  label();
  b.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    if (!need()) return;
    const r = await api('POST', `/api/users/${u.id}/follow`);
    Object.assign(u, r.user); b.classList.toggle('grey', u.isFollowing); label();
  };
  return b;
}
function userRow(u, sub) {
  const r = h(`<a class="row" href="#/@${esc(u.username)}"><img class="av" src="${avatar(u)}"><div class="grow"><div class="t1">${esc(u.name || u.username)} ${check(u)}</div><div class="t2">${sub ?? `@${esc(u.username)} · ${fmt(u.followers)} volgers`}</div></div></a>`);
  r.append(followBtn(u));
  return r;
}

// ================= PROFIEL =================
async function profilePage(username) {
  const page = h(`<div class="page"><div class="spinner"></div></div>`);
  view.append(page);
  const r = await api('GET', '/api/users/' + encodeURIComponent(username));
  const u = r.user;
  const me = u.isMe;
  page.innerHTML = `
    <div class="head">${me ? '<span class="ic"></span>' : backBtn()}<h2>${esc(u.name || u.username)}</h2><button class="ic menu">${ic(me ? 'menu' : 'more')}</button></div>
    <div class="profile-top">
      ${u.liveId ? `<a href="#/live/${u.liveId}" class="is-live big"><img class="big-av" src="${avatar(u)}"><span class="live-tag">LIVE</span></a>` : `<img class="big-av" src="${avatar(u)}">`}
      <div class="handle">@${esc(u.username)} ${check(u)}</div>
      <div class="stats">
        <a href="#/@${esc(u.username)}/following"><b>${fmt(u.following)}</b>Volgend</a>
        <a href="#/@${esc(u.username)}/followers"><b class="fcount">${fmt(u.followers)}</b>Volgers</a>
        <a><b>${fmt(u.likes)}</b>Likes</a>
      </div>
      <div class="pbtns"></div>
      ${u.bio ? `<div class="bio rich">${rich(u.bio)}</div>` : me ? '<a class="bio" href="#/edit" style="color:var(--muted)">+ Bio toevoegen</a>' : ''}
    </div>
    <div class="segs" style="top:52px">
      <button data-t="videos" class="active">${ic('grid')}</button>
      ${me ? `<button data-t="favorites">${ic('bookmark')}</button><button data-t="maps" style="font-size:13px">Mappen</button>` : ''}
      <button data-t="liked">${ic('heartO')}</button>
    </div>
    <div class="tabc"></div>`;
  const btns = $('.pbtns', page);
  if (me) {
    btns.append(h('<a class="btn grey" href="#/edit">Profiel bewerken</a>'));
    const sh = h('<button class="btn grey">Profiel delen</button>');
    sh.onclick = async () => { const l = location.origin + '/#/@' + u.username; try { await navigator.clipboard.writeText(l); toast('Profiellink gekopieerd'); } catch { prompt('Link:', l); } };
    btns.append(sh);
  } else {
    const drawBtns = () => {
      btns.innerHTML = '';
      if (u.isFollowing) {
        btns.append(h(`<a class="btn grey" href="#/chat/${esc(u.username)}">Bericht</a>`));
        const unf = h(`<button class="btn grey" title="Ontvolgen">${ic('addUser')} ✓</button>`);
        unf.onclick = async () => { const r2 = await api('POST', `/api/users/${u.id}/follow`); Object.assign(u, r2.user); $('.fcount', page).textContent = fmt(u.followers); drawBtns(); };
        btns.append(unf);
      } else {
        const f = h(`<button class="btn">${u.followsYou ? 'Terugvolgen' : 'Volgen'}</button>`);
        f.onclick = async () => { if (!need()) return; const r2 = await api('POST', `/api/users/${u.id}/follow`); Object.assign(u, r2.user); $('.fcount', page).textContent = fmt(u.followers); drawBtns(); };
        btns.append(f, h(`<a class="btn grey" href="#/chat/${esc(u.username)}" onclick="if(!S.me){askLogin();return false}">Bericht</a>`));
      }
    };
    drawBtns();
  }
  $('.menu', page).onclick = () => {
    const s = sheet(`<div class="sh-body" style="padding:8px 0">
      ${me ? `<a class="row" href="#/edit">${ic('edit')}<span class="grow">Profiel bewerken</span></a>
      <a class="row" href="#/stats">${ic('speed')}<span class="grow">Statistieken</span></a>
      <a class="row" href="#/geschiedenis">${ic('play')}<span class="grow">Kijkgeschiedenis</span></a>
      <button class="row" style="width:100%" data-a="install">${ic('download')}<span class="grow" style="text-align:left">FlikFlak installeren als app</span></button>` : ''}
      <button class="row" style="width:100%" data-a="link">${ic('link')}<span class="grow" style="text-align:left">Profiellink kopiëren</span></button>
      ${me ? `<button class="row" style="width:100%" data-a="logout">${ic('back')}<span class="grow" style="text-align:left">Uitloggen</span></button>`
        : `<button class="row" style="width:100%" data-a="block">${ic('nope')}<span class="grow" style="text-align:left">Blokkeren</span></button>`}
      <button class="row" style="width:100%;justify-content:center;color:var(--muted)" data-close>Annuleren</button></div>`);
    $$('[data-a]', s).forEach(b => b.onclick = async () => {
      s.close();
      if (b.dataset.a === 'link') { try { await navigator.clipboard.writeText(location.origin + '/#/@' + u.username); toast('Gekopieerd'); } catch {} }
      if (b.dataset.a === 'install') installApp();
      if (b.dataset.a === 'logout') {
        await api('POST', '/api/logout'); S.token = null; S.me = null; localStorage.removeItem('ff_token');
        reconnectWs(); setUnread(0); toast('Uitgelogd'); location.hash = '#/';
      }
      if (b.dataset.a === 'block') { if (!need()) return; const r2 = await api('POST', `/api/users/${u.id}/block`); toast(r2.blocked ? `@${u.username} geblokkeerd` : 'Deblokkeerd'); }
    });
  };
  const tabc = $('.tabc', page);
  const show = t => {
    $$('.segs button', page).forEach(b => b.classList.toggle('active', b.dataset.t === t));
    tabc.innerHTML = '';
    if (t === 'videos') tabc.append(grid(r.videos, '@' + u.username, me ? 'Deel je eerste video!<br><br><a class="btn" href="#/upload">Uploaden</a>' : 'Nog geen video\'s', { pins: true }));
    if (t === 'favorites') tabc.append(grid(r.favorites || [], 'Favorieten', 'Bewaar video\'s met het bladwijzer-icoon.<br>Alleen jij ziet ze.'));
    if (t === 'liked') tabc.append(grid(r.liked, 'Geliked', 'Nog geen gelikete video\'s', { likes: true }));
    if (t === 'maps') collectionsTab(tabc);
  };
  $$('.segs button', page).forEach(b => b.onclick = () => show(b.dataset.t));
  show('videos');
}

async function followListPage(username, which) {
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>@${esc(username)}</h2><span class="ic"></span></div>
    <div class="segs"><button data-w="following">Volgend</button><button data-w="followers">Volgers</button></div><div class="lst"><div class="spinner"></div></div></div>`);
  view.append(page);
  $$('[data-w]', page).forEach(b => { b.classList.toggle('active', b.dataset.w === which); b.onclick = () => location.replace(`#/@${username}/${b.dataset.w}`); });
  const r = await api('GET', `/api/users/${encodeURIComponent(username)}/${which}`);
  const lst = $('.lst', page); lst.innerHTML = r.users.length ? '' : '<div class="grid-empty">Nog niemand hier</div>';
  r.users.forEach(u => lst.append(userRow(u)));
}

async function editProfilePage() {
  if (!need()) return (location.hash = '#/');
  const u = S.me;
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>Profiel bewerken</h2><span class="ic"></span></div>
    <div class="profile-top"><label style="cursor:pointer;position:relative"><img class="big-av" src="${avatar(u)}"><input type="file" accept="image/*" hidden><div style="font-size:13px;margin-top:6px">Foto wijzigen</div></label></div>
    <div class="auth" style="padding-top:0">
      <label>Naam<input name="name" value="${esc(u.name)}" maxlength="30"></label>
      <label>Gebruikersnaam<input name="username" value="${esc(u.username)}" maxlength="24"></label>
      <label>Bio<textarea name="bio" rows="3" maxlength="80" placeholder="Vertel iets over jezelf">${esc(u.bio)}</textarea></label>
      <div class="err"></div>
      <button class="btn block" data-save>Opslaan</button>
    </div></div>`);
  view.append(page);
  const file = $('input[type=file]', page);
  file.onchange = () => { if (file.files[0]) $('.big-av', page).src = URL.createObjectURL(file.files[0]); };
  $('[data-save]', page).onclick = async () => {
    const fd = new FormData();
    $$('[name]', page).forEach(i => fd.append(i.name, i.value));
    if (file.files[0]) fd.append('avatar', await shrinkImage(file.files[0]), 'avatar.jpg');
    try { const r = await api('POST', '/api/profile', fd); S.me = r.user; toast('Profiel opgeslagen'); location.hash = '#/@' + r.user.username; }
    catch (e) { $('.err', page).textContent = e.message; }
  };
}
function shrinkImage(f) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); const s = 400; c.width = c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      c.toBlob(res, 'image/jpeg', 0.85);
    };
    img.onerror = () => res(f);
    img.src = URL.createObjectURL(f);
  });
}

// ================= ONTDEKKEN / ZOEKEN =================
function searchBar(q = '') {
  const bar = h(`<div class="search-bar">${backBtn()}<div class="sw">${ic('search')}<input placeholder="Zoeken" value="${esc(q)}" enterkeyhint="search"></div><button class="go">Zoeken</button></div>`);
  const go = () => { const v = $('input', bar).value.trim(); if (v) location.hash = '#/search/' + encodeURIComponent(v); };
  $('.go', bar).onclick = go;
  $('input', bar).onkeydown = e => { if (e.key === 'Enter') go(); };
  return bar;
}
async function discoverPage() {
  const page = h('<div class="page"></div>');
  page.append(searchBar());
  page.append(h('<div class="spinner"></div>'));
  view.append(page);
  setTimeout(() => $('input', page).focus(), 50);
  const r = await api('GET', '/api/trending');
  $('.spinner', page).remove();
  const hist = JSON.parse(localStorage.getItem('ff_hist') || '[]');
  if (hist.length) {
    page.append(h(`<div class="sec-title">Recent gezocht <button style="color:var(--muted);font-weight:400;font-size:13px" onclick="localStorage.removeItem('ff_hist');this.parentNode.nextSibling.remove();this.parentNode.remove()">Wissen</button></div>`));
    page.append(h(`<div class="chips">${hist.map(x => `<a class="chip" href="#/search/${encodeURIComponent(x)}">${esc(x)}</a>`).join('')}</div>`));
  }
  const ch = await api('GET', '/api/challenges').catch(() => ({ challenges: [] }));
  page.append(h(`<div class="sec-title">Challenges <a href="#/challenges" style="color:var(--muted);font-weight:400;font-size:13px">Alles ›</a></div>`));
  page.append(challengeStrip(ch.challenges.filter(c => !c.done).slice(0, 6)));
  if (r.users.length) {
    page.append(h('<div class="sec-title">Voorgestelde accounts</div>'));
    r.users.slice(0, 5).forEach(u => page.append(userRow(u)));
  }
  for (const t of r.hashtags) {
    page.append(h(`<a class="row" href="#/tag/${encodeURIComponent(t.tag)}"><span class="tag-ic">#</span><div class="grow"><div class="t1">${esc(t.tag)}</div><div class="t2">Trending</div></div><span style="color:var(--muted);font-size:13px">${fmt(t.views)} ›</span></a>`));
    const row = h('<div class="hrow"></div>');
    t.videos.forEach(v => row.append(cell(v, t.videos, '#' + t.tag)));
    page.append(row);
  }
  if (!r.hashtags.length && !r.users.length) page.append(h('<div class="grid-empty">Nog niets trending. Plaats video\'s met #hashtags!</div>'));
}
async function searchPage(q) {
  q = decodeURIComponent(q);
  const hist = JSON.parse(localStorage.getItem('ff_hist') || '[]').filter(x => x !== q);
  localStorage.setItem('ff_hist', JSON.stringify([q, ...hist].slice(0, 10)));
  const page = h('<div class="page"></div>');
  page.append(searchBar(q));
  const segs = h(`<div class="segs" style="top:56px">${['Top', 'Gebruikers', 'Video\'s', 'Geluiden', 'Hashtags'].map((t, i) => `<button data-i="${i}" style="font-size:14px">${t}</button>`).join('')}</div>`);
  page.append(segs, h('<div class="res"><div class="spinner"></div></div>'));
  view.append(page);
  const r = await api('GET', '/api/search?q=' + encodeURIComponent(q));
  const res = $('.res', page);
  const show = i => {
    $$('button', segs).forEach(b => b.classList.toggle('active', +b.dataset.i === i));
    res.innerHTML = '';
    const none = () => res.append(h('<div class="grid-empty">Geen resultaten gevonden</div>'));
    if (i === 0) {
      r.users.slice(0, 3).forEach(u => res.append(userRow(u)));
      if (r.hashtags[0]) res.append(h(`<a class="row" href="#/tag/${encodeURIComponent(r.hashtags[0].tag)}"><span class="tag-ic">#</span><div class="grow"><div class="t1">${esc(r.hashtags[0].tag)}</div><div class="t2">${r.hashtags[0].count} video's</div></div></a>`));
      if (r.videos.length) res.append(grid(r.videos, q));
      if (!r.users.length && !r.videos.length && !r.hashtags.length) none();
    }
    if (i === 1) { r.users.forEach(u => res.append(userRow(u))); if (!r.users.length) none(); }
    if (i === 2) { r.videos.length ? res.append(grid(r.videos, q)) : none(); }
    if (i === 3) { r.sounds.forEach(s => res.append(h(`<a class="row" href="#/sound/${s.id}">${s.thumb ? `<img class="thumb" src="${s.thumb}">` : `<span class="tag-ic">♫</span>`}<div class="grow"><div class="t1">${esc(s.name)}</div><div class="t2">${s.count} video's</div></div></a>`))); if (!r.sounds.length) none(); }
    if (i === 4) { r.hashtags.forEach(t => res.append(h(`<a class="row" href="#/tag/${encodeURIComponent(t.tag)}"><span class="tag-ic">#</span><div class="grow"><div class="t1">${esc(t.tag)}</div><div class="t2">${t.count} video's</div></div></a>`))); if (!r.hashtags.length) none(); }
  };
  $$('button', segs).forEach(b => b.onclick = () => show(+b.dataset.i));
  show(0);
}
async function tagPage(tag) {
  tag = decodeURIComponent(tag);
  const r = await api('GET', '/api/tag/' + encodeURIComponent(tag));
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2></h2><span class="ic"></span></div>
    <div class="big-head"><div class="ph">#</div><div><h1>#${esc(tag)}</h1><p>${fmt(r.views)} weergaven · ${r.videos.length} video's</p></div></div></div>`);
  page.append(grid(r.videos, '#' + tag));
  page.append(h(`<div class="float-btn"><a class="btn" href="#/upload?tag=${encodeURIComponent(tag)}">${ic('play')} Gebruik deze hashtag</a></div>`));
  view.append(page);
}
async function soundPage(id) {
  const r = await api('GET', '/api/sound/' + id);
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2></h2><span class="ic"></span></div>
    <div class="big-head"><button class="ph pl" style="position:relative">${r.original.thumb ? `<img src="${r.original.thumb}">` : '♫'}<span style="position:absolute;inset:0;display:grid;place-items:center;font-size:36px;background:rgba(0,0,0,.35)">${ic('play')}</span></button>
    <div><h1>${esc(r.sound.name)}</h1><p><a href="#/@${esc(r.original.author.username)}">@${esc(r.original.author.username)}</a></p><p>${r.videos.length} video's</p></div></div></div>`);
  const audio = new Audio(r.original.url);
  $('.pl', page).onclick = () => { if (audio.paused) { audio.play(); $('.pl span', page).innerHTML = '❚❚'; } else { audio.pause(); $('.pl span', page).innerHTML = ic('play'); } };
  onCleanup(() => audio.pause());
  page.append(grid(r.videos, r.sound.name));
  page.append(h(`<div class="float-btn"><a class="btn" href="#/upload?sound=${id}">${ic('music')} Gebruik dit geluid</a></div>`));
  view.append(page);
}

// ================= INBOX =================
function notifText(n) {
  return { like: 'vindt je video leuk.', comment: `reageerde: ${n.text}`, reply: `beantwoordde je reactie: ${n.text}`, follow: 'volgt je nu.', mention: n.text ? `noemde je in een reactie: ${n.text}` : 'noemde je in een video.', commentlike: `vindt je reactie leuk: ${n.text}`, post: 'heeft een nieuwe video geplaatst.', live: `is LIVE: ${n.text || ''}` }[n.type] || '';
}
async function inboxPage() {
  if (!need()) return (location.hash = '#/');
  const page = h(`<div class="page"><div class="head"><span class="ic"></span><h2>Inbox</h2><button class="ic new">${ic('edit')}</button></div>
    <div class="segs"><button data-t="act">Activiteit</button><button data-t="msg">Berichten</button></div><div class="ib"></div></div>`);
  view.append(page);
  const ib = $('.ib', page);
  let tab = route.params.get('t') || 'act';
  let filter = 'all';
  $('.new', page).onclick = async () => {
    const r = await api('GET', `/api/users/${S.me.username}/following`);
    const s = sheet(`<div class="sh-head">Nieuw bericht<button class="x" data-close>${ic('close')}</button></div><div class="sh-body">${r.users.length ? '' : '<div class="grid-empty">Volg iemand om een bericht te sturen</div>'}</div>`, { tall: true });
    r.users.forEach(u => $('.sh-body', s).append(h(`<a class="row" href="#/chat/${esc(u.username)}"><img class="av" src="${avatar(u)}"><div class="grow"><div class="t1">${esc(u.name)}</div><div class="t2">@${esc(u.username)}</div></div></a>`)));
  };
  async function showAct() {
    ib.innerHTML = `<div class="chips">${[['all', 'Alle activiteit'], ['like', 'Likes'], ['comment', 'Reacties'], ['mention', 'Vermeldingen'], ['follow', 'Volgers'], ['post', 'Nieuwe video\'s']].map(([k, l]) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div><div class="nl"><div class="spinner"></div></div>`;
    $$('[data-f]', ib).forEach(b => b.onclick = () => { filter = b.dataset.f; showAct(); });
    const r = await api('GET', '/api/notifications');
    api('POST', '/api/notifications/read').then(() => api('GET', '/api/me')).then(m => setUnread(m.unread)).catch(() => {});
    const list = r.notifications.filter(n => filter === 'all' || n.type === filter || (filter === 'like' && n.type === 'commentlike') || (filter === 'comment' && n.type === 'reply'));
    const nl = $('.nl', ib); nl.innerHTML = list.length ? '' : '<div class="grid-empty">Nog geen activiteit.<br>Als mensen je video\'s liken of erop reageren, zie je dat hier.</div>';
    for (const n of list) {
      if (!n.from) continue;
      const row = h(`<div class="row" style="cursor:pointer">${!n.read ? '<span class="dot"></span>' : ''}<a href="#/@${esc(n.from.username)}"><img class="av" src="${avatar(n.from)}"></a>
        <div class="grow"><div class="t1">${esc(n.from.name || n.from.username)}</div><div class="t2" style="white-space:normal">${esc(notifText(n))} <span>${ago(n.created)}</span></div></div></div>`);
      if (n.type === 'follow') row.append(followBtn(n.from));
      else if (n.video) row.append(h(n.video.thumb ? `<img class="thumb" src="${n.video.thumb}">` : '<span class="thumb"></span>'));
      row.onclick = e => { if (e.target.closest('a,button')) return; if (n.type === 'live') location.hash = '#/live/' + n.liveId; else if (n.video) location.hash = '#/v/' + n.video.id; else location.hash = '#/@' + n.from.username; };
      nl.append(row);
    }
  }
  async function showMsg() {
    ib.innerHTML = '<div class="spinner"></div>';
    const r = await api('GET', '/api/conversations');
    ib.innerHTML = r.conversations.length ? '' : '<div class="grid-empty">Nog geen berichten.<br>Stuur iemand een bericht via zijn profiel of met het potlood-icoon.</div>';
    for (const c of r.conversations) {
      const last = c.last.video ? (c.last.from === S.me.id ? 'Je hebt een video gedeeld' : 'Deelde een video') : c.last.text;
      ib.append(h(`<a class="row" href="#/chat/${esc(c.user.username)}"><img class="av" src="${avatar(c.user)}"><div class="grow"><div class="t1">${esc(c.user.name || c.user.username)}</div><div class="t2" style="${c.unread ? 'color:#fff;font-weight:600' : ''}">${esc(last)} · ${ago(c.last.created)}</div></div>${c.unread ? `<span class="badge" style="position:static">${c.unread}</span>` : ''}</a>`));
    }
  }
  const show = t => { tab = t; $$('[data-t]', page).forEach(b => b.classList.toggle('active', b.dataset.t === t)); t === 'act' ? showAct() : showMsg(); };
  $$('[data-t]', page).forEach(b => b.onclick = () => show(b.dataset.t));
  const refresh = () => tab === 'act' ? showAct() : showMsg();
  document.addEventListener('ff:notif', refresh);
  onCleanup(() => document.removeEventListener('ff:notif', refresh));
  show(tab);
}

async function chatPage(username) {
  if (!need()) return (location.hash = '#/');
  const r = await api('GET', '/api/messages/' + encodeURIComponent(username));
  const u = r.user; S.chatWith = u;
  api('GET', '/api/me').then(m => setUnread(m.unread)).catch(() => {});
  const page = h(`<div class="chat"><div class="head">${backBtn()}<a href="#/@${esc(u.username)}" style="display:flex;align-items:center;gap:8px;flex:1;justify-content:center"><img class="av" style="width:30px;height:30px;border:0" src="${avatar(u)}"><b>${esc(u.name || u.username)}</b></a><span class="ic"></span></div>
    <div class="msgs"></div><div class="typing"></div>
    <div class="chat-in"><input placeholder="Bericht sturen..." maxlength="1000"><button class="btn small">${ic('send')}</button></div></div>`);
  view.append(page);
  const box = $('.msgs', page);
  let lastTs = 0;
  const add = m => {
    if (m.created - lastTs > 10 * 60e3) box.append(h(`<div class="msg-time">${new Date(m.created).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>`));
    lastTs = m.created;
    const mine = m.from === S.me.id;
    const el = h(`<div class="msg ${mine ? 'me' : ''}">${mine ? '' : `<img class="av" src="${avatar(u)}">`}<div class="bubble">${m.video ? `<a class="vcard" href="#/v/${m.video.id}">${m.video.thumb ? `<img src="${m.video.thumb}">` : '<img>'}</a>` : ''}${esc(m.text)}</div></div>`);
    box.append(el); box.scrollTop = box.scrollHeight;
  };
  if (!r.messages.length) box.append(h(`<div class="grid-empty"><img class="big-av" style="width:80px;height:80px;border-radius:50%" src="${avatar(u)}"><br><b>${esc(u.name)}</b><br>@${esc(u.username)}<br><br>Zeg hallo! 👋</div>`));
  r.messages.forEach(add);
  const input = $('input', page);
  const send = async () => {
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    try { await api('POST', '/api/messages/' + encodeURIComponent(u.username), { text }); } catch (e) { toast(e.message); }
  };
  $('.chat-in button', page).onclick = send;
  let lastTyping = 0;
  input.onkeydown = e => {
    if (e.key === 'Enter') return send();
    if (Date.now() - lastTyping > 1500 && S.ws?.readyState === 1) { lastTyping = Date.now(); S.ws.send(JSON.stringify({ type: 'typing', to: u.username })); }
  };
  const onMsg = e => { $('.grid-empty', box)?.remove(); add(e.detail); if (e.detail.from !== S.me.id) api('GET', '/api/messages/' + encodeURIComponent(u.username)).catch(() => {}); $('.typing', page).textContent = ''; };
  let tt;
  const onTyping = () => { $('.typing', page).textContent = `${u.name || u.username} is aan het typen…`; clearTimeout(tt); tt = setTimeout(() => $('.typing', page).textContent = '', 2500); };
  document.addEventListener('ff:msg', onMsg); document.addEventListener('ff:typing', onTyping);
  onCleanup(() => { document.removeEventListener('ff:msg', onMsg); document.removeEventListener('ff:typing', onTyping); S.chatWith = null; });
  input.focus();
}

// ================= UPLOADEN / CAMERA =================
async function uploadPage() {
  if (!need()) return (location.hash = '#/');
  const soundId = route.params.get('sound');
  const duetId = route.params.get('duet');
  const tag = route.params.get('tag');
  let soundInfo = null, duetVideo = null;
  if (soundId) soundInfo = await api('GET', '/api/sound/' + soundId).catch(() => null);
  if (duetId) duetVideo = (await api('GET', '/api/videos/' + duetId).catch(() => ({}))).video;

  const page = h(`<div class="cam">
    <div class="cam-stage ${duetVideo ? 'duet' : ''}"><video class="live mirror" autoplay muted playsinline></video>${duetVideo ? `<video class="orig" src="${duetVideo.url}" playsinline style="filter:${filterCss(duetVideo.filter)}"></video>` : ''}</div>
    <div class="rec-track"></div><div class="rec-progress" style="width:0"></div>
    <div class="cam-top"><a class="ic" href="#/">${ic('close')}</a><div class="sound-pill">♫ ${soundInfo ? esc(soundInfo.sound.name) : duetVideo ? 'Duet met @' + esc(duetVideo.author.username) : 'Geluid: je microfoon'}</div><span style="width:28px"></span></div>
    <div class="cam-side">
      <button data-a="flip">${ic('flip')}Draaien</button>
      <button data-a="timer">${ic('timer')}Timer</button>
      <button data-a="filters">${ic('magic')}Filters</button>
    </div>
    <div class="cam-bottom">
      <div class="filters" hidden>${Object.entries(FILTERS).map(([k, [n, css]]) => `<button data-f="${k}" class="${k === 'none' ? 'active' : ''}"><span class="sw" style="filter:${css}"></span>${n}</button>`).join('')}</div>
      <div class="durs">${[[15, '15s'], [60, '60s'], [180, '3m'], [600, '10m']].map(([s, l]) => `<button data-d="${s}" class="${s === 60 ? 'active' : ''}">${l}</button>`).join('')}${duetVideo || soundInfo ? '' : '<a href="#/golive" style="color:rgba(255,255,255,.6)">LIVE</a>'}</div>
      <div class="cam-ctrl">
        <label class="gal" ${duetVideo ? 'style="visibility:hidden"' : ''}><span class="box">${ic('grid')}</span>Uploaden<input type="file" accept="video/*" hidden></label>
        <button class="rec"></button>
        <label class="gal fotos-gal" ${duetVideo || soundInfo ? 'style="visibility:hidden"' : ''}><span class="box">📷</span>Foto's<input type="file" accept="image/*" multiple hidden></label>
        <button class="done-btn" style="visibility:hidden"><span class="box">✓</span>Klaar</button>
      </div>
    </div>
    <div class="countdown" hidden></div>
    <div class="cam-msg" hidden></div>
  </div>`);
  view.append(page);
  const live = $('.live', page), orig = $('.orig', page);
  let facing = 'user', stream = null, filter = 'none', maxDur = 60, useTimer = false;
  let recorder = null, chunks = [], elapsed = 0, tick = null, audioCtx = null, soundAudio = null, soundDest = null;

  async function startCam() {
    stream?.getTracks().forEach(t => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: !soundInfo });
      live.srcObject = stream;
      live.classList.toggle('mirror', facing === 'user');
      $('.cam-msg', page).hidden = true;
    } catch (e) {
      const msg = $('.cam-msg', page); msg.hidden = false;
      msg.innerHTML = `${ic('eyeOff')}<b style="color:#fff">Camera niet beschikbaar</b><div>Geef toegang tot je camera en microfoon, of kies een video van je apparaat.</div>
        <label class="btn">Video kiezen<input type="file" accept="video/*" hidden></label><button class="btn grey" data-retry>Opnieuw proberen</button>`;
      $('input', msg).onchange = e => e.target.files[0] && editStep(e.target.files[0]);
      $('[data-retry]', msg).onclick = startCam;
    }
  }
  if (soundInfo) {
    soundAudio = new Audio(soundInfo.original.url);
    soundAudio.loop = true;
  }
  onCleanup(() => {
    stream?.getTracks().forEach(t => t.stop()); clearInterval(tick);
    try { recorder?.state !== 'inactive' && recorder?.stop(); } catch {}
    soundAudio?.pause(); audioCtx?.close();
  });
  startCam();

  $('[data-a="flip"]', page).onclick = () => { if (recorder) return toast('Draaien kan niet tijdens het opnemen'); facing = facing === 'user' ? 'environment' : 'user'; startCam(); };
  $('[data-a="timer"]', page).onclick = e => { useTimer = !useTimer; e.currentTarget.classList.toggle('on', useTimer); toast(useTimer ? 'Timer: 3 seconden aftellen' : 'Timer uit'); };
  $('[data-a="filters"]', page).onclick = () => { $('.filters', page).hidden = !$('.filters', page).hidden; };
  $$('[data-f]', page).forEach(b => b.onclick = () => {
    filter = b.dataset.f; live.style.filter = filterCss(filter);
    $$('[data-f]', page).forEach(x => x.classList.toggle('active', x === b));
  });
  $$('[data-d]', page).forEach(b => b.onclick = () => {
    if (recorder) return;
    maxDur = +b.dataset.d; $$('[data-d]', page).forEach(x => x.classList.toggle('active', x === b));
  });
  $('.gal input', page).onchange = e => e.target.files[0] && editStep(e.target.files[0]);
  $('.fotos-gal input', page).onchange = e => e.target.files.length && fotoStep([...e.target.files], { tag, stop: () => stream?.getTracks().forEach(t => t.stop()) });

  const recBtn = $('.rec', page), doneBtn = $('.done-btn', page);
  const countdown = n => new Promise(res => {
    const cd = $('.countdown', page); cd.hidden = false; cd.textContent = n;
    const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); cd.hidden = true; res(); } else cd.textContent = n; }, 1000);
  });
  function buildRecorder() {
    let recStream = stream;
    if (soundInfo) {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaElementSource(soundAudio);
      soundDest = audioCtx.createMediaStreamDestination();
      src.connect(soundDest); src.connect(audioCtx.destination);
      recStream = new MediaStream([...stream.getVideoTracks(), ...soundDest.stream.getAudioTracks()]);
    }
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    recorder = new MediaRecorder(recStream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : {});
    chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      stream?.getTracks().forEach(t => t.stop());
      soundAudio?.pause(); orig?.pause();
      editStep(blob);
    };
  }
  const setRecording = on => {
    recBtn.classList.toggle('on', on);
    $('.cam-side', page).style.visibility = on ? 'hidden' : '';
    $('.durs', page).style.visibility = recorder ? 'hidden' : '';
    $('.gal', page).style.visibility = recorder || duetVideo ? 'hidden' : '';
    $('.filters', page).hidden = true;
  };
  recBtn.onclick = async () => {
    if (!stream) return toast('Geen camera');
    if (recorder?.state === 'recording') {
      recorder.pause(); clearInterval(tick); soundAudio?.pause(); orig?.pause(); setRecording(false); return;
    }
    if (useTimer) await countdown(3);
    if (!recorder) { buildRecorder(); recorder.start(250); }
    else recorder.resume();
    if (soundAudio) { audioCtx?.resume(); soundAudio.play(); }
    if (orig) { orig.currentTime = elapsed; orig.play(); }
    setRecording(true);
    let lastT = performance.now();
    tick = setInterval(() => {
      const t = performance.now(); elapsed += (t - lastT) / 1000; lastT = t;
      $('.rec-progress', page).style.width = Math.min(100, elapsed / (duetVideo ? Math.min(maxDur, orig.duration || maxDur) : maxDur) * 100) + '%';
      if (elapsed >= 1) doneBtn.style.visibility = 'visible';
      if (elapsed >= maxDur || (orig && orig.ended)) finish();
    }, 100);
  };
  function finish() { clearInterval(tick); if (recorder && recorder.state !== 'inactive') recorder.stop(); }
  doneBtn.onclick = finish;

  // ---- stap 2: bewerken & plaatsen ----
  async function editStep(file) {
    stream?.getTracks().forEach(t => t.stop());
    const url = URL.createObjectURL(file);
    onCleanup(() => URL.revokeObjectURL(url));
    view.innerHTML = '';
    document.body.classList.add('fullscreen');
    const trending = await api('GET', '/api/trending').catch(() => ({ hashtags: [] }));
    const ed = h(`<div class="page edit"><div class="head"><button class="ic back">${ic('back')}</button><h2>Plaatsen</h2><span class="ic"></span></div>
      <div class="preview-wrap"><textarea maxlength="2200" placeholder="Beschrijf je video… gebruik #hashtags en @vermeldingen">${tag ? '#' + esc(tag) + ' ' : ''}</textarea><div class="pv"><video src="${url}" autoplay loop muted playsinline style="filter:${filterCss(filter)}"></video></div></div>
      <div class="quick"><button data-ins="#"># Hashtags</button><button data-ins="@">@ Vermelden</button>${trending.hashtags.slice(0, 5).map(t => `<button data-ins="#${esc(t.tag)} ">#${esc(t.tag)}</button>`).join('')}</div>
      <div class="filters" style="padding-top:6px">${Object.entries(FILTERS).map(([k, [n, css]]) => `<button data-f="${k}" class="${k === filter ? 'active' : ''}"><span class="sw" style="filter:${css}"></span>${n}</button>`).join('')}</div>
      ${soundInfo ? `<div class="opt">${ic('music')}<label>Geluid</label><span style="color:var(--muted);font-size:14px">${esc(soundInfo.sound.name)}</span></div>` : `<div class="opt">${ic('music')}<label>Naam geluid</label><input type="text" name="soundName" placeholder="origineel geluid" maxlength="60"></div>`}
      <div class="opt">${ic('lock')}<label>Wie kan dit bekijken</label><select name="privacy"><option value="public">Iedereen</option><option value="friends">Vrienden</option><option value="private">Alleen ik</option></select></div>
      <div class="opt">${ic('comment')}<label>Reacties toestaan</label><label class="switch-t"><input type="checkbox" name="allowComments" checked><span></span></label></div>
      <div class="opt">${ic('duet')}<label>Duet toestaan</label><label class="switch-t"><input type="checkbox" name="allowDuet" checked><span></span></label></div>
      <div class="opt">${ic('link')}<label>ZekerFlex-koppeling</label><button class="btn small grey kies-produkt">Kiezen</button></div>
      <div class="progress" hidden><div></div></div>
      <div class="post-bar"><button class="btn grey again">Opnieuw</button><button class="btn grey bewerk">✂ Bewerken</button><button class="btn post">Plaatsen</button></div></div>`);
    view.append(ed);
    const ta = $('textarea', ed), pv = $('.pv video', ed);
    let produkt = null;
    $('.kies-produkt', ed).onclick = () => pickProduktSheet(p => { produkt = p; $('.kies-produkt', ed).textContent = p ? p.titel.slice(0, 18) : 'Kiezen'; }, produkt);
    // bewerken: knippen, snelheid, tekst en muziek; het resultaat vervangt het bestand dat geplaatst wordt
    $('.bewerk', ed).onclick = async () => { const nb = await openEditor(file, filter); if (nb) { file = nb; pv.src = URL.createObjectURL(nb); toast('Bewerking toegepast'); } };
    $$('[data-ins]', ed).forEach(b => b.onclick = () => { ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + b.dataset.ins; ta.focus(); });
    $$('[data-f]', ed).forEach(b => b.onclick = () => { filter = b.dataset.f; pv.style.filter = filterCss(filter); $$('[data-f]', ed).forEach(x => x.classList.toggle('active', x === b)); });
    const redo = () => render();
    $('.back', ed).onclick = redo; $('.again', ed).onclick = redo;
    $('.post', ed).onclick = async () => {
      const btn = $('.post', ed); btn.disabled = true; btn.textContent = 'Bezig…';
      const fd = new FormData();
      const ext = (file.type || '').includes('mp4') ? '.mp4' : (file.name?.match(/\.\w+$/)?.[0] || '.webm');
      fd.append('video', file, 'video' + ext);
      const thumb = await makeThumb(pv.src, filter);
      if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
      if (produkt) fd.append('produkt', JSON.stringify(produkt));
      fd.append('caption', ta.value);
      fd.append('filter', filter);
      fd.append('privacy', $('[name=privacy]', ed).value);
      fd.append('allowComments', $('[name=allowComments]', ed).checked);
      fd.append('allowDuet', $('[name=allowDuet]', ed).checked);
      if (soundInfo) fd.append('soundId', soundInfo.sound.id);
      else fd.append('soundName', $('[name=soundName]', ed).value);
      if (duetVideo) fd.append('duetOf', duetVideo.id);
      $('.progress', ed).hidden = false;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/videos');
      xhr.setRequestHeader('x-token', S.token);
      xhr.upload.onprogress = e => { if (e.lengthComputable) $('.progress div', ed).style.width = (e.loaded / e.total * 100) + '%'; };
      xhr.onload = () => {
        if (xhr.status === 200) { toast('Je video is geplaatst! 🎉'); location.hash = '#/@' + S.me.username; }
        else { btn.disabled = false; btn.textContent = 'Plaatsen'; toast(JSON.parse(xhr.responseText || '{}').error || 'Uploaden mislukt'); }
      };
      xhr.onerror = () => { btn.disabled = false; btn.textContent = 'Plaatsen'; toast('Uploaden mislukt'); };
      xhr.send(fd);
    };
  }
}

function makeThumb(url, filter) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    let done = false;
    const draw = () => {
      if (done) return; done = true;
      try {
        if (!v.videoWidth) return res(null);
        const w = 360, hgt = Math.round(360 * v.videoHeight / v.videoWidth);
        const c = document.createElement('canvas'); c.width = w; c.height = hgt;
        const ctx = c.getContext('2d'); ctx.filter = filterCss(filter) || 'none';
        ctx.drawImage(v, 0, 0, w, hgt);
        c.toBlob(b => res(b), 'image/jpeg', 0.8);
      } catch { res(null); }
    };
    v.addEventListener('loadeddata', () => {
      const d = isFinite(v.duration) ? v.duration : 1;
      v.currentTime = Math.min(0.5, d / 2);
    });
    v.addEventListener('seeked', draw);
    setTimeout(() => { if (v.readyState >= 2) draw(); else if (!done) { done = true; res(null); } }, 4000);
  });
}

// ================= LIVE =================
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const LIVE_GIFTS = [['roos', '🌹', 'Roos'], ['hart', '💖', 'Hartje'], ['feest', '🎉', 'Feest'], ['leeuw', '🦁', 'Leeuw'], ['raket', '🚀', 'Raket'], ['kroon', '👑', 'Kroon']];
const dur = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// WebRTC-verbinding met wachtrij voor ICE-kandidaten die te vroeg binnenkomen
function makePeer(to) {
  const pc = new RTCPeerConnection(ICE);
  pc._queue = [];
  pc.onicecandidate = e => e.candidate && wsSend({ type: 'live:signal', to, data: { ice: e.candidate } });
  pc.handle = async data => {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      for (const c of pc._queue) await pc.addIceCandidate(c).catch(() => {});
      pc._queue = [];
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        wsSend({ type: 'live:signal', to, data: { sdp: pc.localDescription } });
      }
    }
    if (data.ice) pc.remoteDescription ? pc.addIceCandidate(data.ice).catch(() => {}) : pc._queue.push(data.ice);
  };
  return pc;
}

// gedeelde LIVE-kamer (voor maker en kijker)
function liveRoom(live, isHost) {
  const host = live.host;
  const room = h(`<div class="lv">
    <video class="lv-video ${isHost ? 'mirror' : 'snd'}" autoplay playsinline ${isHost ? 'muted' : ''}></video>
    <div class="lv-shade"></div>
    <div class="lv-tap"></div>
    <div class="lv-hearts"></div>
    <div class="lv-top">
      <div class="lv-host"><img src="${avatar(host)}"><div><b>${esc(host.name || host.username)}</b><small><span class="lv-likes">${fmt(live.likes)}</span> likes</small></div></div>
      <span class="lv-pill"><span class="live-tag" style="position:static">LIVE</span> <span class="lv-time">0:00</span></span>
      <span class="lv-pill">👁 <span class="lv-count">${live.viewers}</span></span>
      <button class="ic lv-x">${ic('close')}</button>
    </div>
    <div class="lv-title">${esc(live.title)}</div>
    <div class="lv-gift" hidden></div>
    <div class="lv-chat"></div>
    <div class="lv-bottom">
      <input class="lv-in" placeholder="${S.me ? 'Zeg iets…' : 'Log in om te chatten'}" maxlength="150">
      ${isHost ? `
        <button class="lv-btn" data-a="flip" title="Camera draaien">${ic('flip')}</button>
        <button class="lv-btn" data-a="mic" title="Microfoon">🎙️</button>
        <button class="lv-btn end" data-a="end">Stop</button>` : `
        <button class="lv-btn" data-a="gift" title="Cadeau">🎁</button>
        <button class="lv-btn" data-a="share" title="Delen">${ic('share')}</button>
        <button class="lv-btn heart" data-a="like" title="Like">${ic('heart')}</button>`}
    </div>
    <div class="lv-center" hidden></div>
  </div>`);
  const chat = $('.lv-chat', room);
  room.addChat = (who, text, cls = '') => {
    const el = h(`<div class="lv-msg ${cls}">${who ? `<img src="${avatar(who)}"><b>${esc(who.name || who.username)}</b> ` : ''}<span>${esc(text)}</span></div>`);
    chat.append(el);
    while (chat.children.length > 30) chat.firstChild.remove();
    chat.scrollTop = chat.scrollHeight;
  };
  room.heart = () => {
    const colors = ['#ff3b5c', '#ff7a1a', '#8b5cf6', '#ec4899', '#eab308', '#10b981'];
    const hp = h(`<div class="lv-fh" style="color:${colors[Math.floor(Math.random() * colors.length)]};--x:${Math.round(Math.random() * 60 - 30)}px">${ic('heart')}</div>`);
    $('.lv-hearts', room).append(hp); setTimeout(() => hp.remove(), 2200);
  };
  room.gift = (user, emoji, gift) => {
    const g = $('.lv-gift', room);
    g.innerHTML = `<img src="${avatar(user)}"><div><b>${esc(user.name || user.username)}</b><small>stuurde ${esc(LIVE_GIFTS.find(x => x[0] === gift)?.[2] || 'een cadeau')}</small></div><span class="emo">${emoji}</span>`;
    g.hidden = false; g.style.animation = 'none'; g.offsetHeight; g.style.animation = '';
    clearTimeout(g._t); g._t = setTimeout(() => g.hidden = true, 3000);
    room.addChat(user, `stuurde ${emoji}`, 'gift');
  };
  room.center = html => { const c = $('.lv-center', room); c.hidden = !html; c.innerHTML = html || ''; };
  const start = live.started;
  const timer = setInterval(() => $('.lv-time', room).textContent = dur(Date.now() - start), 1000);
  onCleanup(() => clearInterval(timer));
  room.stopTimer = () => clearInterval(timer);
  // chat versturen
  const input = $('.lv-in', room);
  input.onfocus = () => { if (!S.me) { input.blur(); askLogin(); } };
  input.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const text = input.value.trim(); if (!text) return;
    wsSend({ type: 'live:chat', text }); input.value = '';
  };
  // gebeurtenissen van de server
  const onLive = e => {
    const m = e.detail;
    if (m.type === 'live:chat') room.addChat(m.user, m.text, m.host ? 'host' : '');
    if (m.type === 'live:system') room.addChat(null, m.text, 'sys');
    if (m.type === 'live:count') $('.lv-count', room).textContent = fmt(m.viewers);
    if (m.type === 'live:likes') { $('.lv-likes', room).textContent = fmt(m.likes); if (m.conn !== S.conn) for (let i = 0; i < Math.min(m.n, 6); i++) setTimeout(room.heart, i * 120); }
    if (m.type === 'live:gift') room.gift(m.user, m.emoji, m.gift);
  };
  document.addEventListener('ff:live', onLive);
  onCleanup(() => document.removeEventListener('ff:live', onLive));
  $('.lv-x', room).onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/live'));
  return room;
}

async function liveListPage() {
  const page = h(`<div class="page"><div class="head">${backBtn()}<h2>LIVE</h2><span class="ic"></span></div>
    <div style="padding:12px 16px"><a class="btn block" href="#/golive">🔴 Zelf LIVE gaan</a></div><div class="lv-list"><div class="spinner"></div></div></div>`);
  view.append(page);
  const load = async () => {
    const r = await api('GET', '/api/lives').catch(() => ({ lives: [] }));
    const list = $('.lv-list', page);
    list.innerHTML = r.lives.length ? '' : `<div class="grid-empty">Er is nu niemand LIVE.<br>Wees de eerste! 🎥</div>`;
    for (const l of r.lives) list.append(h(`<a class="lv-card" href="#/live/${l.id}" style="background-image:url('${avatar(l.host)}')">
      <span class="live-tag">LIVE</span><span class="lv-card-v">👁 ${fmt(l.viewers)}</span>
      <div class="lv-card-b"><b>${esc(l.host.name || l.host.username)}</b><small>${esc(l.title)}</small></div></a>`));
  };
  await load();
  const iv = setInterval(load, 5000);
  onCleanup(() => clearInterval(iv));
}

async function goLivePage() {
  if (!need()) return (location.hash = '#/');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }); }
  catch { view.innerHTML = `<div class="empty">${ic('eyeOff')}<h3>Camera niet beschikbaar</h3><div>Geef toegang tot je camera en microfoon om LIVE te gaan.</div><a class="btn" href="#/live">Terug</a></div>`; return; }
  let facing = 'user', liveId = null, ended = false;
  const pcs = new Map();
  onCleanup(() => {
    if (liveId && !ended) wsSend({ type: 'live:end' });
    stream.getTracks().forEach(t => t.stop());
    pcs.forEach(pc => pc.close());
  });
  // stap 1: voorbeeld + titel
  const setup = h(`<div class="lv">
    <video class="lv-video mirror" autoplay playsinline muted></video><div class="lv-shade"></div>
    <div class="lv-top" style="justify-content:flex-end"><button class="ic lv-x">${ic('close')}</button></div>
    <div class="lv-setup">
      <div class="lv-setup-card"><img src="${avatar(S.me)}"><input class="lv-title-in" placeholder="Geef je LIVE een titel…" maxlength="60"></div>
      <button class="btn block lv-go" style="padding:14px;font-size:17px">🔴 LIVE gaan</button>
      <div style="font-size:12px;color:#ccc;text-align:center">Je volgers krijgen een melding als je LIVE gaat.</div>
    </div></div>`);
  view.append(setup);
  $('video', setup).srcObject = stream;
  $('.lv-x', setup).onclick = () => (location.hash = '#/live');
  $('.lv-go', setup).onclick = async () => {
    $('.lv-go', setup).disabled = true; $('.lv-go', setup).textContent = 'Starten…';
    await wsReady();
    const started = new Promise(res => { const f = e => { if (e.detail.type === 'live:started') { document.removeEventListener('ff:live', f); res(e.detail.live); } }; document.addEventListener('ff:live', f); });
    wsSend({ type: 'live:start', title: $('.lv-title-in', setup).value });
    const live = await started;
    liveId = live.id;
    // stap 2: je bent LIVE
    setup.remove();
    const room = liveRoom(live, true);
    view.append(room);
    const vid = $('video', room); vid.srcObject = stream;
    room.addChat(null, 'Je bent LIVE! Deel de link zodat mensen kunnen kijken 🎉', 'sys');
    const onLive = async e => {
      const m = e.detail;
      if (m.type === 'live:viewer') {
        const pc = makePeer(m.conn); pcs.set(m.conn, pc);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        await pc.setLocalDescription(await pc.createOffer());
        wsSend({ type: 'live:signal', to: m.conn, data: { sdp: pc.localDescription } });
      }
      if (m.type === 'live:signal') pcs.get(m.from)?.handle(m.data);
      if (m.type === 'live:viewer-left') { pcs.get(m.conn)?.close(); pcs.delete(m.conn); }
      if (m.type === 'live:ended') {
        ended = true; room.stopTimer();
        pcs.forEach(pc => pc.close()); pcs.clear(); stream.getTracks().forEach(t => t.stop());
        room.center(`<h2>LIVE beëindigd</h2><div class="lv-stats"><div><b>${dur(m.duration)}</b>Duur</div><div><b>${fmt(m.peak)}</b>Max. kijkers</div><div><b>${fmt(m.likes)}</b>Likes</div></div><a class="btn" href="#/@${esc(S.me.username)}">Naar je profiel</a>`);
        $('.lv-bottom', room).hidden = true;
      }
    };
    document.addEventListener('ff:live', onLive);
    onCleanup(() => document.removeEventListener('ff:live', onLive));
    $('[data-a="end"]', room).onclick = async () => { if (await confirmSheet('LIVE beëindigen?', 'Beëindigen')) wsSend({ type: 'live:end' }); };
    $('[data-a="mic"]', room).onclick = e => {
      const a = stream.getAudioTracks()[0]; if (!a) return;
      a.enabled = !a.enabled; e.currentTarget.textContent = a.enabled ? '🎙️' : '🔇'; toast(a.enabled ? 'Microfoon aan' : 'Microfoon uit');
    };
    $('[data-a="flip"]', room).onclick = async () => {
      facing = facing === 'user' ? 'environment' : 'user';
      try {
        const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const nt = ns.getVideoTracks()[0], old = stream.getVideoTracks()[0];
        pcs.forEach(pc => pc.getSenders().find(s => s.track?.kind === 'video')?.replaceTrack(nt));
        stream.removeTrack(old); old.stop(); stream.addTrack(nt);
        vid.srcObject = stream; vid.classList.toggle('mirror', facing === 'user');
      } catch { toast('Geen andere camera gevonden'); facing = facing === 'user' ? 'environment' : 'user'; }
    };
  };
}

async function watchLivePage(id) {
  let live;
  try { live = (await api('GET', '/api/lives/' + id)).live; }
  catch { view.innerHTML = `<div class="empty">${ic('play')}<h3>Deze LIVE is afgelopen</h3><a class="btn" href="#/live">Andere LIVE's bekijken</a></div>`; return; }
  const room = liveRoom(live, false);
  view.append(room);
  const vid = $('video', room);
  room.center('<div class="spinner" style="margin:0"></div><div>Verbinden…</div>');
  // volgen-knop bij de maker
  if (!live.host.isMe) {
    const fb = followBtn(live.host); fb.classList.add('lv-follow');
    $('.lv-host', room).append(fb);
  }
  let pc = null, hostConn = null, pending = 0;
  const onLive = e => {
    const m = e.detail;
    if (m.type === 'live:joined') hostConn = m.hostConn;
    if (m.type === 'live:signal' && m.from === hostConn) {
      if (m.data.sdp?.type === 'offer') {
        pc?.close();
        pc = makePeer(hostConn);
        pc.ontrack = ev => { if (vid.srcObject !== ev.streams[0]) { vid.srcObject = ev.streams[0]; playWithSound(vid); room.center(null); } };
      }
      pc?.handle(m.data);
    }
    if (m.type === 'live:ended') {
      pc?.close(); vid.srcObject = null; room.stopTimer();
      room.center(`<h2>Deze LIVE is afgelopen</h2><div style="color:#ccc">Bedankt voor het kijken! 💖</div><a class="btn" href="#/@${esc(live.host.username)}">Profiel van ${esc(live.host.name || live.host.username)}</a><a class="btn grey" href="#/live">Meer LIVE</a>`);
      $('.lv-bottom', room).hidden = true;
    }
  };
  document.addEventListener('ff:live', onLive);
  const flush = setInterval(() => { if (pending) { wsSend({ type: 'live:like', n: pending }); pending = 0; } }, 600);
  onCleanup(() => { document.removeEventListener('ff:live', onLive); wsSend({ type: 'live:leave' }); pc?.close(); clearInterval(flush); });
  const like = () => { room.heart(); pending++; };
  $('.lv-tap', room).onclick = like;
  $('[data-a="like"]', room).onclick = like;
  $('[data-a="share"]', room).onclick = async () => { const l = location.origin + '/#/live/' + id; try { await navigator.clipboard.writeText(l); toast('LIVE-link gekopieerd'); } catch { prompt('Link:', l); } };
  $('[data-a="gift"]', room).onclick = () => {
    if (!need()) return;
    const s = sheet(`<div class="sh-head">Stuur een cadeau<button class="x" data-close>${ic('close')}</button></div>
      <div class="lv-gifts">${LIVE_GIFTS.map(([k, e, n]) => `<button data-g="${k}"><span>${e}</span>${n}</button>`).join('')}</div>`);
    $$('[data-g]', s).forEach(b => b.onclick = () => { wsSend({ type: 'live:gift', gift: b.dataset.g }); s.close(); });
  };
  await wsReady();
  wsSend({ type: 'live:join', liveId: id });
}

// ================= start =================
loadMe().then(render);
registerPwa();
