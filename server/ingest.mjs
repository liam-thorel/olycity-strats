/**
 * Ajout d'un TikTok venu d'ailleurs que le site (salon Discord, groupe TikTok) :
 * lecture du titre, détection, création de la strat et copie de la vidéo.
 */
import { cleanTitle, detectStrat } from '../public/js/detect.mjs';
import { videoIdFromUrl } from '../public/js/tiktok.mjs';
import { getMeta } from './tiktok-page.mjs';

/**
 * @returns {Promise<{ status:'added'|'exists'|'unreadable', item?:object, url:string }>}
 */
export async function ingestUrl(url, user, { store, downloader, fetchImpl = fetch }) {
  let meta;
  try {
    meta = await getMeta(url, fetchImpl);
  } catch {
    const videoId = videoIdFromUrl(url);
    if (!videoId) return { status:'unreadable', url };
    meta = { videoId, author:(/\/@([^/?#]+)/.exec(url) || [])[1] || '', description:'', url };
  }
  const existing = store.findByVideo(meta.videoId);
  if (existing) return { status:'exists', item:existing, url };
  const detected = detectStrat(meta.description);
  const item = store.create(
    { url:meta.url || url, videoId:meta.videoId, author:meta.author === 'i' ? '' : meta.author },
    { title:cleanTitle(meta.description), description:meta.description, status:'todo', notes:'', ...detected },
    user,
  );
  downloader.enqueue(item.id);
  return { status:'added', item, url };
}
