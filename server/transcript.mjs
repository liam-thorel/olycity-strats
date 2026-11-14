/**
 * Sous-titres d'un TikTok (ce qui est dit dans la vidéo) : lecture des
 * fichiers WebVTT de yt-dlp, puis complément automatique des champs vides.
 */
import { detectStrat } from '../public/js/detect.mjs';

export const TRANSCRIPT_MAX = 3000;

/** Texte brut d'un fichier WebVTT : sans en-tête, horodatages, balises ni répétitions. */
export function parseVtt(vtt = '') {
  const lines = [];
  let skipBlock = false;
  for (const raw of String(vtt).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { skipBlock = false; continue; }
    // Blocs de commentaire ou de style : ignorés jusqu'à la ligne vide suivante.
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) skipBlock = true;
    if (skipBlock || /^WEBVTT/.test(line) || /-->/.test(line) || /^\d+$/.test(line)) continue;
    const text = line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (text && text !== lines.at(-1)) lines.push(text);
  }
  return lines.join(' ').slice(0, TRANSCRIPT_MAX);
}

/** Sous-titres à privilégier : français, puis anglais, puis le premier venu. */
export function pickSubtitle(files = []) {
  const vtt = files.filter(file => file.endsWith('.vtt'));
  return vtt.find(file => /\.(fr|fra)(-[A-Za-z]+)?\.vtt$/.test(file))
    || vtt.find(file => /\.(en|eng)(-[A-Za-z]+)?\.vtt$/.test(file))
    || vtt[0] || '';
}

/**
 * Champs encore vides complétés depuis les sous-titres. Ce qui a déjà une valeur
 * (titre du TikTok ou saisie d'un membre) n'est jamais remplacé.
 * @returns {{ patch:object, filled:string[] }}
 */
export function autofill(item, transcript) {
  if (!transcript) return { patch:{}, filled:[] };
  const detected = detectStrat(transcript, { mode:'transcript', side:item.side, map:item.map });
  const patch = {};
  if (!item.map && detected.map) patch.map = detected.map;
  if (!item.side && detected.side) patch.side = detected.side;
  if (!item.agents?.length && detected.agents.length) patch.agents = detected.agents;
  if (!item.tags?.length && detected.tags.length) patch.tags = detected.tags;
  // Un étage seul (« Sous-sol », « 2F ») peut être précisé par le bombsite entendu dans la vidéo.
  const floorOnly = /^(Sous-sol|Toit|[123]F|B)$/.test(item.site || '');
  if (!item.site && detected.site) patch.site = detected.site;
  else if (floorOnly && detected.site.includes('·')) patch.site = detected.site;
  return { patch, filled:Object.keys(patch) };
}
