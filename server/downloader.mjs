/**
 * Copie locale des TikToks avec yt-dlp, une vidéo à la fois, espacées pour
 * rester discret auprès de TikTok. Fichiers : media/<videoId>.mp4 et .jpg.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, statfsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseVtt, pickSubtitle } from './transcript.mjs';

const MAX_ATTEMPTS = 3;
const GAP_MS = 5_000;
const RETRY_DELAY_MS = 30 * 60_000;
const MIN_FREE_BYTES = 5 * 1024 ** 3;
const MIN_COVER_BYTES = 8_000;
const UPDATE_EVERY_MS = 24 * 3_600_000;
// Sous-titres (ce qui est dit dans la vidéo) : français, sinon anglais.
const SUBTITLE_ARGS = ['--write-subs', '--write-auto-subs', '--sub-langs', 'fra.*,fr.*,eng.*,en.*', '--sub-format', 'vtt'];

export const mediaPath = (dir, videoId, ext) => join(dir, `${videoId}.${ext}`);

function run(command, args, timeoutMs) {
  return new Promise(resolve => {
    let output = '';
    let child;
    try {
      child = spawn(command, args, { stdio:['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code:-1, output:error.message });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); resolve({ code:-1, output:error.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

/** Dernière ligne d'erreur utile de yt-dlp, lisible dans le site. */
export function errorSummary(output = '') {
  const lines = String(output).split('\n').map(line => line.trim()).filter(Boolean);
  const error = [...lines].reverse().find(line => line.startsWith('ERROR')) || lines.at(-1) || 'Échec inconnu';
  return error.replace(/^ERROR:\s*/, '').slice(0, 200);
}

export class Downloader {
  constructor(store, { ytDlp = 'yt-dlp', ffmpeg = 'ffmpeg', log = console } = {}) {
    this.store = store;
    this.ytDlp = ytDlp;
    this.ffmpeg = ffmpeg;
    this.coverChecked = new Set();
    this.log = log;
    this.queue = [];
    this.running = false;
    this.lastUpdate = 0;
  }

  /** Remet en file tout ce qui n'a pas encore de copie (au démarrage, puis toutes les 30 min). */
  start() {
    const sweep = () => {
      for (const item of this.store.list()) {
        const video = item.video || {};
        const ready = video.status === 'ready' && existsSync(mediaPath(this.store.mediaDir, item.videoId, 'mp4'));
        // Vidéo déjà copiée mais sous-titres jamais cherchés (strats d'avant) : on rattrape.
        if (item.videoId && ready && item.transcript === undefined) { this.enqueue(item.id); continue; }
        // Couverture noire d'une strat déjà copiée : une seule tentative par démarrage.
        if (ready && !this.coverChecked.has(item.videoId)) {
          this.coverChecked.add(item.videoId);
          this.ensureCover(item.id, item.videoId).catch(() => {});
        }
        if (!item.videoId || ready) continue;
        if (video.status === 'failed' && (video.attempts || 0) >= MAX_ATTEMPTS) continue;
        if (video.status === 'failed' && Date.now() - (video.at || 0) < RETRY_DELAY_MS) continue;
        this.enqueue(item.id);
      }
    };
    sweep();
    this.timer = setInterval(sweep, RETRY_DELAY_MS);
    this.timer.unref?.();
  }

  enqueue(id, { reset = false } = {}) {
    if (reset) this.store.setVideo(id, { status:'pending', attempts:0, error:'' });
    if (!this.queue.includes(id)) this.queue.push(id);
    this.pump();
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift();
        await this.download(id);
        if (this.queue.length) await new Promise(resolve => setTimeout(resolve, GAP_MS));
      }
    } finally {
      this.running = false;
    }
  }

  async maybeUpdate() {
    if (Date.now() - this.lastUpdate < UPDATE_EVERY_MS) return;
    this.lastUpdate = Date.now();
    // TikTok change souvent : yt-dlp se met à jour une fois par jour (pip du conteneur).
    const result = await run('pip', ['install', '-q', '-U', 'yt-dlp[default,curl-cffi]'], 180_000);
    if (result.code !== 0) this.log.warn?.(`Mise à jour de yt-dlp impossible : ${errorSummary(result.output)}`);
  }

  async download(id) {
    const item = this.store.get(id);
    if (!item?.videoId) return;
    const dir = this.store.mediaDir;
    const attempts = (item.video?.attempts || 0) + 1;

    try {
      const { bavail, bsize } = statfsSync(dir);
      if (bavail * bsize < MIN_FREE_BYTES) {
        this.store.setVideo(id, { status:'failed', attempts, at:Date.now(), error:'Disque du serveur presque plein' });
        return;
      }
    } catch { /* statfs indisponible : on tente quand même */ }

    await this.maybeUpdate();
    const url = item.author ? `https://www.tiktok.com/@${item.author}/video/${item.videoId}` : item.url;
    const output = ['-o', join(dir, `${item.videoId}.%(ext)s`)];

    // Copie déjà faite : seulement les sous-titres (et une couverture correcte).
    if (item.video?.status === 'ready' && existsSync(mediaPath(dir, item.videoId, 'mp4'))) {
      const subs = await run(this.ytDlp, ['--no-playlist', '--skip-download', ...SUBTITLE_ARGS, ...output, url], 2 * 60_000);
      await this.ensureCover(id, item.videoId);
      // yt-dlp en échec (TikTok qui refuse, réseau) : on réessaiera, plutôt que de noter « pas de sous-titres ».
      if (subs.code !== 0) {
        const tries = (item.subsTries || 0) + 1;
        this.log.warn?.(`Sous-titres de ${item.videoId} (essai ${tries}) : ${errorSummary(subs.output)}`);
        if (tries < MAX_ATTEMPTS) { item.subsTries = tries; this.store.file.save(); return; }
      }
      this.readTranscript(id, item.videoId, subs.output);
      return;
    }

    this.store.setVideo(id, { status:'downloading' });
    const result = await run(this.ytDlp, [
      '--no-playlist', '--no-progress', '--no-warnings',
      '-f', 'b[ext=mp4][vcodec^=h264]/b[ext=mp4]/b',
      '--max-filesize', '300M',
      '--write-thumbnail', '--convert-thumbnails', 'jpg',
      ...SUBTITLE_ARGS,
      ...output,
      url,
    ], 5 * 60_000);

    const file = mediaPath(dir, item.videoId, 'mp4');
    if (!this.store.get(id)) {
      // Strat supprimée pendant le téléchargement.
      for (const ext of ['mp4', 'jpg']) try { unlinkSync(mediaPath(dir, item.videoId, ext)); } catch { /* absent */ }
      return;
    }
    if (result.code === 0 && existsSync(file)) {
      this.store.setVideo(id, {
        status:'ready', attempts, at:Date.now(), error:'',
        size:statSync(file).size, cover:existsSync(mediaPath(dir, item.videoId, 'jpg')),
      });
      this.log.info?.(`Vidéo ${item.videoId} copiée`);
      await this.ensureCover(id, item.videoId);
      this.readTranscript(id, item.videoId);
    } else {
      const error = errorSummary(result.output);
      this.store.setVideo(id, { status:'failed', attempts, at:Date.now(), error });
      this.log.warn?.(`Vidéo ${item.videoId} : ${error}`);
    }
  }

  /**
   * Couverture absente ou quasi vide (image noire de quelques Ko) : on prend une
   * image de la vidéo elle-même, à 1,5 s.
   */
  async ensureCover(id, videoId) {
    const cover = mediaPath(this.store.mediaDir, videoId, 'jpg');
    let size = 0;
    try { size = statSync(cover).size; } catch { /* pas de couverture */ }
    if (size >= MIN_COVER_BYTES) return;
    const result = await run(this.ffmpeg, [
      '-y', '-loglevel', 'error', '-ss', '1.5', '-i', mediaPath(this.store.mediaDir, videoId, 'mp4'),
      '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', cover,
    ], 60_000);
    if (result.code === 0 && existsSync(cover)) this.store.setVideo(id, { cover:true, coverAt:Date.now() });
    else this.log.warn?.(`Couverture de ${videoId} impossible : ${errorSummary(result.output)}`);
  }

  /** Lit les sous-titres téléchargés, les range dans la strat (complément des champs vides) et efface les fichiers. */
  readTranscript(id, videoId, output = '') {
    const dir = this.store.mediaDir;
    let files = [];
    try { files = readdirSync(dir).filter(file => file.startsWith(`${videoId}.`) && file.endsWith('.vtt')); } catch { /* dossier illisible */ }
    let text = '';
    const chosen = pickSubtitle(files);
    if (chosen) {
      try { text = parseVtt(readFileSync(join(dir, chosen), 'utf8')); } catch { /* fichier illisible */ }
    }
    for (const file of files) try { unlinkSync(join(dir, file)); } catch { /* déjà effacé */ }
    if (!files.length && /subtitle/i.test(output) && !/no subtitles/i.test(output)) {
      this.log.warn?.(`Sous-titres de ${videoId} annoncés mais introuvables : ${errorSummary(output)}`);
    }
    const filled = this.store.applyTranscript(id, text);
    if (filled?.length) this.log.info?.(`Vidéo ${videoId} : ${filled.join(', ')} complété(s) depuis les sous-titres`);
  }

  /** Supprime les fichiers d'une vidéo si plus aucune strat ne l'utilise. */
  removeMedia(videoId) {
    if (!videoId || this.store.findByVideo(videoId)) return;
    for (const ext of ['mp4', 'jpg']) {
      try { unlinkSync(mediaPath(this.store.mediaDir, videoId, ext)); } catch { /* absent */ }
    }
  }
}
