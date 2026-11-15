/**
 * Serveur OLYCITY Strats (mini PC) : sert le site, la connexion Discord,
 * l'API des strats, les copies des vidéos, et télécharge les TikToks.
 * Node natif, sans dépendance. Configuration : variables d'environnement (.env).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth, parseCookies } from './auth.mjs';
import { DiscordWatcher } from './discord-watch.mjs';
import { Downloader, mediaPath } from './downloader.mjs';
import { Store, isTikTokUrl } from './store.mjs';
import { HttpError, getMeta } from './tiktok-page.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');

export function loadConfig(env = process.env) {
  const config = {
    PORT:Number(env.PORT || 3100),
    PUBLIC_URL:String(env.PUBLIC_URL || 'http://localhost:3100').replace(/\/+$/, ''),
    DATA_DIR:resolve(env.DATA_DIR || join(ROOT, 'data')),
    DISCORD_CLIENT_ID:env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET:env.DISCORD_CLIENT_SECRET || '',
    DISCORD_GUILD_ID:env.DISCORD_GUILD_ID || '',
    SESSION_DAYS:Number(env.SESSION_DAYS || 30),
    RECHECK_HOURS:Number(env.RECHECK_HOURS || 6),
    DEV_LOGIN:env.DEV_LOGIN === '1',
    YT_DLP:env.YT_DLP || 'yt-dlp',
    // Salon Discord surveillé (facultatif) : jeton d'un bot avec l'intent Message Content.
    DISCORD_BOT_TOKEN:env.DISCORD_BOT_TOKEN || '',
    DISCORD_STRATS_CHANNEL_ID:env.DISCORD_STRATS_CHANNEL_ID || '',
  };
  if (config.DEV_LOGIN && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.PUBLIC_URL)) {
    throw new Error('DEV_LOGIN=1 n’est autorisé qu’en local.');
  }
  if (!config.DEV_LOGIN && (!config.DISCORD_CLIENT_ID || !config.DISCORD_CLIENT_SECRET || !config.DISCORD_GUILD_ID)) {
    throw new Error('DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET et DISCORD_GUILD_ID sont obligatoires.');
  }
  return config;
}

const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.webmanifest':'application/manifest+json', '.mp4':'video/mp4', '.json':'application/json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':[
    "default-src 'self'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "media-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "frame-src https://www.tiktok.com",
    "connect-src 'self' https://www.tiktok.com",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type':typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    ...headers,
  });
  res.end(payload);
}

function redirect(res, location, setCookie) {
  res.writeHead(302, { Location:location, 'Cache-Control':'no-store', ...(setCookie ? { 'Set-Cookie':setCookie } : {}) });
  res.end();
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Requête trop grosse');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'JSON invalide'); }
}

/** Fichier avec prise en charge de Range (lecture vidéo et avance rapide). */
function sendFile(req, res, file, { cache = 'no-cache', extraHeaders = {} } = {}) {
  let stats;
  try { stats = statSync(file); } catch { return send(res, 404, 'Introuvable'); }
  if (!stats.isFile()) return send(res, 404, 'Introuvable');
  const type = TYPES[extname(file)] || 'application/octet-stream';
  const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  const headers = { ...SECURITY_HEADERS, 'Content-Type':type, 'Cache-Control':cache, ETag:etag, 'Accept-Ranges':'bytes', ...extraHeaders };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stats.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stats.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stats.size - 1);
    if (start > end) {
      res.writeHead(416, { ...headers, 'Content-Range':`bytes */${stats.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range':`bytes ${start}-${end}/${stats.size}`, 'Content-Length':end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length':stats.size });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(file).pipe(res);
}

function publicItem(item) {
  const { video = {} } = item;
  return {
    ...item,
    transcript:item.transcript || '',
    auto:item.auto || [],
    video:{ status:video.status || 'none', error:video.error || '', cover:Boolean(video.cover), size:video.size || 0, v:video.coverAt || video.at || 0 },
  };
}

export function createApp(config, { fetchImpl = fetch, log = console } = {}) {
  const store = new Store(config.DATA_DIR);
  const auth = new Auth(config, fetchImpl);
  const downloader = new Downloader(store, { ytDlp:config.YT_DLP, log });
  const origin = new URL(config.PUBLIC_URL).origin;
  const streams = new Set();

  const snapshot = () => JSON.stringify({ items:Object.fromEntries(store.list().map(item => [item.id, publicItem(item)])) });
  let broadcastTimer = null;
  store.onChange(() => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const data = `event: strats\ndata: ${snapshot()}\n\n`;
      for (const res of streams) res.write(data);
    }, 100);
  });

  async function api(req, res, url, user) {
    const path = url.pathname;
    const method = req.method;
    const userRef = { id:user.id, name:user.name };

    if (method !== 'GET' && method !== 'HEAD' && req.headers.origin !== origin) {
      throw new HttpError(403, 'Origine refusée');
    }

    if (path === '/api/me' && method === 'GET') return send(res, 200, { user });

    if (path === '/api/strats' && method === 'GET') return send(res, 200, snapshot(), { 'Content-Type':'application/json; charset=utf-8' });

    if (path === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform',
        Connection:'keep-alive', 'X-Accel-Buffering':'no',
      });
      res.write(`retry: 3000\nevent: strats\ndata: ${snapshot()}\n\n`);
      streams.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => { clearInterval(ping); streams.delete(res); });
      return undefined;
    }

    if (path === '/api/meta' && method === 'GET') {
      const meta = await getMeta(url.searchParams.get('url'), fetchImpl);
      const existing = store.findByVideo(meta.videoId);
      return send(res, 200, { ...meta, cover:undefined, existingId:existing?.id || '' });
    }

    if (path === '/api/strats' && method === 'POST') {
      const body = await readJson(req);
      if (!isTikTokUrl(body.url)) throw new HttpError(400, 'Lien TikTok invalide');
      const videoId = /^\d{8,25}$/.test(String(body.videoId || '')) ? String(body.videoId) : '';
      const existing = store.findByVideo(videoId);
      if (existing) return send(res, 409, { error:'Ce TikTok est déjà dans la liste', id:existing.id });
      const item = store.create({ url:body.url, videoId, author:body.author }, body, userRef);
      if (videoId) downloader.enqueue(item.id);
      return send(res, 201, { item:publicItem(item) });
    }

    const match = /^\/api\/strats\/([a-z0-9]{6,40})(\/retry|\/extract)?$/.exec(path);
    if (match) {
      const [, id, action] = match;
      const retry = action === '/retry';
      if (!store.get(id)) throw new HttpError(404, 'Strat introuvable');
      if (action === '/extract' && method === 'POST') {
        const body = await readJson(req);
        const item = store.extract(id, body, userRef);
        if (!item.clipStart && !item.clipEnd) {
          store.remove(item.id);
          throw new HttpError(400, 'Choisis un début ou une fin pour l’extrait');
        }
        return send(res, 201, { item:publicItem(item) });
      }
      if (retry && method === 'POST') {
        downloader.enqueue(id, { reset:true });
        return send(res, 202, { ok:true });
      }
      if (!action && method === 'PATCH') return send(res, 200, { item:publicItem(store.update(id, await readJson(req), userRef)) });
      if (!action && method === 'DELETE') {
        const removed = store.remove(id);
        downloader.removeMedia(removed.videoId);
        return send(res, 200, { ok:true });
      }
    }
    throw new HttpError(404, 'Route inconnue');
  }

  async function handle(req, res) {
    const url = new URL(req.url, origin);
    const cookies = parseCookies(req.headers.cookie);
    const path = url.pathname;

    if (path === '/health') return send(res, 200, { ok:true });

    if (path === '/auth/login') {
      if (config.DEV_LOGIN) return redirect(res, '/', auth.devLogin());
      const { location, setCookie } = auth.loginRedirect();
      return redirect(res, location, setCookie);
    }
    if (path === '/auth/callback') {
      if (url.searchParams.get('error')) return redirect(res, '/?login=annule');
      const result = await auth.callback(url.searchParams, cookies);
      if (result.error === 'member') return redirect(res, '/?login=refuse');
      if (result.error) return redirect(res, '/?login=erreur');
      return redirect(res, '/', result.setCookie);
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin !== origin) throw new HttpError(403, 'Origine refusée');
      return send(res, 200, { ok:true }, { 'Set-Cookie':auth.logout(cookies) });
    }

    if (path.startsWith('/api/') || path.startsWith('/media/')) {
      const user = await auth.user(cookies);
      if (!user) throw new HttpError(401, 'Connexion Discord requise');
      if (path.startsWith('/api/')) return api(req, res, url, user);
      const media = /^\/media\/(\d{8,25})\.(mp4|jpg)$/.exec(path);
      if (!media || !['GET', 'HEAD'].includes(req.method)) throw new HttpError(404, 'Introuvable');
      return sendFile(req, res, mediaPath(store.mediaDir, media[1], media[2]), { cache:'private, max-age=604800' });
    }

    if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Méthode non autorisée');
    // Partages reçus (raccourci iPhone, appli Android) : on note ce qui arrive, pour diagnostiquer.
    if ((path === '/' || path === '/share') && ['add', 'url', 'text', 'title'].some(key => url.searchParams.has(key))) {
      const fields = ['add', 'url', 'text', 'title'].filter(key => url.searchParams.has(key))
        .map(key => `${key}=${JSON.stringify(url.searchParams.get(key).slice(0, 200))}`);
      log.info?.(`Partage reçu sur ${path} : ${fields.join(' ')} (${String(req.headers['user-agent'] || '').slice(0, 80)})`);
    }
    const file = normalize(join(PUBLIC_DIR, decodeURIComponent(path === '/' ? '/index.html' : path)));
    if (!file.startsWith(PUBLIC_DIR + sep) || !existsSync(file)) return sendFile(req, res, join(PUBLIC_DIR, 'index.html'));
    return sendFile(req, res, file);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(error => {
      if (res.headersSent) return res.end();
      const status = error.status || 500;
      if (status >= 500) log.error?.(error);
      return send(res, status, { error:status >= 500 && !error.status ? 'Erreur du serveur' : error.message });
    });
  });

  return { server, store, auth, downloader, flush:() => { store.file.flush(); auth.file.flush(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const app = createApp(config);
  app.downloader.start();
  if (config.DISCORD_BOT_TOKEN && config.DISCORD_STRATS_CHANNEL_ID) {
    new DiscordWatcher({
      token:config.DISCORD_BOT_TOKEN, channelId:config.DISCORD_STRATS_CHANNEL_ID,
      store:app.store, downloader:app.downloader, publicUrl:config.PUBLIC_URL, dataDir:config.DATA_DIR,
    }).start();
  }
  app.server.listen(config.PORT, () => console.log(`OLYCITY Strats sur ${config.PUBLIC_URL} (port ${config.PORT})`));
  const stop = () => {
    app.flush();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
