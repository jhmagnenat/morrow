> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Décision architecturale : importer des cartes depuis les sources

## Verdict

Le parcours précédent n'était pas une bonne base pour une importation rapide de flashcards. Il demandait des expériences, des mécanismes et une leçon riche pour toute notion, y compris lorsque la source n'établissait qu'un attribut ou une classification. Cette obligation était inscrite dans le schéma et les validations, pas seulement dans les prompts. Empiler des instructions supplémentaires ne pouvait supprimer cette charge.

Il n'est pas justifié de remplacer toute l'application. Le stockage des PDF, les transactions, les empreintes des sources, la reprise des jobs et la protection de l'historique FSRS sont utiles au nouveau parcours. La refonte porte d'abord sur la production et les critères de fin d'import.

## Changement effectivement appliqué

Le pipeline textuel progressif est maintenant `sections-v9-source-first-import` :

1. Sélectionner les sources primaires et leur contexte.
2. Produire des identités de notions minimales et des cartes directement depuis ces sources. Le schéma par défaut ne comporte **aucune leçon**, expérience ou développement causal obligatoire.
3. Auditer les identités, les cartes et la couverture de la source ; vérifier les faits séparément avec les preuves propres aux cartes.
4. Publier les cartes acceptées en conservant les identifiants et l'historique lors d'une régénération.
5. Terminer l'import si la couverture des cartes est acceptée. L'absence volontaire de leçon ne provoque plus une reprise payante.
6. Générer une explication approfondie uniquement sur demande, via le parcours existant `conceptLesson`. Cette explication garde sa propre validation et ne certifie pas rétroactivement les cartes.

Les anciens contenus avec leçons restent lisibles. Le mode d'import riche est conservé comme option explicite `MORROW_IMPORT_LESSONS=1` et dispose de tests de compatibilité. Il n'est plus activé par défaut. Les anciennes cartes ne sont ni effacées ni automatiquement certifiées par ce changement.

Fichiers principaux : `lib/sectionGeneration.ts`, `lib/sectionEvidence.ts`, `.env.local.example`, `scripts/test-source-first-import.mjs`.

## Ce que cette décision améliore et ne prouve pas

**Démontré par le code et les tests :** disparition de la génération obligatoire de leçons lors de l'import textuel ; disparition de leur contrôle comme condition de fin d'import ; pas de fabrication de cartes depuis une leçon quand le générateur renvoie une liste vide ; validation indépendante de l'identité et de chaque carte ; demande d'explication différée ; protection FSRS.

**Effets attendus, à mesurer :** moins de tokens de sortie et de champs à auditer, moins d'incitation à inventer du contexte, première carte disponible plus tôt et moindre coût. Le nombre d'appels de base n'est pas divisé automatiquement : le nouveau test comporte génération, audit principal, revue des identités et revue des cartes. Les contrôles factuels sont maintenus.

**Non démontré :** exactitude de 100 %, équivalence à RemNote, vitesse réelle du modèle, absence d'omissions. Les tests de réponses simulées ne mesurent aucun de ces résultats.

## Limites qui doivent guider les prochaines décisions

| Problème restant | Décision structurelle envisageable | Preuve nécessaire avant généralisation |
|---|---|---|
| Tableaux et images utilisent encore la reconstruction historique | Adapter leur contenu à un contrat de sources visuelles structurées, sans imposer une leçon ; conserver les vérifications de provenance et de portée | Tableau texte, tableau scanné et schéma annotés ; contrôle des colonnes, relations et nombres |
| Contexte sélectionné lexicalement | Index de sections, titres et références ; retrieval ciblé pour une définition ou condition absente | Cas où la bonne définition se trouve loin de la page, comparaison à la sélection actuelle |
| Notions et cartes encore proposées dans un même appel | Représentation intermédiaire des objectifs réellement présents dans la source, distincte des questions finales | Mesurer si elle réduit les omissions et erreurs assez pour justifier un appel supplémentaire |
| Critiques avec le même modèle | Auditeur différent et échantillonnage humain, sans augmenter arbitrairement tous les appels | Même corpus, jugement externe, taux de faux positifs des revues |
| Sources ambiguës ou non explicatives | Signaler explicitement qu'une information manque ; proposer des cartes bornées plutôt que compléter un cours imaginaire | Cas d'illustration publicitaire, liste de titres sans fonctions, extrait incomplet |
| Cache d'une sortie vide ou incomplète | Reprise explicite ciblant les objectifs manquants, distincte d'une répétition aléatoire de validation | Source avec objectifs annotés, contrôle qu'une correction ne contourne aucun rejet factuel |

Ces points sont des travaux à évaluer, pas des capacités déjà implémentées. Aucun changement de modèle ne remplace ce travail sur les sources et la couverture.

## Évaluation qui permettra de décider si la voie est bonne

Constituer un petit corpus fixe représentatif : texte explicatif, tableau de classifications, formule avec domaine, exercice complet, schéma, scan, document français, et page pauvre qui ne justifie aucune carte. Annoter avant génération les objectifs importants et les affirmations interdites. Produire les résultats dans une bibliothèque isolée.

Comparer l'ancien mode riche, le nouveau mode textuel, et les sorties RemNote sur les mêmes sources et une demande comparable. Juger chaque carte sans connaître son système d'origine. Critères : vérité de toute la réponse, conditions et unités, pertinence, question autonome, objectif unique, non-répétition et couverture des objectifs annotés. Mesurer aussi la première carte acceptée, la durée totale, les appels et les tokens. Une page sans cartes exige de distinguer abstention appropriée et omission.

Les seuils proposés pour une phase pilote sont **zéro erreur factuelle critique observée**, au moins 95 % de cartes acceptées par une revue humaine et au moins 90 % des objectifs annotés couverts. Ce sont des objectifs de validation, pas des performances actuelles ni une preuve mathématique d'exactitude. La comparaison réelle décide si le nouveau parcours doit devenir plus structuré ou si une autre approche est nécessaire.

## Vérification réalisée

La suite automatique complète et TypeScript passent après le changement. Le test spécifique exerce le schéma strict minimal, la fin d'import sans leçon, le rejet d'identité et de fait, les citations forgées, la liste vide, la demande d'explication différée et la conservation des cartes révisées.

Une génération réelle a été tentée sur la page 23 du cours dans une base jetable : `data/reports/card-quality-live-1791621029250.json`. Elle a échoué avec une erreur de connexion OpenAI, sans réponse du modèle ni tokens rapportés. Un appel réseau sans clé confirme `EACCES` dans cet environnement. Il n'y a donc pas de nouvelle note de qualité ou mesure de vitesse exploitable. Le blocage concerne le réseau local, pas une conclusion sur les crédits ou les capacités du modèle.
