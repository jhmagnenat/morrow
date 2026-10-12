> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Diagnostic de génération — 10 octobre 2026

## Périmètre

Lecture du moteur de production, des contrats, de la publication, du fournisseur et de la base `data/encyclopedia.db` en lecture seule. Aucun nouvel appel fournisseur, aucune modification des cartes ou de la configuration. Inventaire reproductible conservé dans `evaluation/generation-diagnostic-2026-10-10.json`.

La base actuelle contient 74 cartes (64 draft, 10 ready), 7 notions et 38 analyses de pages (21 retry, 4 complete, 13 skipped). Les 35 runs enregistrés cumulent 59 appels, 200 971 tokens d'entrée, 32 041 de sortie et zéro échec fournisseur. Ces cumuls comprennent reprises et cache : ils ne mesurent pas un import unique. Les statuts stockés ne prouvent ni exactitude ni éligibilité à la révision au moment de la lecture.

## Causes observables

1. Sélection pédagogique insuffisante : des cartes et notions portent sur Moodle, les motivations de l'étudiant et les modalités du cours. Le filtre local est lexical et spécialisé ; le verdict du modèle ne remplace pas une définition explicite des connaissances cibles.
2. Notions construites incorrectement : `publishGeneration` prend le topic de la première carte acceptée et utilise question + réponse comme définition. Il ne produit pas de définition autonome du concept et ne construit aucun lien. Une carte de comparaison ou d'application ne constitue pas nécessairement une définition.
3. Evidence visuelle trop bloquante : le moteur met toute carte citant une image en brouillon, même si elle possède des citations textuelles. Les identifiants image ne sont pas inclus dans les sources textuelles passées à `accuracyIssues`, qui peut donc signaler des sources manquantes. Il faut distinguer fait textuellement établi et fait exclusivement visuel, sans autoriser automatiquement les graphiques incertains.
4. Découpage physique : lots de une à trois pages, contexte lexical/voisin et plafond de douze cartes. Ces limites bornent la consommation, mais ne constituent pas un plan pédagogique. L'effet sur la couverture réelle reste à mesurer.
5. Contrat de réponse ambigu : le prompt demande à la fois un objectif atomique et des explications développées en paragraphes. Séparer réponse de rappel et explication facultative évite de confondre carte et mini-leçon.
6. Audit coûteux et incomplet comme solution : il relit sources, cartes et objectifs, mais ne corrige pas le mauvais choix de connaissances. Un run récent a consacré 8,502 secondes à l'audit contre 3,423 à la rédaction ; cet exemple n'est pas une moyenne.
7. Traçabilité de version insuffisante : des artefacts avec les anciens problèmes de partition de claims partagent le même nom de version que le contrat actuel à champ fixe. Les caches incluent le système, mais les rapports doivent aussi enregistrer le hash du prompt/contrat pour ne pas mélanger les générations.

## Décision recommandée

Conserver stockage, PDF, FSRS, historique, sauvegardes et interface. Tester un remplacement isolé du cœur de génération avant toute migration. Ne pas multiplier les frameworks ou réintroduire les moteurs archivés sans comparaison.

Baseline : section cohérente de sources originales → un appel de conception avec notions explicitement définies, objectifs et cartes → validation locale → revue sémantique ciblée ou par lot → prévisualisation avant activation. Comparer à la production actuelle, qui comporte déjà deux appels par lot. Une étape préalable d'extraction des connaissances est une variante à mesurer, pas une amélioration acquise ; elle conserve l'accès aux sources originales et ajoute un coût.

Ne pas retirer l'audit existant sans preuve. Les contrôles locaux ne vérifient pas seuls la vérité ou la pertinence. Une revue ciblée exige des critères de risque et une vérification humaine des cartes non auditées pendant le pilote.

## Validation avant bascule

- Constituer 12–20 sections réelles avec liste humaine des connaissances essentielles, exemples de bonnes cartes et mauvais choix à exclure ; garder une partie hors réglage.
- Comparer baseline, production et variante structurée sur les mêmes sources et réglages connus. Comparaison RemNote séparée, avec options documentées.
- Mesurer erreurs critiques, ambiguïtés, connaissances couvertes, cartes acceptables sans édition, doublons, temps humain de correction, délai de première carte validée, durée totale et coût par carte acceptée.
- Exemple de cible de pilote à convenir : au moins 90 % de cartes acceptables sans réécriture, au moins 85 % des objectifs essentiels couverts, aucune erreur critique dans l'échantillon, amélioration mesurée du coût et du temps. Ces seuils sont proposés ; zéro erreur observée ne garantit pas l'absence future d'erreurs.
- Réparer l'accès fournisseur et tester sur une source courte avant toute expérience payante. Le laboratoire A/B/C déjà présent permet préparation et estimation sans appel API.

## Outils

Les dépendances actuelles suffisent au pilote. Réutiliser le laboratoire et les évaluations existantes. Un skill de travail peut maintenir la rubrique et les exemples pour les interventions Codex ; il ne modifie pas automatiquement le prompt de l'application. OCR supplémentaire uniquement si les PDF cibles sont scannés ou mal extraits. Aucun besoin établi de base vectorielle, framework multi-agent, fine-tuning ou réécriture de Next.js.

## Sources officielles

- [RemNote : génération, choix du détail et prévisualisation](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai)
- [RemNote : apprentissage guidé par sections](https://help.remnote.com/en/articles/15724936-guided-learn-mode)
- [OpenAI : cycle d'évaluation et optimisation](https://developers.openai.com/api/docs/guides/model-optimization)
- [OpenAI : latence](https://developers.openai.com/api/docs/guides/latency-optimization)
- [OpenAI : sorties structurées et leurs limites](https://developers.openai.com/api/docs/guides/structured-outputs)
