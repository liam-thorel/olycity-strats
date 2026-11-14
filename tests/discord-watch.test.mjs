import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { DiscordWatcher } from '../server/discord-watch.mjs';
import { Store } from '../server/store.mjs';

const dir = mkdtempSync(join(tmpdir(), 'strats-discord-'));
after(() => rmSync(dir, { recursive:true, force:true }));

const VIDEO = '7357019832287612192';
const tiktokPage = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
  __DEFAULT_SCOPE__:{ 'webapp.video-detail':{ itemInfo:{ itemStruct:{
    id:VIDEO, desc:'Bank duo strat for basement using Mute and Azami #r6', author:{ uniqueId:'am37r6' },
  } } } },
})}</script>`;

function fakeWorld(messages) {
  const posted = [];
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('tiktok.com')) return new Response(tiktokPage, { status:200 });
    if (href.includes('/messages?after=')) return Response.json(messages.splice(0));
    if (href.includes('/messages?limit=1')) return Response.json([{ id:'100' }]);
    if (href.endsWith('/messages') && options.method === 'POST') {
      posted.push(JSON.parse(options.body));
      return Response.json({ id:'999' });
    }
    throw new Error(`appel inattendu ${href}`);
  };
  return { posted, fetchImpl };
}

test('un TikTok posté dans le salon devient une strat, avec réponse du bot', async () => {
  const store = new Store(dir);
  const queued = [];
  const messages = [
    { id:'102', content:'regardez https://www.tiktok.com/@am37r6/video/7357019832287612192?_r=1', author:{ id:'42', global_name:'Nico' } },
    { id:'101', content:'salut', author:{ id:'42', username:'nico' } },
    { id:'103', content:'https://www.tiktok.com/@x/video/1', author:{ id:'7', bot:true } },
  ];
  const { posted, fetchImpl } = fakeWorld(messages);
  const watcher = new DiscordWatcher({
    token:'t', channelId:'555', store, downloader:{ enqueue:id => queued.push(id) },
    publicUrl:'https://strats.olycity.fr', dataDir:dir, log:{}, fetchImpl,
  });
  await watcher.start();
  watcher.stop();
  await watcher.poll();

  const [item] = store.list();
  assert.equal(store.list().length, 1);
  assert.equal(item.videoId, VIDEO);
  assert.equal(item.map, 'bank');
  assert.deepEqual(item.agents, ['mute', 'azami']);
  assert.deepEqual(item.addedBy, { id:'42', name:'Nico' });
  assert.deepEqual(queued, [item.id]);
  assert.equal(watcher.state.data.lastId, '103');

  assert.equal(posted.length, 1);
  assert.match(posted[0].content, /✅ Ajoutée : Bank · DEF · Sous-sol · Mute, Azami/);
  assert.match(posted[0].content, new RegExp(`<https://strats.olycity.fr/\\?strat=${item.id}>`));
  assert.equal(posted[0].message_reference.message_id, '102');
  assert.deepEqual(posted[0].allowed_mentions, { parse:[] });

  // Le même TikTok reposté : pas de doublon.
  messages.push({ id:'104', content:'https://www.tiktok.com/@am37r6/video/7357019832287612192', author:{ id:'43', username:'liam' } });
  await watcher.poll();
  assert.equal(store.list().length, 1);
  assert.match(posted[1].content, /Déjà dans les strats/);
});
