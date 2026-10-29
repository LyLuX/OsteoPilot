# OsteoPilot

OsteoPilot **0.4.0** gère la patientèle d’un cabinet unique : connexion,
calendrier mensuel des paiements, coordonnées administratives des patients,
import/export CSV, utilisateurs, rôles, permissions, paramètres et historique.

Aucun agenda, rendez-vous, dossier médical, facturation ou module comptable complet.
Aucune notion de société ou d’établissement.

## Environnement

Windows 10/11, PowerShell, Git pour Windows, Node.js LTS 22 ou 24 et npm.
Vérifiés sur le poste : Node.js 24.18.0, npm 11.16.0, Git 2.47.0, MySQL 8.0.19.
React 19, Vite 6, Bootstrap 5, Router 7, Axios ; Express 5, MySQL/Sequelize 6,
JWT, bcrypt, Helmet, Jest/Supertest, Vitest, ESLint/Prettier.
Les versions exactes sont verrouillées dans les deux lockfiles.

La base applicative **existante** est exclusivement `osteopilot`.
Aucune création/réinitialisation de cette base, synchronisation Sequelize
destructive ou test directement dessus.

## Installation PowerShell

Depuis le dossier OsteoPilot déjà ouvert, sans créer de sous-dossier homonyme :

```powershell
Get-Location
Get-ChildItem -Force
node --version
npm --version
git --version
if (-not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env }
npm ci
npm ci --prefix frontend
```

Configurer localement `.env` : accès MySQL, `DATABASE_NAME=osteopilot`,
`PORT=3008`, `APP_PUBLIC_URL=http://localhost:5174`,
`CORS_ORIGINS=http://localhost:5174`, `NODE_ENV=development`.
Conserver `PUBLIC_REGISTRATION_ENABLED=false` et `MAIL_ENABLED=false` :
aucune inscription publique ni vérification email activable dans cette version.
Aucun exemple frontend supplémentaire : appels relatifs via le proxy Vite.

Générer un secret JWT propre au projet, puis le renseigner dans `.env` :

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))"
```

Ne pas partager la sortie ni copier de secret GreenDesk. `.env` reste ignoré
par Git ; aucun mot de passe universel dans les exemples. Traces SQL désactivées par défaut.

## Base et migrations

```powershell
npm run db:migrate:status
# Après examen du diagnostic seulement :
npm run db:migrate
npm run db:migrate:status
npm run db:schema:check
```

Le diagnostic montre nom de base, version serveur, tables/moteurs et historique,
jamais les identifiants. La migration initiale ne s’applique que sur une base vide.
Le 29 octobre 2026, `osteopilot` a été vérifiée vide sur MySQL 8.0.19 ;
la migration initiale a ensuite été appliquée après validation MySQL isolée.
Une base déjà migrée est contrôlée sans réécriture. Une base non vide sans
historique reconnu est refusée : sauvegarde vérifiée et plan humain obligatoires.

Le runner pilote les migrations Sequelize ESM via QueryInterface, avec verrou MySQL,
et remplace volontairement la migration CLI directe qui contournerait ses gardes.
Diagnostic CLI après migration : `npx sequelize-cli db:migrate:status --env development`.
Ne pas employer ses commandes de création, undo ou migration directe.
Aucune migration automatique au démarrage.

Les DDL MySQL font des commits implicites. En cas de migration interrompue,
ne pas effacer les tables : arrêter, diagnostiquer et préparer une reprise validée.
Aucun down destructif fourni. Voir [exploitation](docs/exploitation.md).

## Premier administrateur

Après migration et configuration JWT :

```powershell
.\scripts\create-admin.ps1
```

Le script demande les informations localement, masque le mot de passe et efface
les variables temporaires en sortie. Procédure idempotente pour l’administrateur
déjà créé ; aucun mot de passe existant modifié. Le rôle système ADMIN est immuable
et non attribuable par l’API. Récupération d’accès ou second administrateur système :
procédure locale à examiner, sans porte dérobée ni compte par défaut.

Créer ensuite un rôle, affecter ses permissions, puis créer les comptes ordinaires.
Impossible de modifier ses propres droits ou de transmettre des droits supérieurs.
Attribuer les lectures nécessaires : `roles.read` pour gérer utilisateurs et
permissions, `patients.read` pour modifier une fiche.

## Démarrage manuel

Dans deux terminaux séparés, depuis OsteoPilot :

```powershell
# Terminal API
npm run dev
```

```powershell
# Terminal frontend
npm run dev --prefix frontend
```

Interface : [localhost:5174](http://localhost:5174).
API : [localhost:3008](http://localhost:3008), préfixe `/api/v1`.
Santé : [localhost:3008/health](http://localhost:3008/health).
OpenAPI/Swagger : `/api-docs.json` et `/api-docs` hors production uniquement.
Swagger sert à la consultation ; les mutations exigent l’origine frontend autorisée.
Vite refuse un port occupé (strictPort). API sur `127.0.0.1:3008`.
Aucun lancement automatique des deux serveurs, service Windows ou tâche persistante.

## Accès sur le réseau local

Dans le terminal API, autoriser explicitement l’origine du PC sur le réseau.
Renseigner son adresse IPv4 locale, visible avec ipconfig :

```powershell
$lanAddress = Read-Host 'Adresse IPv4 locale du PC (exemple : 192.168.1.20)'
$env:CORS_ORIGINS = "http://localhost:5174,http://${lanAddress}:5174"
npm run dev
```

Dans un autre terminal, depuis la racine OsteoPilot :

```powershell
npm run dev:lan
```

Depuis le dossier frontend, la même commande fonctionne directement.
Ouvrir ensuite http://ADRESSE-IP-DU-PC:5174 depuis un appareil du même réseau.
Vite écoute sur toutes les interfaces, toujours sur le port 5174 strict ;
l’API reste sur 127.0.0.1:3008 et les appels passent par le proxy Vite.
L’origine réseau exacte doit être autorisée pour la connexion et les mutations.
Pour http://osteopilot.org:5174, ajouter explicitement cette origine à CORS_ORIGINS
et utiliser cette URL comme APP_PUBLIC_URL. Ces variables désignent le frontend,
pas l’API sur 3008. Redémarrer l’API après tout changement de configuration.
Si Windows demande une autorisation réseau pour Node.js, choisir le réseau privé.
La variable CORS_ORIGINS ci-dessus reste limitée à ce terminal ; pour une configuration
durable, reporter les origines explicites dans le fichier .env local.

## Notifications et traces de développement

Les notifications utilisent les Toasts CSS et JavaScript de Bootstrap.
Elles se ferment automatiquement après deux secondes ou via la croix.
Bootstrap suspend ce délai pendant le survol ou le focus clavier pour laisser
le temps de lire le message. Les erreurs sous les champs et les rapports CSV
restent visibles pour permettre leur correction.

En mode development, les requêtes HTTP sont affichées dans le terminal API :
heure, méthode, route déclarée (avec :id), statut et durée en colonnes alignées.
Les statuts sont colorés dans un terminal compatible (succès en vert, redirections
en cyan, erreurs client en jaune et erreurs serveur en rouge). Les sorties redirigées
et NO_COLOR désactivent les couleurs. HTTP_LOGGING=false désactive ces traces.
Pour afficher aussi la structure SQL, mettre DATABASE_LOGGING=true dans .env,
puis redémarrer l’API. Les valeurs SQL et paramètres liés sont masqués.
Une requête non reconnue est masquée entièrement. Aucun corps, cookie, jeton,
email, paramètre de recherche ou UUID patient n’est journalisé par les traces HTTP.
Ces traces HTTP et SQL sont désactivées en test et en production.

## Contrôles

```powershell
npm run lint
npm run format:check
npm test
npm run docs:check
npm test --prefix frontend
npm run build --prefix frontend
npm run test:integration
npm run db:migrate:status
npm run db:schema:check
```

Les tests unitaires fixent leur environnement, sans secret local.
Le runner MySQL crée une base aléatoire `osteopilot_test_<16 hex>`, migre,
vérifie contraintes et transactions puis supprime uniquement cette base.
Le compte de test doit pouvoir créer/supprimer ces bases ; aucune substitution
par osteopilot n’est permise. Toute erreur d’isolation, assertion, connexion ou
nettoyage échoue explicitement. Données fictives ; rapports ignorés dans coverage.

La CI emploie seulement un MySQL jetable et son mot de passe propre, jamais les accès
du PC. La porte Sécurité refuse tout contrôle manquant, annulé, ignoré ou en échec.
Rapports conservés 30 jours. Rendre les trois contrôles obligatoires sur GitHub :
cette protection n’est pas activée automatiquement.

## CSV

UTF-8, virgules, entête exact :

```text
lastName,firstName,phone,email,address
Exemple,Fictif,,,
```

512 Kio, 1 000 lignes, aperçu de 10 fiches, rapport par numéro de ligne.
Nom et prénom requis ; autres valeurs vides possibles. L’import revalide tout
dans la transaction et annule l’ensemble à la moindre erreur.
Le doublon est le quadruplet nom/prénom/email/téléphone, normalisé NFKC,
sans espaces extérieurs et en minuscules. L’adresse ne départage pas les doublons ;
des homonymes sans coordonnées peuvent être refusés. Une fiche archivée conserve
son unicité. Aucun écrasement ou rapprochement flou.

Création/import exigent Idempotency-Key : répétition identique rejouée, requête
différente sous la même clé refusée (409). Les mises à jour vérifient leur version.
Export autorisé des actifs, maximum 10 000 fiches, BOM UTF-8, formules neutralisées
par apostrophe. Cette protection peut modifier des coordonnées dans le CSV ;
examiner ces apostrophes avant réimportation. Protéger les fichiers téléchargés.

## Architecture et protections

src/modules porte le métier, src/core les transactions/erreurs/validations.
Le registre de routes déclare schémas et permissions et alimente OpenAPI.
Services : règles métier et transactions ; controllers : adaptation HTTP.
Contrat : `{ success: true, data }`, listes avec items/pagination,
erreurs `{ success: false, error: { message, details? } }`.

Mutations et audit SQL dans la même transaction explicite InnoDB.
Un verrou de ligne commun sérialise les écritures du cabinet : compromis simple
pour un faible volume, à mesurer avant montée en charge. Relecture des droits
dans la transaction ; contrôle de version patient. Les lectures restent hors
transaction sauf besoin. Aucun effet externe : un futur email devra utiliser
un outbox transactionnel ou une action après commit.

JWT HS256 de 15 minutes, session serveur de huit heures maximum et 15 minutes
d’inactivité, rotation invalidant le JWT précédent, révocation au logout.
Cookie HttpOnly/SameSite Strict, Secure en production. Aucun JWT dans le stockage
JavaScript. CSRF en mémoire et origine autorisée obligatoires pour les mutations.
Une XSS pourrait encore déclencher des actions : CSP, validation et échappement
restent nécessaires. Le renouvellement authentifié compte comme activité, avec
expiration absolue qui borne aussi un client malveillant déjà authentifié.

Bcrypt coût 12, limites IP et compte au login, Helmet, CORS restrictif,
projections publiques minimales, audits sans fiches ni secrets.
En production : HTTPS, origines et proxys explicitement listés, compte MySQL dédié,
protection du disque et des sauvegardes. L’application ne chiffre pas les tables.
Les quotas mémoire supposent une seule instance ; stockage partagé à prévoir
pour plusieurs instances. Réserver les droits CREATE/DROP aux tests isolés.

Voir [conventions](docs/conventions.md), [ajout-module](docs/ajout-module.md),
[décisions](docs/decisions.md), [confidentialité](docs/confidentialite.md).
Web app responsive uniquement ; aucune application native ni PWA installable.

Le statut patient peut être modifié dans la liste (filtre Tous par défaut) :
Désactiver conserve la fiche, Activer la remet en activité. Ces actions utilisent
la permission patients.archive et PATCH /api/v1/patients/{id}/status avec
active (booléen) et version (entier positif). La mutation et son audit sont
committés ensemble ; une version dépassée est refusée avec HTTP 409.

## Moyens de règlement acceptés

Dans Paramétrage, le panneau Moyens de paiement propose Espèces, Carte, Chèque
et Virement. Chaque case est sauvegardée immédiatement, sans bouton Enregistrer
et indépendamment du formulaire Informations générales.
La lecture utilise settings.read et la modification settings.update. Aucun moyen
n’est présélectionné pour un cabinet existant ; une liste vide est autorisée.
L’API expose paymentMethods (cash, card, cheque, transfer), limité à quatre codes
connus sans doublon. PATCH /api/v1/settings/payment-methods reçoit method (code)
et accepted (booléen), puis renvoie la sélection. La mutation fusionne le changement
sous verrou, pour préserver les changements simultanés sur les autres cases.
PUT /api/v1/settings accepte uniquement les informations générales.
La migration additive 202610290002-settings-payment-methods.js ajoute une colonne
JSON nullable, sans réinitialiser les informations du cabinet. Exécuter le
diagnostic et db:migrate avant de démarrer le code mis à jour, puis db:schema:check.

## Paiements du tableau de bord

Chaque case affiche Espèces, Carte, Chèque, Virement et le total en euros. Les
jours sans paiement affichent zéro ; un chargement ou une erreur ne simule pas
un solde nul. Le panneau du jour sélectionné présente une liste paginée et le
bouton Enregistrer un paiement. La modale exige un patient actif, la date civile
du cabinet, un montant positif (999 999,99 € maximum) et un moyen accepté.
Les centimes sont des entiers ; aucun calcul de cumul n’utilise des euros flottants.
Un moyen désactivé reste visible dans les totaux historiques, mais ne peut plus
être utilisé pour une nouvelle saisie.

Droits : payments.read pour les montants et listes, payments.create pour la saisie
et la recherche minimale de patients. La migration 202610290003-payments.js les
affecte au rôle ADMIN ; les rôles personnalisés nécessitent une attribution
explicite. Aucun droit existant n’accorde implicitement l’accès aux paiements.
La migration ajoute la table Payments sans modifier la patientèle.

API : GET /api/v1/payments/summary (from/to, 62 jours maximum), GET
/api/v1/payments (date/page/limit), GET /api/v1/payments/patients (search/page/limit)
et POST /api/v1/payments. Le POST exige Idempotency-Key, valide le moyen accepté
et le patient dans la transaction, puis committe paiement, audit minimal et clé
ensemble. Rejouer la même saisie avec la même clé ne crée aucun doublon.
