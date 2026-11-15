import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictCuts, snap } from '../public/js/cuts.mjs';
import { parseVttCues } from '../server/transcript.mjs';

const cues = lines => lines.map(([s, e, t]) => ({ s, e, t }));

test('l’accroche du début est coupée à la première phrase concrète', () => {
  const result = predictCuts({ cues:cues([
    [0, 3, 'Try out this aggressive duo hold and'],
    [3, 5, 'you will never lose another round.'],
    [5.2, 7, 'Azami will be locking down servers'],
    [7, 10, 'with these Kiba barrier spots.'],
  ]), duration:30 });
  assert.equal(result.intro.start, 5.2);
});

test('« So first, » en fin de phrase : la strat commence à la phrase suivante', () => {
  const result = predictCuts({ cues:cues([
    [0, 3, 'If you want to win more rounds'],
    [3, 5, 'then watch this video. What is this?'],
    [5, 9.2, 'And how do you set it up? So first,'],
    [9.2, 12, 'you are gonna bring a nomad'],
  ]), duration:30 });
  assert.equal(result.intro.start, 9.2);
});

test('pas d’intro quand la vidéo entre directement dans la strat', () => {
  const result = predictCuts({ cues:cues([
    [0, 3, 'Place your Mira on the cocktail wall'],
    [3, 6, 'then reinforce the hatch'],
    [6, 9, 'and hold the stairs'],
  ]), duration:20 });
  assert.equal(result.intro, null);
});

test('la fin « abonne-toi » est coupée, calée sur le changement de plan', () => {
  const result = predictCuts({ cues:cues([
    [0, 10, 'Place your Kiba on the window'],
    [10, 20, 'hold this one way angle'],
    [20.4, 23, 'follow me for more strats'],
  ]), scenes:[20], duration:23 });
  assert.equal(result.outro.end, 20);
});

test('plusieurs strats dans une vidéo : un passage par strat', () => {
  const result = predictCuts({ cues:cues([
    [0, 3, 'Here are 3 spots you need to know on Kafe'],
    [3, 6, 'make sure to follow for more'],
    [6, 12, 'First spot, place your Kiba on the cocktail window'],
    [12, 20, 'it gives a one way angle on the stairs'],
    [20, 26, 'The second spot is on the train museum door'],
    [26, 33, 'reinforce the wall and hold the angle'],
    [33, 40, 'And the third spot uses a Mira on the mining window'],
    [40, 48, 'you see everyone coming'],
    [48, 52, 'follow me for part two'],
  ]), scenes:[19.8, 33.4], duration:53 });
  assert.deepEqual(result.segments.map(segment => [segment.start, segment.end]), [[6, 19.8], [19.8, 33.4], [33.4, 48]]);
  assert.equal(result.outro.end, 48);
});

test('« throw your second… » dans la même strat ne coupe pas', () => {
  const result = predictCuts({ cues:cues([
    [0, 5, 'Throw your first Kiba on the edge of this table'],
    [5, 10, 'and then throw your second on these cables'],
    [10, 18, 'to create this one way angle onto dirt'],
    [18, 30, 'here is a second one way angle I like to make'],
  ]), duration:30 });
  assert.deepEqual(result.segments, []);
});

test('calage sur un changement de plan proche seulement', () => {
  assert.equal(snap(10, [9.4, 15]), 9.4);
  assert.equal(snap(10, [8, 12]), 10);
});

test('sous-titres horodatés lus depuis le WebVTT, répétitions fusionnées', () => {
  const parsed = parseVttCues(`WEBVTT

00:00:00.080 --> 00:00:03.560
Try out this <c>duo</c> hold

00:00:03.560 --> 00:00:05.240
Try out this duo hold

00:00:05.240 --> 00:00:07.080
Azami will be locking down servers
`);
  assert.deepEqual(parsed, [
    { s:0.08, e:5.24, t:'Try out this duo hold' },
    { s:5.24, e:7.08, t:'Azami will be locking down servers' },
  ]);
});
