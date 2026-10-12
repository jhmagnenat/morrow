# Améliorations et preuves disponibles

Les améliorations de cette livraison ne constituent pas une certification 10/10.
L'interface conserve ses écrans et son identité ; les fonctions avancées sont
regroupées dans Tools. Une copie des fichiers visuels antérieurs se trouve dans
`ui-baselines/before-usability-changes.json`.

## Parcours ajoutés

- Synchronisation manuelle et automatique, compteur de réponses en attente,
  export des réponses et résolution explicite des conflits en conservant la
  version serveur après archivage local.
- Téléchargement de sauvegardes, sélection des points de récupération et
  import Anki avec aperçu avant écriture.
- Personnalisation FSRS et export d'une évaluation sur un échantillon stable,
  avec passages sources et critères à noter par un évaluateur humain.
- Affichage restreint du HTML Anki, images et audio privés. Aucun script,
  gestionnaire d'événement HTML ni ressource externe n'est exécuté.
- Comptes optionnels : stockage indépendant, sessions révocables, conservation
  des cours locaux pour le propriétaire, traitement des files par utilisateur.
- Révision mobile sans débordement, retour au graphe, contraste des textes
  secondaires, focus clavier, mouvement réduit et fenêtres à focus contenu.

## Validation reproductible

`node scripts/run-tests.mjs` couvre les bases réelles isolées, l'authentification,
les sauvegardes, les écritures concurrentes, les paquets Anki, les conflits de
révision et les pipelines de génération avec fournisseurs simulés.

Après un build et `node scripts/seed-offline-preview.mjs`, les tests Chrome
`--check-study --check-tools` vérifient les sept modes, le focus du panneau,
l'absence de notation derrière une fenêtre et l'absence de débordement à 390 px.
`--check-offline-chains --check-offline` vérifie une vraie coupure réseau,
le rechargement complet, les chaînes de réponses et la reprise sans doublon.
Ces tests utilisent uniquement un cours jetable.

`node scripts/check-auth-runtime.mjs` vérifie le vrai serveur de production :
redirection, connexion, cookies, espaces séparés, Study rendu côté serveur,
refus des appels intersites et révocation. `check-production-runtime.mjs`
provoque un crash du worker et vérifie sa relance et la continuité HTTP.

## Conditions encore nécessaires pour soutenir une excellente note globale

L'exactitude des raisonnements scientifiques exige une évaluation indépendante
sur de vrais cours, notamment scans, tableaux et équations. Les mesures de
latence réelle exigent un fournisseur configuré et un budget d'appels. Les
tests simulés ne démontrent ni leur qualité ni leur vitesse réelle.

L'OCR nécessite Tesseract configuré. Les modèles Anki complexes exécutant du
JavaScript et les clozes imbriquées ne sont pas intégralement reproduits.
Le hors ligne concerne les révisions mises en cache ; il ne fusionne pas deux
installations SQLite indépendantes ni des éditions de notes hors ligne.
La personnalisation FSRS et la notation des explications doivent encore être
validées sur des historiques et réponses humains. Le mode hébergé reste
sur un seul hôte, sans preuve de haute disponibilité ni audit externe de sécurité.
