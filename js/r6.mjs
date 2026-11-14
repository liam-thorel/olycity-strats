/**
 * Données Rainbow Six Siege : maps, agents (opérateurs) et types de strat.
 *
 * `aliases` : façons d'écrire le nom dans un titre TikTok (FR/EN, abréviations).
 * `strict` : alias qui sont aussi des mots courants (« tour », « smoke »…). Ils
 * ne sont reconnus que s'ils sont écrits avec une majuscule ou en hashtag.
 * Pour ajouter un agent ou une map, il suffit de compléter ces listes.
 */

export const MAPS = [
  { id:'bank', name:'Bank', aliases:['bank', 'banque'] },
  { id:'border', name:'Border', aliases:['border', 'frontiere'] },
  { id:'chalet', name:'Chalet', aliases:['chalet'] },
  { id:'clubhouse', name:'Clubhouse', aliases:['clubhouse', 'club house', 'club'] },
  { id:'coastline', name:'Coastline', aliases:['coastline', 'littoral', 'coast'] },
  { id:'consulate', name:'Consulate', aliases:['consulate', 'consulat'] },
  { id:'emerald', name:'Emerald Plains', aliases:['emerald plains', 'emerald', 'plaines d emeraude'] },
  { id:'favela', name:'Favela', aliases:['favela'] },
  { id:'fortress', name:'Fortress', aliases:['fortress', 'forteresse'] },
  { id:'hereford', name:'Hereford Base', aliases:['hereford base', 'hereford'] },
  { id:'house', name:'House', aliases:['house', 'maison'], strict:['house', 'maison'] },
  { id:'kafe', name:'Kafe Dostoyevsky', aliases:['kafe dostoyevsky', 'kafe', 'cafe dostoievski', 'kafe dostoievski'] },
  { id:'kanal', name:'Kanal', aliases:['kanal', 'canal'], strict:['canal'] },
  { id:'lair', name:'Lair', aliases:['lair', 'repaire'] },
  { id:'nighthaven', name:'Nighthaven Labs', aliases:['nighthaven labs', 'nighthaven', 'labs'] },
  { id:'oregon', name:'Oregon', aliases:['oregon'] },
  { id:'outback', name:'Outback', aliases:['outback'] },
  { id:'plane', name:'Plane', aliases:['presidential plane', 'avion presidentiel', 'plane', 'avion'], strict:['plane', 'avion'] },
  { id:'skyscraper', name:'Skyscraper', aliases:['skyscraper', 'gratte ciel', 'sky'] , strict:['sky'] },
  { id:'stadium', name:'Stadium', aliases:['stadium bravo', 'stadium alpha', 'stadium', 'stade'] },
  { id:'themepark', name:'Theme Park', aliases:['theme park', 'themepark', 'parc d attractions', 'parc d attraction'] },
  { id:'tower', name:'Tower', aliases:['tower', 'tour'], strict:['tour'] },
  { id:'villa', name:'Villa', aliases:['villa'] },
  { id:'yacht', name:'Yacht', aliases:['yacht'] },
];

const atk = (name, aliases = [], strict = []) => ({ id:slug(name), name, side:'atk', aliases:[name, ...aliases], strict });
const def = (name, aliases = [], strict = []) => ({ id:slug(name), name, side:'def', aliases:[name, ...aliases], strict });

export const AGENTS = [
  // Attaque
  atk('Sledge'), atk('Thatcher', ['thatch']), atk('Ash', [], ['ash']), atk('Thermite', ['therm']), atk('Twitch', [], ['twitch']),
  atk('Montagne', ['monty']), atk('Glaz'), atk('Fuze'), atk('Blitz', [], ['blitz']), atk('IQ'), atk('Buck'),
  atk('Blackbeard', ['bb']), atk('Capitão', ['capitao', 'capi']), atk('Hibana'), atk('Jackal'), atk('Ying'),
  atk('Zofia'), atk('Dokkaebi', ['dokka']), atk('Lion', [], ['lion']), atk('Finka'), atk('Maverick', ['mav']),
  atk('Nomad', [], ['nomad']), atk('Gridlock', ['grid']), atk('Nøkk', ['nokk']), atk('Amaru'), atk('Kali'),
  atk('Iana'), atk('Ace', [], ['ace']), atk('Zero', [], ['zero']), atk('Flores', [], ['flores']), atk('Osa'),
  atk('Sens', [], ['sens']), atk('Grim', [], ['grim']), atk('Brava', [], ['brava']), atk('Ram', [], ['ram']),
  atk('Deimos'), atk('Striker', [], ['striker']),
  // Défense
  def('Smoke', [], ['smoke']), def('Mute', [], ['mute']), def('Castle', [], ['castle']), def('Pulse', [], ['pulse']),
  def('Doc', [], ['doc']), def('Rook', [], ['rook']), def('Kapkan'), def('Tachanka', ['chanka']), def('Jäger', ['jager', 'jaeger']),
  def('Bandit', [], ['bandit']), def('Frost', [], ['frost']), def('Valkyrie', ['valk']), def('Caveira', ['cav']),
  def('Echo', [], ['echo']), def('Mira', [], ['mira']), def('Lesion'), def('Ela'), def('Vigil', [], ['vigil']),
  def('Maestro', [], ['maestro']), def('Alibi', [], ['alibi']), def('Clash', [], ['clash']), def('Kaid'),
  def('Mozzie', ['mozz']), def('Warden', [], ['warden']), def('Goyo'), def('Wamai'), def('Oryx'), def('Melusi'),
  def('Aruni'), def('Thunderbird', ['tbird']), def('Thorn', [], ['thorn']), def('Azami'), def('Solis', [], ['solis']),
  def('Fenrir'), def('Tubarão', ['tubarao']), def('Sentry', [], ['sentry']), def('Skopós', ['skopos']),
  def('Rauora'), def('Denari'),
];

/** Agents jamais détectés automatiquement (« ace » veut presque toujours dire 5 kills). */
export const NEVER_AUTO = new Set(['ace']);

export const SIDES = [
  { id:'atk', name:'Attaque', short:'ATK', keywords:['attaque', 'attack', 'atk', 'attaquant', 'attaquants', 'attacker', 'attackers', 'en atk'] },
  { id:'def', name:'Défense', short:'DEF', keywords:['defense', 'defence', 'def', 'defenseur', 'defenseurs', 'defender', 'defenders', 'en def'] },
];

export const TAGS = [
  { id:'setup', name:'Setup / renforts', keywords:['setup', 'set up', 'renfo', 'renfos', 'renfort', 'renforts', 'reinforce', 'reinforcement', 'reinforcements', 'barricade'] },
  { id:'utility', name:'Lineup / utilitaire', keywords:['lineup', 'line up', 'lineups', 'nade', 'nades', 'grenade', 'grenades', 'flash', 'molly', 'lancer', 'throw', 'utility', 'utilitaire', 'gadget', 'gadgets'] },
  { id:'spawnpeek', name:'Spawn peek', keywords:['spawn peek', 'spawnpeek', 'spawn kill', 'spawnkill', 'spawn'] },
  { id:'runout', name:'Run-out', keywords:['runout', 'run out', 'rush out'] },
  { id:'vertical', name:'Vertical', keywords:['vertical', 'verticale', 'verti', 'hatch', 'hatches', 'trappe', 'trappes', 'murder hole', 'trou'] },
  { id:'rotate', name:'Rotation', keywords:['rotate', 'rotation', 'rotations', 'rota', 'rotat'] },
  { id:'drone', name:'Drone', keywords:['drone', 'drones', 'droner', 'drone spot', 'cam', 'camera'] },
  { id:'plant', name:'Plant / défuse', keywords:['plant', 'planter', 'post plant', 'postplant', 'defuse', 'defuser', 'defuseur', 'denial', 'deny'] },
  { id:'roam', name:'Roam', keywords:['roam', 'roamer', 'roaming', 'flank', 'flanker'] },
  { id:'retake', name:'Retake', keywords:['retake', 'reprise'] },
  { id:'execute', name:'Exécution', keywords:['execute', 'exec', 'rush', 'push', 'strat atk'] },
  { id:'trick', name:'Astuce / spot', keywords:['trick', 'tricks', 'astuce', 'astuces', 'tips', 'tip', 'spot', 'spots', 'secret', 'glitch', 'bug', 'hack', 'hidden', 'cache'] },
];

export const STATUSES = [
  { id:'todo', name:'À tester' },
  { id:'good', name:'Validée' },
  { id:'meh', name:'Bof' },
];

export function slug(value = '') {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/gi, 'o')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

export const mapById = id => MAPS.find(map => map.id === id) || null;
export const agentById = id => AGENTS.find(agent => agent.id === id) || null;
export const tagById = id => TAGS.find(tag => tag.id === id) || null;
export const sideById = id => SIDES.find(side => side.id === id) || null;
export const statusById = id => STATUSES.find(status => status.id === id) || null;
