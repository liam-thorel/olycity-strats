/**
 * Données Rainbow Six Siege : maps, bombsites, salles, agents (opérateurs) et
 * types de strat. Noms affichés en français ; les noms anglais (ceux des
 * TikToks et des callouts) restent reconnus.
 *
 * `aliases` : façons d'écrire un nom dans un titre ou dans ce qui est dit
 * dans la vidéo (FR/EN, abréviations, gadgets, erreurs fréquentes des
 * sous-titres automatiques).
 * `strict` : alias qui sont aussi des mots courants (« tour », « smoke »…), reconnus
 * seulement avec une majuscule ou en hashtag.
 * Pour ajouter un agent, une map ou une salle, il suffit de compléter ces listes.
 */

export const MAPS = [
  { id:'bank', name:'Banque', en:'Bank', aliases:['bank', 'banque'] },
  { id:'border', name:'Frontière', en:'Border', aliases:['border', 'frontiere'] },
  { id:'chalet', name:'Chalet', en:'Chalet', aliases:['chalet'] },
  { id:'clubhouse', name:'Club House', en:'Clubhouse', aliases:['clubhouse', 'club house', 'club'] },
  { id:'coastline', name:'Littoral', en:'Coastline', aliases:['coastline', 'littoral', 'coast'] },
  { id:'consulate', name:'Consulat', en:'Consulate', aliases:['consulate', 'consulat'] },
  { id:'emerald', name:'Plaines d’émeraude', en:'Emerald Plains', aliases:['emerald plains', 'emerald', 'plaines d emeraude', 'plaine d emeraude'] },
  { id:'favela', name:'Favela', en:'Favela', aliases:['favela'] },
  { id:'fortress', name:'Forteresse', en:'Fortress', aliases:['fortress', 'forteresse'] },
  { id:'hereford', name:'Base d’Hereford', en:'Hereford Base', aliases:['hereford base', 'hereford', 'base d hereford'] },
  { id:'house', name:'Maison', en:'House', aliases:['house', 'maison'], strict:['house', 'maison'] },
  { id:'kafe', name:'Kafe Dostoïevski', en:'Kafe Dostoyevsky', aliases:['kafe dostoyevsky', 'kafe dostoievski', 'kafe', 'cafe dostoievski'] },
  { id:'kanal', name:'Canal', en:'Kanal', aliases:['kanal', 'canal'], strict:['canal'] },
  { id:'lair', name:'Repaire', en:'Lair', aliases:['lair', 'repaire'] },
  { id:'nighthaven', name:'Laboratoires Nighthaven', en:'Nighthaven Labs', aliases:['nighthaven labs', 'nighthaven', 'laboratoires nighthaven', 'labs'] },
  { id:'oregon', name:'Oregon', en:'Oregon', aliases:['oregon'] },
  { id:'outback', name:'Outback', en:'Outback', aliases:['outback'] },
  { id:'plane', name:'Avion présidentiel', en:'Presidential Plane', aliases:['presidential plane', 'avion presidentiel', 'plane', 'avion'], strict:['plane', 'avion'] },
  { id:'skyscraper', name:'Gratte-ciel', en:'Skyscraper', aliases:['skyscraper', 'gratte ciel', 'sky'], strict:['sky'] },
  { id:'stadium', name:'Stade', en:'Stadium', aliases:['stadium bravo', 'stadium alpha', 'stadium', 'stade'] },
  { id:'themepark', name:'Parc d’attractions', en:'Theme Park', aliases:['theme park', 'themepark', 'parc d attractions', 'parc d attraction'] },
  { id:'tower', name:'Tour', en:'Tower', aliases:['tower', 'tour'], strict:['tour'] },
  { id:'villa', name:'Villa', en:'Villa', aliases:['villa'] },
  { id:'yacht', name:'Yacht', en:'Yacht', aliases:['yacht'] },
];

/**
 * Bombsites par paire : [étage, nom FR, nom EN, mots-clés de détection].
 * Les mots-clés sont choisis pour être parlants (une salle propre à la map) :
 * un mot-clé présent sur une seule map permet aussi de deviner la map.
 */
export const SITES = {
  bank:[
    ['2F', 'Bureau du PDG / Salon de direction', 'CEO Office / Executive Lounge', ['ceo', 'pdg', 'executive lounge', 'salon de direction', 'bureau du pdg']],
    ['1F', 'Espace ouvert / Salle du personnel', 'Open Area / Staff Room', ['open area', 'staff room', 'espace ouvert', 'salle du personnel']],
    ['1F', 'Guichets / Archives', 'Teller’s Office / Archives', ['tellers', 'teller s office', 'guichets']],
    ['B', 'Vestiaires / Vidéosurveillance', 'Lockers / CCTV Room', ['lockers', 'vestiaires']],
  ],
  border:[
    ['2F', 'Casiers de l’armurerie / Archives', 'Armory Lockers / Archives', ['armory lockers', 'casiers de l armurerie']],
    ['1F', 'Salle de ventilation / Atelier', 'Ventilation Room / Workshop', ['ventilation', 'workshop', 'atelier']],
    ['1F', 'Inspection douanière / Réserve', 'Customs Inspection / Supply Room', ['customs', 'douane', 'inspection douaniere']],
    ['1F', 'Toilettes / Guichets', 'Bathroom / Tellers', ['bathroom tellers']],
  ],
  chalet:[
    ['2F', 'Chambre principale / Bureau', 'Master Bedroom / Office', ['master bedroom', 'chambre principale']],
    ['1F', 'Bar / Salle de jeux', 'Bar / Gaming Room', ['gaming room']],
    ['1F', 'Cuisine / Salle des trophées', 'Kitchen / Trophy Room', ['trophy room']],
    ['B', 'Cave à vin / Garage des motoneiges', 'Wine Cellar / Snowmobile Garage', ['wine cellar', 'snowmobile', 'cave a vin', 'motoneige', 'motoneiges']],
  ],
  clubhouse:[
    ['2F', 'Salle de sport / Chambre', 'Gym / Bedroom', ['gym']],
    ['2F', 'Vidéosurveillance / Salle de l’argent', 'CCTV / Cash Room', ['cash room', 'cash']],
    ['1F', 'Bar / Scène', 'Bar / Stage', ['stage', 'scene']],
    ['B', 'Église / Arsenal', 'Church / Arsenal Room', ['church', 'arsenal', 'eglise']],
  ],
  coastline:[
    ['2F', 'Salon chicha / Salle de billard', 'Hookah Lounge / Billiards Room', ['hookah', 'billiards', 'billard', 'chicha']],
    ['2F', 'Cinéma / Penthouse', 'Theater / Penthouse', ['penthouse', 'theater', 'theatre', 'cinema']],
    ['1F', 'Cuisine / Entrée de service', 'Kitchen / Service Entrance', ['service entrance', 'entree de service']],
    ['1F', 'Bar bleu / Bar Sunrise', 'Blue Bar / Sunrise Bar', ['blue bar', 'sunrise', 'bar bleu']],
  ],
  consulate:[
    ['2F', 'Bureau du consul / Salle de réunion', 'Consul Office / Meeting Room', ['consul office', 'consul', 'bureau du consul']],
    ['1F', 'Hall / Salle de presse', 'Lobby / Press Room', ['press room', 'salle de presse']],
    ['B', 'Archives / Guichets', 'Archives / Tellers', ['archives tellers']],
    ['B', 'Garage / Cafétéria', 'Garage / Cafeteria', ['cafeteria']],
  ],
  fortress:[
    ['2F', 'Bureau du commandant / Chambre', 'Commander’s Office / Bedroom', ['commander', 'commandant']],
    ['2F', 'Dortoir / Salle de briefing', 'Dormitory / Briefing Room', ['briefing', 'dormitory']],
    ['1F', 'Cuisine / Cafétéria', 'Kitchen / Cafeteria', ['kitchen cafeteria']],
    ['1F', 'Hammam / Salon', 'Hammam / Sitting Room', ['hammam', 'sitting room']],
  ],
  kafe:[
    ['3F', 'Bar / Salon cocktail', 'Bar / Cocktail Lounge', ['cocktail']],
    ['2F', 'Salle des mines / Musée du train', 'Mining Room / Train Museum', ['mining', 'train museum', 'musee du train', 'salle des mines']],
    ['2F', 'Salle de lecture / Salle de la cheminée', 'Reading Room / Fireplace Hall', ['reading room', 'fireplace', 'salle de lecture', 'cheminee']],
    ['1F', 'Cuisine (service) / Cuisine (préparation)', 'Kitchen Service / Kitchen Cooking', ['kitchen service', 'kitchen cooking', 'bakery', 'boulangerie']],
  ],
  oregon:[
    ['2F', 'Dortoir des enfants / Grand dortoir', 'Kids’ Dorms / Dorms Main Hall', ['kids dorm', 'kids dorms', 'dorms', 'dortoir des enfants']],
    ['1F', 'Cuisine / Réfectoire', 'Kitchen / Dining Hall', ['dining hall', 'refectoire']],
    ['1F', 'Salle de réunion / Cuisine', 'Meeting Hall / Kitchen', ['meeting hall']],
    ['B', 'Buanderie / Réserve', 'Laundry Room / Supply Room', ['laundry', 'buanderie']],
  ],
  outback:[
    ['2F', 'Buanderie / Salle de jeux', 'Laundry / Games Room', ['games room laundry']],
    ['2F', 'Salle des fêtes / Bureau', 'Party Room / Office', ['party room', 'salle des fetes']],
    ['1F', 'Salle du compresseur / Magasin d’équipement', 'Compressor Room / Gear Store', ['compressor', 'gear store', 'compresseur']],
    ['1F', 'Cuisine / Grill', 'Kitchen / Grill', ['grill']],
  ],
  skyscraper:[
    ['2F', 'Salon de thé / Karaoké', 'Tea Room / Karaoke', ['karaoke', 'tea room', 'salon de the']],
    ['2F', 'Exposition / Bureau', 'Exhibition / Work Office', ['exhibition', 'work office', 'exposition']],
    ['1F', 'Barbecue / Cuisine', 'BBQ / Kitchen', ['bbq', 'barbecue']],
    ['1F', 'Chambre / Salle de bain', 'Bedroom / Bathroom', ['bedroom bathroom']],
  ],
  themepark:[
    ['2F', 'Salle d’initiation / Bureau', 'Initiation Room / Office', ['initiation']],
    ['2F', 'Dortoir / Garderie', 'Bunk / Day Care', ['day care', 'daycare', 'garderie', 'bunk']],
    ['1F', 'Armurerie / Salle du trône', 'Armory / Throne Room', ['throne', 'trone']],
    ['1F', 'Labo / Entrepôt', 'Lab / Storage', ['drug lab', 'lab storage']],
  ],
  villa:[
    ['2F', 'Salle de l’aviateur / Salle de jeux', 'Aviator Room / Games Room', ['aviator', 'aviateur']],
    ['2F', 'Salle des trophées / Salle des statues', 'Trophy Room / Statuary Room', ['statuary', 'statues', 'trophy statuary']],
    ['1F', 'Salon / Bibliothèque', 'Living Room / Library', ['library', 'bibliotheque', 'living room']],
    ['1F', 'Salle à manger / Cuisine', 'Dining Room / Kitchen', ['dining room', 'salle a manger']],
  ],
};

/** Salles utiles pour situer un spot (autocomplétion) : [nom FR, nom EN]. */
export const ROOMS = {
  bank:[['Coffre-fort', 'Vault'], ['Hall principal', 'Main Lobby'], ['Escalier carré', 'Square Stairs'], ['Escalier en marbre', 'Marble Stairs'],
    ['Local d’entretien', 'Janitor'], ['Réserve', 'Stock Room'], ['Garage', 'Garage'], ['Verrière', 'Skylight'], ['Ascenseurs', 'Elevators'], ['Toit', 'Roof']],
  border:[['Salle de sécurité', 'Security Room'], ['Salle d’attente', 'Waiting Room'], ['Hall principal', 'Main Lobby'], ['Bureaux', 'Offices'],
    ['Salle de pause', 'Break Room'], ['Escalier est', 'East Stairs'], ['Balcon', 'Balcony']],
  chalet:[['Garage', 'Garage'], ['Bibliothèque', 'Library'], ['Grand salon', 'Great Room'], ['Mezzanine', 'Mezzanine'], ['Escalier principal', 'Main Stairs'], ['Salle de la cheminée', 'Fireplace Hall']],
  clubhouse:[['Garage', 'Garage'], ['Chantier', 'Construction Site'], ['Cuisine', 'Kitchen'], ['Salon', 'Lounge'], ['Planque secrète', 'Secret Stash'], ['Casse', 'Junkyard'], ['Bureau logistique', 'Logistic Office']],
  coastline:[['Piscine', 'Pool'], ['Aquarium', 'Aquarium'], ['Cour', 'Courtyard'], ['Salon VIP', 'VIP Lounge'], ['Toit', 'Rooftop'], ['Salle de bain', 'Bathroom']],
  consulate:[['Bureau des visas', 'Visa Office'], ['Salle des serveurs', 'Server Room'], ['Bureau administratif', 'Admin Office'], ['Escalier principal', 'Main Stairs'], ['Cour', 'Courtyard']],
  kafe:[['Boulangerie', 'Bakery'], ['Buanderie', 'Laundry'], ['Escalier rouge', 'Red Stairs'], ['Escalier blanc', 'White Stairs'], ['Salle des piliers', 'Pillar Room'],
    ['Salon VIP', 'VIP'], ['Terrasse', 'Terrace'], ['Verrière', 'Skylight']],
  oregon:[['Tour', 'Tower'], ['Grenier', 'Attic'], ['Bunker', 'Bunker'], ['Armurerie', 'Armory'], ['Garage', 'Garage'], ['Congélateur', 'Freezer'], ['Douches', 'Showers'], ['Chantier', 'Construction']],
  skyscraper:[['Jardin', 'Garden'], ['Salle des bonsaïs', 'Bonsai Room'], ['Hall', 'Lobby'], ['Héliport', 'Helipad'], ['Salle de méditation', 'Meditation Room']],
  themepark:[['Café', 'Cafe'], ['Salle à manger hantée', 'Haunted Dining'], ['Tunnel', 'Tunnel'], ['Dragon', 'Dragon'], ['Salle de contrôle', 'Control Room']],
  villa:[['Garage', 'Garage'], ['Cour', 'Courtyard'], ['Garde-manger', 'Pantry'], ['Escalier principal', 'Main Stairs'], ['Salle de bain', 'Bathroom']],
};

/** Étages : code du jeu → libellé français. */
export const FLOORS = { '3F':'2e étage', '2F':'1er étage', '1F':'RDC', 'B':'Sous-sol' };

const agent = side => (name, aliases = [], strict = []) => ({ id:slug(name), name, side, aliases:[name, ...aliases], strict });
const atk = agent('atk');
const def = agent('def');

/*
 * Les gadgets servent d'alias : « Kiba » → Azami, « Evil Eye » → Maestro…
 * Les erreurs fréquentes des sous-titres automatiques aussi (« a zombie » → Azami).
 */
export const AGENTS = [
  // Attaque
  atk('Sledge', ['sledgehammer', 'breaching hammer']),
  atk('Thatcher', ['thatch', 'emp grenade', 'emp']),
  atk('Ash', ['breaching round', 'breaching rounds'], ['ash']),
  atk('Thermite', ['therm', 'exothermic charge', 'thermite charge']),
  atk('Twitch', ['shock drone', 'shock drones'], ['twitch']),
  atk('Montagne', ['monty', 'le roc']),
  atk('Glaz'),
  atk('Fuze', ['cluster charge', 'cluster charges']),
  atk('Blitz', ['flash shield'], ['blitz']),
  atk('IQ', ['electronics detector']),
  atk('Buck', ['skeleton key']),
  atk('Blackbeard', ['bb', 'rifle shield']),
  atk('Capitão', ['capitao', 'capi', 'tactical crossbow', 'asphyxiating bolt']),
  atk('Hibana', ['x kairos', 'kairos']),
  atk('Jackal', ['eyenox']),
  atk('Ying', ['candela', 'candelas']),
  atk('Zofia', ['ks79', 'lifeline', 'sofia']),
  atk('Dokkaebi', ['dokka', 'doki', 'dokebi', 'logic bomb']),
  atk('Lion', ['ee one d'], ['lion']),
  atk('Finka', ['adrenal surge']),
  atk('Maverick', ['mav', 'breaching torch', 'blowtorch', 'blow torch']),
  atk('Nomad', ['airjab', 'airjabs', 'air jab', 'air jabs', 'air job', 'air jobs'], ['nomad']),
  atk('Gridlock', ['grid', 'trax', 'trax stingers']),
  atk('Nøkk', ['nokk']),
  atk('Amaru', ['garra hook']),
  atk('Kali', ['lv lance', 'lv explosive lance']),
  atk('Iana', ['gemini replicator']),
  atk('Ace', ['selma', 'selmas'], ['ace']),
  atk('Zero', ['argus', 'argus camera'], ['zero']),
  atk('Flores', ['ratero', 'rce ratero'], ['flores']),
  atk('Osa', ['talon shield', 'talon shields']),
  atk('Sens', ['rou projector'], ['sens']),
  atk('Grim', ['kawan hive'], ['grim']),
  atk('Brava', ['kludge', 'kludge drone'], ['brava']),
  atk('Ram', ['bu gi', 'bugi'], ['ram']),
  atk('Deimos', ['deathmark']),
  atk('Striker', [], ['striker']),
  // Défense
  def('Smoke', ['gas canister', 'gas canisters', 'remote gas grenade'], ['smoke']),
  def('Mute', ['signal disruptor', 'signal disruptors', 'jammer', 'jammers'], ['mute']),
  def('Castle', ['armor panel', 'armor panels', 'castle barricade', 'castle barricades'], ['castle']),
  def('Pulse', ['heartbeat sensor', 'cardiac sensor'], ['pulse']),
  def('Doc', ['stim pistol'], ['doc']),
  def('Rook', ['armor pack', 'armor plates'], ['rook']),
  def('Kapkan', ['edd', 'edds', 'entry denial device']),
  def('Tachanka', ['chanka', 'shumikha']),
  def('Jäger', ['jager', 'jaeger', 'yeager', 'magpie', 'magpies', 'ads', 'active defense system'], ['ads']),
  def('Bandit', ['shock wire', 'shock wires', 'bandit trick'], ['bandit']),
  def('Frost', ['welcome mat', 'welcome mats'], ['frost']),
  def('Valkyrie', ['valk', 'black eye', 'black eyes', 'valk cam', 'valk cams']),
  def('Caveira', ['cav', 'silent step', 'luison']),
  def('Echo', ['yokai'], ['echo']),
  def('Mira', ['black mirror', 'black mirrors', 'mira window', 'mira windows'], ['mira']),
  def('Lesion', ['gu mine', 'gu mines']),
  def('Ela', ['grzmot', 'grzmot mine', 'grzmot mines']),
  def('Vigil', ['erc 7'], ['vigil']),
  def('Maestro', ['evil eye', 'evil eyes'], ['maestro']),
  def('Alibi', ['prisma', 'prismas'], ['alibi']),
  def('Clash', ['cce shield'], ['clash']),
  def('Kaid', ['electroclaw', 'electroclaws', 'rtila']),
  def('Mozzie', ['mozz', 'mozi', 'pest launcher', 'pests']),
  def('Warden', ['glance smart glasses'], ['warden']),
  def('Goyo', ['volcan', 'volcans', 'volcan shield']),
  def('Wamai', ['mag net', 'magnet', 'magnets'], ['magnet', 'magnets']),
  def('Oryx', ['remah dash']),
  def('Melusi', ['melosi', 'banshee', 'banshees']),
  def('Aruni', ['surya gate', 'surya gates']),
  def('Thunderbird', ['tbird', 'thunder bird', 'kona', 'kona station', 'kona stations']),
  def('Thorn', ['razorbloom', 'razorblooms'], ['thorn']),
  def('Azami', ['kiba', 'kibas', 'kiba barrier', 'kiba barriers', 'a zombie', 'azzami']),
  def('Solis', ['spec io'], ['solis']),
  def('Fenrir', ['f natt', 'dread mine', 'dread mines']),
  def('Tubarão', ['tubarao', 'zoto', 'zoto canister', 'zoto canisters']),
  def('Sentry', [], ['sentry']),
  def('Skopós', ['skopos', 'talos']),
  def('Rauora', ['dom panel', 'd o m panel']),
  def('Denari', ['trip connector', 'trip connectors']),
];

/** Alias jamais utilisés pour la détection (« ace » veut presque toujours dire 5 kills). */
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
  { id:'trick', name:'Astuce / spot', keywords:['trick', 'tricks', 'astuce', 'astuces', 'tips', 'tip', 'spot', 'spots', 'secret', 'glitch', 'bug', 'hack', 'hidden', 'cache', 'one way', 'pixel'] },
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

/** Libellé d'un bombsite tel qu'il est enregistré dans le champ « Site » : « 2F · Bureau du PDG / Salon de direction ». */
export const siteLabel = ([floor, fr]) => `${floor} · ${fr}`;

/**
 * Propositions pour le champ « Site » : bombsites puis salles de la map
 * (de toutes les maps si aucune n'est choisie), filtrées sur le français,
 * l'anglais et les mots-clés.
 * @returns {{ label:string, hint:string, map:string, kind:'site'|'room' }[]}
 */
export function siteSuggestions(mapId = '', query = '', normalizeText = value => value.toLowerCase()) {
  const words = normalizeText(query).split(' ').filter(Boolean);
  const maps = mapId ? [mapId] : MAPS.map(map => map.id);
  const out = [];
  for (const id of maps) {
    for (const site of SITES[id] || []) {
      out.push({ label:siteLabel(site), hint:site[2], map:id, kind:'site', haystack:normalizeText(`${site[0]} ${site[1]} ${site[2]} ${site[3].join(' ')}`) });
    }
    for (const [fr, en] of ROOMS[id] || []) {
      out.push({ label:fr, hint:en === fr ? '' : en, map:id, kind:'room', haystack:normalizeText(`${fr} ${en}`) });
    }
  }
  return out.filter(entry => words.every(word => entry.haystack.includes(word)))
    .map(({ haystack:_haystack, ...entry }) => entry);
}
