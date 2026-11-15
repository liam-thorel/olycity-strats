import { api, logout, me, subscribe } from './api.mjs';
import { cleanTitle, detectStrat, normalize } from './detect.mjs';
import { AGENTS, MAPS, STATUSES, TAGS, agentById, mapById, sideById, siteSuggestions, statusById, tagById } from './r6.mjs';
import { embedUrl, extractTikTokUrls, fetchTikTokMeta } from './tiktok.mjs';

const $ = selector => document.querySelector(selector);

export const escapeHTML = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const state = {
  items:{},
  loaded:false,
  user:null,
  filters:{ map:decodeURIComponent(location.hash.slice(1)), side:'', agent:'', tag:'', status:'', author:'', q:'' },
  lastVisit:0,
};

/** Dernière visite (strats « Nouveau ») : gardée dans ce navigateur. */
function readLastVisit() {
  try {
    state.lastVisit = Number(localStorage.getItem('strats-last-visit')) || Date.now();
    localStorage.setItem('strats-last-visit', String(Date.now()));
  } catch {
    state.lastVisit = Date.now();
  }
}

/* ─── Données ─────────────────────────────────────────────────────────── */

const strats = () => Object.values(state.items || {});
const findById = id => state.items[id] || null;

function draftFromMeta(meta) {
  const detected = detectStrat(meta.description);
  return {
    id:'', url:meta.url, videoId:meta.videoId, author:meta.author, description:meta.description,
    title:cleanTitle(meta.description), status:'todo', notes:'', video:{ status:'none' }, ...detected,
  };
}

const editableFields = draft => ({
  title:draft.title, description:draft.description, map:draft.map, side:draft.side, site:draft.site,
  agents:draft.agents, tags:draft.tags, status:draft.status, notes:draft.notes,
  clipStart:draft.clipStart || 0, clipEnd:draft.clipEnd || 0,
});

async function createStrat(draft) {
  try {
    const { item } = await api('/api/strats', {
      method:'POST',
      body:{ url:draft.url, videoId:draft.videoId, author:draft.author, ...editableFields(draft) },
    });
    state.items = { ...state.items, [item.id]:item };
    return { item };
  } catch (error) {
    if (error.status === 409) return { duplicateId:error.body?.id };
    throw error;
  }
}

/* ─── Filtres ─────────────────────────────────────────────────────────── */

function haystack(strat) {
  return normalize([
    strat.title, strat.description, strat.notes, strat.site, strat.author, strat.transcript,
    mapById(strat.map)?.name, mapById(strat.map)?.en, ...strat.agents.map(id => agentById(id)?.name || id),
    ...strat.tags.map(id => tagById(id)?.name || id), strat.addedBy?.name,
  ].join(' '));
}

function matches(strat, { ignoreMap = false } = {}) {
  const { map, side, agent, tag, status, author, q } = state.filters;
  if (!ignoreMap && map && (map === 'none' ? strat.map : strat.map !== map)) return false;
  if (side && strat.side !== side) return false;
  if (agent && !strat.agents.includes(agent)) return false;
  if (tag && !strat.tags.includes(tag)) return false;
  if (status && strat.status !== status) return false;
  if (author && strat.addedBy?.id !== author) return false;
  if (q && !normalize(q).split(' ').every(word => haystack(strat).includes(word))) return false;
  return true;
}

/* ─── Rendu ───────────────────────────────────────────────────────────── */

function renderUserChip() {
  const user = state.user;
  $('#profile-chip').innerHTML = user
    ? `${user.avatar ? `<img src="${escapeHTML(user.avatar)}" alt="">` : `<span>${escapeHTML(user.name.slice(0, 1))}</span>`}<strong>${escapeHTML(user.name)}</strong>`
    : '';
  $('#profile-chip').hidden = !user;
}

function renderMaps() {
  const visible = strats().filter(strat => matches(strat, { ignoreMap:true }));
  const counts = visible.reduce((acc, strat) => ({ ...acc, [strat.map || 'none']:(acc[strat.map || 'none'] || 0) + 1 }), {});
  const button = (id, name, count, always = false) => `<button type="button" class="map-btn${state.filters.map === id ? ' is-active' : ''}${count || always ? '' : ' is-empty'}" data-map="${id}">
    <span>${escapeHTML(name)}</span><small>${count}</small></button>`;
  const used = MAPS.filter(map => counts[map.id]);
  const unused = MAPS.filter(map => !counts[map.id]);
  $('#maps').innerHTML = [
    button('', 'Toutes les maps', visible.length, true),
    ...used.map(map => button(map.id, map.name, counts[map.id])),
    counts.none ? button('none', 'Sans map', counts.none) : '',
    unused.length ? '<p class="maps-sep">Pas encore de strat</p>' : '',
    ...unused.map(map => button(map.id, map.name, 0)),
  ].join('');
}

const timeAgo = timestamp => {
  if (!timestamp) return '';
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 2) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
};

function coverHTML(strat) {
  const fallback = `<span class="placeholder">${escapeHTML(mapById(strat.map)?.name || 'R6')}</span>`;
  if (!strat.video?.cover) return fallback;
  return `${fallback}<img src="/media/${escapeHTML(strat.videoId)}.jpg?v=${Number(strat.video.v) || 0}" alt="" loading="lazy">`;
}

const VIDEO_BADGES = {
  pending:'<span class="pill video-pending" title="Copie de la vidéo en attente">⏳</span>',
  downloading:'<span class="pill video-pending" title="Copie de la vidéo en cours">⏳</span>',
  failed:'<span class="pill video-failed" title="Copie de la vidéo impossible : lecteur TikTok">TikTok</span>',
};

/** Site court pour les cartes : « 2F · Bureau du PDG » (le libellé complet reste en info-bulle). */
const shortSite = site => String(site || '').split(' / ')[0];

const isNew = strat => strat.addedAt > state.lastVisit && strat.addedBy?.id !== state.user?.id;

function cardHTML(strat) {
  const side = sideById(strat.side);
  const status = statusById(strat.status);
  const agents = strat.agents.map(id => agentById(id) || { id, name:id, side:'' });
  const preview = strat.video?.status === 'ready' ? ` data-preview="${escapeHTML(strat.videoId)}"` : '';
  const cut = strat.clipStart || strat.clipEnd;
  return `<button type="button" class="strat${isNew(strat) ? ' is-new' : ''}" data-id="${escapeHTML(strat.id)}"${preview}>
    <div class="strat-cover">${coverHTML(strat)}
      <div class="strat-badges">
        ${isNew(strat) ? '<span class="pill new">Nouveau</span>' : ''}
        ${side ? `<span class="pill ${side.id}">${side.short}</span>` : ''}
        ${strat.site ? `<span class="pill site" title="${escapeHTML(strat.site)}">${escapeHTML(shortSite(strat.site))}</span>` : ''}
        ${VIDEO_BADGES[strat.video?.status] || ''}
        ${cut ? `<span class="pill clip-pill" title="Extrait ${formatTime(strat.clipStart)} → ${strat.clipEnd ? formatTime(strat.clipEnd) : 'fin'}">✂️</span>` : ''}
        ${status ? `<span class="pill status-${status.id}">${escapeHTML(status.name)}</span>` : ''}
      </div>
    </div>
    <div class="strat-body">
      <span class="strat-title${strat.title ? '' : ' is-untitled'}">${escapeHTML(strat.title || 'Sans titre')}</span>
      ${agents.length ? `<div class="strat-agents">${agents.map(agent => `<span class="agent-tag ${agent.side}">${escapeHTML(agent.name)}</span>`).join('')}</div>` : ''}
      <span class="strat-meta">${strat.addedBy?.name ? `<b>${escapeHTML(strat.addedBy.name)}</b> · ` : ''}${timeAgo(strat.addedAt)}${strat.tags.length ? ` · ${strat.tags.map(id => escapeHTML(tagById(id)?.name || id)).join(', ')}` : ''}</span>
    </div>
  </button>`;
}

function renderResults() {
  const results = $('#results');
  if (!state.loaded) return;
  const list = strats().filter(strat => matches(strat)).sort((left, right) => right.addedAt - left.addedAt);
  if (!list.length) {
    const total = strats().length;
    results.innerHTML = `<p class="empty">${total ? 'Aucune strat ne correspond à ces filtres.' : 'Aucune strat pour le moment : colle un lien TikTok au-dessus pour commencer.'}</p>`;
    return;
  }
  const groups = new Map();
  for (const strat of list) {
    const key = strat.map || 'none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(strat);
  }
  const order = [...MAPS.map(map => map.id), 'none'].filter(id => groups.has(id));
  const sideCount = (list, side) => list.filter(strat => strat.side === side).length;
  results.innerHTML = order.map(id => {
    const list = groups.get(id);
    const map = mapById(id);
    const counts = [
      `${list.length} strat${list.length > 1 ? 's' : ''}`,
      sideCount(list, 'atk') ? `<span class="atk">${sideCount(list, 'atk')} ATK</span>` : '',
      sideCount(list, 'def') ? `<span class="def">${sideCount(list, 'def')} DEF</span>` : '',
    ].filter(Boolean).join(' · ');
    return `<section class="map-group">
    <h2>${escapeHTML(map?.name || 'Sans map')}${map && map.en !== map.name ? ` <em>${escapeHTML(map.en)}</em>` : ''} <small>${counts}</small></h2>
    <div class="cards">${list.map(cardHTML).join('')}</div>
  </section>`;
  }).join('');
}

/** Filtre « Ajoutée par » : les membres qui ont ajouté au moins une strat. */
function renderAuthorFilter() {
  const select = $('#author-filter');
  const authors = new Map(strats().filter(strat => strat.addedBy?.id).map(strat => [strat.addedBy.id, strat.addedBy.name]));
  const signature = [...authors].map(([id, name]) => `${id}:${name}`).sort().join('|');
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  select.innerHTML = `<option value="">Tout le monde</option>${[...authors].sort((left, right) => left[1].localeCompare(right[1], 'fr'))
    .map(([id, name]) => `<option value="${escapeHTML(id)}">${escapeHTML(id === state.user?.id ? `${name} (moi)` : name)}</option>`).join('')}`;
  select.value = authors.has(state.filters.author) ? state.filters.author : '';
}

function render() {
  renderAuthorFilter();
  renderMaps();
  renderResults();
}

function fillFilterSelects() {
  const options = list => list.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('');
  const sorted = [...AGENTS].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  $('#agent-filter').insertAdjacentHTML('beforeend',
    `<optgroup label="Attaque">${options(sorted.filter(agent => agent.side === 'atk'))}</optgroup>
     <optgroup label="Défense">${options(sorted.filter(agent => agent.side === 'def'))}</optgroup>`);
  $('#tag-filter').insertAdjacentHTML('beforeend', options(TAGS));
  $('#status-filter').insertAdjacentHTML('beforeend', options(STATUSES));
  $('#f-map').innerHTML = `<option value="">— Map inconnue —</option>${options(MAPS)}`;
}

/* ─── Fiche d'une strat ───────────────────────────────────────────────── */

const sheet = $('#sheet');
let draft = null;
let shownVideo = '';

function setSeg(root, attribute, value) {
  root.querySelectorAll('button').forEach(button => button.classList.toggle('is-active', button.dataset[attribute] === value));
}

function renderAgentPicker() {
  const query = normalize($('#agent-search').value);
  const group = side => AGENTS.filter(agent => agent.side === side)
    .filter(agent => !query || normalize(agent.name).includes(query) || draft.agents.includes(agent.id))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
    .map(agent => `<button type="button" class="chip ${agent.side}" data-agent="${agent.id}" aria-pressed="${draft.agents.includes(agent.id)}">${escapeHTML(agent.name)}</button>`)
    .join('');
  const html = { atk:group('atk'), def:group('def') };
  const title = { atk:'Attaque', def:'Défense' };
  const first = draft.side || '';
  if (!first) {
    $('#f-agents').innerHTML = ['atk', 'def'].map(side => (html[side] ? `<h3>${title[side]}</h3><div class="chips">${html[side]}</div>` : '')).join('');
  } else {
    // Le côté de la strat d'abord ; l'autre replié (déplié si on cherche ou s'il a un agent choisi).
    const other = first === 'atk' ? 'def' : 'atk';
    const otherOpen = query || draft.agents.some(id => agentById(id)?.side === other);
    $('#f-agents').innerHTML = `${html[first] ? `<h3>${title[first]}</h3><div class="chips">${html[first]}</div>` : ''}
      ${html[other] ? `<details class="other-side"${otherOpen ? ' open' : ''}><summary>Agents en ${title[other].toLowerCase()}</summary><div class="chips">${html[other]}</div></details>` : ''}`;
  }
  $('#agent-count').textContent = draft.agents.length ? `· ${draft.agents.length} choisi${draft.agents.length > 1 ? 's' : ''}` : '';
}

function renderSheetChoices() {
  setSeg($('#f-side'), 'side', draft.side);
  setSeg($('#f-status'), 'status', draft.status);
  $('#f-tags').innerHTML = TAGS.map(tag => `<button type="button" class="chip" data-tag="${tag.id}" aria-pressed="${draft.tags.includes(tag.id)}">${escapeHTML(tag.name)}</button>`).join('');
  renderAgentPicker();
}

function detectionSummary(detected) {
  const parts = [
    mapById(detected.map)?.name,
    sideById(detected.side)?.name,
    detected.site,
    ...detected.agents.map(id => agentById(id)?.name),
    ...detected.tags.map(id => tagById(id)?.name),
  ].filter(Boolean);
  return parts.length ? `Détecté dans le titre : ${parts.join(' · ')}` : 'Rien détecté dans le titre : à compléter à la main.';
}

function fillSheet() {
  $('#f-title').value = draft.title;
  $('#f-description').value = draft.description;
  $('#f-map').value = draft.map;
  $('#f-site').value = draft.site;
  $('#f-notes').value = draft.notes;
  $('#agent-search').value = '';
  $('#open-tiktok').href = draft.url || '#';
  $('#open-tiktok').hidden = !draft.url;
  $('#f-transcript').textContent = draft.transcript || '';
  $('#f-transcript-box').hidden = !draft.transcript;
  renderAutoMarks();
  renderSheetChoices();
  renderClip();
}

/** « ✨ auto » à côté des champs complétés depuis la vidéo, tant que personne ne les a retouchés. */
function renderAutoMarks() {
  for (const mark of sheet.querySelectorAll('[data-auto]')) mark.hidden = !(draft.auto || []).includes(mark.dataset.auto);
}

function untouch(field) {
  if (!draft?.auto?.includes(field)) return;
  draft.auto = draft.auto.filter(entry => entry !== field);
  renderAutoMarks();
}

/** Lecteur : notre copie si elle est prête, sinon le lecteur TikTok. */
function renderVideo() {
  const status = draft.video?.status || 'none';
  const key = `${draft.videoId}:${status === 'ready' ? 'copy' : 'tiktok'}:${status}`;
  if (key === shownVideo) return;
  shownVideo = key;
  const box = $('#sheet-video');
  if (!draft.videoId) {
    box.innerHTML = `<p class="placeholder">${draft.url ? 'Lecture de la vidéo…' : 'Pas de vidéo'}</p>`;
    return;
  }
  if (status === 'ready') {
    box.innerHTML = `<video src="/media/${escapeHTML(draft.videoId)}.mp4" ${draft.video.cover ? `poster="/media/${escapeHTML(draft.videoId)}.jpg?v=${Number(draft.video.v) || 0}"` : ''} controls autoplay playsinline preload="auto"></video>`;
    wireClip(box.querySelector('video'), () => draft);
    renderClip();
    return;
  }
  const notes = {
    pending:'Copie de la vidéo en attente : lecteur TikTok en attendant.',
    downloading:'Copie de la vidéo en cours : lecteur TikTok en attendant.',
    failed:`Copie impossible (${escapeHTML(draft.video.error || 'erreur inconnue')}). <button type="button" class="link-btn" data-retry>Réessayer</button>`,
  };
  box.innerHTML = `<iframe src="${escapeHTML(embedUrl(draft.videoId))}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="Vidéo TikTok"></iframe>
    ${notes[status] ? `<p class="video-note">${notes[status]}</p>` : ''}`;
}

/* ─── Découpe (extrait lu en boucle, la vidéo reste entière) ──────────── */

const formatTime = value => {
  const total = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(total / 60);
  const rest = (total - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
};

/**
 * Lecture limitée à [clipStart, clipEnd] : départ au début de l'extrait, retour au
 * début en atteignant la fin. On peut toujours chercher ailleurs à la main (pour
 * régler un nouveau début), la boucle reprend à la fin de l'extrait.
 */
function wireClip(video, source) {
  if (!video) return;
  const range = () => ({ start:Number(source()?.clipStart) || 0, end:Number(source()?.clipEnd) || 0 });
  video.addEventListener('loadedmetadata', () => {
    const { start } = range();
    if (start && start < video.duration) video.currentTime = start;
  });
  video.addEventListener('timeupdate', () => {
    const { start, end } = range();
    if (end && video.currentTime >= end) video.currentTime = start;
  });
  video.addEventListener('ended', () => {
    video.currentTime = range().start;
    video.play().catch(() => {});
  });
}

function renderClip() {
  const box = $('#clip-box');
  const ready = draft?.video?.status === 'ready';
  box.hidden = !ready;
  if (!ready) return;
  const start = Number(draft.clipStart) || 0;
  const end = Number(draft.clipEnd) || 0;
  const cut = start || end;
  $('#clip-times').textContent = cut ? `${formatTime(start)} → ${end ? formatTime(end) : 'fin'}` : 'Vidéo entière';
  $('#clip-times').classList.toggle('is-cut', Boolean(cut));
  $('#clip-reset').hidden = !cut;
  // Plusieurs strats dans un même TikTok : chaque passage peut devenir sa propre strat.
  $('#clip-extract').hidden = !draft.id || !cut;
  $('#clip-extract-hint').hidden = Boolean(draft.id);
  renderSiblings();
}

/** Les autres strats tirées de la même vidéo, pour passer de l'une à l'autre. */
function renderSiblings() {
  const box = $('#clip-siblings');
  const siblings = strats().filter(strat => strat.videoId === draft.videoId && strat.id !== draft.id)
    .sort((left, right) => (Number(left.clipStart) || 0) - (Number(right.clipStart) || 0));
  box.hidden = !siblings.length;
  box.innerHTML = siblings.length ? `<span class="label">Aussi dans ce TikTok</span>${siblings.map(strat => `
    <button type="button" class="sibling" data-open="${escapeHTML(strat.id)}">
      <span>${strat.clipStart || strat.clipEnd ? `✂️ ${formatTime(strat.clipStart)} → ${strat.clipEnd ? formatTime(strat.clipEnd) : 'fin'}` : 'Vidéo entière'}</span>
      <strong>${escapeHTML(strat.title || 'Sans titre')}</strong>
    </button>`).join('')}` : '';
}

async function extractClip() {
  if (!draft?.id) return;
  const button = $('#clip-extract');
  button.disabled = true;
  try {
    const { item } = await api(`/api/strats/${draft.id}/extract`, {
      method:'POST', body:{ clipStart:draft.clipStart || 0, clipEnd:draft.clipEnd || 0 },
    });
    state.items = { ...state.items, [item.id]:item };
    // La strat ouverte garde son propre découpage enregistré : on passe au passage suivant.
    const saved = findById(draft.id);
    draft.clipStart = saved?.clipStart || 0;
    draft.clipEnd = saved?.clipEnd || 0;
    render();
    renderClip();
    toast(`Nouvelle strat créée : « ${item.title} »`);
  } catch (error) {
    $('#sheet-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function setClip(which) {
  const video = $('#sheet-video video');
  if (!video || !draft) return;
  const now = Math.round(video.currentTime * 10) / 10;
  if (which === 'start') {
    draft.clipStart = now;
    if (draft.clipEnd && draft.clipEnd <= now) draft.clipEnd = 0;
  } else {
    if (now <= (Number(draft.clipStart) || 0)) {
      toast('La fin doit être après le début de l’extrait');
      return;
    }
    draft.clipEnd = now;
    video.currentTime = Number(draft.clipStart) || 0;
  }
  renderClip();
  toast('Extrait réglé : pense à enregistrer');
}

function resetClip() {
  if (!draft) return;
  draft.clipStart = 0;
  draft.clipEnd = 0;
  renderClip();
}

function readSheet() {
  draft.title = $('#f-title').value.trim();
  draft.description = $('#f-description').value.trim();
  draft.map = $('#f-map').value;
  draft.site = $('#f-site').value.trim();
  draft.notes = $('#f-notes').value.trim();
}

function credits(strat) {
  return [
    strat.author ? `@${strat.author}` : '',
    strat.addedBy?.name ? `ajoutée par ${strat.addedBy.name} ${timeAgo(strat.addedAt)}` : '',
    strat.updatedBy?.name && strat.updatedAt !== strat.addedAt ? `modifiée par ${strat.updatedBy.name} ${timeAgo(strat.updatedAt)}` : '',
  ].filter(Boolean).join(' · ');
}

function openSheet(nextDraft, { isNew = false, source = '' } = {}) {
  draft = { ...nextDraft, agents:[...nextDraft.agents], tags:[...nextDraft.tags], auto:[...(nextDraft.auto || [])], video:{ ...(nextDraft.video || {}) } };
  sheet.classList.toggle('is-new', isNew);
  $('#sheet-title').textContent = isNew ? 'Nouvelle strat' : (mapById(draft.map)?.name || 'Strat');
  $('#save-btn').textContent = isNew ? 'Ajouter' : 'Enregistrer';
  $('#sheet-error').textContent = '';
  const auto = nextDraft.auto || [];
  const filledFromVideo = auto.length ? ` · ✨ ${auto.length} champ${auto.length > 1 ? 's' : ''} complété${auto.length > 1 ? 's' : ''} depuis la vidéo` : '';
  $('#sheet-source').textContent = source || `${credits(nextDraft)}${filledFromVideo}`;
  fillSheet();
  shownVideo = '';
  renderVideo();
  if (!sheet.open) sheet.showModal();
  // Toujours repartir du haut de la fiche (titre et ✕ visibles), même après un focus automatique.
  for (const box of [sheet, sheet.querySelector('.sheet-body'), sheet.querySelector('.sheet-fields')]) box.scrollTop = 0;
}

function openStrat(id) {
  const strat = findById(id);
  if (strat) openSheet(strat);
}

/** Mise à jour en direct : la fiche ouverte suit l'état de la copie vidéo. */
function refreshOpenSheet() {
  if (!sheet.open || !draft?.id) return;
  const strat = findById(draft.id);
  if (!strat) {
    sheet.close();
    toast('Cette strat a été supprimée');
    return;
  }
  draft.video = { ...strat.video };
  renderVideo();
  // Sous-titres arrivés pendant que la fiche est ouverte : on complète ce qui est encore vide ici.
  if (strat.transcript && !draft.transcript) {
    readSheet();
    draft.transcript = strat.transcript;
    for (const field of strat.auto || []) {
      const empty = Array.isArray(draft[field]) ? !draft[field].length : !draft[field];
      if (empty) {
        draft[field] = Array.isArray(strat[field]) ? [...strat[field]] : strat[field];
        draft.auto = [...new Set([...draft.auto, field])];
      }
    }
    fillSheet();
    toast('✨ Sous-titres de la vidéo reçus : fiche complétée');
  }
}

function redetect() {
  readSheet();
  const fromTitle = detectStrat(`${draft.title} ${draft.description}`);
  // Ce qui est dit dans la vidéo complète ce que le titre ne dit pas.
  const fromVideo = draft.transcript
    ? detectStrat(draft.transcript, { mode:'transcript', side:fromTitle.side || draft.side, map:fromTitle.map || draft.map })
    : { map:'', side:'', agents:[], tags:[], site:'' };
  const detected = {
    map:fromTitle.map || fromVideo.map,
    side:fromTitle.side || fromVideo.side,
    site:fromTitle.site.includes('·') ? fromTitle.site : (fromVideo.site || fromTitle.site),
    agents:fromTitle.agents.length ? fromTitle.agents : fromVideo.agents,
    tags:[...new Set([...fromTitle.tags, ...fromVideo.tags])],
  };
  if (detected.map) draft.map = detected.map;
  if (detected.side) draft.side = detected.side;
  if (detected.site && (!draft.site || !draft.site.includes('·'))) draft.site = detected.site;
  draft.agents = [...new Set([...draft.agents, ...detected.agents])];
  draft.tags = [...new Set([...draft.tags, ...detected.tags])];
  if (!draft.title) draft.title = cleanTitle(draft.description);
  $('#sheet-source').textContent = detectionSummary(detected);
  fillSheet();
}

async function saveSheet() {
  readSheet();
  const button = $('#save-btn');
  button.disabled = true;
  $('#sheet-error').textContent = '';
  try {
    if (draft.id) {
      const { item } = await api(`/api/strats/${draft.id}`, { method:'PATCH', body:editableFields(draft) });
      state.items = { ...state.items, [item.id]:item };
      toast('Strat enregistrée');
    } else {
      const result = await createStrat(draft);
      if (result.duplicateId) {
        toast('Ce TikTok est déjà dans la liste');
        openStrat(result.duplicateId);
        return;
      }
      toast('Strat ajoutée : la vidéo est copiée sur le serveur');
    }
    render();
    sheet.close();
  } catch (error) {
    $('#sheet-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deleteStrat() {
  if (!draft?.id) return;
  const name = draft.title || 'cette strat';
  if (!confirm(`Supprimer « ${name} » pour tout le monde ? La copie de la vidéo sera effacée.`)) return;
  try {
    await api(`/api/strats/${draft.id}`, { method:'DELETE' });
    const { [draft.id]:_removed, ...rest } = state.items;
    state.items = rest;
    render();
    sheet.close();
    toast('Strat supprimée');
  } catch (error) {
    $('#sheet-error').textContent = error.message;
  }
}

async function retryVideo() {
  if (!draft?.id) return;
  try {
    await api(`/api/strats/${draft.id}/retry`, { method:'POST' });
    draft.video = { status:'pending' };
    renderVideo();
  } catch (error) {
    $('#sheet-error').textContent = error.message;
  }
}

/* ─── Ajout ───────────────────────────────────────────────────────────── */

let toastTimer = 0;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3_200);
}

function setAddStatus(message, isError = false) {
  const status = $('#add-status');
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function addOne(url) {
  openSheet(draftFromMeta({ url, videoId:'', author:'', description:'' }), { isNew:true, source:'Récupération du titre…' });
  const meta = await fetchTikTokMeta(url);
  if (!sheet.open || draft.id || draft.url !== url) return;
  if (meta.existingId && findById(meta.existingId)) {
    toast('Ce TikTok est déjà dans la liste');
    openStrat(meta.existingId);
    return;
  }
  const next = draftFromMeta(meta);
  openSheet(next, {
    isNew:true,
    source:meta.description ? detectionSummary(next) : 'Titre non récupéré : colle la description du TikTok puis « Re-détecter ».',
  });
}

async function addMany(urls) {
  let added = 0;
  let duplicates = 0;
  let untitled = 0;
  for (const [index, url] of urls.entries()) {
    setAddStatus(`Ajout ${index + 1}/${urls.length}…`);
    const meta = await fetchTikTokMeta(url);
    if (meta.existingId) { duplicates += 1; continue; }
    const result = await createStrat(draftFromMeta(meta));
    if (result.duplicateId) { duplicates += 1; continue; }
    added += 1;
    if (!meta.description) untitled += 1;
    render();
  }
  setAddStatus([
    `${added} strat${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}`,
    duplicates ? `${duplicates} déjà présente${duplicates > 1 ? 's' : ''}` : '',
    untitled ? `${untitled} sans titre à compléter` : '',
  ].filter(Boolean).join(' · '));
}

/** Lien copié dans TikTok → ajout direct (Safari demande une confirmation « Coller »). */
async function pasteFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    $('#add-input').focus();
    setAddStatus('Accès au presse-papiers refusé : appuie longuement dans le champ puis « Coller ».', true);
    return;
  }
  if (!extractTikTokUrls(text).length) {
    setAddStatus('Le presse-papiers ne contient pas de lien TikTok. Dans TikTok : Partager → Copier le lien.', true);
    return;
  }
  $('#add-input').value = text;
  $('#add-form').requestSubmit();
}

async function onAdd(event) {
  event.preventDefault();
  const input = $('#add-input');
  const urls = extractTikTokUrls(input.value);
  if (!urls.length) {
    setAddStatus('Aucun lien TikTok trouvé dans ce texte.', true);
    return;
  }
  input.value = '';
  setAddStatus('');
  try {
    if (urls.length === 1) await addOne(urls[0]);
    else await addMany(urls);
  } catch (error) {
    setAddStatus(error.message, true);
  }
}

/* ─── Autocomplétion du site (bombsites par paire, salles) ────────────── */

let suggestions = [];
let activeSuggestion = -1;

function renderSiteSuggestions() {
  const input = $('#f-site');
  const list = $('#site-suggest');
  const mapId = $('#f-map').value;
  suggestions = siteSuggestions(mapId, input.value, normalize).slice(0, mapId ? 30 : 12);
  activeSuggestion = -1;
  if (!suggestions.length || document.activeElement !== input) {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  let lastKind = '';
  list.innerHTML = suggestions.map((entry, index) => {
    const header = entry.kind !== lastKind
      ? `<li class="suggest-head" role="presentation">${entry.kind === 'site' ? '💣 Bombsites' : '🚪 Salles'}</li>` : '';
    lastKind = entry.kind;
    const mapName = mapId ? '' : `<em>${escapeHTML(mapById(entry.map)?.name || '')}</em>`;
    return `${header}<li role="option" id="suggest-${index}" data-index="${index}">
      <span>${escapeHTML(entry.label)}</span>${entry.hint ? `<small>${escapeHTML(entry.hint)}</small>` : ''}${mapName}</li>`;
  }).join('');
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function pickSuggestion(index) {
  const entry = suggestions[index];
  if (!entry) return;
  $('#f-site').value = entry.label;
  untouch('site');
  // Un bombsite choisi sans map : on règle la map avec.
  if (!$('#f-map').value) {
    $('#f-map').value = entry.map;
    untouch('map');
  }
  $('#site-suggest').hidden = true;
  $('#f-site').setAttribute('aria-expanded', 'false');
}

function moveSuggestion(step) {
  const items = [...$('#site-suggest').querySelectorAll('[data-index]')];
  if (!items.length) return;
  activeSuggestion = (activeSuggestion + step + items.length) % items.length;
  items.forEach((item, index) => item.classList.toggle('is-active', index === activeSuggestion));
  items[activeSuggestion].scrollIntoView({ block:'nearest' });
  $('#f-site').setAttribute('aria-activedescendant', items[activeSuggestion].id);
}

function bindSiteCombo() {
  const input = $('#f-site');
  const list = $('#site-suggest');
  input.addEventListener('focus', renderSiteSuggestions);
  input.addEventListener('input', () => { untouch('site'); renderSiteSuggestions(); });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 150));
  input.addEventListener('keydown', event => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestion(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestion(-1); }
    else if (event.key === 'Enter' && activeSuggestion >= 0) { event.preventDefault(); pickSuggestion(activeSuggestion); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); list.hidden = true; }
  });
  // pointerdown : avant que le champ perde le focus (sinon la liste disparaît avant le clic).
  list.addEventListener('pointerdown', event => {
    const item = event.target.closest('[data-index]');
    if (!item) return;
    event.preventDefault();
    pickSuggestion(Number(item.dataset.index));
  });
  $('#f-map').addEventListener('change', () => {
    untouch('map');
    if (document.activeElement === input) renderSiteSuggestions();
  });
}

/* ─── Aperçu vidéo au survol (ordinateur) ─────────────────────────────── */

function bindHoverPreview() {
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const results = $('#results');
  results.addEventListener('mouseover', event => {
    const card = event.target.closest('[data-preview]');
    if (!card || card.querySelector('video.preview')) return;
    const video = document.createElement('video');
    Object.assign(video, { muted:true, playsInline:true, autoplay:true, preload:'auto', className:'preview' });
    video.src = `/media/${card.dataset.preview}.mp4`;
    wireClip(video, () => findById(card.dataset.id));
    card.querySelector('.strat-cover').append(video);
  });
  results.addEventListener('mouseout', event => {
    const card = event.target.closest('[data-preview]');
    if (!card || card.contains(event.relatedTarget)) return;
    card.querySelector('video.preview')?.remove();
  });
}

/* ─── Événements ──────────────────────────────────────────────────────── */

function bindEvents() {
  $('#add-form').addEventListener('submit', onAdd);
  $('#paste-btn').addEventListener('click', pasteFromClipboard);
  $('#add-input').addEventListener('paste', () => setTimeout(() => {
    if (extractTikTokUrls($('#add-input').value).length) $('#add-form').requestSubmit();
  }));

  $('#maps').addEventListener('click', event => {
    const button = event.target.closest('[data-map]');
    if (!button) return;
    state.filters.map = button.dataset.map;
    history.replaceState(null, '', state.filters.map ? `#${state.filters.map}` : location.pathname);
    render();
    if (matchMedia('(max-width:860px)').matches) $('#results').scrollIntoView({ behavior:'smooth', block:'start' });
  });
  $('#side-filter').addEventListener('click', event => {
    const button = event.target.closest('[data-side]');
    if (!button) return;
    state.filters.side = button.dataset.side;
    setSeg($('#side-filter'), 'side', state.filters.side);
    render();
  });
  for (const [selector, key] of [['#agent-filter', 'agent'], ['#tag-filter', 'tag'], ['#status-filter', 'status'], ['#author-filter', 'author']]) {
    $(selector).addEventListener('change', event => { state.filters[key] = event.target.value; render(); });
  }
  $('#search').addEventListener('input', event => { state.filters.q = event.target.value.trim(); render(); });
  $('#results').addEventListener('click', event => {
    const card = event.target.closest('[data-id]');
    if (card) openStrat(card.dataset.id);
  });
  // Couverture absente ou effacée : on garde le nom de la map (pas de onerror en ligne, à cause de la CSP).
  $('#results').addEventListener('error', event => {
    if (event.target.tagName === 'IMG') event.target.remove();
  }, true);

  $('#f-side').addEventListener('click', event => {
    const button = event.target.closest('[data-side]');
    if (!button) return;
    draft.side = button.dataset.side;
    setSeg($('#f-side'), 'side', draft.side);
    untouch('side');
    renderAgentPicker();
  });
  $('#f-status').addEventListener('click', event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    draft.status = button.dataset.status;
    setSeg($('#f-status'), 'status', draft.status);
  });
  $('#f-agents').addEventListener('click', event => {
    const chip = event.target.closest('[data-agent]');
    if (!chip) return;
    const id = chip.dataset.agent;
    draft.agents = draft.agents.includes(id) ? draft.agents.filter(agent => agent !== id) : [...draft.agents, id];
    untouch('agents');
    if (!draft.side) {
      const sides = new Set(draft.agents.map(agent => agentById(agent)?.side));
      if (sides.size === 1) { draft.side = [...sides][0]; setSeg($('#f-side'), 'side', draft.side); }
    }
    renderAgentPicker();
  });
  $('#agent-search').addEventListener('input', renderAgentPicker);
  $('#f-tags').addEventListener('click', event => {
    const chip = event.target.closest('[data-tag]');
    if (!chip) return;
    const id = chip.dataset.tag;
    draft.tags = draft.tags.includes(id) ? draft.tags.filter(tag => tag !== id) : [...draft.tags, id];
    untouch('tags');
    chip.setAttribute('aria-pressed', String(draft.tags.includes(id)));
  });
  $('#sheet-video').addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) retryVideo();
  });
  // Molette au-dessus de la vidéo (ordinateur) : elle fait défiler les champs, pas la page.
  $('#sheet-video').addEventListener('wheel', event => {
    const fields = sheet.querySelector('.sheet-fields');
    if (fields.scrollHeight <= fields.clientHeight || getComputedStyle(fields).overflowY === 'visible') return;
    fields.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive:false });
  $('#redetect').addEventListener('click', redetect);
  $('#clip-start').addEventListener('click', () => setClip('start'));
  $('#clip-end').addEventListener('click', () => setClip('end'));
  $('#clip-reset').addEventListener('click', resetClip);
  $('#clip-extract').addEventListener('click', extractClip);
  $('#clip-siblings').addEventListener('click', event => {
    const target = event.target.closest('[data-open]');
    if (target) openStrat(target.dataset.open);
  });
  bindSiteCombo();
  bindHoverPreview();
  $('#sheet-form').addEventListener('submit', event => { event.preventDefault(); saveSheet(); });
  $('#delete-btn').addEventListener('click', deleteStrat);
  sheet.addEventListener('click', event => {
    if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
  });
  sheet.addEventListener('close', () => {
    // L'événement arrive après coup : si la fiche a été rouverte entre-temps, on n'efface rien.
    if (sheet.open) return;
    $('#sheet-video').innerHTML = '';
    shownVideo = '';
    draft = null;
  });

  $('#profile-chip').addEventListener('click', async () => {
    if (!confirm(`Connecté en tant que ${state.user?.name}. Se déconnecter ?`)) return;
    await logout();
    location.reload();
  });
  addEventListener('hashchange', () => { state.filters.map = decodeURIComponent(location.hash.slice(1)); render(); });
}

/* ─── Connexion ───────────────────────────────────────────────────────── */

const LOGIN_MESSAGES = {
  refuse:'Ce compte Discord n’est pas sur le serveur OLYCITY. Demande une invitation, puis reconnecte-toi.',
  annule:'Connexion annulée.',
  erreur:'La connexion avec Discord a échoué, réessaie.',
};

function showLogin() {
  const reason = new URLSearchParams(location.search).get('login');
  $('#login-message').textContent = LOGIN_MESSAGES[reason] || '';
  $('#login-message').hidden = !LOGIN_MESSAGES[reason];
  $('#login').hidden = false;
  $('#app').hidden = true;
}

/* ─── Partage depuis TikTok (Android : appli installée, iPhone : raccourci) ── */

const PENDING_SHARE = 'strats-pending-share';

/** Texte partagé (/share?text=…&url=… ou /?add=…), mis de côté pour survivre à la connexion Discord. */
function stashShare() {
  const params = new URLSearchParams(location.search);
  const shared = ['add', 'url', 'text', 'title'].map(key => params.get(key) || '').join(' ').trim();
  // Raccourci iPhone mal réglé : il ouvre /?add= sans rien derrière.
  if (!shared && (params.has('add') || location.pathname === '/share')) state.emptyShare = true;
  if (!shared) return;
  try { localStorage.setItem(PENDING_SHARE, shared); } catch { /* navigation privée : traité tout de suite si connecté */ }
  state.pendingShare = shared;
}

function takePendingShare() {
  let shared = state.pendingShare || '';
  try {
    shared = localStorage.getItem(PENDING_SHARE) || shared;
    localStorage.removeItem(PENDING_SHARE);
  } catch { /* stockage indisponible */ }
  state.pendingShare = '';
  return shared;
}

async function handleShareAndLinks() {
  const strat = new URLSearchParams(location.search).get('strat');
  const shared = takePendingShare();
  history.replaceState(null, '', `/${location.hash}`);
  if (state.emptyShare && !shared) {
    state.emptyShare = false;
    setAddStatus('Le partage est arrivé vide (TikTok ne transmet pas le lien aux raccourcis). Dans TikTok : Partager → Copier le lien, puis touche 📋 Coller.', true);
    $('#add-form').scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }
  if (shared) {
    const urls = extractTikTokUrls(shared);
    if (!urls.length) toast('Aucun lien TikTok dans ce partage');
    else if (urls.length === 1) await addOne(urls[0]);
    else await addMany(urls);
  } else if (strat) {
    if (findById(strat)) openStrat(strat);
    else toast('Cette strat n’existe plus');
  }
}

/* ─── Installation et aide ────────────────────────────────────────────── */

let installEvent = null;

function bindHelp() {
  const help = $('#help');
  $('#help-btn').addEventListener('click', () => help.showModal());
  help.addEventListener('click', event => {
    if (event.target === help || event.target.closest('[data-close]')) help.close();
  });
  $('#shortcut-prefix').textContent = `${location.origin}/?add=`;
  $('#copy-prefix').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#shortcut-prefix').textContent);
      toast('Adresse copiée');
    } catch {
      toast('Copie impossible : sélectionne le texte à la main');
    }
  });
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    $('#install-btn').hidden = false;
    $('#install-manual').hidden = true;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    $('#install-btn').hidden = true;
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ─── Démarrage ───────────────────────────────────────────────────────── */

async function start() {
  stashShare();
  let user;
  try {
    user = await me();
  } catch {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#results').innerHTML = '<p class="empty">Le serveur ne répond pas pour le moment. Réessaie dans un instant.</p>';
    return;
  }
  if (!user) {
    showLogin();
    return;
  }
  state.user = user;
  readLastVisit();
  $('#login').hidden = true;
  $('#app').hidden = false;
  renderUserChip();
  $('#f-status').innerHTML = STATUSES.map(status => `<button type="button" data-status="${status.id}">${escapeHTML(status.name)}</button>`).join('');
  fillFilterSelects();
  bindEvents();
  bindHelp();
  render();
  let first = true;
  subscribe(items => {
    state.items = items || {};
    state.loaded = true;
    render();
    refreshOpenSheet();
    if (first) {
      first = false;
      handleShareAndLinks().catch(error => setAddStatus(error.message, true));
    }
  }, {
    onUnauthorized:() => location.reload(),
    onError:() => {
      if (!state.loaded) $('#results').innerHTML = '<p class="empty">Connexion au serveur impossible pour le moment. Nouvel essai…</p>';
    },
  });
}

start();
