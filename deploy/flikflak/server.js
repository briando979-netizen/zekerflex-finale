// FlikFlak — korte-video app (TikTok-achtig)
const express = require('express');
const multer = require('multer');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
// Opslag staat op een vast volume (FF_STORAGE, bv. /data in de container), zodat
// de video's en de gegevens een uitrol overleven. Zonder die variabele valt het
// terug op de eigen map (lokaal ontwikkelen).
const ROOT = process.env.FF_STORAGE || __dirname;
const DATA = path.join(ROOT, 'data', 'db.json');
const UPLOADS = path.join(ROOT, 'uploads');
// Token voor de beheerpagina (/beheer). Zonder token is het beheer dicht.
const ADMIN_TOKEN = process.env.FF_ADMIN_TOKEN || '';
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(path.dirname(DATA), { recursive: true });

// ---------- opslag ----------
const empty = () => ({ users: [], videos: [], comments: [], notifications: [], messages: [], sessions: {}, reports: [], challenges: [] });
// Eigen muziekbibliotheek (public/muziek, zelf gemaakt, rechtenvrij) voor fotoposts en de bewerker.
const MUZIEK = [
  { id: 'zonnig', name: 'Zonnige dag', file: '/muziek/zonnig.mp3' },
  { id: 'chill', name: 'Chill', file: '/muziek/chill.mp3' },
  { id: 'hype', name: 'Hype', file: '/muziek/hype.mp3' },
  { id: 'dromerig', name: 'Dromerig', file: '/muziek/dromerig.mp3' },
  { id: 'werk', name: 'Aan het werk', file: '/muziek/werk.mp3' },
];
const DAG = () => new Date().toISOString().slice(0, 10);
let db = fs.existsSync(DATA) ? { ...empty(), ...JSON.parse(fs.readFileSync(DATA, 'utf8')) } : empty();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFileSync(DATA, JSON.stringify(db)), 150);
}
const id = () => crypto.randomBytes(8).toString('hex');
const now = () => Date.now();

function hashPass(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
const userById = uid => db.users.find(u => u.id === uid);
const userByName = n => db.users.find(u => u.username.toLowerCase() === String(n).toLowerCase());

function publicUser(u, viewer) {
  if (!u) return null;
  const followers = db.users.filter(x => x.following.includes(u.id)).length;
  const likes = db.videos.filter(v => v.userId === u.id).reduce((s, v) => s + v.likes.length, 0);
  return {
    id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, verified: !!u.verified,
    following: u.following.length, followers, likes,
    isFollowing: viewer ? viewer.following.includes(u.id) : false,
    followsYou: viewer ? u.following.includes(viewer.id) : false,
    isMe: viewer ? viewer.id === u.id : false,
    liveId: [...lives.values()].find(l => l.hostId === u.id)?.id || null,
  };
}
const lives = new Map(); // liveId -> { id, hostId, hostConn, title, started, viewers: Set<connId>, likes, peak }
const isFriend = (a, b) => a && b && a.following.includes(b.id) && b.following.includes(a.id);

// een ingeplande post is tot het moment van plaatsen alleen voor de maker zichtbaar
const zichtbaarNu = v => !v.publishAt || v.publishAt <= now();
function canSee(v, viewer) {
  if (!zichtbaarNu(v) && (!viewer || viewer.id !== v.userId)) return false;
  if (v.privacy === 'public') return true;
  if (!viewer) return false;
  if (viewer.id === v.userId) return true;
  if (v.privacy === 'friends') return isFriend(viewer, userById(v.userId));
  return false;
}

function publicVideo(v, viewer) {
  const author = userById(v.userId);
  return {
    id: v.id, url: v.file ? '/uploads/' + v.file : null, thumb: v.thumb ? '/uploads/' + v.thumb : null,
    fotos: (v.fotos || []).map(f => '/uploads/' + f),
    caption: v.caption, hashtags: v.hashtags, sound: v.sound, filter: v.filter, privacy: v.privacy,
    allowComments: v.allowComments, allowDuet: v.allowDuet !== false && !!v.file,
    produkt: v.produkt || null,
    likes: v.likes.length, favs: v.favs.length, shares: v.shares, views: v.views,
    comments: db.comments.filter(c => c.videoId === v.id).length,
    liked: viewer ? v.likes.includes(viewer.id) : false,
    faved: viewer ? v.favs.includes(viewer.id) : false,
    pinned: !!v.pinned, created: v.created,
    scheduled: !zichtbaarNu(v), publishAt: v.publishAt || null,
    duetOf: duetInfo(v.duetOf),
    author: publicUser(author, viewer),
  };
}

function duetInfo(did) {
  const o = did && db.videos.find(x => x.id === did);
  return o ? { id: o.id, url: '/uploads/' + o.file, filter: o.filter, author: { username: userById(o.userId)?.username } } : null;
}

function notify(userId, fromId, type, extra = {}) {
  if (userId === fromId) return;
  const n = { id: id(), userId, fromId, type, created: now(), read: false, ...extra };
  db.notifications.push(n);
  save();
  push(userId, { type: 'notification', notification: publicNotif(n, userById(userId)) });
}
function publicNotif(n, viewer) {
  const v = n.videoId && db.videos.find(x => x.id === n.videoId);
  return { ...n, from: publicUser(userById(n.fromId), viewer), video: v ? { id: v.id, thumb: v.thumb ? '/uploads/' + v.thumb : null } : null };
}

// ---------- app ----------
const app = express();
// Achter Caddy: het echte bezoeker-IP staat in X-Forwarded-For. We bewaren het bij
// aanmelden, plaatsen en melden om misbruik tegen te gaan en meldingen te kunnen
// behandelen. Dit staat open in de huisregels die iemand bij het aanmelden ziet.
app.set('trust proxy', true);
const clientIp = req => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));

app.use((req, res, next) => {
  const token = req.headers['x-token'] || (req.headers.cookie || '').match(/ff_token=([a-f0-9]+)/)?.[1];
  req.user = token && db.sessions[token] ? userById(db.sessions[token]) : null;
  req.token = token;
  next();
});
const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Log eerst in' }));

const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || (file.mimetype.includes('webm') ? '.webm' : file.mimetype.includes('image') ? '.jpg' : '.mp4')).toLowerCase();
    cb(null, id() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } });

// ----- account -----
app.post('/api/register', (req, res) => {
  let { username, password, name } = req.body || {};
  username = String(username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) return res.status(400).json({ error: 'Gebruikersnaam: 3-24 tekens (letters, cijfers, _ en .)' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Wachtwoord moet minstens 4 tekens zijn' });
  if (userByName(username)) return res.status(400).json({ error: 'Deze gebruikersnaam is al bezet' });
  const { salt, hash } = hashPass(password);
  const ip = clientIp(req);
  const u = { id: id(), username, name: String(name || username).slice(0, 30), bio: '', avatar: null, salt, hash, following: [], blocked: [], created: now(), ip, lastIp: ip, lastSeen: now() };
  db.users.push(u);
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = u.id;
  save();
  res.json({ token, user: publicUser(u, u) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = userByName(String(username || '').replace(/^@/, ''));
  if (!u || hashPass(String(password || ''), u.salt).hash !== u.hash) return res.status(400).json({ error: 'Gebruikersnaam of wachtwoord klopt niet' });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = u.id;
  u.lastIp = clientIp(req); u.lastSeen = now();
  save();
  res.json({ token, user: publicUser(u, u) });
});

app.post('/api/logout', (req, res) => {
  if (req.token) delete db.sessions[req.token];
  save();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const unread = db.notifications.filter(n => n.userId === req.user.id && !n.read).length
    + db.messages.filter(m => m.to === req.user.id && !m.read).length;
  res.json({ user: publicUser(req.user, req.user), unread });
});

app.post('/api/profile', auth, upload.single('avatar'), (req, res) => {
  const u = req.user;
  const { name, bio, username } = req.body;
  if (username && username !== u.username) {
    const clean = username.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(clean)) return res.status(400).json({ error: 'Ongeldige gebruikersnaam' });
    if (userByName(clean)) return res.status(400).json({ error: 'Gebruikersnaam is al bezet' });
    u.username = clean;
  }
  if (name !== undefined) u.name = String(name).slice(0, 30);
  if (bio !== undefined) u.bio = String(bio).slice(0, 80);
  if (req.file) u.avatar = '/uploads/' + req.file.filename;
  save();
  res.json({ user: publicUser(u, u) });
});

// ----- feed -----
function score(v, me) {
  const ageH = (now() - v.created) / 36e5;
  const c = db.comments.filter(x => x.videoId === v.id).length;
  const eng = v.likes.length * 2 + c * 3 + v.shares * 4 + v.favs.length * 3 + v.views * 0.2;
  // "niet geïnteresseerd": elke keer dat iemand dat bij een maker zei, telt die maker half zo zwaar
  const straf = me?.nopeAuthors?.[v.userId] ? Math.pow(0.5, me.nopeAuthors[v.userId]) : 1;
  return (eng + 5) / Math.pow(ageH + 2, 0.6) * (0.6 + Math.random() * 0.8) * straf;
}

app.get('/api/feed', (req, res) => {
  const tab = req.query.tab || 'foryou';
  const me = req.user;
  let list = db.videos.filter(v => canSee(v, me) && !(me && me.blocked?.includes(v.userId)) && !(me && me.nope?.includes(v.id)));
  if (tab === 'following') {
    if (!me) return res.json({ videos: [], needLogin: true });
    list = list.filter(v => me.following.includes(v.userId)).sort((a, b) => b.created - a.created);
  } else if (tab === 'friends') {
    if (!me) return res.json({ videos: [], needLogin: true });
    list = list.filter(v => isFriend(me, userById(v.userId))).sort((a, b) => b.created - a.created);
  } else {
    list = list.map(v => [score(v, me), v]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  }
  res.json({ videos: list.slice(0, 60).map(v => publicVideo(v, me)) });
});

app.get('/api/videos/:id', (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v || !canSee(v, req.user)) return res.status(404).json({ error: 'Video niet gevonden' });
  res.json({ video: publicVideo(v, req.user) });
});

app.post('/api/videos', auth, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }, { name: 'fotos', maxCount: 10 }]), (req, res) => {
  const f = req.files?.video?.[0];
  // fotopost: 1-10 foto's met muziek uit de bibliotheek, in plaats van een video
  const fotos = (req.files?.fotos || []).filter(x => x.mimetype.startsWith('image/')).map(x => x.filename);
  if (!f && !fotos.length) return res.status(400).json({ error: 'Geen video of foto ontvangen' });
  const caption = String(req.body.caption || '').slice(0, 2200);
  const hashtags = [...new Set((caption.match(/#[\p{L}0-9_]+/gu) || []).map(t => t.slice(1).toLowerCase()))];
  let sound;
  const useSound = req.body.soundId && db.videos.find(v => v.sound.id === req.body.soundId);
  const muziek = req.body.muziekId && MUZIEK.find(m => m.id === req.body.muziekId);
  if (useSound) sound = useSound.sound;
  else if (muziek) sound = { id: 'muziek-' + muziek.id, name: muziek.name + ' · FlikFlak', by: 'flikflak', file: muziek.file };
  else sound = { id: id(), name: String(req.body.soundName || '').trim() || `origineel geluid - ${req.user.username}`, by: req.user.username };
  // koppeling met ZekerFlex: een product uit de shop of een klus (alleen link + titel, geen aanroep)
  let produkt = null;
  try { const p = req.body.produkt && JSON.parse(req.body.produkt); if (p && /^https:\/\/(www\.)?zekerflex\.com\//.test(String(p.url || ''))) produkt = { titel: String(p.titel || '').slice(0, 80), url: String(p.url).slice(0, 300), soort: p.soort === 'klus' ? 'klus' : 'product' }; } catch {}
  const v = {
    id: id(), userId: req.user.id, file: f ? f.filename : null, thumb: req.files?.thumb?.[0]?.filename || fotos[0] || null,
    fotos: f ? [] : fotos,
    caption, hashtags, sound, filter: String(req.body.filter || 'none'),
    privacy: ['public', 'friends', 'private'].includes(req.body.privacy) ? req.body.privacy : 'public',
    allowComments: req.body.allowComments !== 'false', allowDuet: req.body.allowDuet !== 'false' && !!f,
    duetOf: req.body.duetOf || null, produkt,
    // inplannen: tot 30 dagen vooruit; tot dan alleen zichtbaar voor de maker
    publishAt: +req.body.publishAt > now() ? Math.min(+req.body.publishAt, now() + 30 * 864e5) : null,
    likes: [], favs: [], shares: 0, views: 0, dag: {}, created: now(), ip: clientIp(req),
  };
  v.published = !v.publishAt;
  db.videos.push(v);
  save();
  if (v.published) meldPlaatsing(v);
  res.json({ video: publicVideo(v, req.user) });
});
// meldingen voor @vermeldingen en volgers (bij een geplande post pas op het moment van plaatsen)
function meldPlaatsing(v) {
  for (const m of new Set((v.caption.match(/@([a-zA-Z0-9_.]+)/g) || []).map(x => x.slice(1)))) {
    const mu = userByName(m);
    if (mu) notify(mu.id, v.userId, 'mention', { videoId: v.id });
  }
  if (v.privacy === 'public') for (const u of db.users.filter(x => x.following.includes(v.userId))) notify(u.id, v.userId, 'post', { videoId: v.id });
}
setInterval(() => {
  let n = 0;
  for (const v of db.videos) if (!v.published && zichtbaarNu(v)) { v.published = true; v.created = now(); meldPlaatsing(v); n++; }
  if (n) save();
}, 30_000);

app.patch('/api/videos/:id', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v || v.userId !== req.user.id) return res.status(403).json({ error: 'Niet toegestaan' });
  const { privacy, allowComments, pinned, caption } = req.body;
  if (privacy) v.privacy = privacy;
  if (allowComments !== undefined) v.allowComments = !!allowComments;
  if (pinned !== undefined) v.pinned = !!pinned;
  if (caption !== undefined) {
    v.caption = String(caption).slice(0, 2200);
    v.hashtags = [...new Set((v.caption.match(/#[\p{L}0-9_]+/gu) || []).map(t => t.slice(1).toLowerCase()))];
  }
  save();
  res.json({ video: publicVideo(v, req.user) });
});

app.delete('/api/videos/:id', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v || v.userId !== req.user.id) return res.status(403).json({ error: 'Niet toegestaan' });
  removeVideo(v);
  save();
  res.json({ ok: true });
});

function toggle(arr, val) {
  const i = arr.indexOf(val);
  if (i >= 0) { arr.splice(i, 1); return false; }
  arr.push(val); return true;
}

app.post('/api/videos/:id/like', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).end();
  // force = dubbeltik: alleen liken, nooit un-liken
  let on;
  if (req.body?.force) { on = true; if (!v.likes.includes(req.user.id)) v.likes.push(req.user.id); }
  else on = toggle(v.likes, req.user.id);
  if (on && !db.notifications.some(n => n.type === 'like' && n.fromId === req.user.id && n.videoId === v.id)) notify(v.userId, req.user.id, 'like', { videoId: v.id });
  save();
  res.json({ liked: v.likes.includes(req.user.id), likes: v.likes.length });
});

app.post('/api/videos/:id/fav', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).end();
  const on = toggle(v.favs, req.user.id);
  save();
  res.json({ faved: on, favs: v.favs.length });
});

app.post('/api/videos/:id/share', (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).end();
  v.shares++;
  const to = req.body?.to && userByName(req.body.to);
  if (to && req.user) sendMessage(req.user, to, '', v.id);
  save();
  res.json({ shares: v.shares });
});

app.post('/api/videos/:id/view', (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (v) {
    v.views++;
    v.dag = v.dag || {}; v.dag[DAG()] = (v.dag[DAG()] || 0) + 1; // voor de statistieken van de maker
    if (req.user) { // kijkgeschiedenis (alleen voor jezelf zichtbaar, max 100)
      req.user.history = [{ videoId: v.id, t: now() }, ...(req.user.history || []).filter(h => h.videoId !== v.id)].slice(0, 100);
    }
    save();
  }
  res.json({ ok: true });
});

// "Niet geïnteresseerd": de video verdwijnt uit je feed en die maker telt voortaan lichter mee
app.post('/api/videos/:id/nope', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).end();
  const me = req.user;
  me.nope = me.nope || []; if (!me.nope.includes(v.id)) me.nope.push(v.id);
  me.nopeAuthors = me.nopeAuthors || {}; me.nopeAuthors[v.userId] = (me.nopeAuthors[v.userId] || 0) + 1;
  save();
  res.json({ ok: true });
});

app.post('/api/videos/:id/report', auth, (req, res) => {
  db.reports.push({ id: id(), videoId: req.params.id, by: req.user.id, reason: String(req.body?.reason || '').slice(0, 300), created: now(), ip: clientIp(req), done: false });
  save();
  res.json({ ok: true });
});

// ----- reacties -----
function publicComment(c, viewer) {
  const v = db.videos.find(x => x.id === c.videoId);
  return {
    id: c.id, text: c.text, created: c.created, parentId: c.parentId || null,
    likes: c.likes.length, liked: viewer ? c.likes.includes(viewer.id) : false,
    byCreator: v && v.userId === c.userId,
    likedByCreator: v ? c.likes.includes(v.userId) : false,
    canDelete: viewer ? viewer.id === c.userId || (v && v.userId === viewer.id) : false,
    user: publicUser(userById(c.userId), viewer),
  };
}
app.get('/api/videos/:id/comments', (req, res) => {
  const list = db.comments.filter(c => c.videoId === req.params.id)
    .sort((a, b) => (b.likes.length - a.likes.length) || (b.created - a.created));
  res.json({ comments: list.map(c => publicComment(c, req.user)) });
});
app.post('/api/videos/:id/comments', auth, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).end();
  if (!v.allowComments) return res.status(400).json({ error: 'Reacties staan uit voor deze video' });
  const text = String(req.body?.text || '').trim().slice(0, 150);
  if (!text) return res.status(400).json({ error: 'Leeg bericht' });
  const c = { id: id(), videoId: v.id, userId: req.user.id, text, parentId: req.body.parentId || null, likes: [], created: now() };
  db.comments.push(c);
  if (c.parentId) {
    const p = db.comments.find(x => x.id === c.parentId);
    if (p) notify(p.userId, req.user.id, 'reply', { videoId: v.id, text });
  }
  notify(v.userId, req.user.id, 'comment', { videoId: v.id, text });
  for (const m of new Set((text.match(/@([a-zA-Z0-9_.]+)/g) || []).map(x => x.slice(1)))) {
    const mu = userByName(m);
    if (mu) notify(mu.id, req.user.id, 'mention', { videoId: v.id, text });
  }
  save();
  res.json({ comment: publicComment(c, req.user) });
});
app.post('/api/comments/:id/like', auth, (req, res) => {
  const c = db.comments.find(x => x.id === req.params.id);
  if (!c) return res.status(404).end();
  const on = toggle(c.likes, req.user.id);
  if (on) notify(c.userId, req.user.id, 'commentlike', { videoId: c.videoId, text: c.text });
  save();
  res.json({ liked: on, likes: c.likes.length });
});
app.delete('/api/comments/:id', auth, (req, res) => {
  const c = db.comments.find(x => x.id === req.params.id);
  const v = c && db.videos.find(x => x.id === c.videoId);
  if (!c || (c.userId !== req.user.id && v?.userId !== req.user.id)) return res.status(403).end();
  db.comments = db.comments.filter(x => x.id !== c.id && x.parentId !== c.id);
  save();
  res.json({ ok: true });
});

// ----- gebruikers -----
app.get('/api/users/:username', (req, res) => {
  const u = userByName(req.params.username);
  if (!u) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  const me = req.user;
  const vids = db.videos.filter(v => v.userId === u.id && canSee(v, me))
    .sort((a, b) => (b.pinned - a.pinned) || (b.created - a.created));
  const out = { user: publicUser(u, me), videos: vids.map(v => publicVideo(v, me)) };
  const liked = db.videos.filter(v => v.likes.includes(u.id) && canSee(v, me)).sort((a, b) => b.created - a.created);
  out.liked = liked.map(v => publicVideo(v, me));
  if (me && me.id === u.id) {
    out.favorites = db.videos.filter(v => v.favs.includes(u.id) && canSee(v, me)).map(v => publicVideo(v, me));
  }
  res.json(out);
});

app.get('/api/users/:username/:list(followers|following)', (req, res) => {
  const u = userByName(req.params.username);
  if (!u) return res.status(404).end();
  const list = req.params.list === 'following' ? u.following.map(userById) : db.users.filter(x => x.following.includes(u.id));
  res.json({ users: list.filter(Boolean).map(x => publicUser(x, req.user)) });
});

app.post('/api/users/:id/follow', auth, (req, res) => {
  const u = userById(req.params.id);
  if (!u || u.id === req.user.id) return res.status(400).end();
  const on = toggle(req.user.following, u.id);
  if (on) notify(u.id, req.user.id, 'follow');
  save();
  res.json({ user: publicUser(u, req.user) });
});

app.post('/api/users/:id/block', auth, (req, res) => {
  const me = req.user;
  me.blocked = me.blocked || [];
  const on = toggle(me.blocked, req.params.id);
  if (on) me.following = me.following.filter(x => x !== req.params.id);
  save();
  res.json({ blocked: on });
});

// ----- ontdekken -----
app.get('/api/trending', (req, res) => {
  const tags = {};
  for (const v of db.videos.filter(v => v.privacy === 'public' && zichtbaarNu(v)))
    for (const t of v.hashtags) {
      tags[t] = tags[t] || { tag: t, count: 0, views: 0, videos: [] };
      tags[t].count++; tags[t].views += v.views;
      if (tags[t].videos.length < 6) tags[t].videos.push(publicVideo(v, req.user));
    }
  const hashtags = Object.values(tags).sort((a, b) => (b.views + b.count * 50) - (a.views + a.count * 50)).slice(0, 12);
  const users = db.users.filter(u => !req.user || (u.id !== req.user.id && !req.user.following.includes(u.id)))
    .map(u => publicUser(u, req.user)).sort((a, b) => b.followers - a.followers).slice(0, 10);
  res.json({ hashtags, users });
});

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().replace(/^[#@]/, '');
  if (!q) return res.json({ users: [], videos: [], hashtags: [], sounds: [] });
  const users = db.users.filter(u => u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)).slice(0, 30).map(u => publicUser(u, req.user));
  const vids = db.videos.filter(v => canSee(v, req.user) && (v.caption.toLowerCase().includes(q) || v.sound.name.toLowerCase().includes(q) || userById(v.userId)?.username.toLowerCase().includes(q)));
  const tagCount = {};
  for (const v of db.videos.filter(v => v.privacy === 'public' && zichtbaarNu(v))) for (const t of v.hashtags) if (t.includes(q)) tagCount[t] = (tagCount[t] || 0) + 1;
  const sounds = {};
  for (const v of db.videos.filter(v => v.privacy === 'public' && zichtbaarNu(v) && v.sound.name.toLowerCase().includes(q))) {
    sounds[v.sound.id] = sounds[v.sound.id] || { ...v.sound, count: 0, thumb: v.thumb ? '/uploads/' + v.thumb : null };
    sounds[v.sound.id].count++;
  }
  res.json({
    users,
    videos: vids.slice(0, 60).map(v => publicVideo(v, req.user)),
    hashtags: Object.entries(tagCount).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    sounds: Object.values(sounds),
  });
});

app.get('/api/tag/:tag', (req, res) => {
  const t = req.params.tag.toLowerCase();
  const vids = db.videos.filter(v => v.hashtags.includes(t) && canSee(v, req.user));
  res.json({ tag: t, views: vids.reduce((s, v) => s + v.views, 0), videos: vids.sort((a, b) => b.likes.length - a.likes.length).map(v => publicVideo(v, req.user)) });
});

app.get('/api/sound/:id', (req, res) => {
  const vids = db.videos.filter(v => v.sound.id === req.params.id && canSee(v, req.user));
  if (!vids.length) return res.status(404).json({ error: 'Geluid niet gevonden' });
  const orig = vids.slice().sort((a, b) => a.created - b.created)[0];
  res.json({ sound: vids[0].sound, original: publicVideo(orig, req.user), videos: vids.map(v => publicVideo(v, req.user)) });
});

// ----- meldingen -----
app.get('/api/notifications', auth, (req, res) => {
  const list = db.notifications.filter(n => n.userId === req.user.id).sort((a, b) => b.created - a.created).slice(0, 100);
  res.json({ notifications: list.map(n => publicNotif(n, req.user)) });
});
app.post('/api/notifications/read', auth, (req, res) => {
  db.notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; });
  save();
  res.json({ ok: true });
});

// ----- berichten -----
function sendMessage(from, to, text, videoId = null) {
  const m = { id: id(), from: from.id, to: to.id, text, videoId, created: now(), read: false };
  db.messages.push(m);
  save();
  const pm = publicMessage(m);
  push(to.id, { type: 'message', message: pm, from: publicUser(from, to) });
  push(from.id, { type: 'message', message: pm, from: publicUser(from, from) });
  return pm;
}
function publicMessage(m) {
  const v = m.videoId && db.videos.find(x => x.id === m.videoId);
  return { ...m, video: v ? { id: v.id, thumb: v.thumb ? '/uploads/' + v.thumb : null, caption: v.caption } : null };
}
app.get('/api/conversations', auth, (req, res) => {
  const me = req.user.id;
  const convos = {};
  for (const m of db.messages.filter(m => m.from === me || m.to === me)) {
    const other = m.from === me ? m.to : m.from;
    if (!convos[other] || convos[other].last.created < m.created) convos[other] = { ...(convos[other] || { unread: 0 }), last: publicMessage(m) };
    if (m.to === me && !m.read) convos[other].unread = (convos[other].unread || 0) + 1;
  }
  res.json({
    conversations: Object.entries(convos).map(([uid, c]) => ({ user: publicUser(userById(uid), req.user), ...c }))
      .filter(c => c.user).sort((a, b) => b.last.created - a.last.created),
  });
});
app.get('/api/messages/:username', auth, (req, res) => {
  const other = userByName(req.params.username);
  if (!other) return res.status(404).end();
  const me = req.user.id;
  const list = db.messages.filter(m => (m.from === me && m.to === other.id) || (m.from === other.id && m.to === me));
  list.forEach(m => { if (m.to === me) m.read = true; });
  save();
  res.json({ user: publicUser(other, req.user), messages: list.map(publicMessage) });
});
app.post('/api/messages/:username', auth, (req, res) => {
  const other = userByName(req.params.username);
  if (!other) return res.status(404).end();
  if (other.blocked?.includes(req.user.id)) return res.status(403).json({ error: 'Je kunt deze persoon geen berichten sturen' });
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text && !req.body?.videoId) return res.status(400).end();
  res.json({ message: sendMessage(req.user, other, text, req.body?.videoId || null) });
});

// ----- LIVE -----
function publicLive(l, viewer) {
  return { id: l.id, title: l.title, started: l.started, viewers: l.viewers.size, likes: l.likes, host: publicUser(userById(l.hostId), viewer) };
}
app.get('/api/lives', (req, res) => {
  const list = [...lives.values()].map(l => publicLive(l, req.user)).sort((a, b) => b.viewers - a.viewers);
  res.json({ lives: list });
});
app.get('/api/lives/:id', (req, res) => {
  const l = lives.get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Deze LIVE is afgelopen' });
  res.json({ live: publicLive(l, req.user) });
});

// ----- meer: muziek, collecties, challenges, statistieken, kijkgeschiedenis, deel-voorbeeld -----
app.get('/api/muziek', (req, res) => res.json({ muziek: MUZIEK }));

// Collecties: eigen mappen met bewaarde video's (alleen jij ziet ze)
const myCollections = u => (u.collections = u.collections || []);
const pubCollection = (c, me) => {
  const vids = c.videoIds.map(vid => db.videos.find(v => v.id === vid)).filter(v => v && canSee(v, me));
  return { id: c.id, name: c.name, count: vids.length, thumb: vids[0]?.thumb ? '/uploads/' + vids[0].thumb : null, videoIds: c.videoIds };
};
app.get('/api/collections', auth, (req, res) => res.json({ collections: myCollections(req.user).map(c => pubCollection(c, req.user)) }));
app.post('/api/collections', auth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Geef de map een naam' });
  const c = { id: id(), name, videoIds: [], created: now() };
  myCollections(req.user).push(c); save();
  res.json({ collection: pubCollection(c, req.user) });
});
app.post('/api/collections/:id/toggle', auth, (req, res) => {
  const c = myCollections(req.user).find(x => x.id === req.params.id);
  if (!c) return res.status(404).end();
  const on = toggle(c.videoIds, String(req.body?.videoId || ''));
  save();
  res.json({ in: on, collection: pubCollection(c, req.user) });
});
app.delete('/api/collections/:id', auth, (req, res) => {
  req.user.collections = myCollections(req.user).filter(x => x.id !== req.params.id); save();
  res.json({ ok: true });
});
app.get('/api/collections/:id', auth, (req, res) => {
  const c = myCollections(req.user).find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Map niet gevonden' });
  const videos = c.videoIds.map(vid => db.videos.find(v => v.id === vid)).filter(v => v && canSee(v, req.user)).map(v => publicVideo(v, req.user));
  res.json({ collection: pubCollection(c, req.user), videos });
});

// Challenges: een hashtag met een titel, uitleg en einddatum; meedoen = een video met die tag
const pubChallenge = (c, me) => {
  const vids = db.videos.filter(v => v.hashtags.includes(c.tag) && canSee(v, me) && v.created >= c.created);
  return { id: c.id, tag: c.tag, title: c.title, desc: c.desc, ends: c.ends, created: c.created, by: publicUser(userById(c.by), me),
    count: vids.length, views: vids.reduce((s, v) => s + v.views, 0), done: c.ends < now(),
    top: vids.sort((a, b) => b.likes.length - a.likes.length).slice(0, 3).map(v => publicVideo(v, me)) };
};
app.get('/api/challenges', (req, res) => {
  const list = db.challenges.map(c => pubChallenge(c, req.user)).sort((a, b) => (a.done - b.done) || (b.count - a.count) || (b.created - a.created));
  res.json({ challenges: list });
});
app.post('/api/challenges', auth, (req, res) => {
  const tag = String(req.body?.tag || '').trim().replace(/^#/, '').toLowerCase();
  if (!/^[\p{L}0-9_]{2,30}$/u.test(tag)) return res.status(400).json({ error: 'Hashtag: 2-30 tekens (letters, cijfers, _)' });
  if (db.challenges.some(c => c.tag === tag && c.ends > now())) return res.status(400).json({ error: 'Deze challenge loopt al' });
  const days = Math.min(60, Math.max(1, +req.body?.days || 7));
  const c = { id: id(), tag, title: String(req.body?.title || '').trim().slice(0, 60) || '#' + tag, desc: String(req.body?.desc || '').trim().slice(0, 300), by: req.user.id, created: now(), ends: now() + days * 864e5 };
  db.challenges.push(c); save();
  res.json({ challenge: pubChallenge(c, req.user) });
});
app.get('/api/challenges/:tag', (req, res) => {
  const tag = String(req.params.tag).toLowerCase();
  const c = db.challenges.filter(x => x.tag === tag).sort((a, b) => b.created - a.created)[0];
  if (!c) return res.status(404).json({ error: 'Challenge niet gevonden' });
  const vids = db.videos.filter(v => v.hashtags.includes(tag) && canSee(v, req.user) && v.created >= c.created).sort((a, b) => b.likes.length - a.likes.length);
  const makers = {};
  for (const v of vids) { const k = v.userId; makers[k] = makers[k] || { user: publicUser(userById(k), req.user), likes: 0, videos: 0 }; makers[k].likes += v.likes.length; makers[k].videos++; }
  res.json({ challenge: pubChallenge(c, req.user), videos: vids.map(v => publicVideo(v, req.user)), makers: Object.values(makers).sort((a, b) => b.likes - a.likes).slice(0, 10) });
});

// Statistieken voor de maker: totalen, weergaven per dag (14 dagen), per video
app.get('/api/stats', auth, (req, res) => {
  const me = req.user, vids = db.videos.filter(v => v.userId === me.id);
  const dagen = [...Array(14)].map((_, i) => new Date(now() - (13 - i) * 864e5).toISOString().slice(0, 10));
  const perDag = dagen.map(d => ({ dag: d, views: vids.reduce((s, v) => s + (v.dag?.[d] || 0), 0) }));
  const tel = (f) => vids.reduce((s, v) => s + f(v), 0);
  res.json({
    followers: db.users.filter(x => x.following.includes(me.id)).length, following: me.following.length,
    totals: { videos: vids.length, views: tel(v => v.views), likes: tel(v => v.likes.length), comments: tel(v => db.comments.filter(c => c.videoId === v.id).length), shares: tel(v => v.shares), favs: tel(v => v.favs.length) },
    perDag,
    videos: vids.map(v => ({ id: v.id, caption: v.caption, thumb: v.thumb ? '/uploads/' + v.thumb : null, views: v.views, likes: v.likes.length, comments: db.comments.filter(c => c.videoId === v.id).length, shares: v.shares, created: v.created })).sort((a, b) => b.views - a.views),
  });
});

// Kijkgeschiedenis (alleen van jezelf)
app.get('/api/history', auth, (req, res) => {
  const videos = (req.user.history || []).map(h => db.videos.find(v => v.id === h.videoId)).filter(v => v && canSee(v, req.user)).map(v => publicVideo(v, req.user));
  res.json({ videos });
});
app.delete('/api/history', auth, (req, res) => { req.user.history = []; save(); res.json({ ok: true }); });

// Deel-link met voorbeeld (titel, foto, video) voor WhatsApp/social; stuurt de bezoeker door naar de app
app.get('/s/:id', (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  const e = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const base = `${req.protocol}://${req.get('host')}`;
  const title = v ? `${userById(v.userId)?.name || 'FlikFlak'} op FlikFlak` : 'FlikFlak';
  const desc = v ? (v.caption || 'Bekijk deze video op FlikFlak') : 'Korte video\'s: swipen, liken, reageren, chatten en live gaan.';
  const img = v?.thumb ? `${base}/uploads/${v.thumb}` : `${base}/iconen/512.png`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${e(title)}</title>
<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}"><meta property="og:image" content="${e(img)}"><meta property="og:type" content="${v?.file ? 'video.other' : 'website'}"><meta property="og:url" content="${base}/s/${e(req.params.id)}">${v?.file && v.privacy === 'public' ? `<meta property="og:video" content="${base}/uploads/${e(v.file)}">` : ''}
<meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=/#/v/${e(req.params.id)}"></head><body style="background:#000;color:#fff;font-family:system-ui;text-align:center;padding:40px"><p>Even geduld… <a href="/#/v/${e(req.params.id)}" style="color:#ff7a1a">Open in FlikFlak</a></p></body></html>`);
});

// ----- beheer / moderatie (openlijk gemeld in de huisregels) -----
// Alleen bereikbaar met het geheime token (FF_ADMIN_TOKEN). Zonder token: dicht.
function adminOk(req) {
  if (!ADMIN_TOKEN) return false;
  const given = String(req.headers['x-admin'] || req.query.token || '');
  if (given.length !== ADMIN_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(ADMIN_TOKEN)); } catch { return false; }
}
const admin = (req, res, next) => (adminOk(req) ? next() : res.status(401).json({ error: 'Geen toegang' }));

function removeVideo(v) {
  db.videos = db.videos.filter(x => x !== v);
  db.comments = db.comments.filter(c => c.videoId !== v.id);
  db.notifications = db.notifications.filter(n => n.videoId !== v.id);
  for (const u of db.users) for (const c of u.collections || []) c.videoIds = c.videoIds.filter(x => x !== v.id);
  for (const file of [v.file, v.thumb, ...(v.fotos || [])]) if (file) fs.rm(path.join(UPLOADS, file), () => {});
}

app.get('/api/admin/overzicht', admin, (req, res) => {
  const vid = v => ({ id: v.id, caption: v.caption, thumb: v.thumb ? '/uploads/' + v.thumb : null, url: v.file ? '/uploads/' + v.file : (v.fotos?.[0] ? '/uploads/' + v.fotos[0] : '#'), views: v.views, likes: v.likes.length, created: v.created, ip: v.ip || null, author: userById(v.userId)?.username || '?' });
  const reports = db.reports.slice().sort((a, b) => (a.done - b.done) || (b.created - a.created)).slice(0, 200).map(r => {
    const v = db.videos.find(x => x.id === r.videoId);
    return { id: r.id, reason: r.reason, created: r.created, done: !!r.done, ip: r.ip || null, reporter: userById(r.by)?.username || '?', video: v ? vid(v) : { id: r.videoId, weg: true } };
  });
  const users = db.users.slice().sort((a, b) => b.created - a.created).slice(0, 100).map(u => ({
    id: u.id, username: u.username, name: u.name, created: u.created, ip: u.ip || null, lastIp: u.lastIp || null, lastSeen: u.lastSeen || null,
    videos: db.videos.filter(v => v.userId === u.id).length,
  }));
  const videos = db.videos.slice().sort((a, b) => b.created - a.created).slice(0, 100).map(vid);
  res.json({
    stats: {
      users: db.users.length, videos: db.videos.length, comments: db.comments.length,
      reportsOpen: db.reports.filter(r => !r.done).length, views: db.videos.reduce((s, v) => s + v.views, 0),
    },
    reports, users, videos,
  });
});

app.post('/api/admin/report/:id/klaar', admin, (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (r) { r.done = true; save(); }
  res.json({ ok: true });
});

app.delete('/api/admin/video/:id', admin, (req, res) => {
  const v = db.videos.find(x => x.id === req.params.id);
  if (v) { removeVideo(v); save(); }
  res.json({ ok: true });
});

app.delete('/api/admin/user/:id', admin, (req, res) => {
  const u = userById(req.params.id);
  if (!u) return res.json({ ok: true });
  for (const v of db.videos.filter(v => v.userId === u.id)) removeVideo(v);
  db.users = db.users.filter(x => x.id !== u.id);
  db.comments = db.comments.filter(c => c.userId !== u.id);
  for (const t of Object.keys(db.sessions)) if (db.sessions[t] === u.id) delete db.sessions[t];
  save();
  res.json({ ok: true });
});

app.get('/beheer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'beheer.html')));

app.get(/^\/(?!api|uploads|ws|s\/).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- realtime ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map(); // userId -> Set<ws>
const conns = new Map();   // connId -> ws (ook gasten)
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function push(userId, msg) {
  const set = sockets.get(userId);
  if (set) for (const ws of set) send(ws, msg);
}
function liveCast(l, msg) {
  send(conns.get(l.hostConn), msg);
  for (const c of l.viewers) send(conns.get(c), msg);
}
const miniUser = u => u ? { id: u.id, username: u.username, name: u.name, avatar: u.avatar } : null;
const GIFTS = { roos: '🌹', hart: '💖', feest: '🎉', leeuw: '🦁', raket: '🚀', kroon: '👑' };

function endLive(l) {
  liveCast(l, { type: 'live:ended', likes: l.likes, peak: l.peak, duration: now() - l.started });
  for (const c of l.viewers) { const w = conns.get(c); if (w) w.liveId = null; }
  const host = conns.get(l.hostConn); if (host) host.hostingLive = null;
  lives.delete(l.id);
}
function leaveLive(ws) {
  const l = lives.get(ws.liveId);
  ws.liveId = null;
  if (!l || !l.viewers.delete(ws.connId)) return;
  send(conns.get(l.hostConn), { type: 'live:viewer-left', conn: ws.connId });
  liveCast(l, { type: 'live:count', viewers: l.viewers.size });
}

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const uid = db.sessions[token] || null; // zonder account = gast (mag LIVE kijken)
  ws.connId = id(); ws.uid = uid;
  conns.set(ws.connId, ws);
  if (uid) {
    if (!sockets.has(uid)) sockets.set(uid, new Set());
    sockets.get(uid).add(ws);
  }
  send(ws, { type: 'hello', conn: ws.connId });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const me = uid && userById(uid);
    if (m.type === 'typing' && me) { const o = userByName(m.to); if (o) push(o.id, { type: 'typing', from: me.username }); }

    if (m.type === 'live:start' && me) {
      for (const l of [...lives.values()]) if (l.hostId === uid) endLive(l);
      const l = { id: id(), hostId: uid, hostConn: ws.connId, title: String(m.title || '').trim().slice(0, 60) || `${me.name} is LIVE`, started: now(), viewers: new Set(), likes: 0, peak: 0, pinned: '', banned: new Set() };
      lives.set(l.id, l);
      ws.hostingLive = l.id;
      send(ws, { type: 'live:started', live: publicLive(l, me) });
      for (const f of db.users.filter(x => x.following.includes(uid))) notify(f.id, uid, 'live', { liveId: l.id, text: l.title });
    }
    if (m.type === 'live:end' && ws.hostingLive) { const l = lives.get(ws.hostingLive); if (l) endLive(l); }
    if (m.type === 'live:join') {
      const l = lives.get(m.liveId);
      if (!l) return send(ws, { type: 'live:ended', missing: true });
      if (ws.liveId) leaveLive(ws);
      if (l.hostId === uid) return;
      if (l.banned.has(uid || ws.connId)) return send(ws, { type: 'live:kicked' }); // door de maker verwijderd: niet opnieuw binnen
      ws.liveId = l.id; l.viewers.add(ws.connId);
      l.peak = Math.max(l.peak, l.viewers.size);
      send(ws, { type: 'live:joined', live: publicLive(l, me), hostConn: l.hostConn });
      if (l.pinned) send(ws, { type: 'live:pin', text: l.pinned });
      send(conns.get(l.hostConn), { type: 'live:viewer', conn: ws.connId });
      liveCast(l, { type: 'live:count', viewers: l.viewers.size });
      liveCast(l, { type: 'live:system', text: `${me ? me.name || me.username : 'Een gast'} is erbij gekomen 👋` });
    }
    if (m.type === 'live:leave') leaveLive(ws);
    if (m.type === 'live:signal') {
      const target = conns.get(m.to);
      if (target) send(target, { type: 'live:signal', from: ws.connId, data: m.data });
    }
    const l = lives.get(ws.liveId || ws.hostingLive);
    if (!l) return;
    if (m.type === 'live:chat' && me) {
      const text = String(m.text || '').trim().slice(0, 150);
      if (text) liveCast(l, { type: 'live:chat', user: miniUser(me), host: uid === l.hostId, text, conn: ws.connId });
    }
    // alleen de maker: een bericht vastpinnen (leeg = losmaken) en een kijker verwijderen
    if (m.type === 'live:pin' && uid === l.hostId) { l.pinned = String(m.text || '').trim().slice(0, 150); liveCast(l, { type: 'live:pin', text: l.pinned }); }
    if (m.type === 'live:kick' && uid === l.hostId) {
      const target = conns.get(m.conn);
      if (target && l.viewers.has(target.connId)) {
        l.banned.add(target.uid || target.connId);
        send(target, { type: 'live:kicked' }); leaveLive(target);
        liveCast(l, { type: 'live:system', text: 'De maker heeft een kijker verwijderd' });
      }
    }
    if (m.type === 'live:like') {
      l.likes += Math.min(50, Math.max(1, m.n | 0));
      liveCast(l, { type: 'live:likes', likes: l.likes, n: Math.min(50, Math.max(1, m.n | 0)), conn: ws.connId });
    }
    if (m.type === 'live:gift' && me && GIFTS[m.gift]) liveCast(l, { type: 'live:gift', user: miniUser(me), gift: m.gift, emoji: GIFTS[m.gift] });
  });
  ws.on('close', () => {
    if (uid) sockets.get(uid)?.delete(ws);
    conns.delete(ws.connId);
    if (ws.liveId) leaveLive(ws);
    if (ws.hostingLive) { const l = lives.get(ws.hostingLive); if (l) endLive(l); }
  });
});

server.listen(PORT, () => console.log(`FlikFlak draait op http://localhost:${PORT}`));
