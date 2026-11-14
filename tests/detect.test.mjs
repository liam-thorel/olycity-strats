import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTitle, detectStrat } from '../public/js/detect.mjs';
import { AGENTS, MAPS } from '../public/js/r6.mjs';

test('détecte map, côté et agents dans un titre typique', () => {
  const result = detectStrat('Strat ATK sur Bank avec Thermite et Ash 🔥 #r6 #rainbowsixsiege');
  assert.equal(result.map, 'bank');
  assert.equal(result.side, 'atk');
  assert.deepEqual(result.agents, ['thermite', 'ash']);
});

test('reconnaît les noms français, accents et hashtags', () => {
  assert.equal(detectStrat('Le meilleur setup en défense sur Frontière').map, 'border');
  assert.equal(detectStrat('setup en défense').side, 'def');
  assert.equal(detectStrat('#kafe #r6siege').map, 'kafe');
  assert.equal(detectStrat('Theme Park 2F').map, 'themepark');
  assert.equal(detectStrat('themepark').map, 'themepark');
  assert.deepEqual(detectStrat('jager + Nokk').agents, ['jager', 'nokk']);
  assert.deepEqual(detectStrat('Capitao + Tubarão').agents, ['capitao', 'tubarao']);
});

test('les noms ambigus demandent une majuscule ou un hashtag', () => {
  assert.deepEqual(detectStrat('trop de smoke ici').agents, []);
  assert.deepEqual(detectStrat('Smoke + Mute').agents, ['smoke', 'mute']);
  assert.deepEqual(detectStrat('#frost trap').agents, ['frost']);
  assert.equal(detectStrat('encore un tour de chauffe').map, '');
  assert.equal(detectStrat('Tour, toit').map, 'tower');
});

test('« ace » n’est jamais pris pour l’agent', () => {
  assert.deepEqual(detectStrat('ACE en clutch avec Ace').agents, []);
});

test('le côté se déduit des agents si le titre ne le dit pas', () => {
  assert.equal(detectStrat('Kapkan Lesion Valk sur Oregon').side, 'def');
  assert.equal(detectStrat('Kapkan et Thermite').side, '');
});

test('types de strat et étage', () => {
  const result = detectStrat('Spawn peek + lineup de nade au 2F, sous-sol ensuite');
  assert.ok(result.tags.includes('spawnpeek'));
  assert.ok(result.tags.includes('utility'));
  assert.equal(result.site, '2F');
  assert.equal(detectStrat('setup sous-sol').site, 'Sous-sol');
});

test('la première map citée l’emporte', () => {
  assert.equal(detectStrat('Clubhouse > Bank').map, 'clubhouse');
});

test('cleanTitle retire hashtags et mentions', () => {
  assert.equal(cleanTitle('Setup Bank 🔥 #r6 #fyp @pote'), 'Setup Bank 🔥');
});

test('identifiants uniques', () => {
  assert.equal(new Set(MAPS.map(map => map.id)).size, MAPS.length);
  assert.equal(new Set(AGENTS.map(agent => agent.id)).size, AGENTS.length);
});

test('gadgets → agent, bombsites → map et site, hashtags collés', () => {
  const kiba = detectStrat('Best Kiba spots on Villa aviator room');
  assert.equal(kiba.map, 'villa');
  assert.deepEqual(kiba.agents, ['azami']);
  assert.equal(kiba.side, 'def');
  assert.equal(kiba.site, '2F · Salle de l’aviateur / Salle de jeux');

  const cocktail = detectStrat('setup cocktail avec #r6smoke et #kapkanr6');
  assert.equal(cocktail.map, 'kafe');
  assert.deepEqual(cocktail.agents, ['smoke', 'kapkan']);
  assert.equal(cocktail.site, '3F · Bar / Salon cocktail');

  const ceo = detectStrat('Evil eye + yokai sur #bankr6 CEO');
  assert.equal(ceo.map, 'bank');
  assert.deepEqual(ceo.agents, ['maestro', 'echo']);
  assert.equal(ceo.site, '2F · Bureau du PDG / Salon de direction');
});

test('Twitch la plateforme n’est pas Twitch l’agente', () => {
  assert.deepEqual(detectStrat('SPAWNKILL SUR KAFE ! #R6 #Live #Twitch #Tips').agents, []);
  assert.deepEqual(detectStrat('je suis en live sur Twitch ce soir').agents, []);
  assert.deepEqual(detectStrat('Twitch drone peek').agents, ['twitch']);
});

test('sous-titres : on garde les agents de son côté, comptés', () => {
  const transcript = 'Try this duo hold with a zombie and Mute. Mute places his jammer to protect the kibas from Flores. '
    + 'The Kiba barrier makes a one way. Mute stays on stairs. Watch out for Flores drones.';
  const result = detectStrat(transcript, { mode:'transcript' });
  assert.equal(result.side, 'def');
  assert.deepEqual(result.agents, ['mute', 'azami']);
  assert.ok(!result.agents.includes('flores'));
});

test('un mot de bombsite commun ne devine pas la map dans une vidéo', () => {
  assert.equal(detectStrat('go to the bar then the kitchen', { mode:'transcript' }).map, '');
  assert.equal(detectStrat('the cocktail lounge window, then cocktail again', { mode:'transcript' }).map, 'kafe');
});
