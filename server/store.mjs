/**
 * Stockage JSON des strats et des sessions (petits volumes : quelques
 * centaines de strats). Écriture atomique (fichier temporaire + rename).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, MAPS, SIDES, STATUSES, TAGS } from '../public/js/r6.mjs';
import { autofill } from './transcript.mjs';

export class JsonFile {
  constructor(path, fallback) {
    this.path = path;
    try { this.data = JSON.parse(readFileSync(path, 'utf8')); } catch { this.data = fallback; }
    this.timer = null;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
    this.timer.unref?.();
  }

  /** Écrit sur le disque. Une erreur (disque plein…) est journalisée sans arrêter le serveur. */
  flush() {
    clearTimeout(this.timer);
    try {
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      renameSync(tmp, this.path);
      return true;
    } catch (error) {
      console.error(`Écriture de ${this.path} impossible :`, error.message);
      this.timer = setTimeout(() => this.flush(), 10_000);
      this.timer.unref?.();
      return false;
    }
  }
}

const MAP_IDS = new Set(MAPS.map(map => map.id));
const AGENT_IDS = new Set(AGENTS.map(agent => agent.id));
const TAG_IDS = new Set(TAGS.map(tag => tag.id));
const SIDE_IDS = new Set(SIDES.map(side => side.id));
const STATUS_IDS = new Set(STATUSES.map(status => status.id));

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const ids = (value, allowed) => [...new Set((Array.isArray(value) ? value : []).map(String).filter(id => allowed.has(id)))];

export function isTikTokUrl(raw) {
  try {
    const url = new URL(String(raw));
    return url.protocol === 'https:' && (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'));
  } catch { return false; }
}

/** Champs modifiables par les membres, nettoyés. Seuls les champs présents sont renvoyés. */
export function sanitizeFields(input = {}) {
  const out = {};
  if ('title' in input) out.title = text(input.title, 160);
  if ('description' in input) out.description = text(input.description, 2000);
  if ('map' in input) out.map = MAP_IDS.has(input.map) ? input.map : '';
  if ('side' in input) out.side = SIDE_IDS.has(input.side) ? input.side : '';
  if ('site' in input) out.site = text(input.site, 80);
  if ('agents' in input) out.agents = ids(input.agents, AGENT_IDS);
  if ('tags' in input) out.tags = ids(input.tags, TAG_IDS);
  if ('status' in input) out.status = STATUS_IDS.has(input.status) ? input.status : 'todo';
  if ('notes' in input) out.notes = text(input.notes, 4000);
  return out;
}

export function newId() {
  return `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}

export class Store {
  constructor(dataDir) {
    mkdirSync(join(dataDir, 'media'), { recursive:true });
    this.mediaDir = join(dataDir, 'media');
    this.file = new JsonFile(join(dataDir, 'strats.json'), { items:{} });
    this.listeners = new Set();
  }

  get items() { return this.file.data.items; }

  list() { return Object.values(this.items); }

  get(id) { return this.items[id] || null; }

  findByVideo(videoId) {
    return videoId ? this.list().find(item => item.videoId === videoId) || null : null;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    this.file.save();
    for (const listener of this.listeners) {
      try { listener(); } catch { /* client parti */ }
    }
  }

  create({ url, videoId, author }, fields, user) {
    const now = Date.now();
    const item = {
      id:newId(), url, videoId, author:text(author, 80),
      title:'', description:'', map:'', side:'', site:'', agents:[], tags:[], status:'todo', notes:'',
      ...sanitizeFields(fields),
      video:{ status:videoId ? 'pending' : 'none', attempts:0 },
      addedBy:user, addedAt:now, updatedBy:user, updatedAt:now,
    };
    this.items[item.id] = item;
    this.changed();
    return item;
  }

  update(id, fields, user) {
    const item = this.get(id);
    if (!item) return null;
    const clean = sanitizeFields(fields);
    // Un champ retouché par un membre n'est plus « complété automatiquement ».
    if (item.auto?.length) {
      item.auto = item.auto.filter(field => !(field in clean) || JSON.stringify(clean[field]) === JSON.stringify(item[field]));
    }
    Object.assign(item, clean, { updatedBy:user, updatedAt:Date.now() });
    this.changed();
    return item;
  }

  /** Range les sous-titres et complète les champs encore vides. Renvoie les champs complétés. */
  applyTranscript(id, text) {
    const item = this.get(id);
    if (!item) return [];
    item.transcript = text || '';
    const { patch, filled } = autofill(item, item.transcript);
    Object.assign(item, sanitizeFields(patch));
    if (filled.length) item.auto = [...new Set([...(item.auto || []), ...filled])];
    this.changed();
    return filled;
  }

  setVideo(id, video) {
    const item = this.get(id);
    if (!item) return;
    item.video = { ...(item.video || {}), ...video };
    this.changed();
  }

  remove(id) {
    const item = this.get(id);
    if (!item) return null;
    delete this.items[id];
    this.changed();
    return item;
  }
}
