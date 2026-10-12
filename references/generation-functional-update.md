> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Génération utilisable : changements et validation

Version de production : `direct-cards-v3-recall-and-concepts`.

## Changements

- La conception sélectionne explicitement les connaissances du sujet et exclut accès Moodle, apps, consignes, retours d'étudiants et modalités du cours. Les pages mixtes restent disponibles pour leurs connaissances enseignées.
- Chaque concept possède une définition autonome, vérifiée dans le même champ que la question, la réponse et l'explication. Une question/réponse n'est plus utilisée comme définition du concept.
- Réponse de rappel courte (600 caractères maximum), explication facultative séparée (1 200 caractères maximum), visible après révélation et modifiable dans Browse. Les deux restent vérifiées, conservées dans les sauvegardes et exportées vers Anki.
- Une citation d'image accessoire ne bloque plus une carte dont le relecteur justifie intégralement le contenu avec des citations textuelles valides. Les preuves exclusivement visuelles et l'OCR incertain restent en brouillon. Une preuve sur une page principale est toujours requise.
- Idées essentielles et couverture détaillée sont accessibles dans Documents et transmises au moteur. Les plafonds de sortie s'adaptent au contrat ; ils ne constituent pas des quotas de cartes.
- Choix facultatif de 1 à 3 pages. Les frontières explicites de chapitre séparent les lots. Le découpage reste borné à trois pages, avec contexte : ce n'est pas encore une segmentation sémantique complète.
- Regenerate/Rebuild remet les pages choisies en traitement avec point de récupération préalable. Les identifiants, corrections manuelles, suspensions et historiques de révision restent protégés. Les anciennes cartes ne sont pas supprimées automatiquement.
- L'audit ne reçoit plus deux copies de toutes les réponses. Les runs enregistrent modèles, couverture et empreintes des prompts. Toujours deux appels par lot non caché ; aucune baisse mesurée de coût ou de latence n'est revendiquée.
- Une modification humaine d'explication invalide la preuve automatique précédente. L'approbation humaine ne se fait pas passer pour une nouvelle approbation du modèle.

## Utilisation

Redémarrer le serveur après la mise à jour. Ouvrir Documents, choisir Essential ideas, saisir par exemple `19,23` pour le cours d'assurance, puis Generate cards ou Regenerate cards. Inspecter les questions/réponses et sources dans Browse avant d'étendre au document. Une sélection de pages reprocess ces pages et conserve le reste du cours.

## Vérification

- Suite complète `npm.cmd test` passée, avec régressions sur preuves mixtes, images seules, citations forgées, notions autonomes, explications, régénération et historiques.
- TypeScript, lint et build de production passés.
- `node scripts/check-generation-runtime.mjs` passe dans Chrome headless : choix réels de couverture/pages transmis, page invalide refusée, explication séparée après révélation. Base jetable, requêtes de génération interceptées, aucun appel modèle.
- Un essai du moteur de production sur le vrai PDF a été tenté dans une base isolée. La première requête a échoué ; une sonde sans authentification vers OpenAI échoue aussi avec `EACCES`. Aucun résultat de qualité ou de vitesse ne peut être déduit de cet essai. Rapport : `.next/direct-generation-evaluation.json`.

## Évaluation réelle disponible

Préparation sans appel IA :

```powershell
node scripts/evaluate-direct-generation.mjs
```

Depuis un terminal ayant accès au fournisseur, essai sur le cours actuellement enregistré dans `data/encyclopedia.db` :

```powershell
node scripts/evaluate-direct-generation.mjs --live --pages=19,23
```

Au plus quatre appels configurés, plafond de sortie 4 096 tokens par appel, aucune reprise automatique, base jetable. Cette commande utilise les crédits API du fournisseur. Le plafond de tokens partagé arrête les appels suivants après consommation ; il n'est pas un plafond de facture garanti. Le rapport inclut sources, cartes, notions, avertissements et temps. Les appréciations humaines restent vides : aucune note d'exactitude automatique n'est attribuée.

Aucun nouveau logiciel, skill ou framework n'est requis. La qualité sur d'autres matières, les gains de coût/latence, la compréhension à J+7 et l'équivalence avec RemNote restent à mesurer.
