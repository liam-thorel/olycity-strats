// Configuration publique du site (aucun secret : tout est lisible par les visiteurs).
const LOCAL = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);

export const CONFIG = {
  // Worker workers/tiktok (lecture du titre et de la couverture des TikToks).
  // Vide = pas de Worker : seul l'oEmbed de TikTok est tenté, le titre se saisit à la main.
  TIKTOK_ENDPOINT: LOCAL ? 'http://127.0.0.1:8787' : 'https://olycity-tiktok.olycity.workers.dev',
  // Chemin Firebase des strats. En local on écrit à part pour ne pas polluer la vraie liste.
  DB_ROOT: LOCAL ? 'r6strats-dev' : 'r6strats',
};
