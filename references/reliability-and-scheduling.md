# Fiabilité locale et personnalisation des révisions

Ces améliorations ne modifient aucun composant visuel. Elles ne démontrent ni une note de 10/10, ni une équivalence complète avec Anki ou RemNote.

## FSRS personnalisé

Le moteur local FSRS-6 accepte un profil par cours. Une recherche par coordonnées respecte les [bornes publiées de FSRS](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/src/constant.ts). Ce n'est pas l'optimiseur officiel d'Anki.

L'ajustement automatique est proposé après 200 nouvelles révisions. Il prend jusqu'à 100 cartes et 6 000 événements, en conservant des historiques complets depuis la dernière réinitialisation. Chaque prédiction précède le résultat qu'elle évalue. Les derniers 20 % des événements, par date, sont réservés à la validation. Minimum : cinq cartes, 100 rappels différés et dix échecs d'entraînement, puis 30 rappels et trois échecs de validation. Les rappels du même jour modifient la mémoire mais ne comptent pas comme observations de rappel différé.

Un profil n'est activé que si la perte logarithmique de validation baisse d'au moins 0,002 et si le score de Brier ne se dégrade pas. Les paramètres actuels restent en place sinon. Une modification de l'historique ou du profil pendant le calcul empêche son application. L'ajustement ne change pas les échéances existantes ; le prochain rappel utilise la mémoire reconstruite avec les paramètres retenus. Les réinitialisations disposent d'un repère temporel qui empêche de réutiliser leurs anciens rappels, toujours conservés dans l'historique.

`GET /api/review/scheduler` expose paramètres et dernier résultat. `POST /api/review/scheduler` déclenche une tentative explicite, avec les mêmes conditions de validation. Le résultat porte sur la prédiction du rappel ; il ne prouve pas un gain d'apprentissage humain. Des ajustements répétés sur un même petit historique peuvent aussi surestimer leur généralisation.

## Points de récupération

Un point est publié avant une réinitialisation, un effacement de carte de connaissances, une restauration ou la suppression d'un cours. Si sa création échoue, l'action destructive ne continue pas. Après une révision enregistrée, une maintenance crée au maximum un point par heure et tente l'ajustement FSRS si nécessaire. Une erreur de maintenance ne supprime pas la révision ; elle est enregistrée dans `quality_settings`, clé `maintenance-error`.

Les archives contiennent les données du cours, les cartes, les compétences, les historiques et les paramètres. Les PDF sont conservés séparément par empreinte SHA-256 : un PDF inchangé n'est pas recopié à chaque sauvegarde. Les empreintes de l'archive et des PDF sont vérifiées avant restauration. Les écritures de PDF et du registre de cours sont publiées par renommage d'un fichier temporaire ; le registre dispose également d'une copie de récupération.

Stockage : `data/recovery/<courseId>/`, ou le dossier défini par `MORROW_DATA_DIR`. Conservation : 24 points horaires et 20 points liés aux autres actions. Les PDF sans référence dans les points conservés sont supprimés. La taille dépend des données et des PDF ; il n'y a pas de quota total en octets. Une sauvegarde locale ne protège pas de la perte du disque : copier régulièrement tout le dossier de données sur un autre support reste nécessaire.

API, sans ajout à l'interface :

- `GET /api/recovery` liste les points du cours sélectionné.
- `POST /api/recovery`, corps `{ "id": "identifiant-du-point" }`, restaure ce cours après avoir sauvegardé son état actuel.
- Pour récupérer un cours supprimé, sélectionner un cours de destination puis utiliser `GET /api/recovery?sourceCourseId=<ancien-id>` et `POST /api/recovery` avec `{ "id": "identifiant-du-point", "sourceCourseId": "ancien-id" }`. Cela **remplace le contenu du cours de destination** ; le point préalable permet de revenir en arrière.
- `X-Course-Id` sélectionne le cours de destination. Ces API suivent le modèle existant d'application locale, sans authentification multiutilisateur.

## Vérification et limites

`npm test` inclut les tests de personnalisation sur des données synthétiques, de conservation des échéances, de réinitialisation, de restauration des PDF, de déduplication, d'intégrité et d'isolation des cours. Les autres tests couvrent les workflows Study, Interview, Drills, Knowledge Map et génération. Aucun appel IA payant n'est nécessaire à cette suite.

Une équivalence générale nécessiterait encore des mesures avec le fournisseur réel, une évaluation pédagogique indépendante et une validation prolongée sur des historiques réels. Une passerelle Anki historique et un transfert manuel protégé sont désormais disponibles ; voir [leurs limites et procédures](interoperability-and-validation.md). La synchronisation continue, les applications mobiles dédiées et une compatibilité complète avec les modèles et médias Anki ne sont pas fournies. L'export TSV Anki existant reste disponible.
