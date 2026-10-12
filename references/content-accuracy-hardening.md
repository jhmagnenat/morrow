# Exactitude des contenus : changements et preuves

Les contrôles visent à empêcher la publication de contenus insuffisamment
vérifiés. Ils ne permettent pas de garantir une exactitude universelle de 10/10.

## Changements

- Conception des cartes améliorée : question autonome et précise, un objectif,
  réponse directe puis raisonnement décisif, unités et conditions conservées,
  contrastes pertinents et exemples hypothétiques résolus.
- Correction ciblée des cartes rejetées dans la génération progressive et les
  nouvelles Q&A : une tentative fondée sur le défaut signalé, puis vérifications
  pédagogique et factuelle distinctes. Une correction ne peut remplacer un
  exercice par une définition plus facile ni changer ses sources justificatives.
- Les cartes déjà acceptées ne sont pas réécrites. Les corrections conservent
  les objectifs et l'historique ; les répétitions identiques utilisent le cache.
- Une carte Q&A automatique déjà en brouillon peut être améliorée sur place,
  sans être ignorée comme doublon ni perdre son identifiant et ses révisions.
  Les cartes prêtes, suspendues ou modifiées manuellement restent protégées.

- Relecture contradictoire supplémentaire des affirmations, avec couverture
  intégrale du texte, citations exactes et contrôle des conditions d'application.
- Rejet des affirmations incertaines, contredites, inventées et des évaluations
  incomplètes, même après un premier audit favorable.
- Contrôles arithmétiques indépendants : priorités, parenthèses, signes,
  puissances, pourcentages et arrondis. Les expressions ambiguës ne sont pas
  présentées comme vérifiées.
- Empreintes du contenu et des pages sources complètes pour les cartes et
  leçons générées. Une modification invalide leur ancienne approbation.
- Exclusion des cartes invalidées des révisions, exports et inventaires hors
  ligne actualisés, avec conservation des identifiants et historiques FSRS.
- Explications complémentaires fondées sur les sources originales ; correction
  et notation des réponses soumises à une vérification factuelle avant
  l'enregistrement d'une progression.
- Conservation des verdicts négatifs pour éviter qu'une répétition identique
  obtienne une approbation par hasard. Un changement du contenu, des sources ou
  du modèle produit une nouvelle vérification.

## Preuves et limites

Les tests isolés couvrent 21 évaluations adversariales et 35 cas arithmétiques,
ainsi que les changements de source, les courses concurrentes, la conservation
des historiques, les API d'explication, la notation et le cache hors ligne.
Les modèles simulés testent les mécanismes ; ils ne mesurent pas l'exactitude
scientifique des modèles réels.

L'essai réel du fournisseur configuré a échoué sur une erreur de connexion,
avant tout résultat exploitable. Voir
[`accuracy-live-1791582854266.json`](../data/reports/accuracy-live-1791582854266.json).
Le générateur et le relecteur utilisaient tous deux gpt-4o : des appels séparés
ne constituent pas une validation indépendante par un autre modèle ou un expert.

Une nouvelle évaluation du générateur complet, après les améliorations de
conception et de correction des cartes, a rencontré la même erreur de connexion
au premier appel. Aucune carte réelle n'a pu être évaluée ; voir
[`card-quality-live-1791584407189.json`](../data/reports/card-quality-live-1791584407189.json).
Le script `scripts/evaluate-card-quality-live.mjs --live` conserve les paires
source/carte, les attentes déclarées et une grille vierge pour expertise ; il
limite les appels et ne produit pas de note automatique à partir des approbations.

Le fichier `.env.local.example` expose les options `*_ACCURACY_MODEL`.
Les vérifications supplémentaires augmentent le coût et peuvent laisser en
brouillon un contenu correct mais insuffisamment établi. Sur le scénario simulé
de 38 diapositives, la génération progressive utilise 28 appels.

Une source peut elle-même contenir une erreur ; une citation authentique n'est
pas une preuve scientifique. Les contenus importés ou validés manuellement,
les anciennes explications complémentaires et les sources visuelles demandent
encore une revue adaptée. Un appareil entièrement déconnecté ne peut connaître
un changement récent du serveur. La reconnaissance des formules et les règles
déterministes ne couvrent pas tous les domaines.

La mesure à effectuer ensuite est une expertise en aveugle sur des cours réels,
avec annotation des erreurs critiques, de la couverture et des refus excessifs,
puis des évaluations de transfert et de rétention. Aucune note d'exactitude
mesurée n'est attribuée tant que ces preuves manquent.
