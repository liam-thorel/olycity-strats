import { api, logout, me, subscribe } from './api.mjs';
import { cleanTitle, detectStrat, normalize } from './detect.mjs';
import { AGENTS, MAPS, STATUSES, TAGS, agentById, mapById, sideById, statusById, tagById } from './r6.mjs';
import { embedUrl, extractTikTokUrls, fetchTikTokMeta } from './tiktok.mjs';

const $ = selector => document.querySelector(selector);

export const escapeHTML = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const state = {
  items:{},
  loaded:false,
  user:null,
  filters:{ map:decodeURIComponent(location.hash.slice(1)), side:'', agent:'', tag:'', status:'', q:'' },
};

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
    strat.title, strat.description, strat.notes, strat.site, strat.author,
    mapById(strat.map)?.name, ...strat.agents.map(id => agentById(id)?.name || id),
    ...strat.tags.map(id => tagById(id)?.name || id), strat.addedBy?.name,
  ].join(' '));
}

function matches(strat, { ignoreMap = false } = {}) {
  const { map, side, agent, tag, status, q } = state.filters;
  if (!ignoreMap && map && (map === 'none' ? strat.map : strat.map !== map)) return false;
  if (side && strat.side !== side) return false;
  if (agent && !strat.agents.includes(agent)) return false;
  if (tag && !strat.tags.includes(tag)) return false;
  if (status && strat.status !== status) return false;
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
  return `${fallback}<img src="/media/${escapeHTML(strat.videoId)}.jpg" alt="" loading="lazy">`;
}

const VIDEO_BADGES = {
  pending:'<span class="pill video-pending" title="Copie de la vidéo en attente">⏳</span>',
  downloading:'<span class="pill video-pending" title="Copie de la vidéo en cours">⏳</span>',
  failed:'<span class="pill video-failed" title="Copie de la vidéo impossible : lecteur TikTok">TikTok</span>',
};

function cardHTML(strat) {
  const side = sideById(strat.side);
  const status = statusById(strat.status);
  const agents = strat.agents.map(id => agentById(id) || { id, name:id, side:'' });
  return `<button type="button" class="strat" data-id="${escapeHTML(strat.id)}">
    <div class="strat-cover">${coverHTML(strat)}
      <div class="strat-badges">
        ${side ? `<span class="pill ${side.id}">${side.short}</span>` : ''}
        ${strat.site ? `<span class="pill">${escapeHTML(strat.site)}</span>` : ''}
        ${VIDEO_BADGES[strat.video?.status] || ''}
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
  results.innerHTML = order.map(id => `<section class="map-group">
    <h2>${escapeHTML(mapById(id)?.name || 'Sans map')} <small>${groups.get(id).length} strat${groups.get(id).length > 1 ? 's' : ''}</small></h2>
    <div class="cards">${groups.get(id).map(cardHTML).join('')}</div>
  </section>`).join('');
}

function render() {
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
  const atk = group('atk');
  const def = group('def');
  $('#f-agents').innerHTML = `${atk ? `<h3>Attaque</h3><div class="chips">${atk}</div>` : ''}${def ? `<h3>Défense</h3><div class="chips">${def}</div>` : ''}`;
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
  renderSheetChoices();
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
    box.innerHTML = `<video src="/media/${escapeHTML(draft.videoId)}.mp4" ${draft.video.cover ? `poster="/media/${escapeHTML(draft.videoId)}.jpg"` : ''} controls autoplay loop playsinline preload="auto"></video>`;
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
  draft = { ...nextDraft, agents:[...nextDraft.agents], tags:[...nextDraft.tags], video:{ ...(nextDraft.video || {}) } };
  sheet.classList.toggle('is-new', isNew);
  $('#sheet-title').textContent = isNew ? 'Nouvelle strat' : (mapById(draft.map)?.name || 'Strat');
  $('#save-btn').textContent = isNew ? 'Ajouter' : 'Enregistrer';
  $('#sheet-error').textContent = '';
  $('#sheet-source').textContent = source || credits(nextDraft);
  fillSheet();
  shownVideo = '';
  renderVideo();
  if (!sheet.open) sheet.showModal();
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
}

function redetect() {
  readSheet();
  const detected = detectStrat(`${draft.title} ${draft.description}`);
  if (detected.map) draft.map = detected.map;
  if (detected.side) draft.side = detected.side;
  if (detected.site && !draft.site) draft.site = detected.site;
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

/* ─── Événements ──────────────────────────────────────────────────────── */

function bindEvents() {
  $('#add-form').addEventListener('submit', onAdd);
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
  for (const [selector, key] of [['#agent-filter', 'agent'], ['#tag-filter', 'tag'], ['#status-filter', 'status']]) {
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
    chip.setAttribute('aria-pressed', String(draft.tags.includes(id)));
  });
  $('#sheet-video').addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) retryVideo();
  });
  $('#redetect').addEventListener('click', redetect);
  $('#sheet-form').addEventListener('submit', event => { event.preventDefault(); saveSheet(); });
  $('#delete-btn').addEventListener('click', deleteStrat);
  sheet.addEventListener('click', event => {
    if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
  });
  sheet.addEventListener('close', () => { $('#sheet-video').innerHTML = ''; shownVideo = ''; draft = null; });

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
