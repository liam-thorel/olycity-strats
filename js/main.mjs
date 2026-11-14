import { CONFIG } from '../config.js';
import { currentProfile, db, escapeHTML, loadMembers, onProfileChange, pickProfile } from '../sdk/olycity.mjs';
import { cleanTitle, detectStrat, normalize } from './detect.mjs';
import { AGENTS, MAPS, STATUSES, TAGS, agentById, mapById, sideById, statusById, tagById } from './r6.mjs';
import { embedUrl, extractTikTokUrls, fetchTikTokMeta } from './tiktok.mjs';

const ITEMS = `${CONFIG.DB_ROOT}/items`;
const $ = selector => document.querySelector(selector);

const state = {
  items:{},
  loaded:false,
  profile:null,
  filters:{ map:decodeURIComponent(location.hash.slice(1)), side:'', agent:'', tag:'', status:'', q:'' },
};

/* ─── Données ─────────────────────────────────────────────────────────── */

const asList = value => (Array.isArray(value) ? value : Object.values(value || {})).filter(Boolean);

function normalizeStrat(id, raw = {}) {
  return {
    id,
    url:String(raw.url || ''),
    videoId:String(raw.videoId || ''),
    author:String(raw.author || ''),
    description:String(raw.description || ''),
    title:String(raw.title || ''),
    map:String(raw.map || ''),
    side:String(raw.side || ''),
    site:String(raw.site || ''),
    agents:asList(raw.agents).map(String),
    tags:asList(raw.tags).map(String),
    status:String(raw.status || 'todo'),
    notes:String(raw.notes || ''),
    addedBy:raw.addedBy || null,
    addedAt:Number(raw.addedAt) || 0,
    updatedBy:raw.updatedBy || null,
    updatedAt:Number(raw.updatedAt) || 0,
  };
}

const strats = () => Object.entries(state.items || {}).map(([id, raw]) => normalizeStrat(id, raw));

function by() {
  const profile = state.profile;
  return profile ? { id:profile.id, name:profile.name } : { id:'guest', name:'Invité' };
}

/** Champs enregistrés dans Firebase (les tableaux vides sont gardés en []: Firebase les ignore). */
function toRecord(draft) {
  return {
    url:draft.url, videoId:draft.videoId, author:draft.author,
    description:draft.description.slice(0, 2000), title:draft.title.slice(0, 160),
    map:draft.map, side:draft.side, site:draft.site.slice(0, 80),
    agents:draft.agents, tags:draft.tags, status:draft.status, notes:draft.notes.slice(0, 4000),
  };
}

function draftFromMeta(meta) {
  const detected = detectStrat(meta.description);
  return {
    id:'', url:meta.url, videoId:meta.videoId, author:meta.author, description:meta.description,
    title:cleanTitle(meta.description), status:'todo', notes:'', ...detected,
  };
}

const findByVideo = videoId => videoId && strats().find(strat => strat.videoId === videoId);

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

function renderProfileChip(profile) {
  $('#profile-chip').innerHTML = profile
    ? `${profile.avatar ? `<img src="${escapeHTML(profile.avatar)}" alt="">` : `<span>${escapeHTML(profile.name.slice(0, 1))}</span>`}<strong>${escapeHTML(profile.name)}</strong>`
    : '<span>?</span><strong>Choisir mon profil</strong>';
}

function renderMaps() {
  const visible = strats().filter(strat => matches(strat, { ignoreMap:true }));
  const counts = visible.reduce((acc, strat) => ({ ...acc, [strat.map || 'none']:(acc[strat.map || 'none'] || 0) + 1 }), {});
  const button = (id, name, count) => `<button type="button" class="map-btn${state.filters.map === id ? ' is-active' : ''}${count ? '' : ' is-empty'}" data-map="${id}">
    <span>${escapeHTML(name)}</span><small>${count}</small></button>`;
  const used = MAPS.filter(map => counts[map.id]);
  const unused = MAPS.filter(map => !counts[map.id]);
  $('#maps').innerHTML = [
    button('', 'Toutes les maps', visible.length).replace(' is-empty', ''),
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
  if (!CONFIG.TIKTOK_ENDPOINT || !strat.videoId) return fallback;
  return `${fallback}<img src="${escapeHTML(`${CONFIG.TIKTOK_ENDPOINT}/cover/${strat.videoId}`)}" alt="" loading="lazy" onerror="this.remove()">`;
}

function cardHTML(strat) {
  const side = sideById(strat.side);
  const status = statusById(strat.status);
  const agents = strat.agents.map(id => agentById(id) || { id, name:id, side:'' });
  return `<button type="button" class="strat" data-id="${escapeHTML(strat.id)}">
    <div class="strat-cover">${coverHTML(strat)}
      <div class="strat-badges">
        ${side ? `<span class="pill ${side.id}">${side.short}</span>` : ''}
        ${strat.site ? `<span class="pill">${escapeHTML(strat.site)}</span>` : ''}
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
  const options = (list, label = item => item.name) => list.map(item => `<option value="${item.id}">${escapeHTML(label(item))}</option>`).join('');
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

function renderVideo() {
  $('#sheet-video').innerHTML = draft.videoId
    ? `<iframe src="${escapeHTML(embedUrl(draft.videoId))}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="Vidéo TikTok"></iframe>`
    : `<p class="placeholder">${draft.url ? 'Lecture de la vidéo…' : 'Pas de vidéo'}</p>`;
}

function readSheet() {
  draft.title = $('#f-title').value.trim();
  draft.description = $('#f-description').value.trim();
  draft.map = $('#f-map').value;
  draft.site = $('#f-site').value.trim();
  draft.notes = $('#f-notes').value.trim();
}

function openSheet(nextDraft, { isNew = false, source = '' } = {}) {
  draft = { ...nextDraft, agents:[...nextDraft.agents], tags:[...nextDraft.tags] };
  sheet.classList.toggle('is-new', isNew);
  $('#sheet-title').textContent = isNew ? 'Nouvelle strat' : (mapById(draft.map)?.name || 'Strat');
  $('#save-btn').textContent = isNew ? 'Ajouter' : 'Enregistrer';
  $('#sheet-error').textContent = '';
  const credits = [
    draft.author ? `@${draft.author}` : '',
    nextDraft.addedBy?.name ? `ajoutée par ${nextDraft.addedBy.name} ${timeAgo(nextDraft.addedAt)}` : '',
    nextDraft.updatedBy?.name && nextDraft.updatedAt !== nextDraft.addedAt ? `modifiée par ${nextDraft.updatedBy.name} ${timeAgo(nextDraft.updatedAt)}` : '',
  ].filter(Boolean).join(' · ');
  $('#sheet-source').textContent = source || credits;
  fillSheet();
  renderVideo();
  if (!sheet.open) sheet.showModal();
}

function openStrat(id) {
  const strat = strats().find(item => item.id === id);
  if (strat) openSheet(strat);
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
    const author = by();
    const now = Date.now();
    if (draft.id) {
      await db.update(`${ITEMS}/${draft.id}`, { ...toRecord(draft), updatedBy:author, updatedAt:now });
      toast('Strat enregistrée');
    } else {
      const duplicate = findByVideo(draft.videoId);
      if (duplicate) {
        toast('Ce TikTok est déjà dans la liste');
        openStrat(duplicate.id);
        return;
      }
      await db.push(ITEMS, { ...toRecord(draft), addedBy:author, addedAt:now, updatedBy:author, updatedAt:now });
      toast('Strat ajoutée');
    }
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
  if (!confirm(`Supprimer « ${name} » pour tout le monde ?`)) return;
  try {
    await db.remove(`${ITEMS}/${draft.id}`);
    sheet.close();
    toast('Strat supprimée');
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

async function ensureProfile() {
  let asked = false;
  try { asked = Boolean(sessionStorage.getItem('strats-asked-profile')); sessionStorage.setItem('strats-asked-profile', '1'); } catch { /* navigation privée */ }
  if (!state.profile && !asked) {
    state.profile = await pickProfile({ title:'Qui ajoute ?', subtitle:'Ton nom sera affiché sur les strats que tu ajoutes.' });
  }
}

async function addOne(url) {
  openSheet(draftFromMeta({ url, videoId:'', author:'', description:'' }), { isNew:true, source:'Récupération du titre…' });
  const meta = await fetchTikTokMeta(url, CONFIG.TIKTOK_ENDPOINT);
  if (!sheet.open || draft.id || draft.url !== url) return;
  const duplicate = findByVideo(meta.videoId);
  if (duplicate) {
    toast('Ce TikTok est déjà dans la liste');
    openStrat(duplicate.id);
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
  const seen = new Set();
  for (const [index, url] of urls.entries()) {
    setAddStatus(`Ajout ${index + 1}/${urls.length}…`);
    const meta = await fetchTikTokMeta(url, CONFIG.TIKTOK_ENDPOINT);
    if (findByVideo(meta.videoId) || seen.has(meta.videoId || url)) { duplicates += 1; continue; }
    seen.add(meta.videoId || url);
    const author = by();
    const now = Date.now();
    await db.push(ITEMS, { ...toRecord(draftFromMeta(meta)), addedBy:author, addedAt:now, updatedBy:author, updatedAt:now });
    added += 1;
    if (!meta.description) untitled += 1;
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
  await ensureProfile();
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
    history.replaceState(null, '', state.filters.map ? `#${state.filters.map}` : location.pathname + location.search);
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
  $('#redetect').addEventListener('click', redetect);
  $('#sheet-form').addEventListener('submit', event => { event.preventDefault(); saveSheet(); });
  $('#delete-btn').addEventListener('click', deleteStrat);
  sheet.addEventListener('click', event => {
    if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
  });
  sheet.addEventListener('close', () => { $('#sheet-video').innerHTML = ''; draft = null; });

  $('#profile-chip').addEventListener('click', () => pickProfile({ title:'Qui es-tu ?', subtitle:'Ton nom sera affiché sur les strats que tu ajoutes ou modifies.' }));
  onProfileChange(profile => { state.profile = profile; renderProfileChip(profile); });
  addEventListener('hashchange', () => { state.filters.map = decodeURIComponent(location.hash.slice(1)); render(); });
}

/* ─── Démarrage ───────────────────────────────────────────────────────── */

function start() {
  $('#f-status').innerHTML = STATUSES.map(status => `<button type="button" data-status="${status.id}">${escapeHTML(status.name)}</button>`).join('');
  fillFilterSelects();
  bindEvents();
  render();
  db.subscribe(ITEMS, items => {
    state.items = items || {};
    state.loaded = true;
    render();
  }, {
    onError:() => {
      if (!state.loaded) $('#results').innerHTML = '<p class="empty">Connexion à la base impossible pour le moment. Réessaie dans un instant.</p>';
    },
  });
  loadMembers().then(currentProfile).then(profile => {
    state.profile = profile;
    renderProfileChip(profile);
  });
}

start();
