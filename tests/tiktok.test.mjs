import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTikTokUrls, videoIdFromUrl } from '../public/js/tiktok.mjs';
import { extractItem, getMeta, itemToMeta } from '../server/tiktok-page.mjs';

test('extrait les liens TikTok d’un message', () => {
  const text = `regarde ça https://vm.tiktok.com/ZMabc123/ et https://www.tiktok.com/@pro.r6/video/7412345678901234567?is_from_webapp=1&sender_device=pc.
  et un autre https://youtube.com/x et encore https://vm.tiktok.com/ZMabc123/`;
  assert.deepEqual(extractTikTokUrls(text), [
    'https://vm.tiktok.com/ZMabc123/',
    'https://www.tiktok.com/@pro.r6/video/7412345678901234567',
  ]);
  assert.deepEqual(extractTikTokUrls('https://faketiktok.com/x'), []);
});

test('identifiant de vidéo', () => {
  assert.equal(videoIdFromUrl('https://www.tiktok.com/@a/video/7412345678901234567'), '7412345678901234567');
  assert.equal(videoIdFromUrl('https://vm.tiktok.com/ZMabc123/'), '');
});

const page = item => `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
  __DEFAULT_SCOPE__:{ 'webapp.video-detail':{ itemInfo:{ itemStruct:item } } },
})}</script></html>`;

const ITEM = {
  id:'7412345678901234567', desc:'Setup Bank Kapkan #r6', createTime:'1700000000',
  author:{ uniqueId:'pro.r6', nickname:'Pro' }, textExtra:[{ hashtagName:'r6' }], video:{ cover:'https://p16.tiktokcdn.com/c.jpg' },
};

test('lit la vidéo dans la page TikTok', () => {
  const meta = itemToMeta(extractItem(page(ITEM)));
  assert.equal(meta.videoId, ITEM.id);
  assert.equal(meta.author, 'pro.r6');
  assert.equal(meta.description, 'Setup Bank Kapkan #r6');
  assert.deepEqual(meta.hashtags, ['r6']);
});

test('suit les redirections des liens courts sans quitter tiktok.com', async () => {
  const calls = [];
  const fakeFetch = async url => {
    calls.push(url);
    if (url.startsWith('https://vm.tiktok.com/')) return new Response(null, { status:301, headers:{ location:`https://www.tiktok.com/@pro.r6/video/${ITEM.id}` } });
    return new Response(page(ITEM), { status:200 });
  };
  const meta = await getMeta('https://vm.tiktok.com/ZMabc/', fakeFetch);
  assert.equal(meta.videoId, ITEM.id);
  assert.equal(meta.url, `https://www.tiktok.com/@pro.r6/video/${ITEM.id}`);
  assert.equal(calls.length, 2);

  const evil = async () => new Response(null, { status:302, headers:{ location:'http://169.254.169.254/' } });
  await assert.rejects(getMeta('https://vm.tiktok.com/ZMabc/', evil), /hors de tiktok/);
});

