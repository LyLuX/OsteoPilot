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

## Validation Bootstrap commune

Utiliser BootstrapForm pour chaque formulaire, avec errors={task.fieldErrors}
pour les mutations et errors={resource.fieldErrors} pour les filtres.
Field, PasswordInput et FormControl reprennent les états is-invalid,
invalid-feedback, aria-invalid et aria-describedby. Les erreurs sont affichées
après soumission ; elles sont réévaluées à la saisie. Le premier champ invalide
reçoit le focus. Les erreurs globales restent dans Alert.

Les contrôles natifs restent actifs via leur API de validité, mais les bulles
navigateur sont remplacées par des messages français Bootstrap (noValidate).
Conserver required, minLength, maxLength, type et pattern adaptés.
Les règles de groupes ou de dates utilisent validate(form), sans accès SQL.
Pour un groupe de cases, utiliser un seul FormFeedback et son identifiant partagé.
Les erreurs 422 de l’API sont associées aux noms de champs ; la validation serveur
ne doit jamais être retirée au motif qu’un contrôle existe dans l’interface.
Le fichier CSV utilise également FormControl pour ses erreurs de fichier.
