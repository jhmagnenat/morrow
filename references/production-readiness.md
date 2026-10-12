# Renforcement de Morrow et accès discret aux outils

Cette livraison améliore des parcours vérifiables. Elle ne démontre pas une
note de 10/10 ni une préférence générale face à RemNote. Les composants
visuels ont ensuite été améliorés avec autorisation : bouton Tools, adaptation
mobile, focus clavier et contraste. L'état précédent est conservé dans
`references/ui-baselines/before-usability-changes.json`.

## Révisions hors ligne et serveur commun

Study prépare automatiquement un inventaire de cartes et leurs états FSRS,
stocké dans IndexedDB. Un service worker garde la page Study et les ressources
déjà chargées. Un premier passage en ligne est nécessaire. Le service worker
demande un contexte sécurisé : HTTPS, ou localhost pendant le développement.
HTTP sur une adresse réseau ordinaire ne suffit pas.

Une réponse est enregistrée durablement dans IndexedDB avant de faire avancer
la session hors ligne. Le même FSRS calcule son échéance locale. Le retour du
réseau et les passages au premier plan déclenchent une synchronisation ; une
maintenance toutes les trente secondes la reprend également. Les identifiants
de requête empêchent les doubles enregistrements après perte de l'accusé de
réception. L'heure de la réponse, et non celle de son upload, est enregistrée.

La base d'une réponse inclut le contenu de la carte, son échéance et son repère
de réinitialisation. Si un autre appareil a modifié, réinitialisé ou révisé
cette carte, le serveur refuse de remplacer sa progression. La réponse locale
reste dans le magasin IndexedDB `reviews` de `morrow-offline-v1`, avec son
erreur. Les révisions de cartes différentes sont indépendantes. Des réponses
vieilles de plus de trente jours, ou dont la carte n'était pas due, sont refusées.

Limites explicites : le parcours validé est une session de cartes en cache,
son rechargement et sa synchronisation vers **le même serveur**. Il ne s'agit
pas d'une fusion de deux installations SQLite indépendantes. Une carte avec
une réponse en attente peut recevoir une nouvelle réponse lorsque son échéance
FSRS locale est atteinte. La chaîne conserve l'ordre des réponses et vérifie
les reçus précédents côté serveur ; un changement externe interrompt sa reprise.
Tools permet d'exporter les réponses en conflit puis de conserver la version
serveur. Il n'y a pas de génération IA hors ligne ni de garantie que tous les
PDF sont en cache.
Fermer les onglets interrompt la synchronisation de premier plan ; les réponses
restent enregistrées et l'ouverture suivante reprend la synchronisation.

La sélection du cours est conservée dans un cookie par navigateur. Les appels
asynchrones conservent `X-Course-Id`, pour que changer de cours ne redirige pas
une réponse ou génération déjà commencée. Ce mécanisme ne constitue pas une
autorisation utilisateur. Le mode optionnel `MORROW_AUTH=required` ajoute des
comptes, sessions et espaces de stockage isolés. Un compte propriétaire créé
avec `node scripts/users.mjs nom --owner` conserve les données existantes.
Les mots de passe sont dérivés avec scrypt et sel aléatoire ; seuls les hash
des jetons de session sont conservés. Les routes et pages exigent une session,
les cours et PDF sont séparés par compte, le worker traite chaque espace.
Un changement de compte refuse d'effacer les réponses en attente. HTTPS reste
nécessaire à distance. L'exploitation reste sur un seul hôte ; haute disponibilité,
audit de sécurité externe et reprise après perte complète du disque ne sont pas
démontrés par ces tests.

## Sauvegardes et génération durable

Les points de récupération protègent aussi les cours contenant uniquement du
vocabulaire, de la prononciation, des entretiens, des tentatives, des cartes
indépendantes ou de la progression. Les tests restaurent réellement des decks
de langue sans notion, document ou première révision.

`npm start` lance désormais Next.js et le worker dans des processus séparés.
Le worker est relancé automatiquement après un crash, avec une attente bornée
de 1 à 30 secondes. Un arrêt volontaire ne le relance pas. Les deux processus
utilisent le même `MORROW_DATA_DIR`, sur le même hôte. Le processus
consulte les files SQLite toutes les 500 ms et traite un document à la
fois ; les sections conservent la concurrence déjà configurée. L'adoption d'un
job se fait sous verrou SQLite, les écritures restent protégées par son identité.

Une reprise garde le même identifiant de job et traite uniquement les passages
inachevés. Un effacement explicite invalide le claim : le worker ne ressuscite
pas ces données. Les tests couvrent enregistrement sans exécution HTTP, adoption
unique, reprise d'un processus disparu et annulation. Une interruption pendant
un appel fournisseur peut nécessiter de répéter un appel non enregistré ; ce
mode ne garantit pas l'absence de facturation répétée par le fournisseur.

Le mode `inline` reste le défaut de `npm run dev` et peut être choisi
explicitement en production. En développement avec
`MORROW_GENERATION_EXECUTION=worker`, lancer aussi `npm run worker`.
Le worker compile les modules serveur
avec TypeScript au démarrage ; conserver les dépendances nécessaires à cette
commande. Ce n'est pas un worker pour un déploiement serverless éphémère.

`node scripts/check-production-runtime.mjs` vérifie le démarrage de production,
arrête brutalement le worker qu'il vient de créer, observe son remplacement et
vérifie que le serveur répond toujours. L'arrêt par le superviseur ferme les
deux processus. Ce test passe sur une base jetable, sans job IA lancé.

## Sources PDF et Anki

L'extraction PDF conserve les mêmes chaînes de texte et ajoute des blocs
positionnés, tailles de police et candidats de lignes de tableau/formule.
Ce sont des indices géométriques, pas une reconstruction sémantique certifiée.
Les scans et pages tournées imposent le parcours de vérification visuelle.
`GET /api/documents/<id>/pages/<page>` expose le champ `layout` ; il est conservé
dans les sauvegardes. Les anciens documents restent compatibles sans ce champ.

Un exécutable Tesseract peut être configuré par `MORROW_OCR_BINARY` et
`MORROW_OCR_LANGUAGES`. Il n'est pas installé automatiquement. Les pages
textuelles ordinaires ne l'appellent pas. Les mots OCR ont des coordonnées et
une confiance ; les nombres incertains sont signalés. Un échec ne supprime pas
le PDF et ne constitue pas un résultat réussi. L'OCR est limité dans le temps
et exécuté sans interpréteur de commandes. Ses résultats passent aussi par les
images originales avant approbation. Le contenu reconnaissable uniquement
par vision reste soumis à une vérification humaine lorsqu'il est brouillon.
Une citation issue d'une page OCR contenant des mots ou nombres incertains ne
peut pas rendre une nouvelle carte prête par la seule approbation du modèle.

L'import `.apkg` prend maintenant aussi en charge le transport récent
`collection.anki21b`, les tables normalisées, les configurations protobuf,
Zstandard et les empreintes SHA-1 des médias. La structure suit les
[messages officiels Anki](https://github.com/ankitects/anki/blob/main/proto/anki/import_export.proto)
et ses [configurations de modèles](https://github.com/ankitects/anki/blob/main/proto/anki/notetypes.proto).
La décompression cumulée est limitée à 256 MiB. Des fixtures indépendantes
vérifient Basic, inverse, cloze simple, médias et rejet de corruption.

Cela ne rend pas les modèles JavaScript, filtres personnalisés, clozes imbriquées
ou médias actifs équivalents à Anki. L'interface textuelle existante conserve
leur mise en brouillon. Le paquet original et ses médias restent préservés.

## Pédagogie, rapidité et preuves

Le corrigé d'une carte de mécanisme reprend aussi les étapes causales déjà
générées, sans appel de rédaction supplémentaire. Le contrôle local détecte
également une omission observée : une question sur durée **et** investissement
ne peut pas être validée avec une réponse ne couvrant qu'un aspect. Les pages
qui échouent aux contrôles restent retryables, même si l'audit IA est optimiste.

Le parcours respecte les prérequis tout en donnant la priorité aux concepts
faibles parmi les sujets accessibles. `Mastery by domain` utilise désormais
la maîtrise des cinq compétences ; les statistiques de maturité des cartes
restent séparées. La rétention porte sur les rappels espacés d'au moins un jour,
exclut les premières expositions et compte `Hard` comme un rappel réussi.

Les reconstructions PDF sont mémorisées par empreinte des octets et configuration
OCR dans un cache borné de quatre documents. Les erreurs ne sont pas mises en
cache ; les réponses sont copiées pour empêcher une mutation du cache. Les images
gardent leur cache borné existant. Les textes par page sont indexés une seule
fois par section au lieu de reparcourir tous les passages pour chaque citation.

Validation : suite isolée complète, TypeScript, ESLint, build de production,
test navigateur avec réseau coupé et rechargement complet. Les tests conservent
le scénario de 38 diapositives textuelles à sept sections et quatorze appels
simulés. Ce chiffre ne décrit pas un PDF arbitraire avec des scans.

Le test navigateur général `--check-study` passe sur une fixture dédiée :
sept onglets, interleaving de Today, identité commune des cartes, raccourcis
limités à l'onglet visible, échec d'enregistrement, brouillons, rechargement,
retour depuis Browse et réponse en vol. `--check-offline` vérifie une vraie
coupure réseau suivie d'un **nouveau document** chargé hors ligne.
`--check-offline-chains` vérifie deux révisions espacées de la même carte,
un rafraîchissement pendant l'attente et la perte d'un accusé après validation
serveur. Le rejeu n'ajoute chaque réponse qu'une fois. Ces fixtures n'utilisent
aucun cours de l'utilisateur et n'effectuent aucun appel IA.

Les snapshots lisent une seule version de SQLite malgré les écritures du
worker. Les copies de PDF, restaurations et resets sont protégés contre les
écritures concurrentes. Un test lance réellement un deuxième processus pendant
l'export ; un autre injecte un échec de reset et vérifie son rollback complet.
Une panne HTTP temporaire conserve une réponse locale en attente et permet
la progression ; elle ne devient pas une carte bloquée présentée comme un échec.
Les compteurs XP existants se rafraîchissent à la synchronisation.

`scripts/test-backup-atomicity.mjs` remplace réellement un premier PDF, injecte
un échec de remplacement du deuxième, puis vérifie le retour des deux fichiers
et de la base à leur état initial. Il vérifie aussi une précondition périmée et
une restauration complète réussie.

Les requêtes de mutation provenant d'un autre site sont refusées avant
d'appeler les handlers. `MORROW_PUBLIC_ORIGIN` indique l'origine publique
exacte si un reverse proxy change l'URL interne. Ce contrôle ne remplace pas
une authentification avant exposition publique.

Les mesures d'extraction sur le PDF réel de 38 pages ne sont **pas** une mesure
de génération IA. Les premiers essais sans cache montrent une variation autour
de quelques centaines de millisecondes, avec un petit surcoût possible pour les
coordonnées. La répétition bénéficie du cache. Aucun gain de qualité scientifique
ou de rétention humaine ne doit être déduit de la réussite de ces tests.
Mesure reproductible sur cette machine : première extraction structurée 314 ms,
répétitions en cache médianes 18 ms, extraction textuelle sans cache médiane
276 ms (trois répétitions). `node scripts/benchmark-pdf-layout.mjs --pdf <pdf>`
vérifie aussi que les textes ne changent pas et qu'une mutation du résultat ne
corrompt pas le cache. Le premier temps ne constitue pas une comparaison à froid
équitable, car le parseur a déjà été initialisé par la mesure textuelle.

Dernière répétition après cette livraison : première extraction structurée
200 ms ; médiane des répétitions en cache 14 ms, contre 168 ms pour l'extraction
textuelle sans cache. Le texte du PDF de 38 pages reste identique. Ce résultat
porte uniquement sur l'extraction, sur ce document et cette machine.

## Ce qui reste nécessaire pour établir la préférence face à RemNote

- Mesurer première carte exploitable, durée totale, coût et erreurs critiques
  sur plusieurs cours réels, avec le fournisseur configuré et relecture humaine.
- Comparer à sources, temps d'étude, tâches et évaluateurs identiques, avec un
  rappel différé et de nouveaux problèmes de transfert.
- Fournir une vraie authentification et isolation par utilisateur avant de
  proposer un service hébergé à plusieurs personnes ; déployer le serveur
  personnel derrière une authentification HTTPS adaptée.
- Rendre la résolution des conflits, récupération et configuration accessibles
  dans le produit si la contrainte d'interface est levée.
- Corriger lisibilité et ergonomie mobile si une note visuelle supérieure est
  recherchée. Aucun changement de backend ne corrige le contraste du texte.

Le dispositif `scripts/evaluate-learning.mjs` existe déjà pour préparer une
relecture humaine. Une préférence produit ne peut pas être attribuée par ce
document ou par un autre modèle à la place de ces observations.
