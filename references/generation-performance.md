> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Génération progressive et FSRS

La dernière génération observée dans la base utilisateur concernait 38 pages : environ 17 minutes, 100 appels IA et 1 124 969 tokens d’entrée. Ce constat a motivé la réduction des étapes et des contextes répétés ; il ne constitue pas un benchmark comparatif de RemNote.

Le pipeline progressif est actif par défaut. Le découpage local regroupe les slides textuelles en sections bornées : une première section de deux slides au plus, puis jusqu’à six slides et 9 000 caractères par section, avec séparation aux chapitres explicites. Il n’y a plus de plan IA obligatoire ni deux appels par slide : une reconstruction compacte et un audit indépendant couvrent toute une section. Le même mécanisme développé sur plusieurs slides conserve une notion et ses cartes. Les contextes de référence sont limités à deux extraits pertinents.

Une petite section textuelle est terminée avant le traitement du reste. Ensuite, trois sections peuvent être traitées simultanément avec un fournisseur cloud, une avec Ollama par défaut. Le contenu vérifié est enregistré au fil de l’eau ; Study, Interview et Drills peuvent l’utiliser pendant la suite du job. Le statut indique l’étape active ; les jobs enregistrent leur durée, les cartes prêtes uniques et le délai avant les premières cartes. Les slides peu textuelles ou signalant des figures conservent le parcours avec inspection visuelle. Une réponse tronquée peut être divisée en deux sections une fois ; un rejet pédagogique ne déclenche pas de boucle de réparations payantes.

Les leçons initiales contiennent le contexte, les mécanismes, le formalisme, les conditions et une application auditée. Study → Understand → **Deepen understanding** enrichit uniquement le concept choisi : intuition, analogie si utile, limites et deux variantes de transfert auditées. Les demandes simultanées partagent le même travail et le résultat est sauvegardé. Les notes manuelles, les cartes et FSRS restent protégés ; une modification des sources ou du concept pendant l’appel empêche de sauvegarder une réponse obsolète.

Configuration : `MORROW_GENERATION_PIPELINE=fast` restaure le précédent pipeline par slide ; `detailed` restaure les étapes détaillées ; `MORROW_GENERATION_CONCURRENCY` accepte 1 à 4 ; `MORROW_LLM_TIMEOUT_MS` règle le délai par appel. Le modèle configuré reste utilisé. Ces réglages concernent les prochains jobs ; ils ne réécrivent pas une exécution déjà chargée en mémoire.

Sur un cours fictif de 38 slides textuelles, le test d’intégration vérifie sept sections et **14 appels**, premières cartes disponibles avant la fin, sans doublons de notions ni perte des historiques. Ce nombre n’est pas universel : les chapitres, pages denses, images et erreurs peuvent augmenter le coût. Sur le PDF utilisateur de 38 pages, l’extraction locale mesurée prend environ **0,6 seconde** ; le plan prévoit cinq sections textuelles, six slides visuelles et dix appels pour les sections textuelles seules. Ce découpage n’est pas une validation humaine de la couverture.

Un essai avec le fournisseur réel depuis cet environnement a échoué avant toute réponse exploitable : zéro token enregistré et aucune carte produite. Il ne permet pas de mesurer la latence réelle ni de démontrer une génération en 30 secondes.

Mesurer sur un PDF sans modifier le cours utilisateur :

```powershell
# Extraction et découpage uniquement, aucun appel IA
node scripts/benchmark-generation.mjs --pdf "chemin/vers/cours.pdf"
# Copie jetable du PDF, fournisseur configuré ; consomme des crédits IA
node scripts/benchmark-generation.mjs --pdf "chemin/vers/cours.pdf" --pages 19,20 --live
```

Le rapport JSON dans `.next/generation-benchmark-*.json` distingue extraction, première carte prête, durée totale, appels, tokens et pages nécessitant une vérification. Omettre `--pages` mesure le cours complet. La durée simulée des tests n’est pas un benchmark fournisseur.

Le planificateur local implémente les équations et paramètres par défaut [FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm). Il utilise les dates réelles de rappel, les quatre notes, stabilité, difficulté et lapses. La rétention cible est sauvegardée avec le cours. La migration rejoue les historiques sans fabriquer de rappels et sans changer les échéances avant une nouvelle réponse. Les sauvegardes préservent ces états. Un ajustement personnel avec validation chronologique est désormais disponible ; voir [la personnalisation et la récupération](reliability-and-scheduling.md). Il n’y a pas de dispersion aléatoire des échéances.

La suite de tests utilise des données jetables et des réponses IA simulées. Elle vérifie aussi citations inventées, audit absent malgré d’anciennes cartes prêtes, variante numérique fausse, cache, sauvegardes et changements concurrents. Une même application posée dans Interview et Drills a désormais la même identité pour l’évaluation de maîtrise. L’historique reste conservé. Une évaluation pédagogique humaine et un chronométrage réussi avec le fournisseur réel restent nécessaires pour conclure à une supériorité sur un concurrent.
