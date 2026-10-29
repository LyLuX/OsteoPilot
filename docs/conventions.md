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
Calendrier des paiements sur sept colonnes, aucune largeur minimale causant
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
reçoit le focus. Les erreurs globales utilisent le NotificationProvider et les Toasts Bootstrap.
Alert est réservé aux rapports détaillés persistants, notamment les erreurs CSV.

Les contrôles natifs restent actifs via leur API de validité, mais les bulles
navigateur sont remplacées par des messages français Bootstrap (noValidate).
Conserver required, minLength, maxLength, type et pattern adaptés.
Les règles de groupes ou de dates utilisent validate(form), sans accès SQL.
Pour un groupe de cases, utiliser un seul FormFeedback et son identifiant partagé.
Les erreurs 422 de l’API sont associées aux noms de champs ; la validation serveur
ne doit jamais être retirée au motif qu’un contrôle existe dans l’interface.
Le fichier CSV utilise également FormControl pour ses erreurs de fichier.

## Notifications et logs

Monter NotificationProvider une seule fois au-dessus de AuthProvider.
Utiliser useNotifications pour un message direct, useTask pour une opération et
useResource pour un chargement. Les Toasts utilisent le JavaScript Bootstrap,
delay: 2000, autohide et une croix data-bs-dismiss. Ne pas recréer un simple timer
CSS ni remplacer les messages de champ persistants par une notification seule.
Un message identique réactualise le toast courant et son délai.

Les traces techniques sont indépendantes de l’audit SQL transactionnel.
En développement, les traces HTTP gardent uniquement les routes déclarées.
Les traces SQL optionnelles masquent littéraux, commentaires et paramètres ;
les syntaxes non reconnues sont entièrement masquées. Aucune donnée brute de
requête, cookie, jeton, corps HTTP ou valeur patient ne doit être ajoutée.
Les erreurs d’écriture de traces techniques ne changent pas le résultat métier.

## Couleurs des actions

Appliquer cette convention à toutes les fonctionnalités présentes et futures.
Utiliser les variantes Bootstrap sur les boutons et la même tonalité dans les
notifications correspondant à l’action :

- success (vert) : connexion, activation, création, enregistrement, import confirmé ;
- danger (rouge) : déconnexion manuelle ou automatique, désactivation, archivage, suppression,
  refus et erreur, même si une action de sortie réussit ;
- warning (jaune) : entrée en modification, avertissement ;
- info (bleu) : consultation, recherche, filtre, export ;
- secondary (neutre) : annuler, retour, pagination, contrôles de navigation.

Un enregistrement après modification reste vert. Une erreur prend toujours la
priorité en rouge. Les confirmations reprennent la tonalité de leur action via
ConfirmDialog tone. useTask.run(work, message, tone) utilise success par défaut.
Les notifications affichent uniquement leur message et la croix, sans titre
« Succès », « Erreur », « Attention » ou « Information ». Garder des messages
explicites et les rôles accessibles pour comprendre le résultat sans perception
des couleurs. Réutiliser les variables du thème et les classes Bootstrap ; ne pas
coder de couleurs ponctuelles dans les pages.

## Filtres de listes

Réutiliser FilterPanel (adapté du composant GreenDesk) pour les filtres : un
champ de recherche et cinq autres champs au maximum, champs libellés, contrôles
Bootstrap et erreurs via FormControl. Sur mobile, le panneau est dépliable au
clavier et conserve les valeurs et le focus lors des changements de largeur.
La recherche patient attend 300 ms sans saisie avant requête ; les sélecteurs
s’appliquent immédiatement. Chaque changement appliqué revient à la page 1.

## Paiements

Stocker et transporter des centimes entiers, convertir la saisie décimale sans
multiplication de flottants et conserver une date civile YYYY-MM-DD. Le fuseau
Europe/Paris sert à déterminer le jour courant ; les dates de paiement ne se
convertissent pas en instants UTC. Valider les moyens acceptés et le patient
actif côté serveur dans la transaction ; conserver les totaux des anciens moyens.
Les nouveaux paiements utilisent une clé idempotente stable lors d’une reprise,
avec audit dans le même commit et permissions payments.read/payments.create.

## Pagination et icônes de paiement

Utiliser PaginationControls (repris de GreenDesk), via Pagination et usePagination
dans shared.jsx, pour toute pagination. Transmettre limit à la requête backend ;
proposer 5, 10 ou 25 éléments et revenir à la page 1 à chaque changement de taille.
Désactiver les commandes pendant un chargement ou une opération concurrente.

Réutiliser PaymentMethodIcon pour les quatre moyens. Les variantes payment-method--*
définissent uniquement --payment-method-color à partir des variables --payment-*-color
du thème. Le composant utilise currentColor et le fond est calculé par color-mix.
Conserver les formes distinctes, la légende et les libellés accessibles : la couleur
ne doit pas être le seul moyen de reconnaître un type de paiement.

## Périodes du calendrier

Le mois reste la vue initiale. La semaine commence le lundi et utilise le numéro
ISO, avec son année ISO aux changements d’année. La vue annuelle présente douze
cumuls mensuels. Les changements de vue ou de période synchronisent le panneau de paiements avec
la case sélectionnée : un jour en semaine/mois et un mois en année. Masquer les
anciens montants et listes dès que la requête change, jusqu’à sa réponse.
Le bouton de retour à la période complète conserve la sélection et remet la page à 1.
Les lectures acceptent un jour seul ou un intervalle inclusif borné à 366 jours.
Afficher uniquement les moyens acceptés dans les cases et la légende. Les anciens
moyens désactivés restent inclus dans le total et regroupés sous « Autres » dans
les cases ; la liste des paiements conserve leur libellé historique.

## Dépôt des paiements

Le suivi du dépôt en banque concerne uniquement les espèces et les chèques.
Les nouveaux paiements et l’historique démarrent « À déposer » ; ce statut est
à vérifier pour les dépôts réalisés avant l’ajout du suivi. Carte et virement
renvoient bankDeposited: null. Le statut ne change jamais le montant encaissé,
la date du paiement ni les totaux du calendrier.
La permission payments.deposit autorise le changement et son annulation,
avec contrôle de version, verrou transactionnel et audit atomique minimal.
Un état inchangé ne crée pas d’audit. En conflit (409), recharger la liste.
Les rôles personnalisés nécessitent une attribution explicite de ce nouveau droit.
