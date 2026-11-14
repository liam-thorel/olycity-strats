/**
 * Worker `olycity-tiktok` : lit les infos publiques d'un TikTok pour
 * strats.olycity.fr (le navigateur ne peut pas lire la page TikTok lui-même).
 *
 *   GET /meta?url=<lien TikTok>  → { videoId, author, nickname, description, hashtags, createTime }
 *   GET /cover/<videoId>         → l'image de couverture (mise en cache 1 jour)
 *
 * Aucun secret. Seuls les hôtes *.tiktok.com sont suivis (y compris dans les
 * redirections des liens courts), et seules les origines de SITE_ORIGIN sont
 * autorisées en CORS.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_REDIRECTS = 5;
const COVER_HOSTS = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibytedtos.com', 'byteoversea.com', 'tiktokv.com'];

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
async function fetchTikTokPage(rawUrl, fetchImpl = fetch) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isTikTokUrl(url)) throw new HttpError(400, 'Lien hors de tiktok.com');
    url.protocol = 'https:';
    const response = await fetchImpl(url.href, {
      redirect:'manual',
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

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function getMeta(rawUrl, fetchImpl = fetch) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { throw new HttpError(400, 'Lien invalide'); }
  if (!isTikTokUrl(url)) throw new HttpError(400, 'Lien hors de tiktok.com');
  const { html, finalUrl } = await fetchTikTokPage(url.href, fetchImpl);
  const item = extractItem(html);
  if (!item) {
    const videoId = videoIdFromUrl(finalUrl);
    if (!videoId) throw new HttpError(404, 'Vidéo introuvable');
    return { videoId, author:(/\/@([^/?#]+)/.exec(finalUrl) || [])[1] || '', nickname:'', description:'', hashtags:[], createTime:0, cover:'' };
  }
  return itemToMeta(item);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.SITE_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return origin && (allowed.includes(origin) || local)
    ? { 'Access-Control-Allow-Origin':origin, Vary:'Origin' }
    : { Vary:'Origin' };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status,
  headers:{ 'Content-Type':'application/json; charset=utf-8', ...headers },
});

async function cover(videoId, fetchImpl = fetch) {
  const meta = await getMeta(`https://www.tiktok.com/@i/video/${videoId}`, fetchImpl);
  if (!meta.cover) throw new HttpError(404, 'Pas de couverture');
  const coverUrl = new URL(meta.cover);
  if (coverUrl.protocol !== 'https:' || !hostMatches(coverUrl.hostname, COVER_HOSTS)) throw new HttpError(502, 'Couverture inattendue');
  const image = await fetchImpl(coverUrl.href, { headers:{ 'User-Agent':USER_AGENT, Referer:'https://www.tiktok.com/' } });
  if (!image.ok) throw new HttpError(502, `Image ${image.status}`);
  return new Response(image.body, {
    headers:{
      'Content-Type':image.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control':'public, max-age=86400',
    },
  });
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ ...cors, 'Access-Control-Allow-Methods':'GET' } });
    if (request.method !== 'GET') return json({ error:'Méthode non autorisée' }, 405, cors);
    const url = new URL(request.url);
    try {
      if (url.pathname === '/meta') {
        const meta = await getMeta(url.searchParams.get('url'));
        return json(meta, 200, { ...cors, 'Cache-Control':'public, max-age=3600' });
      }
      const coverMatch = /^\/cover\/(\d{8,25})$/.exec(url.pathname);
      if (coverMatch) {
        const cache = globalThis.caches?.default;
        const cached = await cache?.match(request.url);
        if (cached) return cached;
        const response = await cover(coverMatch[1]);
        ctx.waitUntil?.(cache?.put(request.url, response.clone()));
        return response;
      }
      return json({ ok:true, routes:['/meta?url=', '/cover/<videoId>'] }, 200, cors);
    } catch (error) {
      return json({ error:error.message || 'Erreur' }, error.status || 500, cors);
    }
  },
};
