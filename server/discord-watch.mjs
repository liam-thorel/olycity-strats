/**
 * Salon Discord « strats » : chaque TikTok posté (depuis TikTok : Partager →
 * Discord) devient une strat, avec la même détection que le site. Le bot
 * répond avec le lien vers la fiche.
 *
 * Lecture par l'API REST (pas de connexion gateway) : un appel toutes les
 * 15 s, avec le jeton d'OLYBOT (intent « Message Content » activé).
 */
import { join } from 'node:path';
import { agentById, mapById, sideById } from '../public/js/r6.mjs';
import { extractTikTokUrls } from '../public/js/tiktok.mjs';
import { ingestUrl } from './ingest.mjs';
import { JsonFile } from './store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const SUPPRESS_EMBEDS = 1 << 2;

/** Résumé court de ce qui a été détecté, pour la réponse du bot. */
export function detectionLine(item) {
  const parts = [
    mapById(item.map)?.name || 'map inconnue',
    sideById(item.side)?.short,
    item.site,
    item.agents.map(id => agentById(id)?.name || id).join(', '),
  ].filter(Boolean);
  return parts.join(' · ');
}

export class DiscordWatcher {
  constructor({ token, channelId, store, downloader, publicUrl, dataDir, log = console, fetchImpl = fetch, intervalMs = 15_000 }) {
    this.token = token;
    this.channelId = channelId;
    this.store = store;
    this.downloader = downloader;
    this.publicUrl = publicUrl;
    this.log = log;
    this.fetch = fetchImpl;
    this.intervalMs = intervalMs;
    this.state = new JsonFile(join(dataDir, 'discord.json'), { lastId:'' });
    this.busy = false;
    this.pauseUntil = 0;
  }

  async request(path, { method = 'GET', body } = {}) {
    const response = await this.fetch(`${DISCORD_API}${path}`, {
      method,
      headers:{ Authorization:`Bot ${this.token}`, ...(body ? { 'Content-Type':'application/json' } : {}) },
      body:body ? JSON.stringify(body) : undefined,
      signal:AbortSignal.timeout(10_000),
    });
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      this.pauseUntil = Date.now() + (Number(data.retry_after) || 5) * 1000;
      throw new Error('Limite Discord atteinte, pause');
    }
    if (!response.ok) throw new Error(`Discord ${response.status} sur ${path}`);
    return response.status === 204 ? null : response.json();
  }

  async start() {
    // Premier démarrage : on part du dernier message, sans réimporter l'historique.
    if (!this.state.data.lastId) {
      try {
        const [latest] = await this.request(`/channels/${this.channelId}/messages?limit=1`);
        this.state.data.lastId = latest?.id || '0';
        this.state.save();
      } catch (error) {
        this.log.warn?.(`Salon Discord illisible : ${error.message}`);
      }
    }
    this.timer = setInterval(() => this.poll(), this.intervalMs);
    this.timer.unref?.();
    this.log.info?.(`Salon Discord ${this.channelId} surveillé`);
  }

  stop() { clearInterval(this.timer); }

  async poll() {
    if (this.busy || Date.now() < this.pauseUntil) return;
    this.busy = true;
    try {
      const after = this.state.data.lastId || '0';
      const messages = await this.request(`/channels/${this.channelId}/messages?after=${after}&limit=50`);
      // Discord renvoie du plus récent au plus ancien.
      for (const message of [...messages].sort((left, right) => (BigInt(left.id) < BigInt(right.id) ? -1 : 1))) {
        await this.handleMessage(message);
        this.state.data.lastId = message.id;
        this.state.save();
      }
    } catch (error) {
      this.log.warn?.(`Salon Discord : ${error.message}`);
    } finally {
      this.busy = false;
    }
  }

  async handleMessage(message) {
    if (message.author?.bot) return;
    const text = [message.content, ...(message.embeds || []).map(embed => embed.url || '')].join(' ');
    const urls = extractTikTokUrls(text);
    if (!urls.length) return;
    const user = {
      id:message.author.id,
      name:message.member?.nick || message.author.global_name || message.author.username || 'Discord',
    };
    const lines = [];
    for (const url of urls.slice(0, 10)) lines.push(await this.addUrl(url, user));
    await this.request(`/channels/${this.channelId}/messages`, {
      method:'POST',
      body:{
        content:lines.join('\n'),
        message_reference:{ message_id:message.id, fail_if_not_exists:false },
        allowed_mentions:{ parse:[] },
        flags:SUPPRESS_EMBEDS,
      },
    }).catch(error => this.log.warn?.(`Réponse Discord impossible : ${error.message}`));
  }

  link(item) { return `<${this.publicUrl}/?strat=${item.id}>`; }

  async addUrl(url, user) {
    const result = await ingestUrl(url, user, { store:this.store, downloader:this.downloader, fetchImpl:this.fetch });
    if (result.status === 'unreadable') return `⚠️ Je n'arrive pas à lire ce TikTok : ${url}`;
    if (result.status === 'exists') return `↪️ Déjà dans les strats : ${detectionLine(result.item)} ${this.link(result.item)}`;
    return `✅ Ajoutée : ${detectionLine(result.item)} ${this.link(result.item)}`;
  }
}
