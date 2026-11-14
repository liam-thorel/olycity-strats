# strats.olycity.fr

Les strats **Rainbow Six Siege** du Discord OLYCITY : les TikToks qu'on s'envoie,
rangés par map, avec le côté, les agents, le type de strat et nos notes.

## Utilisation

- **Ajouter** : coller un ou plusieurs liens TikTok (un message Discord entier
  marche aussi). Avec un seul lien, la fiche s'ouvre préremplie pour vérifier ;
  avec plusieurs, tout est ajouté d'un coup en « À tester ».
- **Détection automatique** (`js/detect.mjs`) depuis le titre du TikTok :
  map, côté (attaque/défense, ou déduit des agents), agents, type de strat
  (setup, lineup, spawn peek, vertical…) et étage (1F/2F/Sous-sol…).
  Les noms qui sont aussi des mots courants (Smoke, Frost, Tour…) ne sont
  reconnus qu'avec une majuscule ou en hashtag ; « Ace » n'est jamais détecté.
  Le bouton **Re-détecter** relance la détection sur le titre/description modifiés.
- **Compléter** : cliquer une carte ouvre la vidéo et la fiche (agents, site,
  statut À tester / Validée / Bof, notes). Tout le monde peut modifier.
- Le profil (membres du tracker) sert à signer qui a ajouté / modifié.

## Architecture

```text
olycity-strats/
├── index.html, css/app.css      Page unique
├── js/main.mjs                  Interface, filtres, fiche
├── js/r6.mjs                    Maps, agents, types de strat (à compléter ici)
├── js/detect.mjs                Détection depuis le titre
├── js/tiktok.mjs                Liens TikTok + appel du Worker (oEmbed en secours)
├── sdk/                         Copie de olycity-games/sdk (Firebase, membres, profil)
├── config.js                    Adresse du Worker, chemin Firebase
├── workers/tiktok/              Worker Cloudflare `olycity-tiktok`
├── scripts/dev-worker.mjs       Le Worker en local, sans wrangler
└── tests/                       node --test
```

- **Données** : Firebase Realtime Database du tracker, chemin `r6strats/items/<id>`
  (`r6strats-dev` en local, pour ne pas polluer la vraie liste).
- **Worker `olycity-tiktok`** : le navigateur ne peut pas lire une page TikTok
  (CORS) et l'oEmbed de TikTok ne donne plus le titre. Le Worker lit la page,
  suit les liens courts (`vm.tiktok.com`) sans jamais quitter `tiktok.com`, et
  sert la couverture (`/cover/<id>`, cache 1 jour). Sans Worker, le site marche
  quand même : le titre se colle à la main.

## Lancer en local

```bash
node scripts/dev-worker.mjs      # Worker sur http://127.0.0.1:8787
npx serve -l 4175 .              # site sur http://localhost:4175
node --test
```

## Mise en ligne

1. **Worker** : `cd workers/tiktok && npx wrangler deploy`. Si l'URL obtenue
   n'est pas `olycity-tiktok.olycity.workers.dev`, la reporter dans `config.js`.
2. **Dépôt GitHub** `liam-thorel/olycity-strats`, Pages en source « GitHub Actions »
   (workflow `.github/workflows/pages.yml`), domaine `strats.olycity.fr`.
3. **DNS OVH** : `strats` CNAME `liam-thorel.github.io.`
4. Ajouter le service au hub (`olycity-hub`), au sélecteur de sites et à
   `C:\Dev\olycity\CLAUDE.md`.
