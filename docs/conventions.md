# Conventions OsteoPilot

JavaScript ESM, noms descriptifs kebab-case, composants React PascalCase.
Modules métier dans src/modules, infrastructure dans src/core, registre HTTP
dans src/routes/registry.js. Éviter les abstractions spéculatives.

## Services et contrat

Les services ne reçoivent jamais Express response et renvoient des projections
publiques. Controllers : adaptation HTTP et enveloppe commune.
Validation stricte même lors d’un appel direct au service. UUID publics seulement,
aucun hash de doublon ou mot de passe dans les réponses.

Toute mutation utilise withTransaction. Verrou commun, relecture des droits,
écriture et recordAudit avec le même objet transaction. Ne pas imbriquer des
transactions. Repositories : transaction reçue et obligatoire pour les écritures.
Version pour les formulaires exposés aux écrasements, idempotence pour les
créations/imports répétables. Les DDL restent une exception MySQL documentée.

## Interface

Français cohérent, composants shared, erreurs via errorMessage, variables du thème.
Chargement/vide/erreur, confirmations, labels et droits cohérents.
Dates de filtres d’historique en UTC ; affichage Europe/Paris.
Calendrier local sans persistance, sept colonnes, aucune largeur minimale causant
un débordement à 320 px. Hauteur tactile des jours de 52 px et largeur disponible.

## Qualité

AGENTS.md régit les lots. Modifier OpenAPI, droits et tests avec le contrat.
Les exemples et données de tests sont fictifs.
