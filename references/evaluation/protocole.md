# Conditions d'une note maximale sur un périmètre déclaré

Il n'existe pas de certification universelle « apprentissage 10/10 ». Cette
rubrique de projet explicite les conditions choisies et n'autorise une note
maximale que pour les contenus et observations effectivement évalués. Elle
ne transforme pas une absence d'anomalie détectée en preuve d'exactitude.

1. **Contenu** : au moins 30 cas, tous relus par un évaluateur compétent
   indépendant de leur production, sur les sept dimensions du fichier
   d'évaluation. Note 4/4 dans chaque dimension, aucune erreur critique ni
   provenance non résolue. Déclarer le périmètre et la couverture réellement
   relus ; un échantillon n'est pas une validation de toutes les matières.
2. **Compréhension** : les douze réponses J0 entièrement correctes, sans notes,
   avec un jugement indépendant. Enregistrer les réponses initiales.
3. **Transfert différé** : les douze nouveaux problèmes J7 entièrement corrects,
   au moins sept jours plus tard. Documenter les révisions intermédiaires et
   ne pas attribuer causalement le résultat à Morrow sans comparaison contrôlée.
4. **Délai** : trois imports complets du périmètre fixé, chacun sans cache de
   génération préexistant, avec du contenu utilisable et moins de 30 secondes.
   Une requête échouée ou un import partiel ne compte pas. Mesurer séparément
   extraction, première carte et totalité ; conserver les tokens et appels.

Ces seuils sont une convention exigeante du projet, pas une échelle scientifique
calibrée. Même leur réussite ne prouve ni une perfection future ni une
supériorité sur RemNote, Anki ou NotebookLM. Pour les coûts, comparer les mêmes
supports, modèles et conditions ; aucun coût minimal absolu n'est certifié.

```powershell
node scripts/check-learning-validation.mjs references/evaluation/observations.json
node scripts/prepare-local-learning-evaluation.mjs
node scripts/benchmark-generation.mjs --pdf data/uploads/default/784d3a9c-8af9-4736-ab07-fab26f70500c.pdf --live
```

La commande de benchmark utilise le fournisseur configuré et consomme ses crédits.
Chaque exécution crée une base jetable ; elle ne régénère pas le cours actif.
Les connexions externes de l'environnement de travail ont été refusées avec
`EACCES`. Le benchmark doit donc être exécuté dans un terminal de la machine
disposant de l'accès au fournisseur. Cet échec ne mesure pas sa vitesse.

Les observations manquantes restent `pending` et la note reste `null`.
Ne pas remplir une mesure différée avant d'avoir observé le délai réel.
