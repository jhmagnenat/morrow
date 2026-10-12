# Préparer les premiers essais payants

Le pilote utilise le même moteur `generateProfessorCourse` et les mêmes prompts que la plateforme. Il prépare une copie du PDF, traite au maximum cinq slides, conserve les cours et les cartes dans des rapports séparés et n'écrit aucune carte ni révision dans le cours personnel. Il ne publie pas automatiquement les résultats d'essai.

## Pilote déjà préparé

`data/model-evaluation/pilot/case.json` contient les pages **19, 23, 26, 29 et 32** du cours de 38 pages. Les attentes de relecture sont rédigées après inspection du texte et des figures. Elles testent la mutualisation, les familles de produits, les mesures financières, la lecture d'un graphique et les fonctions d'un assureur. Les graphiques de 2022/2025 ne doivent pas devenir des faits actuels ou des preuves de causalité. Elles ne constituent pas un résultat d'évaluation du modèle.

Ouvrir `data/model-evaluation/pilot/slides.html` pour consulter les cinq pages et leurs attentes. Les résultats locaux sont exclus de Git. Le fichier de référence des attentes, lié au hash exact du PDF, est `references/evaluation/teacher-pilot-expectations.json`.

## Configurer les clés

Ajouter uniquement les clés des fournisseurs à `.env.local` :

```dotenv
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Il suffit d'une clé pour tester un modèle. Sol utilise `gpt-6.1-sol`; Sonnet utilise `claude-sonnet-5-5`. La CLI choisit explicitement le fournisseur, le modèle de génération et de relecture, les tarifs et les paramètres. Elle n'affiche jamais les clés. La présence d'une clé ne prouve ni son accès au modèle ni son solde. Les éventuels imports lancés dans l'application ne partagent pas le budget du pilote : commencer par les commandes ci-dessous.

## Vérifier sans dépenser

```powershell
npm.cmd run evaluation:check
npm.cmd run evaluation:run -- --model=sol
npm.cmd run test:model-evaluation
```

`check` et `run` sans `--live` n'envoient aucune requête au fournisseur. Les tests automatisés simulent le transport HTTP. Le cas doit contenir au moins un objectif attendu par page avant un essai payant.

## Lancer après ajout de crédits

```powershell
npm.cmd run evaluation:run -- --model=sol --live
npm.cmd run evaluation:run -- --model=sonnet --live
```

Les modèles sont testés séparément, sur le même PDF, les mêmes attentes et les mêmes prompts. Aucun basculement automatique vers un autre fournisseur. Les appels sont séquentiels, sans réparation automatique ni nouvelle tentative du SDK. La CLI affiche les étapes et le chemin du rapport `review.html`.

Le pilote partage **2 $ de budget cumulé et au maximum 40 appels payants** entre les modèles et les relances. Les compteurs sont dans `data/model-evaluation/pilot/llm-budget.sqlite`. Avant chaque appel, le connecteur demande le comptage natif des tokens d'entrée, ajoute une marge de 15 % + 2 048 tokens et réserve le coût de l'entrée ainsi que toute la sortie maximale, raisonnement inclus. Un appel qui ne tient pas dans le budget n'est pas lancé. Les requêtes de plus de 90 000 tokens comptés sont refusées pour conserver les tarifs de petit contexte. Les tarifs standard vérifiés le 11 octobre 2026 sont 2 $ / million en entrée et 10 $ / million en sortie pour ces deux modèles.

Ce mécanisme bloque localement les appels au-delà des réservations. Le compteur natif est une estimation : une modification tarifaire ou un écart de comptage peut modifier la facture fournisseur. Aucune garantie de plafond contractuel chez le fournisseur n'est revendiquée. Les tokens cachés sont conservés dans la télémétrie, mais aucun rabais n'est utilisé pour réserver le budget.

En cas de timeout, quota ou erreur réseau, le coût peut être inconnu : la réservation reste engagée et la session est arrêtée. Les résultats déjà obtenus restent consultables. Ne pas supprimer le journal ou le verrou d'un processus actif pour forcer une reprise. Après un crash, vérifier que le PID de `live.lock` n'existe plus avant de retirer ce fichier; les réservations persistantes restent conservées. Réconcilier les appels inconnus avec la facturation avant de décider d'un nouvel essai.

Une relance identique récupère les sorties validées dans le cache. Le hash inclut le modèle, les prompts, le schéma, l'entrée et les images. Modifier les slides, les objectifs, les prompts ou les paramètres demande un nouveau cas, afin de conserver une comparaison reproductible. Changer simplement la variable de budget ne peut pas augmenter le plafond d'une session déjà créée.

## Relire et mesurer

Ouvrir le `review.html` indiqué par la commande. Il contient les slides originales, le cours enrichi avec ses origines, les points incertains, toutes les cartes proposées et les contrôles. Pour chaque carte, choisir conserver sans correction, corriger ou rejeter, et indiquer les erreurs factuelles. Noter le cours, vérifier chaque objectif attendu et renseigner le temps de correction. Le bouton télécharge un JSON d'évaluation humaine.

```powershell
npm.cmd run evaluation:score -- --run="CHEMIN/result.json" --review="CHEMIN/human-review-ID.json"
```

Le résumé mesure le taux de conservation, la couverture, les erreurs, le coût par carte conservée et le temps de correction. Seuil initial proposé : génération complète, zéro erreur factuelle dans les cartes, zéro erreur majeure dans le cours, exactitude ≥ 9/10, contexte et clarté ≥ 8/10, au moins 80 % de cartes conservées sans correction et 80 % d'objectifs correctement couverts. Des objectifs non examinés, un cours sans cartes ou un essai interrompu ne passent pas. Le rapport conseille alors soit une correction avant d'autres dépenses, soit **un seul essai sur un cours complet**. Il ne certifie pas la qualité sur d'autres matières.

Comparer les deux `human-summary.json` uniquement si les `protocolHash` sont identiques. Le rapport sépare la nouvelle dépense de l'exécution (`newCostUsd`) du coût cumulé attribué au modèle dans le pilote (`costUsd`). Le coût par carte conservée utilise ce dernier : une relance gratuite en cache ne fait pas disparaître le coût de génération initial.

## Préparer un autre cours

```powershell
npm.cmd run evaluation:prepare -- --pdf="C:/cours/slides.pdf" --pages=3,8,12,17,21 --case="data/model-evaluation/autre-cours"
npm.cmd run evaluation:check -- --case="data/model-evaluation/autre-cours"
```

Sans `--pdf`, la préparation lit le dernier document du cours `default` en lecture seule. `--course=ID` et `--document=ID` permettent de choisir un autre document. Sans `--pages`, une sélection heuristique propose cinq pages; elle doit être examinée, ce n'est pas une sélection pédagogiquement certifiée. Renseigner les objectifs et le contexte attendu dans le nouveau `case.json` avant les appels payants.

## Sources des adaptateurs

- [OpenAI : GPT-6 et compatibilité API](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI : sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI : comptage des tokens](https://developers.openai.com/api/docs/guides/token-counting)
- [Anthropic : changements Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5)
- [Anthropic : sorties structurées](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic : comptage des tokens](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Tarifs OpenAI](https://developers.openai.com/api/docs/pricing), [tarifs Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)
