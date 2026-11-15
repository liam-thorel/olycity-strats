/**
 * Coupes suggérées à partir de ce qui est dit dans la vidéo (sous-titres
 * horodatés) et des changements de plan du montage :
 * - l'intro « accroche » (« If you want… », « Try this… », « abonne-toi… ») ;
 * - la fin « appel à s'abonner » ;
 * - plusieurs strats dans une même vidéo (« second spot », « another setup »…).
 * Ce ne sont que des suggestions : on les applique d'un clic, ou pas.
 */
import { detectStrat, normalize } from './detect.mjs';
import { ROOMS } from './r6.mjs';

/* Phrases d'accroche, d'appel à s'abonner ou de présentation : pas encore la strat. */
const HOOK = new RegExp([
  'if you want', 'you ll never', 'never lose', 'watch (this|till|until)', 'try (out )?this', 'this is (the|a|my) (best|most|only)',
  '^use this', 'you need (to|this)', 'stop (doing|playing|losing)', 'here s (how|why|the|my)', 'how to', 'tag (your|a) (friend|duo|mate|teammate)',
  'so they know', 'make sure to', 'what is this', 'why does it work', 'how does it work', 'how do you set it up', 'nobody (knows|uses|talks)',
  'this (clip|video)', 'in this (clip|video)', 'like what you re seeing', 'let me show you', 'i ll show you', 'you won t believe',
  'si tu veux', 'voici', 'regarde (ca|bien|cette)', 'essaie', 'le meilleur', 'personne ne', 'dans cette video', 'je vais te montrer',
].join('|'));

const OUTRO = new RegExp([
  'follow (me|for)', 'subscribe', 'like (and|the video|this video|if)', 'leave a like', 'comment (below|down)', 'let me know',
  'part (2|two)', 'see you', 'for more', 'if this helped', 'save this', 'share this', 'thanks for watching', 'peace out',
  'abonne', 'abonnez', 'like la video', 'dis moi', 'commente', 'partie 2', 'a la prochaine', 'merci d avoir regarde',
].join('|'));

/* « So first, » : la strat commence juste après. */
const START_MARKER = /\b(so first|first of all|step one|first thing|let s start|premierement|d abord|on commence)\b/;

/* Début d'une autre strat : « the second spot », « another setup », « number two »… en début de phrase. */
const NEXT_STRAT = /^(?:(?:and|so|now|okay|ok|alright|then|next up|et|donc|alors|maintenant|ensuite)\s+)*(?:the\s+|my\s+|a\s+|le\s+|la\s+|un\s+|une\s+)?(?:second|third|fourth|fifth|next|another|other|last|final|bonus|number (?:two|three|four|five|2|3|4|5)|deuxieme|troisieme|quatrieme|autre|derniere?|prochaine?)\b.{0,40}?\b(?:spot|setup|set up|strat|strategy|tip|trick|way|angle|position|lineup|placement|one|play|astuce|technique|facon|endroit|place)\b/;

/* Une phrase qui parle de la strat elle-même : agent, gadget, salle, action. */
const ACTION = /\b(place|placing|throw|put|reinforce|drone|peek|hold|bring|run|plant|wall|hatch|window|door|stairs|barricade|angle|spot|corner|rotate|vertical|shoot|crouch|prone|jump|go (up|down|to)|pose|lance|renforce|monte|descends?|fenetre|porte|escalier|trappe|mur)\b/;

const MIN_SEGMENT = 6;

/* Noms de salles (FR et EN) : « elevator », « janitor », « stock room »… */
const ROOM_WORDS = [...new Set(Object.values(ROOMS).flat().flat().map(normalize))].filter(word => word.length >= 4);
const ROOM_PATTERN = new RegExp(`\\b(${ROOM_WORDS.map(word => word.replace(/s$/, '')).join('|')})s?\\b`);

function hasContent(text) {
  const lower = normalize(text);
  if (ACTION.test(lower) || ROOM_PATTERN.test(lower)) return true;
  const detected = detectStrat(text, { mode:'transcript' });
  return Boolean(detected.agents.length || detected.map || detected.site.includes('·'));
}

/** Coupe placée sur le changement de plan le plus proche (à ±1 s), sinon à la phrase. */
export function snap(time, scenes = [], { before = 1, after = 0.8 } = {}) {
  let best = null;
  for (const scene of scenes) {
    if (scene < time - before || scene > time + after) continue;
    if (best === null || Math.abs(scene - time) < Math.abs(best - time)) best = scene;
  }
  return Math.round((best ?? time) * 10) / 10;
}

/** Fin de l'intro : première phrase concrète après une accroche. */
function predictIntro(cues, scenes) {
  if (cues.length < 3) return null;
  let sawHook = false;
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (cue.s > 18) return null;
    const lower = normalize(cue.t);
    if (START_MARKER.test(lower)) {
      // « …So first, » en fin de phrase : la strat commence à la phrase suivante.
      const markerAtEnd = new RegExp(`${START_MARKER.source}\\s*$`).test(lower);
      const start = markerAtEnd ? cues[index + 1]?.s ?? cue.e : cue.s;
      return start >= 1.5 ? { start:snap(start, scenes), reason:'« So first » : la strat commence ici' } : null;
    }
    const isHook = HOOK.test(lower) || OUTRO.test(lower);
    if (isHook) { sawHook = true; continue; }
    // Première phrase concrète, ou deux phrases « normales » d'affilée : la strat commence.
    const next = cues[index + 1];
    const nextIsNormal = next && !HOOK.test(normalize(next.t)) && !OUTRO.test(normalize(next.t));
    if (hasContent(cue.t) || nextIsNormal) {
      return sawHook && index > 0 && cue.s >= 1.5 ? { start:snap(cue.s, scenes), reason:'Accroche de début' } : null;
    }
  }
  return null;
}

/** Début de la fin « abonne-toi » : dans le dernier tiers de la vidéo. */
function predictOutro(cues, scenes, duration) {
  const end = duration || cues.at(-1)?.e || 0;
  if (!end) return null;
  const outro = cues.find(cue => cue.s >= end * 0.6 && OUTRO.test(normalize(cue.t)));
  return outro && end - outro.s >= 1 ? { end:snap(outro.s, scenes), reason:`« ${outro.t.slice(0, 50)} »` } : null;
}

/**
 * @param {{ cues?:{s:number,e:number,t:string}[], scenes?:number[], duration?:number }} timeline
 * @returns {{ intro:{start,reason}|null, outro:{end,reason}|null, segments:{start,end,label}[] }}
 */
export function predictCuts({ cues = [], scenes = [], duration = 0 } = {}) {
  const intro = predictIntro(cues, scenes);
  const outro = predictOutro(cues, scenes, duration);
  const start = intro?.start || 0;
  const end = outro?.end || duration || cues.at(-1)?.e || 0;

  // Plusieurs strats : on coupe aux phrases qui en annoncent une nouvelle.
  const splits = cues.filter(cue => cue.s > start + MIN_SEGMENT && cue.s < end - MIN_SEGMENT && NEXT_STRAT.test(normalize(cue.t)))
    .map(cue => ({ at:snap(cue.s, scenes), text:cue.t }));
  const segments = [];
  if (splits.length) {
    const bounds = [{ at:start, text:cues.find(cue => cue.s >= start)?.t || '' }, ...splits];
    bounds.forEach((bound, index) => {
      const segmentEnd = bounds[index + 1]?.at ?? end;
      if (segmentEnd - bound.at >= MIN_SEGMENT) {
        segments.push({ start:bound.at, end:Math.round(segmentEnd * 10) / 10, label:bound.text.slice(0, 70) });
      }
    });
  }
  return { intro, outro, segments:segments.length >= 2 ? segments : [] };
}
