/**
 * Lecture des infos publiques d'un TikTok (titre, auteur, couverture) depuis
 * la page de la vidéo. Seuls les hôtes *.tiktok.com sont suivis, y compris
 * dans les redirections des liens courts (vm.tiktok.com/…).
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_REDIRECTS = 5;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hostMatches = (hostname, hosts) => hosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
export const isTikTokUrl = url => (url.protocol === 'https:' || url.protocol === 'http:') && hostMatches(url.hostname.toLowerCase(), ['tiktok.com']);

export function videoIdFromUrl(raw = '') {
  const match = /\/(?:video|photo|v)\/(\d{8,25})/.exec(String(raw));
  return match ? match[1] : '';
}

/** Extrait la vidéo des données embarquées dans la page TikTok. */
export function extractItem(html = '') {
  const scripts = [
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
    /<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
  ];
  for (const pattern of scripts) {
    const match = pattern.exec(html);
    if (!match) continue;
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
      || Object.values(data?.ItemModule || {})[0];
    if (item?.id) return item;
  }
  return null;
}

export function itemToMeta(item) {
  const author = typeof item.author === 'string' ? item.author : item.author?.uniqueId || '';
  const nickname = typeof item.author === 'string' ? item.nickname || '' : item.author?.nickname || '';
  return {
    videoId:String(item.id),
    author,
    nickname,
    description:String(item.desc || ''),
    hashtags:(item.textExtra || item.challenges || []).map(tag => tag.hashtagName || tag.title).filter(Boolean),
    createTime:Number(item.createTime) || 0,
    cover:item.video?.cover || item.video?.originCover || item.video?.dynamicCover || '',
  };
}

/** Suit les redirections à la main pour ne jamais quitter tiktok.com. */
async function fetchTikTokPage(rawUrl, fetchImpl) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isTikTokUrl(url)) throw new HttpError(400, 'Lien hors de tiktok.com');
    url.protocol = 'https:';
    const response = await fetchImpl(url.href, {
      redirect:'manual',
      signal:AbortSignal.timeout(15_000),
      headers:{ 'User-Agent':USER_AGENT, 'Accept-Language':'fr-FR,fr;q=0.9,en;q=0.8', Accept:'text/html' },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new HttpError(502, `TikTok a répondu ${response.status}`);
    return { html:await response.text(), finalUrl:url.href };
  }
  throw new HttpError(502, 'Trop de redirections');
}

/** @returns {Promise<{ videoId, author, nickname, description, hashtags, createTime, cover, url }>} */
export async function getMeta(rawUrl, fetchImpl = fetch) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { throw new HttpError(400, 'Lien invalide'); }
  if (!isTikTokUrl(url)) throw new HttpError(400, 'Lien hors de tiktok.com');
  const { html, finalUrl } = await fetchTikTokPage(url.href, fetchImpl);
  const item = extractItem(html);
  if (!item) {
    const videoId = videoIdFromUrl(finalUrl);
    if (!videoId) throw new HttpError(404, 'Vidéo introuvable');
    const author = (/\/@([^/?#]+)/.exec(finalUrl) || [])[1] || '';
    return { videoId, author, nickname:'', description:'', hashtags:[], createTime:0, cover:'', url:finalUrl.split('?')[0] };
  }
  const meta = itemToMeta(item);
  return { ...meta, url:meta.author ? `https://www.tiktok.com/@${meta.author}/video/${meta.videoId}` : finalUrl.split('?')[0] };
}
