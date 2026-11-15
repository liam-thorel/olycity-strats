/**
 * Connexion du compte TikTok dédié, à lancer sur ton PC (une fois, puis quand
 * la session expire) :  cd inbox && npm install && node login.mjs
 *
 * Ouvre Edge sur la page de connexion TikTok : tu te connectes toi-même avec le
 * compte dédié (ce script ne voit ni ne tape jamais le mot de passe). Dès que
 * TikTok a ouvert la session, le script l'enregistre dans inbox/tiktok-state.json
 * (cookies de session : à garder secret, jamais dans git), à envoyer ensuite sur
 * le mini PC :
 *   scp inbox/tiktok-state.json root@ak1:/root/olycity-strats/data/tiktok-state.json
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = fileURLToPath(new URL('./tiktok-state.json', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch({ channel:'msedge', headless:false });
const context = await browser.newContext({ locale:'fr-FR', viewport:null });
const page = await context.newPage();
await page.goto('https://www.tiktok.com/login');
console.log('Connecte-toi avec le compte TikTok dédié dans la fenêtre Edge qui vient de s’ouvrir…');

const deadline = Date.now() + 15 * 60_000;
let connected = false;
while (Date.now() < deadline && browser.isConnected()) {
  const cookies = await context.cookies('https://www.tiktok.com').catch(() => []);
  if (cookies.some(cookie => cookie.name === 'sessionid' && cookie.value)) { connected = true; break; }
  await sleep(2000);
}
if (!connected) {
  console.log('Pas de connexion détectée (fenêtre fermée ou 15 min écoulées).');
  await browser.close().catch(() => {});
  process.exit(1);
}

// Passer par la messagerie pour que la session ait tout ce qu'il faut pour l'ouvrir.
await page.goto('https://www.tiktok.com/messages');
await sleep(5000);
await context.storageState({ path:OUT });
console.log(`Session enregistrée : ${OUT}`);
await browser.close();
