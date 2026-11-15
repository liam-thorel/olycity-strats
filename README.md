# strats.olycity.fr

Les strats **Rainbow Six Siege** du Discord OLYCITY : les TikToks qu'on s'envoie,
rangés par map, avec le côté, les agents, le type de strat, nos notes et
**une copie de chaque vidéo sur le mini PC**.

Réservé aux **membres du serveur Discord OLYCITY** (connexion avec Discord).
Pour donner l'accès à quelqu'un : l'inviter sur le serveur. Pour le retirer :
l'exclure du serveur ; son accès tombe dans les 6 heures (`RECHECK_HOURS`).

## Utilisation

- **Depuis TikTok** (bouton « 📲 Ajouter directement depuis TikTok » sur le site) :
  - **Discord** : Partager → Discord → salon `⌊🎯⌉strats-r6`. Le serveur lit ce salon
    toutes les 15 s avec OLYBOT, ajoute chaque TikTok et répond avec le lien.
  - **Android** : le site s'installe comme appli (PWA) et apparaît dans Partager
    (`share_target` → `/share`).
  - **iPhone** : raccourci Raccourcis qui ouvre `https://strats.olycity.fr/?add=<lien>`.
  Un partage reçu avant connexion est gardé le temps de se connecter avec Discord.
- **Ajouter** : coller un ou plusieurs liens TikTok (un message Discord entier
  marche aussi). Avec un seul lien, la fiche s'ouvre préremplie pour vérifier ;
  avec plusieurs, tout est ajouté d'un coup en « À tester ».
- **Détection automatique** (`public/js/detect.mjs`, données dans `public/js/r6.mjs`) :
  - depuis le **titre** : map, côté (ou déduit des agents), agents, type de strat, site ;
  - depuis **ce qui est dit dans la vidéo** (sous-titres TikTok récupérés avec la copie) :
    seuls les champs encore vides sont complétés, marqués « ✨ auto » dans la fiche ;
    on compte les mentions et on ne garde que les agents du côté dominant (les
    adversaires cités sont ignorés) ;
  - agents reconnus par leur nom **ou leur gadget** (Kiba → Azami, Evil Eye → Maestro,
    airjab → Nomad…) et par les erreurs fréquentes des sous-titres (« a zombie ») ;
  - **bombsites** reconnus par leurs salles (Cocktail → Kafe 3F, Hookah → Littoral…) :
    un nom de salle propre à une map suffit à deviner la map ;
  - hashtags collés (`#bankr6`, `#r6thermite`) ; « #Twitch » / « live sur Twitch »
    désigne la plateforme, pas l'agente ; « Ace » n'est jamais détecté seul.
  **Re-détecter** relance la détection (titre + vidéo).
- **Maps et positions en français** (Banque, Littoral…) avec les noms anglais reconnus.
  Le champ **Site / salle** propose les bombsites par paire (`2F · Bureau du PDG /
  Salon de direction`) et les salles de la map, en tapant en français ou en anglais
  (« ceo », « lockers », « cocktail »…). Un bombsite choisi sans map règle la map.
- **Vidéos** : chaque TikTok est copié sur le serveur avec yt-dlp, une vidéo à la
  fois. Tant que la copie n'est pas prête (ou si elle échoue), la fiche affiche le
  lecteur TikTok ; « Réessayer » relance une copie échouée.
- **Découper / extraire** (vidéo copiée) : « Début ici » / « Fin ici » limite la lecture
  à un passage, en boucle (coupe non destructive, le fichier reste entier). Un TikTok
  qui montre plusieurs strats : découper chaque passage puis « Extraire ce passage en
  nouvelle strat » ; chaque extrait est une strat à part (titre, agents, notes) qui
  partage le même fichier vidéo et les mêmes sous-titres.
- **Coupes suggérées** (`public/js/cuts.mjs`) : d'après les sous-titres horodatés et les
  changements de plan (ffmpeg), la fiche propose de couper l'intro « accroche », la fin
  « abonne-toi », et repère plusieurs strats dans une vidéo (« second spot »,
  « another setup »…), chacune extractible en un clic. Les phrases des sous-titres sont
  cliquables pour aller au bon moment.
- **Compléter** : cliquer une carte ouvre la vidéo et la fiche (agents, site,
  statut À tester / Validée / Bof, notes). Tout le monde peut modifier ; les
  changements apparaissent en direct chez les autres.

## Architecture

```text
olycity-strats/
├── public/                  Le site (HTML/CSS/JS natif, sans build)
│   ├── js/main.mjs          Interface, filtres, fiche
│   ├── js/api.mjs           Appels au serveur + flux en direct (SSE)
│   ├── js/r6.mjs            Maps, agents, types de strat (à compléter ici)
│   ├── js/detect.mjs        Détection depuis le titre
│   └── js/tiktok.mjs        Liens TikTok
├── server/                  Node 22, sans dépendance
│   ├── index.mjs            HTTP : site, /auth, /api, /media (Range)
│   ├── auth.mjs             Connexion Discord, sessions, revérification
│   ├── store.mjs            data/strats.json
│   ├── downloader.mjs       Copies yt-dlp dans data/media/
│   ├── discord-watch.mjs    Salon Discord strats-r6 → strats
│   ├── transcript.mjs       Sous-titres (WebVTT) → texte, complément des champs vides
│   └── tiktok-page.mjs      Lecture du titre d'un TikTok
├── Dockerfile, docker-compose.yml
├── deploy/deploy.sh         Envoi sur le mini PC
└── tests/                   node --test
```

| Route | Accès | Rôle |
|---|---|---|
| `/`, fichiers du site | public | page (affiche l'écran de connexion) |
| `/auth/login`, `/auth/callback`, `/auth/logout` | public | connexion Discord |
| `/api/me`, `/api/strats`, `/api/events`, `/api/meta` | membres | données, flux en direct, infos d'un TikTok |
| `/media/<videoId>.mp4|.jpg` | membres | copies des vidéos |

Données sur le mini PC dans `/root/olycity-strats/data` : `strats.json`,
`sessions.json`, `media/` (environ 10 à 20 Mo par vidéo).

## Lancer en local

```bash
node --env-file=.env.dev server/index.mjs   # http://localhost:3100, connexion factice
node --test
```

Les copies vidéo nécessitent `yt-dlp` (et `ffmpeg` pour les miniatures) dans le PATH.

## Mise en ligne (mini PC `ak1`)

- **Déployer** : committer, puis `sh deploy/deploy.sh` (envoie `HEAD` dans
  `/root/olycity-strats` et relance `docker compose up -d --build`). `data/` et
  `.env` ne sont pas touchés.
- **`.env` du serveur** : voir `.env.example` (appli Discord d'olydiscord,
  serveur `343778831766913058`).
- **Discord** : dans le portail développeur, appli d'olydiscord → OAuth2 →
  Redirects : `https://strats.olycity.fr/auth/callback`.
- **Cloudflare** : tunnel `ak1` (Networking → Tunnels), nom public
  `strats.olycity.fr` → `http://olycity-strats:3100`.
- yt-dlp se met à jour tout seul une fois par jour dans le conteneur.
