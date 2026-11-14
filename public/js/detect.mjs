/**
 * Détection automatique depuis le titre d'un TikTok, ou depuis ce qui est dit
 * dans la vidéo (sous-titres) : map, côté, agents, types de strat et site.
 * Tout est une suggestion : les champs restent modifiables à la main.
 *
 * Deux modes :
 * - « title » : le titre est court et choisi, la première mention compte ;
 * - « transcript » : la vidéo parle de tout (y compris des adversaires), on
 *   compte les mentions et on ne garde que les agents du côté dominant.
 */
import { AGENTS, MAPS, NEVER_AUTO, SIDES, SITES, TAGS, siteLabel } from './r6.mjs';

const stripAccents = value => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/Ø/g, 'O');

/** Texte comparable : sans accents, en minuscules, ponctuation remplacée par des espaces (sauf #). */
export function normalize(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map();

function aliasPattern(alias) {
  if (!patterns.has(alias)) {
    const body = normalize(alias).split(' ').map(escapeRegExp).join('[ ]?');
    patterns.set(alias, new RegExp(`(?:^|[^a-zA-Z0-9])(#?)(${body})(?=$|[^a-zA-Z0-9])`, 'gi'));
  }
  const pattern = patterns.get(alias);
  pattern.lastIndex = 0;
  return pattern;
}

/** Occurrences d'un alias : positions. `strict` : seulement « Smoke » (majuscule) ou « #smoke ». */
function findAlias(alias, lower, cased, strict) {
  const positions = [];
  for (const match of (strict ? cased : lower).matchAll(aliasPattern(alias))) {
    if (strict) {
      const word = match[2];
      const capitalized = /[A-Z]/.test(word[0]) && word.slice(1) === word.slice(1).toLowerCase();
      if (match[1] !== '#' && !capitalized) continue;
    }
    positions.push(match.index);
  }
  return positions;
}

/*
 * Hashtags collés : #bankr6, #r6thermite, #kafesiege… Un hashtag compte s'il
 * est le nom exact, entouré seulement de mots génériques (r6, siege, tips…).
 */
const NOISE = '(?:r6s|r6|rainbowsixsiege|rainbow6siege|rainbowsix|rainbow6|siege|tips|tip|strats|strat|tricks|trick|mains|main)';
const hashtagPatterns = new Map();

export function hashtagWords(text = '') {
  return [...stripAccents(text).toLowerCase().matchAll(/#([a-z0-9_]+)/g)].map(([, tag]) => tag.replace(/_/g, ''));
}

function hashtagMatches(tags, key) {
  if (!hashtagPatterns.has(key)) hashtagPatterns.set(key, new RegExp(`^${NOISE}*${escapeRegExp(key)}${NOISE}*$`));
  return tags.some(tag => hashtagPatterns.get(key).test(tag));
}

/*
 * Noms qui désignent souvent autre chose dans un TikTok : « #Twitch » ou « en live
 * sur Twitch » parle de la plateforme de stream, pas de l'agente.
 */
const PLATFORM_CONTEXT = /(?:live|stream|streams|streamer|chaine|channel|sur|on|my|ma|follow|twitch tv)\s*$/i;
const NO_HASHTAG = new Set(['twitch']);

function mentions(entry, lower, cased, tags) {
  const strict = new Set((entry.strict || []).map(normalize));
  // Positions distinctes : « Kiba barrier » répond aux alias « kiba » et « kiba barrier » mais ne compte qu'une fois.
  const positions = new Set();
  for (const alias of entry.aliases) {
    const key = normalize(alias);
    if (NEVER_AUTO.has(key)) continue;
    let found = findAlias(alias, lower, cased, strict.has(key));
    if (NO_HASHTAG.has(key)) {
      found = found.filter(position => cased[position] !== '#' && cased[position + 1] !== '#'
        && !PLATFORM_CONTEXT.test(cased.slice(Math.max(0, position - 20), position + 1)));
    } else if (hashtagMatches(tags, key.replace(/ /g, ''))) {
      found.push(Number.MAX_SAFE_INTEGER - 1);
    }
    for (const position of found) positions.add(position);
  }
  return { count:positions.size, first:positions.size ? Math.min(...positions) : -1 };
}

const ranked = (entries, mode) => entries
  .filter(entry => entry.count > 0)
  .sort((left, right) => (mode === 'transcript'
    ? right.count - left.count || left.first - right.first
    : left.first - right.first));

/** Mentions distinctes d'une liste de mots-clés (« setup » et « set up » au même endroit comptent une fois). */
function countKeyword(keywords, lower) {
  const positions = new Set();
  for (const keyword of keywords) for (const match of lower.matchAll(aliasPattern(keyword))) positions.add(match.index);
  return positions.size;
}

export function detectFloor(lower) {
  const floor = /(?:^|[^a-z0-9])([123])\s?(?:f|er etage|e etage|eme etage)(?=$|[^a-z0-9])/.exec(lower);
  if (floor) return `${floor[1]}F`;
  if (/(?:^|[^a-z0-9])(sous sol|basement|cave|bsmt)(?=$|[^a-z0-9])/.test(lower)) return 'Sous-sol';
  if (/(?:^|[^a-z0-9])(rdc|rez de chaussee|ground floor)(?=$|[^a-z0-9])/.test(lower)) return '1F';
  if (/(?:^|[^a-z0-9])(toit|roof|rooftop)(?=$|[^a-z0-9])/.test(lower)) return 'Toit';
  return '';
}

/* Mots-clés de bombsite présents sur une seule map : ils suffisent à deviner la map. */
const KEY_MAPS = new Map();
for (const [mapId, sites] of Object.entries(SITES)) {
  for (const site of sites) {
    for (const key of site[3]) KEY_MAPS.set(key, KEY_MAPS.has(key) && KEY_MAPS.get(key) !== mapId ? null : mapId);
  }
}

/** Bombsite reconnu : { map, label, count }, la map étant connue ou devinée par un mot-clé propre à une map. */
export function detectSite(lower, mapId = '', { minCount = 1 } = {}) {
  let best = null;
  for (const [id, sites] of Object.entries(SITES)) {
    if (mapId && id !== mapId) continue;
    for (const site of sites) {
      const count = countKeyword(site[3], lower);
      if (count < minCount) continue;
      const usable = mapId || site[3].some(key => KEY_MAPS.get(key) === id && countKeyword([key], lower) > 0);
      if (usable && (!best || count > best.count)) best = { map:id, label:siteLabel(site), count };
    }
  }
  return best;
}

/**
 * @param {string} text titre / description du TikTok, ou sous-titres
 * @param {{ mode?:'title'|'transcript', side?:string, map?:string }} options
 * @returns {{ map:string, side:string, agents:string[], tags:string[], site:string }}
 */
export function detectStrat(text = '', { mode = 'title', side:knownSide = '', map:knownMap = '' } = {}) {
  const lower = normalize(text);
  const cased = stripAccents(text).replace(/[^a-zA-Z0-9#]+/g, ' ');
  const tags = hashtagWords(text);

  const maps = ranked(MAPS.map(map => ({ id:map.id, ...mentions(map, lower, cased, tags) })), mode);
  const allAgents = ranked(AGENTS.map(agent => ({ agent, ...mentions(agent, lower, cased, tags) })), mode);

  // Côté : dit dans le titre, sinon celui des agents cités (pondéré par les mentions).
  let side = knownSide;
  if (!side && mode === 'title') {
    const sides = SIDES.filter(entry => countKeyword(entry.keywords, lower) > 0).map(entry => entry.id);
    if (sides.length === 1) side = sides[0];
  }
  if (!side && allAgents.length) {
    const weight = { atk:0, def:0 };
    for (const entry of allAgents) weight[entry.agent.side] += mode === 'transcript' ? entry.count : 1;
    if (weight.atk !== weight.def && (mode === 'transcript' || !weight.atk || !weight.def)) side = weight.atk > weight.def ? 'atk' : 'def';
  }

  // Dans une vidéo on parle aussi des adversaires (« protège-toi de Flores ») : on ne garde que son côté.
  let agents = allAgents.map(entry => entry.agent);
  if (mode === 'transcript') agents = agents.filter(entry => !side || entry.side === side).slice(0, 4);

  let map = knownMap || maps[0]?.id || '';
  const site = detectSite(lower, map, { minCount:mode === 'transcript' && !map ? 2 : 1 });
  if (!map && site) map = site.map;

  return {
    map,
    side,
    agents:agents.map(entry => entry.id),
    tags:TAGS.filter(tag => countKeyword(tag.keywords, lower) >= (mode === 'transcript' ? 2 : 1)).map(tag => tag.id),
    site:site?.label || detectFloor(lower),
  };
}

/** Titre lisible : la description sans hashtags ni mentions. */
export function cleanTitle(description = '') {
  return String(description || '')
    .replace(/(^|\s)[#@][^\s#@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hashtags d'une description, sans le #. */
export function hashtags(description = '') {
  return [...String(description || '').matchAll(/#([^\s#@]+)/g)].map(match => match[1]);
}
