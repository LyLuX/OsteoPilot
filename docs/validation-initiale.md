# Validation initiale du 29 octobre 2026

Socle 0.1.0 réalisé dans le dossier OsteoPilot existant.
GreenDesk a servi uniquement de référence ; son état Git préexistant est inchangé.

## Contenu livré

API Express/MySQL/Sequelize avec auth, patientèle, CSV, utilisateurs, rôles,
permissions, paramètres et audit consolidé. Interface React/Bootstrap mobile-first,
connexion, navigation protégée et calendrier français sans événements.
Infrastructure partagée, migrations gardées, OpenAPI, CI et documentation PowerShell.

Les principaux écarts motivés sont décrits dans decisions.md : cookie HttpOnly/CSRF,
droits relus en base, Zod, suppression du multi-sociétés et des modules matériels,
verrou commun des écritures, aucune inscription publique ni email activable.

## Base locale

MySQL 8.0.19 ; base existante osteopilot, diagnostiquée vide avant toute écriture.
Migration 202610290001-initial.js appliquée après les tests isolés.
Treize tables InnoDB, historique reconnu, types/nullabilité/défauts/index/clés
étrangères vérifiés. État des migrations et diagnostic Sequelize CLI réussis.
Aucun patient ni utilisateur fictif dans cette base : compteurs finaux 0 et 0.
Le premier administrateur réel doit être créé par scripts/create-admin.ps1.

Le fichier .env fourni puis corrigé par le propriétaire a été conservé,
validé sans afficher de secret et reste exclu de Git.

## Contrôles exécutés

| Contrôle                                        | Résultat                               |
| ----------------------------------------------- | -------------------------------------- |
| npm ci backend et frontend depuis les lockfiles | Réussite sous PowerShell               |
| npm run lint                                    | Réussite                               |
| npm run format:check                            | Réussite après correction documentaire |
| npm test                                        | 29 tests, 4 suites réussies            |
| npm run docs:check                              | 24 opérations valides et synchronisées |
| npm test --prefix frontend                      | 11 tests, 6 fichiers réussis           |
| npm run build --prefix frontend                 | Réussite                               |
| npm run test:integration                        | 19 tests MySQL réussis                 |
| db:migrate:status, db:schema:check              | Réussite sur osteopilot                |
| sequelize-cli db:migrate:status                 | Migration initiale indiquée up         |
| Analyse syntaxique du script PowerShell         | Réussite                               |
| npm audit --omit=dev, backend/frontend          | Aucune vulnérabilité runtime signalée  |

Les tests MySQL incluent : migration répétable conservant les données, créations/
modifications, version concurrente, deux requêtes avec même clé, rollback avant et
après insertion d’audit, import atomique et doublons, export refusé sans droits,
révocation/rotation/inactivité, cookie HttpOnly/CSRF/Origin, désactivation de compte,
rôle système, auto-élévation refusée et bootstrap CLI idempotent.
Chaque base de test aléatoire a été supprimée après exécution.

Les tests frontend couvrent connexion/erreur, menus/droits, URL directe protégée,
calendrier lundi/bissextile/clavier, menu mobile et expiration après activité réelle
même après renouvellement du JWT. Le responsive est implémenté en CSS, mais aucun
test visuel sur navigateur ou appareil réel n’a été exécuté.

## Publication et limites

Le dépôt distant était vide ; GitHub confirme master comme branche par défaut.
Le commit initial et son push sont prévus seulement après vérification des fichiers
indexés, secrets et fichiers générés. Les rapports complets restent locaux et ignorés.
Le statut effectivement obtenu est communiqué dans le compte rendu final.

CI configurée avec MySQL 8.4 jetable, audits runtime et porte refusant tout résultat
absent, ignoré, annulé ou en échec. Les protections de branche ne sont pas activées
par cette implémentation ; vérifier le premier run après push.
Quelques alertes basses de développement Jest/deepmerge restent documentées.
Aucun compte universel, aucune donnée réelle, aucun serveur persistant lancé.
Aucun agenda, rendez-vous, facturation ou module comptable. Aucune certification
ou conformité réglementaire prétendue ; vérifications d’usage dans confidentialite.md.
