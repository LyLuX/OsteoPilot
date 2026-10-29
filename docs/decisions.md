# Décisions initiales

## Référence GreenDesk en lecture seule

AGENTS, conventions, README/changelog, packages, CI, configuration, migrations,
transactions, idempotence, auth, utilisateurs/rôles/permissions/audit, connexion,
navigation et thème ont guidé le socle. Aucune modification de GreenDesk.

Conservés : React 19, Vite 6, Bootstrap 5, Router 7, Axios, Express 5,
MySQL/Sequelize 6, JWT, bcrypt, Helmet, rate limiting, Jest/Supertest,
Vitest, ESLint/Prettier, OpenAPI et contrat de réponses.
Thème forêt, sidebar sombre, surfaces claires, arrondis et espacements adaptés ;
aucune illustration métier copiée.

## Écarts motivés

- Aucun contexte société ni module stock/matériel.
- JWT HttpOnly au lieu de localStorage, CSRF et Origin obligatoires.
- Inactivité, révocation et droits relus côté serveur.
- Zod pour les schémas stricts communs services/HTTP/OpenAPI.
- UUID/hash via node:crypto ; parseurs CSV pour les champs quotés.
- QueryInterface gardé pour les migrations ESM, CLI réservé au diagnostic.
- Verrou de ligne commun, plus simple que les réservations de stock.
- Service d’administration partagé, sans framework de plugins.
- Inscription et email explicitement désactivés ; SMTP/outbox/validation email
  seront conçus avec un futur besoin réel.
- Dépendances graphe, uploads et maintenance écartées.
- Initialisation 0.1.0 publiée hors règle de lot, selon demande explicite.

## Limites

Tests DOM et clavier exécutables ; validation visuelle sur vrais appareils à
effectuer manuellement. Aucun serveur persistant lancé par l’agent.
Pas d’application native/PWA, agenda, dossier médical ou comptabilité.

Premier compte et rôle ADMIN protégés ; récupération ou second administrateur
système nécessitent une procédure locale examinée. Les formulaires ordinaires
n’effectuent pas de fusion automatique des modifications concurrentes.
Les sélecteurs de rôles sont bornés ; en cas de plus de 100 rôles, étendre
la recherche du sélecteur avant usage à cette échelle.

Sessions expirées, compteurs, idempotence et audits sont conservés.
Définir une purge contrôlée selon les besoins de conservation ; pas de purge
automatique spéculative. Les exports, sauvegardes et disque MySQL doivent être
protégés hors de l’application. Aucune certification ou conformité attestée.

Le contrôle npm initial a entraîné une mise à jour csv-parse 7.0.3 et une
surcharge UUID 11.1.1 pour Sequelize (interface CommonJS compatible), revalidées
par les tests MySQL. Aucun downgrade automatique du socle.

Le fichier de workspace VS Code est local et ignoré. Le script PowerShell est
en UTF-8 avec BOM pour conserver les accents sous Windows PowerShell 5.1.
Les audits npm runtime sont sans alerte après correction. Les alertes basses
de la chaîne Jest/deepmerge restent des dépendances de développement ; aucune
rétrogradation automatique de Jest n'est appliquée.
