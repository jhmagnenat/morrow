# Morrow — contrat produit

## Objectif

Importer des slides de cours, souvent incomplets, et retrouver les explications qu'un enseignant apporterait : prérequis, définitions, mécanismes, distinctions, conditions et exemples. Transformer ce cours expliqué en cartes de rappel actif sur plusieurs dimensions, puis planifier et suivre les révisions.

**Slides → cours expliqué → cartes multidimensionnelles → révisions suivies.**

Le produit n'est pas un simple extracteur de citations. L'ajout de connaissances disciplinaires pertinentes fait partie du travail attendu du LLM. Il ne peut pas retrouver avec certitude le discours exact ni les intentions du professeur.

## Trois origines de contenu

- **Slides** : affirmations réellement présentes dans le document, conservées avec leur portée, leurs unités et leurs conditions.
- **Contexte ajouté** : connaissances disciplinaires apportées pour enseigner et compléter les slides. Une slide ancre le sujet, mais ne prouve pas ces connaissances. La relecture contrôle leur exactitude et leur pertinence.
- **Illustration** : exemple ou exercice hypothétique avec hypothèses et données explicites. Aucun résultat hypothétique ne devient un fait réel.

Une ambiguïté, une figure illisible, une information actuelle ou une règle dépendant d'une juridiction sans preuve suffisante reste à clarifier. Le système n'invente ni étude, ni référence, ni intention du professeur. Aucune référence externe n'est présentée comme consultée si elle ne l'a pas été.

## Cartes

Les dimensions sont des types de questions dans une même file de révision : définition/rappel, mécanisme/compréhension, comparaison/distinction, application. Elles ne sont pas quatre cases obligatoires pour chaque notion.

Une bonne carte teste un objectif utile et précis, possède une question autonome et une réponse courte. Le contexte détaillé reste dans le cours. Les exercices donnent les entrées et hypothèses nécessaires dans leur question. Zéro carte est approprié pour une page purement administrative ou décorative.

Les cartes proviennent du cours relu, pas directement de fragments de slides interprétés indépendamment à chaque question. Un contenu incertain ne peut pas être converti en carte prête.

## Parcours principal

1. Importer le PDF des slides.
2. Reconstruire et lire le cours expliqué par section.
3. Vérifier les cartes proposées et leur provenance.
4. Réviser et suivre les prochaines échéances.

Le graphe et les exercices spécialisés sont secondaires. La lecture seule ne prouve pas la maîtrise. Le suivi des révisions FSRS est indépendant de l'accès au LLM.

## Fiabilité et coût

Les étapes sont bornées, leur sortie est mise en cache, et les échecs de quota arrêtent le travail. Ajouter des contrôles ou du contenu ne justifie pas des boucles de génération sans fin.

Sans fournisseur disponible, le cours enregistré, les cartes, les corrections, les révisions et les exports restent accessibles. Aucune reconstruction automatique fiable n'est promise sans modèle. Ollama est une option locale, dont la qualité et la vitesse dépendent du modèle et du matériel.

Une relecture IA et des tests simulés ne certifient pas la vérité scientifique. La qualité se mesure sur les paires slides/cours/cartes avec une évaluation humaine : erreurs, couverture des objectifs importants, cartes acceptées sans modification, temps de correction et coût par carte acceptée.

## Préservation

Les modifications conservent les documents, les cartes corrigées ou étudiées, les identifiants, les historiques et les sauvegardes. La réforme ne régénère ni ne réinitialise automatiquement les données existantes.
