/**
 * Repérage des TikToks partagés dans une conversation TikTok (page web des
 * messages) : liens vers des vidéos dans la page, et identifiants de vidéo
 * dans les réponses JSON de la messagerie (souvent du JSON dans du JSON,
 * avec des guillemets échappés).
 */

const ID = '(\\d{15,25})';

/** Identifiants depuis des liens (« /@x/video/123… », « /photo/123… »). */
export function idsFromLinks(links = []) {
  const ids = [];
  for (const link of links) {
    const match = new RegExp(`/(?:video|photo)/${ID}`).exec(String(link || ''));
    if (match) ids.push(match[1]);
  }
  return ids;
}

/** Identifiants de vidéo dans un texte JSON (champs itemId, item_id, aweme_id…), même échappé. */
export function idsFromJson(text = '') {
  const pattern = new RegExp(`\\\\*"(?:item_?id|itemId|aweme_?id|awemeId|video_?id|videoId)\\\\*"\\s*:\\s*\\\\*"?${ID}`, 'gi');
  return [...String(text).matchAll(pattern)].map(match => match[1]);
}

/** Identifiants de la page entière (liens, attributs, JSON embarqué). */
export function idsFromHtml(html = '') {
  return [...new Set([
    ...idsFromLinks([...String(html).matchAll(/https?:\/\/(?:www\.)?tiktok\.com\/[^"'<>\s]+/g)].map(match => match[0])),
    ...idsFromJson(html),
  ])];
}

/** Nouveaux identifiants, dans l'ordre d'apparition, sans doublons. */
export function unseen(ids = [], seen = new Set()) {
  return [...new Set(ids)].filter(id => !seen.has(id));
}

export const videoUrl = id => `https://www.tiktok.com/@i/video/${id}`;
