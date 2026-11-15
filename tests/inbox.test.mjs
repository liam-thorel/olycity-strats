import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idsFromHtml, idsFromJson, idsFromLinks, unseen, videoUrl } from '../inbox/extract.mjs';

test('identifiants depuis les liens de la page', () => {
  assert.deepEqual(idsFromLinks([
    'https://www.tiktok.com/@pro.r6/video/7412345678901234567?lang=fr',
    'https://www.tiktok.com/@x/photo/7412345678901234568',
    'https://www.tiktok.com/messages',
  ]), ['7412345678901234567', '7412345678901234568']);
});

test('identifiants dans le JSON de la messagerie, même échappé', () => {
  const nested = JSON.stringify({ content:JSON.stringify({ itemId:'7412345678901234569', aweme_type:0 }) });
  assert.deepEqual(idsFromJson(nested), ['7412345678901234569']);
  assert.deepEqual(idsFromJson('{"aweme_id": 7412345678901234570, "uid":"7412345678901234999"}'), ['7412345678901234570']);
});

test('page entière : liens et JSON embarqué, sans doublons', () => {
  const html = '<a href="https://www.tiktok.com/@a/video/7412345678901234571">x</a><script>{"itemId":"7412345678901234571","item_id":"7412345678901234572"}</script>';
  assert.deepEqual(idsFromHtml(html).sort(), ['7412345678901234571', '7412345678901234572']);
});

test('seulement les nouveaux, et adresse de vidéo', () => {
  assert.deepEqual(unseen(['1', '2', '2', '3'], new Set(['1'])), ['2', '3']);
  assert.equal(videoUrl('7412345678901234571'), 'https://www.tiktok.com/@i/video/7412345678901234571');
});
