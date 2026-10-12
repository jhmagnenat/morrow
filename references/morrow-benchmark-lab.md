# Laboratoire expérimental de flashcards MORROW

Pour un audit **sans API et sans aucune génération de cartes**, utiliser uniquement `node scripts/benchmark-lab/offline-audit.mjs`. Ce script teste l'extraction PDF, les contrats et les transformations locales avec des connaissances prédéfinies ; il ne lance aucune méthode A/B/C. Voir [le diagnostic architectural hors ligne](morrow-offline-architecture-benchmark.md). Les commandes de démonstration et les tests expérimentaux décrits plus bas ne font pas partie de ce parcours hors ligne, car ils peuvent fabriquer des cartes synthétiques.

Le laboratoire est indépendant du générateur de MORROW. Il ne publie aucune carte dans les cours, n'importe pas le moteur de génération ou ses bases de données et ne modifie pas le frontend principal. Aucune dépendance ni framework multi-agent n'a été ajouté.

## Méthodes comparées

| Méthode | Parcours | Appels par lot de pages |
|---|---|---|
| A — Direct Multimodal | Images et texte des slides → cartes directement | 1 |
| B — Structured Pipeline | Images et texte → connaissances essentielles → cartes | 2 |
| C — Knowledge Compiler | Images et texte → connaissances → IR déterministe → sélection → générations spécialisées de rappel, comparaison ou application | 1 à 4 |

Le modèle initial est **GPT-4o, snapshot `gpt-4o-2024-11-20`**, identique à toutes les étapes et dans les trois méthodes. Il n'hérite pas de modèles d'audit différents configurés dans MORROW. Temperature 0, seed 17, deux pages par lot, huit cartes maximum par lot et 4 096 tokens de sortie maximum par appel. Le seed ne garantit pas un déterminisme absolu. Aucun minimum de cartes n'est imposé.

Les trois méthodes reçoivent exactement les mêmes pages, dans les mêmes lots, avec les mêmes images en haute résolution et le même texte extrait. B et C récupèrent aussi les sources originales au moment de concevoir leurs cartes, pour ne pas prendre une extraction erronée pour autorité. Leurs appels d'extraction sont réalisés indépendamment : pas de résultat partagé qui fausserait le coût.

Dans C, le compilateur **n'est pas un autre LLM**. Il normalise les unités de connaissances, vérifie la présence des références, conserve les conditions, supprime les répétitions exactes, classe par importance déclarée, sélectionne au maximum huit unités et affecte un générateur spécialisé. Les unités rejetées et omises restent consultables dans les artefacts. Il ne certifie pas la vérité scientifique des unités.

## Composants réutilisés et isolation

Seuls `lib/pdf.ts`, ses helpers de layout/OCR et `lib/structuredSchema.ts` sont réutilisés, après transpilation locale dans `.next/benchmark-lab-runtime`. Leur code n'est pas modifié. Le client OpenAI installé dans le dépôt est utilisé avec configuration explicite, schémas stricts et zéro reprise automatique. Le laboratoire possède ses propres mesures, budgets, résultats et commandes.

L'extraction, les images et le PDF original sont figés une fois et identifiés par SHA-256. Le texte de toutes les pages sélectionnées et les images sont conservés dans le manifeste. Le hash de l'implémentation et la configuration sont conservés ; un changement de code de génération exige de préparer une nouvelle expérience avant un lancement payant.

## Utilisation sans dépense

Depuis la racine du dépôt, en PowerShell :

```powershell
npm.cmd run benchmark:lab -- prepare --pdf "C:\chemin\mon-cours.pdf"
```

La commande retourne un `experimentId`, appelé `<ID>` ci-dessous. Sans `--pages`, le document entier est utilisé. Pour une première expérience plus courte, ajouter par exemple `--pages 1,2,3,4`. Le sous-ensemble choisi est rigoureusement le même pour A, B et C. Une configuration différente se fournit avec `--config scripts/benchmark-lab/config.example.json` ou une copie modifiée.

```powershell
npm.cmd run benchmark:lab -- serve
```

Ouvrir **http://127.0.0.1:4177**. Compléter les connaissances essentielles et leurs pages sources, retirer les pages sans objectif pertinent, puis cocher la validation et enregistrer. La liste est indépendante des méthodes et **n'est jamais transmise aux modèles**. Chaque lancement en conserve une copie pour empêcher des modifications ultérieures de changer silencieusement sa couverture.

```powershell
npm.cmd run benchmark:lab -- estimate --experiment <ID>
```

`prepare`, `serve`, `estimate` et `compare` n'effectuent aucun appel IA. La clé n'est chargée depuis `.env.local` que par la commande de lancement payant.

## Coût et accord explicite

`estimate` affiche, pour chaque méthode et au total : appels maximum, estimation de coût, enveloppe conservatrice, hypothèses, tarifs, date de vérification et identifiant du devis. La commande de lancement exacte est affichée **mais jamais exécutée automatiquement**.

Les tarifs initiaux vérifiés le 10 octobre 2026 sont 2,50 USD / million de tokens d'entrée, 1,25 USD pour l'entrée en cache et 10 USD pour la sortie. Voir [la fiche officielle GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o). Les images sont incluses selon [le calcul des tokens d'image](https://developers.openai.com/api/docs/guides/images-vision). Vérifier les tarifs lors d'expériences futures ; ils sont configurables et enregistrés avec chaque lancement.

L'estimation textuelle utilise octets UTF-8 / 3, donc ce n'est pas un tokenizer exact. L'enveloppe réserve le plafond de 24 000 tokens d'entrée et de 4 096 tokens de sortie pour chaque appel possible, sans remise de cache. Avec les paramètres initiaux, elle représente **0,70672 USD par lot de deux pages pour les trois méthodes réunies**. Exemple pour 38 pages : 19 lots, jusqu'à 133 appels et une enveloppe de **13,42768 USD**. Ces montants ne sont pas une prévision de facture : la consommation habituelle peut être moindre et le devis réel dépend de la configuration.

Après avoir lu le devis et décidé de l'approuver, exécuter **manuellement la commande imprimée**, de cette forme :

```powershell
npm.cmd run benchmark:lab -- run --experiment <ID> --approve <IDENTIFIANT_DU_DEVIS> --max-usd <ENVELOPPE_AFFICHEE>
```

Sans approbation correcte, budget suffisant, référence de couverture validée, PDF inchangé et clé OpenAI présente, aucun appel n'est lancé. Chaque appel réserve son enveloppe avant envoi et doit respecter la borne d'entrée. Les appels sont séquentiels, sans retry automatique. Une erreur fournisseur dont la consommation n'est pas connue arrête aussi les méthodes restantes. Les coûts calculés depuis les tokens et les tarifs enregistrés restent des estimations de facturation, pas des factures fournisseur.

L'interface HTTP ne contient **aucune route qui lance une expérience payante**.

## Évaluation à l'aveugle

Après génération, actualiser l'interface et choisir le lancement. Les cartes des trois méthodes sont mélangées avec des identifiants aléatoires ; le JSON destiné à l'interface n'expose ni méthode, ni stade ni mesures permettant de les identifier. La correspondance est conservée dans un fichier privé local, jamais servi par l'interface. Un propriétaire des fichiers peut naturellement l'inspecter : l'aveugle est un protocole d'évaluation, pas un chiffrement contre ce propriétaire.

Pour chaque carte :

- vérifier sa question et sa réponse contre la citation ou la zone visuelle source ;
- noter **pertinence, exactitude et utilisabilité** de 1 à 5 ;
- signaler une éventuelle erreur factuelle critique ;
- indiquer les connaissances réellement testées et ajouter un commentaire.

Les cartes non notées gardent une note inconnue. Une référence textuelle vérifiée ou une zone valide ne garantit pas l'exactitude de l'affirmation. Le laboratoire ne remplace pas le jugement humain par un vote de modèle.

La couverture repose uniquement sur la liste validée et les annotations humaines. Une connaissance est comptée couverte si elle est reliée à au moins une carte notée ≥ 4/5 sur les trois critères et sans erreur critique. Une évaluation incomplète est signalée. Le seuil est une convention de comparaison, pas une preuve de perfection scientifique.

Le bouton de révélation exige une confirmation. Les mesures et les noms des méthodes deviennent alors visibles. Toute évaluation ultérieure est marquée comme effectuée après révélation et toutes les révisions sont journalisées.

## Mesures et résultats conservés

Chaque méthode enregistre :

- temps total du parcours et temps jusqu'au premier lot de cartes désérialisées ;
- temps jusqu'au premier lot comportant une référence structurellement valide, **sans le qualifier de pédagogiquement validé** ;
- appels API réellement tentés, tokens d'entrée/sortie et tokens de cache ;
- coût calculé avec le cache et équivalent sans cache, afin d'observer un éventuel avantage d'ordre d'exécution ;
- nombre de cartes produites, références invalides, erreurs et statut incomplet ;
- modèle demandé, modèle retourné, fingerprint fourni et configuration identique.

Le temps de préparation commun est affiché séparément et l'équivalent bout en bout est conservé (`preparationMs + totalMs`). La mesure de première carte correspond à la fin d'un premier appel structuré, pas au premier token de streaming ni à une carte certifiée par un spécialiste. L'ordre des trois méthodes est aléatoire, enregistré, avec la même concurrence de 1 et aucun cache de réponse du moteur MORROW. Le cache fournisseur peut malgré tout intervenir et est mesuré.

Les données résident dans `data/benchmark-lab/experiments/<ID>/` : manifeste, PDF, images, référence de couverture, devis et répertoires de lancement. Chaque lancement possède résultats, extractions, IR/sélections, mapping aveugle, évaluations et journal des révisions. Ce répertoire est exclu de Git.

Pour comparer les résultats révélés, y compris de futures versions :

```powershell
npm.cmd run benchmark:lab -- compare --experiments <ID1>,<ID2>
```

La commande produit un JSON exportable. Elle conserve hash du document, configuration, hash de la référence et version de l'implémentation pour identifier les comparaisons qui ne sont pas équivalentes. Les résultats non révélés restent masqués. Aucun classement automatique ni note sur 10 n'est fabriqué.

## Vérification hors ligne

```powershell
npm.cmd run benchmark:test
```

Le test prépare un vrai PDF synthétique, vérifie les entrées partagées, les trois parcours, les verrous d'accord/de budget, les références, la configuration API avec transport simulé, les coûts de cache, la persistance, le masquage HTTP, la couverture et la révélation. Aucun appel payant n'est effectué.

Une démonstration de l'interface peut aussi être créée avec `demo --experiment <ID>`. Ses cartes sont explicitement synthétiques ; appels API et coût réels sont zéro. Ses durées et notes ne constituent pas des résultats de comparaison pédagogique.

La réussite de ces vérifications montre seulement que le laboratoire fonctionne techniquement. La qualité, la couverture réelle et l'architecture à retenir seront établies par les expériences approuvées et les évaluations humaines sur des documents représentatifs.
