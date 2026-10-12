# Transfert, Anki et validation sans modification de l'interface

## Anki

L'import accepte les archives `.apkg` contenant `collection.anki2` ou `collection.anki21`, au format de collection historique. Pour un paquet récent contenant `collection.anki21b`, exporter dans Anki avec la compatibilité avec les anciennes versions activée. Les [formats de paquets Anki](https://github.com/ankitects/anki/blob/main/rslib/src/import_export/package/meta.rs) utilisent des formats de collection et de compression différents ; le format récent n'est pas interprété par cette passerelle.

Les cartes Basic, inversées et cloze simples sont converties en cartes textuelles. Les conditions simples de modèles sont interprétées. Les cartes avec médias, champs non interprétés, code actif, clozes imbriquées ou contenu vide restent à vérifier en brouillon. Un paquet corrompu, une référence manquante, un ZIP chiffré, une entrée dangereuse ou une taille excessive ne modifie pas le cours. Limites : 256 MiB compressés et décompressés, 50 000 notes/cartes, 500 000 événements de révision ; ZIP64 non pris en charge.

L'import ajoute au cours au lieu de remplacer son contenu. Les identifiants GUID + modèle empêchent les doublons lors d'un réimport. Les corrections, suspensions et historiques locaux sont conservés ; les cartes différentes sont signalées comme conflits. Un point de récupération est créé avant l'ajout. Les médias et le paquet original sont conservés dans les sauvegardes du cours. `GET /api/anki/packages/<empreinte>` permet de récupérer ce paquet original. L'interface textuelle actuelle n'affiche pas ces médias : leur conservation n'est pas une prise en charge complète des cartes visuelles ou audio.

La reprise de progression est facultative, conformément à la distinction entre [un deck partagé et une migration personnelle](https://docs.ankiweb.net/manual/importing/packaged-decks). Par défaut, aucune révision d'un autre utilisateur n'est adoptée. Avec `--progress`, les grades et dates disponibles sont conservés, sans attribuer de compétences de compréhension. Les réinitialisations et échéances courtes de Morrow sont transportées. Les modèles sont aplatis dans l'export Basic ; la structure originale reste dans le paquet d'origine. Les durées de réponse et intervalles historiques non enregistrés par Morrow ne peuvent pas être reconstruits fidèlement. Une validation dans Anki desktop sur des collections réelles reste nécessaire.

Serveur local lancé, identifiant du cours visible dans `GET /api/courses` :

```powershell
node scripts/anki.mjs preview --course default --file "cours.apkg"
node scripts/anki.mjs import --course default --file "cours.apkg" --progress
node scripts/anki.mjs export --course default --file "morrow-export.apkg" --progress
```

Le helper refuse d'écraser un fichier d'export existant. API : `POST /api/anki/import`, formulaire `file`, `preview=true` pour une simulation, `progress=true` pour une migration personnelle. `GET /api/export?format=apkg&progress=true` exporte les cartes prêtes sans problèmes détectés. Les exports JSON et TSV existants restent disponibles. L'import JSON existant conserve son comportement de restauration ; un fichier `.apkg` envoyé à cette même API suit l'ajout Anki. Aucun contrôle visuel n'a été ajouté ou modifié.

## Transfert entre installations

Le transfert transporte un cours complet dans un fichier `.morrow`, avec PDF dédupliqués, empreintes SHA-256, cartes, apprentissage, historiques et paramètres. Une révision de contenu sert de précondition : une destination modifiée depuis le dernier transfert est refusée, pas fusionnée automatiquement. Le serveur vérifie de nouveau cette précondition sous le verrou d'écriture SQLite. Une restauration crée un point de récupération. Une archive identique ne déclenche aucune nouvelle restauration.

Sur chaque serveur, configurer `MORROW_TRANSFER_TOKEN` avec une valeur aléatoire d'au moins 32 caractères et redémarrer. Dans le terminal du transfert, définir `MORROW_SOURCE_TRANSFER_TOKEN` et `MORROW_DEST_TRANSFER_TOKEN` avec les valeurs correspondantes. Le helper accepte HTTP uniquement sur localhost, HTTPS ailleurs, et refuse les redirections pour ne pas transmettre les jetons à une autre adresse.

```powershell
node scripts/transfer-course.mjs --from http://localhost:3000 --from-course default --to http://localhost:3001 --to-course default --preview
node scripts/transfer-course.mjs --from http://localhost:3000 --from-course default --to http://localhost:3001 --to-course default
```

Le premier transfert exige une destination vide. Les suivants utilisent l'état enregistré dans `.next/transfers/`. Une modification indépendante bloque l'opération. `--replace` permet de remplacer volontairement la destination après examen des deux copies ; la vérification de changement pendant l'opération reste active. Le transfert est manuel et orienté d'une source vers une destination. Il ne fournit ni service cloud, ni synchronisation continue, ni fusion des branches. L'application existante reste une application locale sans authentification globale : les jetons de transfert ne suffisent pas à rendre toutes ses API adaptées à une exposition publique.

API : `GET /api/transfer` expose l'état ; `?download=true` télécharge le cours ; `POST /api/transfer` reçoit le fichier avec `If-Match` contenant la révision de destination. `?preview=true` vérifie sans restaurer. Les appels exigent `Authorization: Bearer <jeton>` et sélectionnent le cours par `X-Course-Id`.

## Performances mesurées

Le calcul des couvertures du graphe utilise désormais des index en mémoire, plutôt qu'un parcours du deck pour chaque concept. Les recherches d'une carte utilisent sa clé SQLite ; l'export APKG indexe les historiques et états au lieu de les reparcourir pour chaque carte. Les budgets et priorités pédagogiques des files sont conservés.

Mesure unique sur cette machine avec un deck synthétique de 10 000 cartes et 10 000 notions, Node 24.18.0 :

| Opération | Avant | Après |
| --- | ---: | ---: |
| Graphe | 2 715 ms | 115 ms |
| File de révision | 2 823 ms | 232 ms |
| Enregistrement d'un rappel | 2 858 ms | 270 ms |
| Export du snapshot | 1 843 ms | 134 ms |

Reproduire : `node scripts/benchmark-deck.mjs --cards 10000`. Les données sont jetables ; le rapport JSON est écrit dans `.next/`. Ces chiffres dépendent de la machine et ne constituent ni une mesure de génération IA ni une comparaison avec Anki ou RemNote.

## Évaluation pédagogique

```powershell
node scripts/evaluate-learning.mjs prepare --course default --file "evaluation.json" --limit 30
# Faire relire les cas avec leurs sources, remplir ratings et criticalErrors.
node scripts/evaluate-learning.mjs score --file "evaluation.json"
```

Le fichier contient les leçons, cartes et extraits sources. L'échantillon est déterministe pour éviter de ne retenir que les meilleures explications. Les dimensions à noter de 0 à 4 sont : exactitude par rapport aux sources, mécanisme, relations, hypothèses, transfert, reconstruction et concision. Rubrique : 0 absent/faux ; 1 défaut majeur ; 2 partiel ; 3 correct et utile ; 4 complet et rigoureux. `criticalErrors` compte les erreurs qui feraient apprendre une affirmation fausse.

Une case n'est réussie que si toutes les dimensions atteignent 3, sans erreur critique ni problème de provenance détecté. Les cases incomplètes ne reçoivent pas une note artificielle : la couverture de relecture est rapportée séparément. Pour comparer plusieurs produits, utiliser les mêmes sources, concepts, critères et évaluateurs indépendants. Ce dispositif prépare et calcule des évaluations humaines ; il ne fournit pas lui-même les jugements ni la preuve d'une supériorité.
