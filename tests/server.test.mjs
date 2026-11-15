import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { errorSummary } from '../server/downloader.mjs';
import { createApp, loadConfig } from '../server/index.mjs';
import { sanitizeFields } from '../server/store.mjs';

const GUILD = '343778831766913058';
const dirs = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'strats-'));
  dirs.push(dir);
  return dir;
};

/** Faux Discord : la personne connectée est membre du serveur OLYCITY, ou non. */
function fakeDiscord({ member = true } = {}) {
  return async url => {
    const href = String(url);
    if (href.endsWith('/oauth2/token')) return Response.json({ access_token:'tok', refresh_token:'ref', expires_in:604800 });
    if (href.endsWith('/users/@me')) return Response.json({ id:'111', username:'alice', global_name:'Alice', avatar:null });
    if (href.endsWith('/users/@me/guilds')) return Response.json(member ? [{ id:GUILD }] : [{ id:'999' }]);
    throw new Error(`appel inattendu ${href}`);
  };
}

function stop(app) {
  app.server.close();
  app.flush();
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function discordApp(member = true) {
  const config = loadConfig({
    PUBLIC_URL:'https://strats.olycity.fr', DATA_DIR:tempDir(),
    DISCORD_CLIENT_ID:'cid', DISCORD_CLIENT_SECRET:'secret', DISCORD_GUILD_ID:GUILD,
  });
  return createApp(config, { fetchImpl:fakeDiscord({ member }), log:{} });
}

async function loginFlow(base) {
  const start = await fetch(`${base}/auth/login`, { redirect:'manual' });
  const location = new URL(start.headers.get('location'));
  assert.equal(location.hostname, 'discord.com');
  assert.equal(location.searchParams.get('scope'), 'identify guilds');
  const state = location.searchParams.get('state');
  const stateCookie = start.headers.get('set-cookie').split(';')[0];
  return fetch(`${base}/auth/callback?code=abc&state=${state}`, { redirect:'manual', headers:{ cookie:stateCookie } });
}

const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith('strats_session='));

test('la configuration exige Discord, et DEV_LOGIN reste local', () => {
  assert.throws(() => loadConfig({ PUBLIC_URL:'https://strats.olycity.fr' }), /DISCORD/);
  assert.throws(() => loadConfig({ PUBLIC_URL:'https://strats.olycity.fr', DEV_LOGIN:'1' }), /local/);
});

test('un membre du serveur Discord se connecte et accède à l’API', async () => {
  const app = discordApp(true);
  const base = await listen(app);
  try {
    assert.equal((await fetch(`${base}/api/strats`)).status, 401);
    const callback = await loginFlow(base);
    assert.equal(callback.headers.get('location'), '/');
    const session = sessionCookie(callback);
    assert.match(session, /HttpOnly/);
    assert.match(session, /Secure/);
    const me = await fetch(`${base}/api/me`, { headers:{ cookie:session.split(';')[0] } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.name, 'Alice');
  } finally {
    stop(app);
  }
});

test('quelqu’un hors du serveur Discord est refusé', async () => {
  const app = discordApp(false);
  const base = await listen(app);
  try {
    const callback = await loginFlow(base);
    assert.equal(callback.headers.get('location'), '/?login=refuse');
    assert.equal(sessionCookie(callback), undefined);
  } finally {
    stop(app);
  }
});

test('un state OAuth falsifié est refusé', async () => {
  const app = discordApp(true);
  const base = await listen(app);
  try {
    const response = await fetch(`${base}/auth/callback?code=abc&state=faux`, { redirect:'manual', headers:{ cookie:'strats_oauth=autre' } });
    assert.equal(response.headers.get('location'), '/?login=erreur');
  } finally {
    stop(app);
  }
});

test('l’accès est coupé quand la personne quitte le serveur Discord', async () => {
  const app = discordApp(true);
  const base = await listen(app);
  try {
    const session = sessionCookie(await loginFlow(base)).split(';')[0];
    app.auth.fetch = fakeDiscord({ member:false });
    for (const stored of Object.values(app.auth.sessions)) stored.checkedAt = 0;
    assert.equal((await fetch(`${base}/api/me`, { headers:{ cookie:session } })).status, 401);
  } finally {
    stop(app);
  }
});

let dev;
let base;
let cookie;
before(async () => {
  const config = loadConfig({ PUBLIC_URL:'http://localhost:3100', DATA_DIR:tempDir(), DEV_LOGIN:'1', YT_DLP:'commande-absente-pour-les-tests' });
  dev = createApp(config, { log:{} });
  base = await listen(dev);
  cookie = (await fetch(`${base}/auth/login`, { redirect:'manual' })).headers.get('set-cookie').split(';')[0];
});
after(() => {
  if (dev) stop(dev);
  dirs.forEach(dir => rmSync(dir, { recursive:true, force:true }));
});

const call = (path, { method = 'GET', body, origin = 'http://localhost:3100' } = {}) => fetch(`${base}${path}`, {
  method,
  headers:{ cookie, origin, ...(body ? { 'content-type':'application/json' } : {}) },
  body:body ? JSON.stringify(body) : undefined,
});

test('créer, dédoublonner, modifier et supprimer une strat', async () => {
  const created = await call('/api/strats', { method:'POST', body:{
    url:'https://www.tiktok.com/@pro.r6/video/7412345678901234567', videoId:'7412345678901234567', author:'pro.r6',
    title:'Setup Bank', map:'bank', side:'def', agents:['kapkan', 'pas-un-agent'], tags:['setup'], status:'nimporte',
  } });
  assert.equal(created.status, 201);
  const { item } = await created.json();
  assert.deepEqual(item.agents, ['kapkan']);
  assert.equal(item.status, 'todo');
  assert.equal(item.addedBy.name, 'Dev local');

  const duplicate = await call('/api/strats', { method:'POST', body:{ url:'https://www.tiktok.com/@x/video/7412345678901234567', videoId:'7412345678901234567' } });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).id, item.id);

  const patched = await call(`/api/strats/${item.id}`, { method:'PATCH', body:{ notes:'Kapkan porte sous-sol', map:'pas-une-map', addedBy:{ name:'pirate' } } });
  const updated = (await patched.json()).item;
  assert.equal(updated.notes, 'Kapkan porte sous-sol');
  assert.equal(updated.map, '');
  assert.equal(updated.addedBy.name, 'Dev local');

  const list = await (await call('/api/strats')).json();
  assert.ok(list.items[item.id]);

  assert.equal((await call(`/api/strats/${item.id}`, { method:'DELETE' })).status, 200);
  assert.equal((await call(`/api/strats/${item.id}`, { method:'DELETE' })).status, 404);
});

test('les écritures depuis une autre origine sont refusées', async () => {
  const response = await call('/api/strats', { method:'POST', origin:'https://evil.com', body:{ url:'https://www.tiktok.com/@a/video/7412345678901234567' } });
  assert.equal(response.status, 403);
});

test('les liens non TikTok sont refusés', async () => {
  const response = await call('/api/strats', { method:'POST', body:{ url:'https://evil.com/video/7412345678901234567' } });
  assert.equal(response.status, 400);
});

test('les vidéos demandent une session et gèrent Range', async () => {
  writeFileSync(join(dev.store.mediaDir, '7400000000000000001.mp4'), Buffer.alloc(1000, 1));
  assert.equal((await fetch(`${base}/media/7400000000000000001.mp4`)).status, 401);
  const partial = await fetch(`${base}/media/7400000000000000001.mp4`, { headers:{ cookie, range:'bytes=100-199' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 100-199/1000');
  assert.equal((await partial.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${base}/media/..%2F..%2Fstrats.json`, { headers:{ cookie } })).status, 404);
});

test('la page est servie sans connexion (écran Discord) mais pas les fichiers du serveur', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Se connecter avec Discord/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  const escape = await fetch(`${base}/..%2Fserver%2Fauth.mjs`);
  assert.doesNotMatch(await escape.text(), /DISCORD_API/);
});

test('nettoyage des champs et résumé d’erreur yt-dlp', () => {
  assert.deepEqual(sanitizeFields({ title:'  x  ', side:'atk', bidon:1 }), { title:'x', side:'atk' });
  assert.equal(errorSummary('[tiktok] x\nERROR: [TikTok] 123: Video not available'), '[TikTok] 123: Video not available');
});

test('découpe : début et fin enregistrés, fin avant le début ignorée', async () => {
  const created = await call('/api/strats', { method:'POST', body:{
    url:'https://www.tiktok.com/@a/video/7400000000000000077', videoId:'7400000000000000077', author:'a', title:'Clip',
  } });
  const { item } = await created.json();
  assert.equal(item.clipStart, 0);
  const cut = await (await call(`/api/strats/${item.id}`, { method:'PATCH', body:{ clipStart:12.34, clipEnd:31 } })).json();
  assert.equal(cut.item.clipStart, 12.3);
  assert.equal(cut.item.clipEnd, 31);
  const wrong = await (await call(`/api/strats/${item.id}`, { method:'PATCH', body:{ clipStart:40, clipEnd:31 } })).json();
  assert.equal(wrong.item.clipStart, 40);
  assert.equal(wrong.item.clipEnd, 0);
});

test('extraire plusieurs passages d’une même vidéo en strats séparées', async () => {
  const created = await call('/api/strats', { method:'POST', body:{
    url:'https://www.tiktok.com/@a/video/7400000000000000088', videoId:'7400000000000000088', author:'a',
    title:'3 setups Banque', map:'bank', side:'def', agents:['kapkan'],
  } });
  const { item:source } = await created.json();

  const noClip = await call(`/api/strats/${source.id}/extract`, { method:'POST', body:{} });
  assert.equal(noClip.status, 400);

  const first = (await (await call(`/api/strats/${source.id}/extract`, { method:'POST', body:{ clipStart:10, clipEnd:20 } })).json()).item;
  const second = (await (await call(`/api/strats/${source.id}/extract`, { method:'POST', body:{ clipStart:25, clipEnd:40 } })).json()).item;
  assert.equal(first.videoId, source.videoId);
  assert.equal(first.map, 'bank');
  assert.deepEqual(first.agents, ['kapkan']);
  assert.equal(first.extractOf, source.id);
  assert.equal(first.title, '3 setups Banque (extrait 2)');
  assert.equal(second.title, '3 setups Banque (extrait 3)');
  assert.deepEqual([second.clipStart, second.clipEnd], [25, 40]);

  // Même vidéo : l'état de la copie et les sous-titres sont partagés.
  dev.store.setVideo(source.id, { status:'ready' });
  assert.equal(dev.store.get(second.id).video.status, 'ready');
  dev.store.applyTranscript(first.id, 'Kapkan on the CEO door');
  assert.equal(dev.store.get(source.id).transcript, 'Kapkan on the CEO door');

  // Supprimer un extrait garde la vidéo pour les autres ; le TikTok reste « déjà ajouté ».
  assert.equal((await call(`/api/strats/${first.id}`, { method:'DELETE' })).status, 200);
  const again = await call('/api/strats', { method:'POST', body:{ url:'https://www.tiktok.com/@a/video/7400000000000000088', videoId:'7400000000000000088' } });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).id, source.id);
});

test('entrée interne du robot TikTok : jeton obligatoire, jamais par le tunnel', async () => {
  const config = loadConfig({ PUBLIC_URL:'http://localhost:3100', DATA_DIR:tempDir(), DEV_LOGIN:'1', INGEST_TOKEN:'secret-de-test' });
  const page = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__:{ 'webapp.video-detail':{ itemInfo:{ itemStruct:{
    id:'7400000000000000099', desc:'Setup Mira cocktail #r6', author:{ uniqueId:'pro' },
  } } } } })}</script>`;
  const app = createApp(config, { log:{}, fetchImpl:async () => new Response(page, { status:200 }) });
  app.downloader.enqueue = () => {};
  const url = await listen(app);
  const ingest = (headers, body = { urls:['https://www.tiktok.com/@i/video/7400000000000000099'], sender:'Nico' }) =>
    fetch(`${url}/internal/ingest`, { method:'POST', headers:{ 'content-type':'application/json', ...headers }, body:JSON.stringify(body) });
  try {
    assert.equal((await ingest({})).status, 401);
    assert.equal((await ingest({ authorization:'Bearer faux' })).status, 401);
    assert.equal((await ingest({ authorization:'Bearer secret-de-test', 'cf-connecting-ip':'1.2.3.4' })).status, 404);
    const ok = await (await ingest({ authorization:'Bearer secret-de-test' })).json();
    assert.equal(ok.results[0].status, 'added');
    const item = app.store.get(ok.results[0].id);
    assert.equal(item.map, 'kafe');
    assert.equal(item.addedBy.name, 'Nico (groupe TikTok)');
    const again = await (await ingest({ authorization:'Bearer secret-de-test' })).json();
    assert.equal(again.results[0].status, 'exists');
  } finally {
    stop(app);
  }
});
