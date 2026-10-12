# Génération de cartes : comparaison et changements

## Ce que RemNote documente

RemNote permet de sélectionner le texte et les sections, de choisir le niveau
de détail, les types de cartes, la langue et le modèle, puis de prévisualiser et
modifier les résultats. Une génération identique réutilise le résultat précédent.
Leur documentation présente les cartes IA comme un point de départ à personnaliser,
pas comme une garantie d'exactitude parfaite.
[Source officielle](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai).

Le mode Guided Learn découpe les documents en sections issues de la source et
peut générer les sections suivantes progressivement. Résumés et cartes ont des
usages distincts ; les cartes sont générées depuis le texte source.
[Source officielle](https://help.remnote.com/en/articles/15724936-guided-learn-mode).

Ces pages ne révèlent pas les prompts internes, les évaluations privées ni les
modèles exacts du service. Elles ne démontrent pas un taux d'exactitude de 100 %.

## Écart constaté dans Morrow

Le parcours progressif fabriquait exactement deux cartes par concept à partir
de la leçon. La réponse au mécanisme concaténait plusieurs champs ; cela peut
surcharger une carte. Une propriété distincte ou une comparaison méritant son
propre rappel n'avait pas de candidat dédié dans ce parcours.

Les leçons restent utiles pour comprendre. Le nouveau parcours demande au
générateur de concevoir séparément les cartes depuis les sources originales,
dans la même requête que la leçon. Les réponses ne doivent pas recopier toute
la note et les objectifs ne doivent pas être des paraphrases redondantes.

## Changements livrés

| Aspect | Nouveau comportement |
| --- | --- |
| Conception | Cartes choisies directement dans la source, avec définition discriminante, mécanisme, comparaison ou application selon le sujet. |
| Quantité | Nombre déterminé par les objectifs distincts utiles, dans les limites de sortie, avec compatibilité des anciennes sections. |
| Parcours | Une seule génération dans Documents ; les cartes utiles sont choisies selon la source, sans sélecteur de densité préalable. |
| Couverture | En mode détaillé, l'audit vérifie les objectifs effectivement testés par les cartes et signale les objectifs manquants. |
| Contexte | Les pages de contexte retenues pour la génération progressive ne sont plus tronquées avant les conditions finales. |
| Correction | Une carte rejetée peut être corrigée puis revue pédagogiquement et factuellement. |
| Cache | Les préférences de couverture distinguent les générations ; un retour au même texte et aux mêmes réglages réutilise les résultats. |
| Préservation | Les identifiants et révisions sont conservés, les contenus modifiés manuellement restent protégés. |

Les tests simulent une source et des réponses déclarées : trois cartes courtes
avec des objectifs différents, puis une distinction supplémentaire en mode
détaillé, sans requête de rédaction séparée. La correction, les changements
de réglage, la réutilisation du cache et la transmission aux tâches persistantes
sont vérifiés. Ces résultats ne mesurent pas la qualité des modèles réels.

Le coût des audits dépend du volume produit. Conserver la même requête de
rédaction ne garantit pas une latence ou un coût total identiques.

## Preuve encore nécessaire

Comparer les deux outils sur les mêmes pages réelles, avec une revue en aveugle
des cartes : erreurs factuelles critiques, conditions omises, ambiguïté de la
question, objectif pertinent, redondance, couverture, temps et coût. Utiliser
une quantité comparable de contenu et séparer génération automatique et
édition humaine. Aucun niveau équivalent à RemNote n'est encore démontré.
