/**
 * Liens TikTok : extraction depuis un texte collé (message Discord…),
 * identifiant de vidéo, et récupération des infos (titre, auteur) via le
 * serveur (/api/meta), qui lit la page TikTok.
 */

const TIKTOK_URL = /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\/[^\s<>"')\]]+/gi;

export function isTikTokHost(hostname = '') {
  const host = String(hostname).toLowerCase();
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

/** Tous les liens TikTok d'un texte, sans doublons ni paramètres de suivi. */
export function extractTikTokUrls(text = '') {
  const seen = new Set();
  const urls = [];
  for (const [raw] of String(text || '').matchAll(TIKTOK_URL)) {
    const url = cleanTikTokUrl(raw);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export function cleanTikTokUrl(raw = '') {
  try {
    const url = new URL(String(raw).trim().replace(/[.,;:!?]+$/, ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!isTikTokHost(url.hostname)) return '';
    url.protocol = 'https:';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

/** Identifiant numérique d'une vidéo, ou '' pour un lien court (vm.tiktok.com/…). */
export function videoIdFromUrl(raw = '') {
  const match = /\/(?:video|photo|v)\/(\d{8,25})/.exec(String(raw)) || /[?&]item_id=(\d{8,25})/.exec(String(raw));
  return match ? match[1] : '';
}

export const authorFromUrl = raw => (/tiktok\.com\/@([^/?#]+)/i.exec(String(raw)) || [])[1] || '';

export const canonicalUrl = (videoId, author = '') =>
  videoId && author ? `https://www.tiktok.com/@${author}/video/${videoId}` : '';

export const embedUrl = videoId =>
  `https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?description=1&music_info=0&rel=0&autoplay=1`;

/**
 * Infos d'une vidéo via le serveur (qui lit la page TikTok). Ne lève jamais :
 * renvoie au minimum ce que l'URL contient.
 * @returns {Promise<{ url, videoId, author, description, existingId, source }>}
 */
export async function fetchTikTokMeta(rawUrl) {
  const url = cleanTikTokUrl(rawUrl);
  const base = { url, videoId:videoIdFromUrl(url), author:authorFromUrl(url), description:'', existingId:'', source:'url' };
  if (!url) return base;
  try {
    const response = await fetch(`/api/meta?url=${encodeURIComponent(url)}`, { signal:AbortSignal.timeout(20_000) });
    if (!response.ok) return base;
    const meta = await response.json();
    if (!meta?.videoId) return base;
    return {
      url:meta.url || canonicalUrl(meta.videoId, meta.author) || url,
      videoId:String(meta.videoId),
      author:meta.author || base.author,
      description:meta.description || '',
      existingId:meta.existingId || '',
      source:'server',
    };
  } catch {
    return base;
  }
}
