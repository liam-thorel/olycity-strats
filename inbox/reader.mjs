/**
 * Robot de la messagerie TikTok (conteneur « inbox » sur le mini PC).
 *
 * Toutes les ~5 minutes : ouvre la messagerie TikTok sur le web avec le compte
 * dédié (session enregistrée par login.mjs), ouvre chaque conversation privée
 * (TikTok sur le web n'affiche pas les groupes), repère les TikToks reçus et
 * les envoie au serveur des strats (/internal/ingest) au nom de l'expéditeur.
 *
 * Aucun contournement : navigateur normal, pas de résolution de captcha. Si
 * TikTok demande de se reconnecter ou bloque, le robot l'écrit dans le journal
 * et dans data/tiktok-inbox.json, puis attend.
 *
 * Variables : INGEST_TOKEN, INGEST_URL,
 * STATE_FILE, SEEN_FILE, CHROMIUM, INTERVAL_MIN, INBOX_DEBUG=1 (enregistre la
 * page pour régler le robot).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { idsFromHtml, idsFromJson, idsFromLinks, unseen, videoUrl } from './extract.mjs';

const env = process.env;
const STATE_FILE = env.STATE_FILE || '/data/tiktok-state.json';
const SEEN_FILE = env.SEEN_FILE || '/data/tiktok-inbox.json';
const INGEST_URL = env.INGEST_URL || 'http://strats:3100/internal/ingest';
const INTERVAL_MIN = Math.max(2, Number(env.INTERVAL_MIN) || 5);
const DEBUG = env.INBOX_DEBUG === '1';
const MAX_PER_RUN = 30;
const MAX_CONVERSATIONS = 25;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive:true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 1));
  renameSync(`${path}.tmp`, path);
}

function saveStatus(seen, status) {
  writeJson(SEEN_FILE, { seen:[...seen].slice(-2000), status:{ ...status, at:new Date().toISOString() } });
}

async function ingest(ids, sender = '') {
  const response = await fetch(INGEST_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.INGEST_TOKEN}` },
    body:JSON.stringify({ urls:ids.map(videoUrl), sender }),
    signal:AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Serveur des strats : HTTP ${response.status}`);
  return (await response.json()).results || [];
}

async function runOnce(seen, firstRun) {
  const browser = await chromium.launch({
    executablePath:env.CHROMIUM || '/usr/bin/chromium',
    headless:true,
    args:['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ storageState:STATE_FILE, locale:'fr-FR', viewport:{ width:1280, height:900 } });
    const page = await context.newPage();
    const fromNetwork = [];
    const debugResponses = [];
    page.on('response', async response => {
      const type = response.headers()['content-type'] || '';
      if (!/json|protobuf|octet|text/.test(type) || !/tiktok/.test(response.url())) return;
      try {
        const body = await response.text();
        const ids = idsFromJson(body);
        fromNetwork.push(...ids);
        if (DEBUG && /im|message|conversation|chat/i.test(response.url())) debugResponses.push(`${response.url()}\n${body.slice(0, 4000)}\n`);
      } catch { /* réponse illisible (binaire, redirection) */ }
    });

    await page.goto('https://www.tiktok.com/messages', { waitUntil:'domcontentloaded', timeout:60_000 });
    if (/\/login/.test(page.url())) return { ok:false, error:'Session expirée : relancer « node inbox/login.mjs » puis renvoyer la session' };
    // La liste des conversations met une vingtaine de secondes à arriver.
    await page.waitForSelector('[data-e2e="dm-new-conversation-item"]', { timeout:45_000 }).catch(() => {});
    await sleep(3000);
    if (/\/login/.test(page.url())) return { ok:false, error:'Session expirée : relancer « node inbox/login.mjs » puis renvoyer la session' };

    // TikTok sur le web n'affiche pas les groupes : on lit toutes les conversations
    // privées du compte dédié (et le groupe s'il apparaît un jour). Chaque TikTok
    // reçu devient une strat, au nom de la personne qui l'a envoyé.
    const conversations = page.locator('[data-e2e="dm-new-conversation-item"]');
    const count = Math.min(await conversations.count(), MAX_CONVERSATIONS);
    if (!count) {
      if (DEBUG) writeFileSync('/data/inbox-debug.html', await page.content());
      return { ok:true, conversations:0, found:0, added:0 };
    }
    // Ce qui est déjà dans la page avant d'ouvrir une conversation n'appartient à personne.
    const baseline = new Set([...idsFromHtml(await page.content()), ...fromNetwork]);
    let totalFound = 0;
    let added = 0;
    const debugPages = [];
    for (let index = 0; index < count; index += 1) {
      const item = conversations.nth(index);
      const sender = (await item.locator('[data-e2e="dm-new-conversation-nickname"]').innerText().catch(() => '')).trim();
      fromNetwork.length = 0;
      await item.click();
      await sleep(5000);
      // Remonter dans la conversation au premier passage, pour reprendre les partages déjà reçus.
      for (let step = 0; step < (firstRun ? 6 : 1); step += 1) {
        await page.mouse.move(900, 400);
        await page.mouse.wheel(0, -2500);
        await sleep(1500);
      }
      const links = await page.$$eval('a[href]', anchors => anchors.map(anchor => anchor.href));
      const html = await page.content();
      if (DEBUG) debugPages.push(`<!-- conversation ${index} -->\n${html}`);
      const found = [...new Set([...idsFromLinks(links), ...idsFromHtml(html), ...fromNetwork])].filter(id => !baseline.has(id));
      totalFound += found.length;
      const fresh = unseen(found, seen).slice(0, MAX_PER_RUN);
      if (!fresh.length) continue;
      const results = await ingest(fresh, sender);
      for (const id of fresh) seen.add(id);
      const addedHere = results.filter(result => result.status === 'added').length;
      added += addedHere;
      log(`${sender || 'Conversation'} : ${fresh.length} TikTok(s) repéré(s), ${addedHere} nouvelle(s) strat(s)`);
    }
    if (DEBUG) {
      writeFileSync('/data/inbox-debug.html', debugPages.join('\n'));
      writeFileSync('/data/inbox-debug-network.txt', debugResponses.join('\n----\n'));
      log(`Débogage : ${count} conversation(s) enregistrée(s) dans /data`);
    }
    await context.storageState({ path:STATE_FILE });
    return { ok:true, conversations:count, found:totalFound, added };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  if (!env.INGEST_TOKEN) {
    log('INGEST_TOKEN manquant : robot TikTok en pause.');
    for (;;) await sleep(3_600_000);
  }
  const saved = readJson(SEEN_FILE, { seen:[] });
  const seen = new Set(saved.seen || []);
  let firstRun = !saved.status;
  for (;;) {
    if (!existsSync(STATE_FILE)) {
      log(`Pas de session TikTok (${STATE_FILE}) : en attente.`);
      saveStatus(seen, { ok:false, error:'Pas encore de session TikTok' });
    } else {
      try {
        const status = await runOnce(seen, firstRun);
        if (!status.ok) log(status.error);
        saveStatus(seen, status);
        firstRun = false;
      } catch (error) {
        log(`Passage en échec : ${error.message}`);
        saveStatus(seen, { ok:false, error:error.message });
      }
    }
    // Un peu d'irrégularité : pas un passage à la seconde près.
    await sleep((INTERVAL_MIN * 60 + Math.round(Math.random() * 60)) * 1000);
  }
}

main();
