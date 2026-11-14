/**
 * Détection automatique à partir du titre (description) d'un TikTok :
 * map, côté, agents, types de strat et étage. Tout est une suggestion :
 * les champs restent modifiables à la main.
 */
import { AGENTS, MAPS, NEVER_AUTO, SIDES, TAGS } from './r6.mjs';

const stripAccents = value => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/Ø/g, 'O');

/** Texte comparable : sans accents, en minuscules, ponctuation remplacée par des espaces (sauf #). */
export function normalize(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function aliasPattern(alias, flags = '') {
  const body = normalize(alias).split(' ').map(escapeRegExp).join('[ ]?');
  return new RegExp(`(?:^|[^a-zA-Z0-9])(#?)(${body})(?=$|[^a-zA-Z0-9])`, flags);
}

/**
 * Position de la première occurrence d'un alias, ou -1.
 * `strict` : seulement avec une majuscule (« Smoke ») ou en hashtag (« #smoke »).
 */
function findAlias(alias, lower, cased, strict) {
  if (!strict) {
    const match = aliasPattern(alias).exec(lower);
    return match ? match.index : -1;
  }
  const pattern = aliasPattern(alias, 'gi');
  for (const match of cased.matchAll(pattern)) {
    const word = match[2];
    const capitalized = word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase() && /[A-Z]/.test(word[0]);
    if (match[1] === '#' || capitalized) return match.index;
  }
  return -1;
}

function firstPosition(entry, lower, cased) {
  const strict = new Set((entry.strict || []).map(normalize));
  let best = -1;
  for (const alias of entry.aliases) {
    const position = findAlias(alias, lower, cased, strict.has(normalize(alias)));
    if (position >= 0 && (best < 0 || position < best)) best = position;
  }
  return best;
}

const hasKeyword = (keywords, lower) => keywords.some(keyword => aliasPattern(keyword).test(lower));

export function detectFloor(lower) {
  const floor = /(?:^|[^a-z0-9])([123])\s?(?:f|er etage|e etage|eme etage)(?=$|[^a-z0-9])/.exec(lower);
  if (floor) return `${floor[1]}F`;
  if (/(?:^|[^a-z0-9])(sous sol|basement|cave|bsmt)(?=$|[^a-z0-9])/.test(lower)) return 'Sous-sol';
  if (/(?:^|[^a-z0-9])(rdc|rez de chaussee|ground floor)(?=$|[^a-z0-9])/.test(lower)) return '1F';
  if (/(?:^|[^a-z0-9])(toit|roof|rooftop)(?=$|[^a-z0-9])/.test(lower)) return 'Toit';
  return '';
}

/**
 * @param {string} text titre / description du TikTok
 * @returns {{ map:string, side:string, agents:string[], tags:string[], site:string }}
 */
export function detectStrat(text = '') {
  const lower = normalize(text);
  const cased = stripAccents(text).replace(/[^a-zA-Z0-9#]+/g, ' ');

  const maps = MAPS.map(map => ({ id:map.id, at:firstPosition(map, lower, cased) }))
    .filter(entry => entry.at >= 0).sort((left, right) => left.at - right.at);

  const agents = AGENTS.filter(agent => !NEVER_AUTO.has(agent.id))
    .map(agent => ({ agent, at:firstPosition(agent, lower, cased) }))
    .filter(entry => entry.at >= 0).sort((left, right) => left.at - right.at)
    .map(entry => entry.agent);

  const sides = SIDES.filter(side => hasKeyword(side.keywords, lower)).map(side => side.id);
  let side = sides.length === 1 ? sides[0] : '';
  if (!side && agents.length) {
    const agentSides = new Set(agents.map(agent => agent.side));
    if (agentSides.size === 1) side = [...agentSides][0];
  }

  return {
    map:maps[0]?.id || '',
    side,
    agents:agents.map(agent => agent.id),
    tags:TAGS.filter(tag => hasKeyword(tag.keywords, lower)).map(tag => tag.id),
    site:detectFloor(lower),
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
