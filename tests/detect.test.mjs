import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTitle, detectStrat } from '../js/detect.mjs';
import { AGENTS, MAPS } from '../js/r6.mjs';

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
