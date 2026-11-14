import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Store } from '../server/store.mjs';
import { autofill, parseVtt, pickSubtitle } from '../server/transcript.mjs';

const dir = mkdtempSync(join(tmpdir(), 'strats-subs-'));
after(() => rmSync(dir, { recursive:true, force:true }));

const VTT = `WEBVTT

NOTE généré automatiquement
ligne ignorée

1
00:00:00.000 --> 00:00:02.000
Use this <c>Azami</c> setup on Bank

2
00:00:02.000 --> 00:00:04.000
Use this <c>Azami</c> setup on Bank

00:00:04.000 --> 00:00:06.000
with a Kiba barrier on the CEO window
`;

test('lecture des sous-titres WebVTT', () => {
  assert.equal(parseVtt(VTT), 'Use this Azami setup on Bank with a Kiba barrier on the CEO window');
});

test('sous-titres préférés : français, puis anglais', () => {
  assert.equal(pickSubtitle(['1.eng-US.vtt', '1.fra-FR.vtt', '1.mp4']), '1.fra-FR.vtt');
  assert.equal(pickSubtitle(['1.eng-US.vtt', '1.jpg']), '1.eng-US.vtt');
  assert.equal(pickSubtitle(['1.mp4']), '');
});

test('complément : seulement les champs vides, jamais une saisie', () => {
  const text = parseVtt(VTT);
  const empty = autofill({ map:'', side:'', agents:[], tags:[], site:'' }, text);
  assert.equal(empty.patch.map, 'bank');
  assert.equal(empty.patch.side, 'def');
  assert.deepEqual(empty.patch.agents, ['azami']);
  assert.equal(empty.patch.site, '2F · Bureau du PDG / Salon de direction');

  const typed = autofill({ map:'bank', side:'def', agents:['mira'], tags:['setup'], site:'Fenêtre du PDG' }, text);
  assert.deepEqual(typed.patch, {});

  const floor = autofill({ map:'bank', side:'def', agents:['azami'], tags:['setup'], site:'2F' }, text);
  assert.equal(floor.patch.site, '2F · Bureau du PDG / Salon de direction');
});

test('une strat garde la trace de ce qui a été complété, effacée quand un membre retouche', () => {
  const store = new Store(dir);
  const item = store.create({ url:'https://www.tiktok.com/@a/video/7400000000000000009', videoId:'7400000000000000009', author:'a' }, { title:'Setup' }, { id:'1', name:'Liam' });
  assert.deepEqual(store.applyTranscript(item.id, parseVtt(VTT)).sort(), ['agents', 'map', 'side', 'site']);
  assert.ok(store.get(item.id).transcript.startsWith('Use this Azami'));
  store.update(item.id, { map:'villa', side:'def' }, { id:'1', name:'Liam' });
  assert.deepEqual(store.get(item.id).auto.sort(), ['agents', 'side', 'site']);
  store.file.flush();
});
