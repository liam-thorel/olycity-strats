// Lance le Worker workers/tiktok en local, sans wrangler : node scripts/dev-worker.mjs
// Écoute sur http://127.0.0.1:8787 (l'adresse que config.js utilise en local).
import { createServer } from 'node:http';
import worker from '../workers/tiktok/worker.mjs';

const PORT = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method:req.method, headers:req.headers });
  const response = await worker.fetch(request, { SITE_ORIGIN:'' }, {});
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => console.log(`Worker TikTok local : http://127.0.0.1:${PORT}`));
