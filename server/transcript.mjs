/**
 * Sous-titres d'un TikTok (ce qui est dit dans la vidéo) : lecture des
 * fichiers WebVTT de yt-dlp, puis complément automatique des champs vides.
 */
import { detectStrat } from '../public/js/detect.mjs';

export const TRANSCRIPT_MAX = 3000;

export const CUES_MAX = 300;

const toSeconds = stamp => {
  const parts = stamp.replace(',', '.').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
};

/**
 * Phrases horodatées d'un fichier WebVTT : [{ s, e, t }] (début, fin en secondes,
 * texte), sans balises ni répétitions. Sert à couper la vidéo au bon moment.
 */
export function parseVttCues(vtt = '') {
  const cues = [];
  let skipBlock = false;
  let current = null;
  for (const raw of String(vtt).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { skipBlock = false; current = null; continue; }
    // Blocs de commentaire ou de style : ignorés jusqu'à la ligne vide suivante.
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) skipBlock = true;
    if (skipBlock || /^WEBVTT/.test(line)) continue;
    const timing = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/.exec(line);
    if (timing) {
      current = { s:Math.round(toSeconds(timing[1]) * 100) / 100, e:Math.round(toSeconds(timing[2]) * 100) / 100, t:'' };
      continue;
    }
    if (/^\d+$/.test(line) && !current) continue;
    const text = line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (current) {
      if (!current.t) {
        // Les sous-titres automatiques répètent souvent la phrase précédente.
        if (cues.at(-1)?.t === text) { cues.at(-1).e = current.e; current = cues.at(-1); continue; }
        current.t = text;
        cues.push(current);
      } else if (current.t !== text) {
        current.t = `${current.t} ${text}`;
      }
    } else if (cues.at(-1)?.t !== text) {
      cues.push({ s:cues.at(-1)?.e || 0, e:cues.at(-1)?.e || 0, t:text });
    }
  }
  return cues.slice(0, CUES_MAX);
}

/** Texte brut d'un fichier WebVTT : sans en-tête, horodatages, balises ni répétitions. */
export function parseVtt(vtt = '') {
  return parseVttCues(vtt).map(cue => cue.t).join(' ').slice(0, TRANSCRIPT_MAX);
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
