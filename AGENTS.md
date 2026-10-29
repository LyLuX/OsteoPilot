# Instructions de contribution OsteoPilot

- Limiter les changements au résultat demandé, dans OsteoPilot uniquement.
  GreenDesk est une référence en lecture seule ; préserver ses modifications.
- Ne lancer aucun serveur, watcher ou processus persistant. Le propriétaire gère
  les terminaux runtime. Tests, builds et diagnostics non destructifs sont autorisés.
- Application mono-structure : aucun contexte société, dossier médical, agenda,
  facturation ou comptabilité sans demande explicite.
- Réutiliser composants et variables du thème. Construire pour 320 px, avec
  cibles tactiles, labels, focus et navigation clavier. Définir les badges
  uniquement par variables CSS ou color-mix de ces variables.
- Appliquer partout et pour la suite du développement les couleurs d’action de
  docs/conventions.md : vert connexion/création/enregistrement/import, rouge
  déconnexion/archivage/suppression/erreur, jaune modification/avertissement,
  bleu consultation/recherche/export, neutre navigation/annulation. Bouton et
  notification partagent la tonalité ; aucun titre d’état dans les notifications.
- Messages français, UUID publics, projections explicites. Aucun secret ni objet
  personnel complet dans les audits/logs.
- Services : règles métier et transaction explicite. Repositories : accès SQL,
  transaction reçue en argument. Toute mutation et son audit dans le même commit.
  Aucun hook d’écriture ou effet externe implicite.
- Valider champs, longueurs, pagination, tri et permissions backend.
  Le masquage frontend ne remplace jamais l’autorisation serveur.
- Maintenir registre de routes et OpenAPI synchronisés. Modifier
  openapi-paths.js et openapi-components.js avec le contrat.
  docs:check est bloquant avant tout commit.
- La base applicative existante est osteopilot. Aucune création, réinitialisation,
  sync force/alter, suppression ou test destructif sur cette base.
  Avant toute évolution persistée : diagnostic des migrations et du schéma.
  Une base non vide inconnue impose plan validé et sauvegarde vérifiée.
- Tests d’intégration uniquement sur les bases éphémères du runner.
  Ne pas définir manuellement TEST_DATABASE_ISOLATED pour contourner le garde.
- Vérifier lint, format:check et tests pertinents. Avant publication :
  backend, frontend, intégration MySQL, docs:check et build.
  Ne jamais annoncer une vérification non exécutée.
- Documenter chaque résultat produit indépendant terminé sous Non publié dans
  CHANGELOG.md, en français, avec niveau PATCH, MINOR ou MAJOR.
  Ses corrections et tests restent dans la même modification.
- Lots futurs : cinq modifications si toutes PATCH, trois dès qu’une MINOR est
  présente, publication immédiate pour MAJOR. Le propriétaire peut demander une
  publication anticipée. Avant le seuil : aucune hausse de version, commit ou push ;
  annoncer niveau, note et nombre restant, préserver les changements utilisateur.
- À publication : une hausse sémantique selon le niveau maximal, déplacer les notes
  sous version/date, vider Non publié, un commit validé et push normal sur la branche
  existante. Ne pas renommer ni forcer.
- Exception initiale explicitement demandée : premier socle 0.1.0 committé et poussé
  après contrôles, sans attendre le seuil de lot.
- Versions identiques dans les deux package.json/lockfiles, README, health,
  footer et OpenAPI ; valeurs runtime issues des métadonnées.
- Ne jamais indexer .env, node_modules, dist, coverage, exports ou fichiers patients.
  Inspecter les fichiers indexés avant commit. Aucun secret demandé au chat.
- Les instructions explicites du propriétaire prévalent sur les règles locales.
