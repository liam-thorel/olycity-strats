/**
 * Liens TikTok : extraction depuis un texte collé (message Discord…),
 * identifiant de vidéo, et récupération des infos (titre, auteur) via le
 * Worker `workers/tiktok`, avec l'oEmbed public de TikTok en secours.
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

async function getJson(url, timeoutMs = 12_000) {
  const response = await fetch(url, { signal:AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Infos d'une vidéo. Ne lève jamais : renvoie au minimum ce que l'URL contient.
 * @returns {Promise<{ url:string, videoId:string, author:string, description:string, source:string }>}
 */
export async function fetchTikTokMeta(rawUrl, endpoint = '') {
  const url = cleanTikTokUrl(rawUrl);
  const base = { url, videoId:videoIdFromUrl(url), author:authorFromUrl(url), description:'', source:'url' };
  if (!url) return base;

  if (endpoint) {
    try {
      const meta = await getJson(`${endpoint.replace(/\/$/, '')}/meta?url=${encodeURIComponent(url)}`);
      if (meta?.videoId) {
        return {
          url:canonicalUrl(meta.videoId, meta.author) || url,
          videoId:String(meta.videoId),
          author:meta.author || base.author,
          description:meta.description || '',
          source:'worker',
        };
      }
    } catch { /* on tente l'oEmbed */ }
  }

  try {
    const oembed = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, 8_000);
    const videoId = String(oembed?.embed_product_id || '') || base.videoId;
    const author = oembed?.author_unique_id || base.author;
    return {
      url:canonicalUrl(videoId, author) || url,
      videoId,
      author,
      description:oembed?.title || '',
      source:'oembed',
    };
  } catch {
    return base;
  }
}
