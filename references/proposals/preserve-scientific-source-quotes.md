# Proposition : préserver les symboles des citations scientifiques

**Suite :** la correction NFC et respect de la casse a depuis été intégrée au moteur après autorisation de modification. Le texte ci-dessous décrit la proposition historique ; les tests actuels et l'architecture appliquée sont documentés dans [le changement de production](../morrow-knowledge-compiler-production.md).

État : **patch préparé et vérifié, non appliqué**. Aucun fichier du moteur de production modifié ; aucun appel API et aucune génération de cartes.

Le [patch](preserve-scientific-source-quotes.patch) remplace NFKC par NFC et retire la conversion en minuscules dans `verifiesQuote`, `lib/contentQuality.ts`. Il conserve la normalisation des espaces et le seuil minimal de douze caractères. L'objectif est de rejeter une citation altérée, pas de certifier l'implication d'une affirmation.

Reproduction hors ligne : `node scripts/benchmark-lab/offline-quote-proposal.mjs`. Le script lit le fichier actuel, isole uniquement la fonction par AST TypeScript, exécute la version originale et une version candidate en mémoire, produit le patch et vérifie que le fichier original est inchangé. Les observations et empreintes sont conservées dans `data/benchmark-lab/offline-audit/quote-proposal.json` et son historique.

Douze cas vérifiés : les collisions exposant, indice, casse d'unité et préfixe sont rejetées par la proposition. Les citations exactes, les différences d'espacement et les accents sous formes Unicode canoniquement équivalentes restent acceptés. Les citations absentes, vides ou trop courtes restent rejetées. `git apply --check references/proposals/preserve-scientific-source-quotes.patch` réussit ; cette commande n'applique pas le patch.

Effet secondaire attendu : une citation modifiée seulement en casse ou utilisant une variante typographique compatible sera désormais refusée. Les références matérialisées à partir des identifiants source gardent le texte original et évitent ce problème. Les anciennes citations non exactes pourraient être signalées lors de leur relecture ; aucun contenu historique n'a été migré ici. Une validation des usages de publication reste nécessaire avant intégration.

Cette correction est ciblée sur un défaut démontré. Elle n'améliore pas à elle seule la sélection pédagogique, ne vérifie pas les graphiques et ne prouve aucun gain sur les cartes réelles. Son intégration reste soumise au périmètre demandé : la dernière instruction interdit toujours de modifier le moteur.
