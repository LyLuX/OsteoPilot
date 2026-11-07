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
Conserver un fond de page distinct des panneaux blancs et un fond secondaire
pour les en-têtes. Texte normal et secondaire : contraste minimal de 4,5:1
sur leurs surfaces ; contours des champs actifs et focus : 3:1 minimum.
Les variables Bootstrap de texte, liens et notifications reprennent le thème.
Réserver --border aux séparateurs et --control-border aux contours des champs.
Les états désactivés restent lisibles, avec fond secondaire et texte atténué,
sans opacité globale sur les boutons. Vérifier aussi survol, sélection et focus.
Dates de filtres d’historique en UTC ; affichage Europe/Paris.
Calendrier des paiements sur sept colonnes, aucune largeur minimale causant
un débordement à 320 px. Hauteur tactile des jours de 52 px et largeur disponible.

Les tableaux de listes utilisent data-table et son survol commun sur les lignes
du corps, avec --table-row-highlight. Réserver le survol aux pointeurs précis
capables de survol ; appliquer aussi le fond à focus-within pour le clavier.
Conserver les curseurs des cellules et commandes : une ligne ne devient pas
cliquable par son surlignage. Exclure les en-têtes et les bordereaux imprimés.

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

Tous les boutons d’action utilisent les variantes Bootstrap btn-outline-* :
fond transparent et texte/contour de la couleur d’action, puis remplissage au
survol ou à l’activation, comme le bouton Déconnexion. Le thème commun définit
ces états via --action-color et les variables --bs-btn-*, y compris pour les
anciennes variantes pleines. Conserver les contrôles spécialisés du calendrier,
de pagination, de navigation et les icônes de fermeture dans leurs composants.

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

La saisie propose chequeNumber uniquement pour un chèque : texte facultatif de
1 à 30 chiffres, avec conservation des zéros initiaux. Le serveur refuse ce champ
pour un autre moyen. Le numéro est persisté dans la transaction de création et
projeté explicitement ; il ne figure jamais dans les audits ou logs. La migration
008 ajoute une colonne nullable sans modifier les paiements existants. L’absence
de numéro reste compatible avec les anciennes créations idempotentes.

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
Désactiver les commandes pendant un chargement ou une opération concurrente. La
pagination doit tenir sur une seule ligne dans la largeur de son panneau, sans
défilement horizontal. Utiliser des chevrons pour Précédent et Suivant, avec
libellés accessibles et titres. Les requêtes de conteneur adaptent les liens
secondaires à la largeur : voisins et ellipses sont retirés sous 28 rem, bornes
non courantes sous 15 rem. Les deux flèches et la page courante restent visibles.
Conserver 44 px pour le tactile et utiliser 36 px avec une souris précise.

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

La page Déposer affiche cinq paiements par défaut ; les tailles 10 et 25 restent disponibles.
Le menu Gestion paiements > Déposer liste tous les paiements via GET /payments
avec page et limit, sans filtre de date. La lecture exige payments.read. Le tableau
réutilise la pagination commune et affiche uniquement les statuts dans la colonne
Dépôt, sans boutons : À déposer ou Déposé pour les espèces et chèques, Sur le compte
pour les virements et Sans objet pour la carte. Les commandes de dépôt et d’annulation
des autres écrans exigent respectivement payments.deposit et payments.deposit.cancel. Le panneau du calendrier
présente le moyen et le badge de statut dans deux spans enfants d’une même div,
avec le badge aligné à droite.
La suppression avec confirmation reste disponible dans la fiche patient et dans
la page Déposer, sous payments.delete ; elle est retirée du calendrier.
La sélection de dépôt exige payments.deposit et concerne uniquement les espèces
ou chèques non déposés. Les cases globales sont exclusives et couvrent toutes les
pages ; les cases individuelles ajustent ce choix et l’état partiel est exposé.
Changer de type remplace la sélection précédente. Carte, virement et paiements
déjà déposés ne sont pas sélectionnables. La sélection seule ne modifie aucun dépôt.
Déposer ouvre l’aperçu A4 du bordereau, inspiré de GreenDesk (lecture seule de la
référence), avec noms, dates, numéros de chèques, montants, total et nom du cabinet configuré. Aucun contexte
société. Le nom du cabinet est projeté seul depuis Settings, sans exiger
settings.read ; un nom absent bloque la préparation (422). Le numéro est affiché
uniquement sur les bordereaux de chèques, avec un tiret s’il est absent.
Le bouton Déposer est sur la ligne des cases de sélection, aligné à droite.
POST /payments/deposits/preview résout toute la sélection, toutes pages,
par type et exclusions ou UUID explicites (5 000 maximum, aucun tronquage).
POST /payments/deposits valide les UUID et versions exacts du bordereau, avec
Idempotency-Key, avant window.print. Les deux services exigent payments.read et
payments.deposit, session, origine et CSRF. Le second verrouille et valide tout le
lot avant mutation ; dépôts, audits minimaux et idempotence partagent le commit.
Un conflit refuse tout le lot. Les nouveaux paiements créés après l’aperçu ne
sont pas ajoutés au bordereau. Aucune donnée personnelle n’est persistée côté
navigateur. L’impression native avant validation affiche uniquement une consigne.
Le navigateur ne confirme pas la sortie papier : annuler sa boîte d’impression
ne revient pas sur le dépôt ; l’utilisateur peut annuler ce dernier dans la liste.
Les paiements déposés affichent une coche dans le vert du thème et une flèche
d’annulation (payments.deposit.cancel), en remplacement de la case et de la corbeille.
La réimpression du même aperçu validé ne réécrit pas les dépôts.
À l’impression, masquer tous les enfants de body sauf le portail du bordereau,
y compris les notifications rendues hors de root. Regrouper en bas le nombre
de paiements puis le montant total, sans séparer ces deux lignes à la pagination.
Placer le bandeau du cabinet, le titre et les colonnes dans thead, le pied dans
tfoot : les groupes se répètent à chaque feuille et réservent leur propre place.
Le récapitulatif figure dans la dernière ligne du corps, uniquement en fin de
bordereau. Le conteneur imprimé reste en flux bloc pour permettre cette répétition.
Une suppression recharge la première page et réinitialise la sélection.
Les choix Espèces et Chèques sont désactivés seulement si aucun paiement
correspondant n’existe, à déposer ou déjà déposé. GET /payments expose
pendingDeposits et depositedPayments, compteurs globaux indépendants de la page
et des dates filtrées, lus dans la même transaction que la liste. Le bouton
Déposer reste désactivé sans paiement à déposer ; un type entièrement déposé
peut être sélectionné pour Annuler les dépôts. Une annulation groupée réussie
réinitialise le type et la sélection des paiements ; une erreur réseau conserve
la sélection et la confirmation pour réessayer. Un dépôt, une suppression ou une annulation recharge ces compteurs.
Une sélection devenue indisponible est effacée.

Le suivi du dépôt en banque concerne uniquement les espèces et les chèques.
Les nouveaux paiements et l’historique démarrent « À déposer » ; ce statut est
à vérifier pour les dépôts réalisés avant l’ajout du suivi. Carte et virement
renvoient bankDeposited: null. Le statut ne change jamais le montant encaissé,
la date du paiement ni les totaux du calendrier.
La permission payments.deposit autorise le dépôt ; payments.deposit.cancel autorise son annulation,
avec contrôle de version, verrou transactionnel et audit atomique minimal.
Un état inchangé ne crée pas d’audit. En conflit (409), recharger la liste.
Les rôles personnalisés nécessitent une attribution explicite de ce nouveau droit.

## Vue initiale du calendrier

Le paramètre partagé Settings.defaultCalendarView vaut week, month ou year ;
month reste la valeur initiale des cabinets existants. Le panneau Calendrier
l’enregistre immédiatement par PATCH /settings/calendar (settings.update),
sans toucher aux informations générales ou aux moyens de paiement. La mutation
et son audit settings.calendar.update sont dans la même transaction.
GET /settings/calendar expose uniquement cette vue aux utilisateurs dashboard.read.
Le dashboard attend ce réglage avant de charger ses périodes et conserve le choix
ponctuel de l’utilisateur jusqu’à sa prochaine ouverture.

## Lectures HTTP et StrictMode

Conserver StrictMode en développement. Le client HTTP partage uniquement les GET
identiques en cours (URL, paramètres et format de réponse) et supprime le partage
dès leur succès ou leur échec. Il ne conserve aucun cache de données métier.
Chaque écriture et changement de jeton CSRF invalide le partage avant les lectures
suivantes ; la file HTTP maintient leur ordre. Les requêtes avec options spécifiques
(headers, signal, etc.) ne sont pas partagées, et aucune écriture n’est dédupliquée.

## Suppression et récapitulatif des paiements

DELETE /payments/:id exige payments.delete, un UUID, une version entière et
confirmed=true, ainsi que session, origine autorisée et CSRF. Le service
revérifie le droit dans la transaction, verrouille le paiement et refuse une
version dépassée. La suppression définitive et l’audit minimal payments.delete
sont dans le même commit ; aucune donnée personnelle ni montant dans cet audit.
Le paiement disparaît des totaux et de la fiche patient. Le paiement d’origine
mémorisé pour l’idempotence est conservé afin de refuser le rejeu après suppression
avec 409 ; une clé déjà utilisée ne permet jamais de recréer ce paiement.
La confirmation mentionne montant, date, moyen et éventuel dépôt déjà effectué.
Bouton et notification sont rouges. Ni lecture, ni création, ni dépôt n’accordent
le droit de suppression. La migration 006 l’attribue uniquement à ADMIN ; les rôles
personnalisés doivent le recevoir explicitement dans la gestion des permissions.

GET /patients/:id/payments exige patients.read et payments.read, côté service
également. Les résultats sont isolés au patient désigné, triés par date puis
création décroissantes et UUID croissant, paginés et projetés explicitement.
Le total et la répartition incluent toutes les dates, toutes les pages et les
moyens désactivés. Liste et totaux sont lus dans une même transaction cohérente.
Les patients désactivés restent consultables. Les onglets reprennent les bordures
et variables de GreenDesk, avec aria-selected, panneaux associés, flèches et
Home/End. La lecture des paiements commence à l’ouverture de l’onglet ; chaque
mutation recharge les données et la suppression revient à la première page.

## Date des paiements

Un paiement ne peut pas être créé après le jour courant Europe/Paris. Le serveur
calcule cette limite à chaque création dans le service et renvoie 422 avec le
champ date en cas de refus, avant toute mutation métier ou clé d’idempotence.
Le bouton du dashboard est désactivé pour une date sélectionnée future. La
modale limite le champ date à aujourd’hui, affiche l’erreur Bootstrap et désactive
la validation si la date saisie est future. Les paiements d’aujourd’hui ou des
jours précédents restent autorisés ; les consultations ne sont pas limitées.

## Tarifs des paiements

Settings.tariffs contient au maximum 100 tarifs publics (UUID, libellé de 1 à
100 caractères, montant en centimes entiers positif et version). Les libellés
sont distincts sans tenir compte de la casse ; plusieurs prestations peuvent
partager un montant. La migration 007 initialise Consultation enfant/nourrisson
à 4500 centimes et Consultation adulte à 5500 centimes. Elle ne touche pas aux
paiements existants et préserve un catalogue déjà initialisé.

GET /settings/tariffs exige payments.create et expose uniquement le catalogue.
POST /settings/tariffs et PATCH /settings/tariffs/:id exigent settings.update,
l’origine autorisée et le CSRF. Les modifications sont indépendantes des autres
paramètres, sérialisées avec leurs audits settings.tariffs.create/update, sans
libellé ni prix dans les audits. Une modification utilise la version courante ;
un conflit exige le rechargement du paramétrage. La lecture complète du
paramétrage reste soumise à settings.read.

POST /payments exige désormais tariffId et amountCents. Le prix envoyé est celui
affiché au choix du tarif ; le serveur le compare au catalogue verrouillé dans
la transaction et utilise le prix configuré. Un tarif inconnu est refusé (422),
un prix devenu obsolète est refusé (409, champ tariffId). La modale recharge alors
le catalogue et exige un nouveau choix. Aucun montant libre n’est proposé.
Le paiement conserve son montant à l’enregistrement : les futurs changements
de prix ne modifient pas l’historique. Le rejeu d’une création déjà validée avec
la même clé restitue le paiement initial, même après une modification du tarif.

La modale de paiement n’affiche ni recherche ni pagination de patients. Elle
charge tous les patients actifs par lots de 100 via l’API paginée existante,
puis propose la liste complète. Une erreur sur un lot bloque la sélection et
l’enregistrement jusqu’à une nouvelle tentative ; aucun résultat partiel n’est
présenté comme complet. Fermer la modale arrête le parcours des pages suivantes.

Le menu des patients utilise ScrollableSelect : hauteur maximale définie par
--select-menu-max-height (16 rem), défilement vertical et adaptation à l’espace
disponible dans la modale. Le composant conserve la validation Bootstrap, les
labels et le champ requis, avec flèches, Home/End, saisie de lettres, Entrée,
Tab et Échap. Le menu se ferme au clic extérieur et conserve le focus sur le
champ après sélection. Le sélecteur natif masqué sert uniquement à la validation
du formulaire ; la liste visible expose les rôles combobox, listbox et option.

## Annulation groupée des dépôts

La page Déposer propose Annuler les dépôts à côté de Déposer, selon payments.deposit.cancel.
Le type sélectionné définit la portée : tous les dépôts de ce type, toutes pages,
indépendamment des cases individuelles de paiements à déposer. GET
/payments/deposits/cancellable?method=cash|cheque expose uniquement les UUID et
versions des dépôts concernés (5 000 maximum, refus sans tronquage au-delà).
Un tableau vide désactive le bouton. Le chargement, une erreur ou l’absence de
type le désactivent également. La confirmation précise type, nombre et portée.
POST /payments/deposits/cancel exige confirmed=true, method, les UUID et versions
exactes et Idempotency-Key. Les deux services exigent payments.read et
payments.deposit.cancel ; la mutation exige aussi origine et CSRF. Le verrou commun
sérialise les écritures, le service relit tous les dépôts du type et refuse 409
si l’ensemble ou les versions ont changé ; aucun dépôt entraîne 422. Chaque
dépôt annulé incrémente sa version et reçoit un audit minimal unmark dans le même
commit que l’idempotence. Aucun montant, date ou autre moyen ne change. Les
couleurs sont warning, comme pour l’annulation individuelle, et la liste ainsi
que les dépôts annulables sont rechargés après l’action ou un conflit.

## Historique des bordereaux

DepositSlips conserve une projection immuable du document à la validation du lot :
nom du cabinet, identités minimales, dates, montants et numéros de chèques.
Archivage, dépôts, audit minimal et résultat idempotent partagent la transaction.
Aucune donnée personnelle dans les audits ; aucun lien de suppression en cascade
avec Patients ou Payments. Une annulation ne retire pas l’archive.
GET /payments/deposits/history est paginé (5 éléments côté interface, 100 maximum
côté serveur), tri createdAt puis UUID décroissants ; le détail /:id est protégé
par payments.read, payments.deposits.read et payments.deposits.reprint. La liste
exige payments.read et payments.deposits.read et ne projette pas les lignes nominatives du document.
La réimpression lit le document archivé et ne poste aucun dépôt.
La première impression utilise le document retourné par le commit serveur.
La migration 009 reprend les anciennes réponses idempotentes ids/totalCents si
tous les paiements existent, sont du même type éligible et concordent avec le total.
Leur identité au moment de l’impression initiale est inconnue : reconstructed=true
est visible à l’écran et sur le bordereau. Les lots incomplets ne sont pas inventés.
Migration additive, reprise du DDL et des lots sans doublon ; down supprime les
archives, jamais les paiements. Une sauvegarde est nécessaire avant tout down utile.

## Permissions des actions de paiement

Chaque commande est protégée dans son service et dans l’interface. Les routes
appliquent le droit principal ; les prérequis cumulés sont contrôlés par le service.
La migration 010 ajoute les nouveaux droits au seul rôle système ADMIN. Les rôles
personnalisés doivent recevoir explicitement les actions voulues via Permissions.

| Action                                             | Permission propre         | Prérequis                             |
| -------------------------------------------------- | ------------------------- | ------------------------------------- |
| Lire les paiements et totaux                       | payments.read             | —                                     |
| Créer un paiement, dont numéro de chèque           | payments.create           | —                                     |
| Supprimer un paiement                              | payments.delete           | —                                     |
| Déposer, préparer et imprimer le premier bordereau | payments.deposit          | payments.read                         |
| Annuler un dépôt individuel ou tous ceux d’un type | payments.deposit.cancel   | payments.read                         |
| Consulter l’historique des bordereaux              | payments.deposits.read    | payments.read                         |
| Lire le détail et réimprimer un bordereau          | payments.deposits.reprint | payments.read, payments.deposits.read |
| Supprimer un bordereau reconstitué                 | payments.deposits.delete  | payments.read, payments.deposits.read |

Le PATCH bank-deposit vérifie le droit correspondant à la valeur demandée, avant
même de traiter un changement sans effet. Les boutons Déposer et Annuler sont
indépendants ; un utilisateur limité à l’annulation peut choisir le type mais
ne peut pas cocher les paiements à déposer. Consulter l’historique n’accorde ni
réimpression ni suppression. Le bouton de première impression effectue le dépôt ;
sa réimpression ultérieure exige le droit spécifique. Le navigateur peut naturellement
imprimer des informations déjà reçues : les droits protègent l’accès serveur et
les commandes applicatives, pas les fonctions du navigateur.

Les statuts d’origine des documents sont Original et Reconstitué. Un Original est
immuable et non supprimable, même avec tous les droits. Le DELETE du reconstitué
exige confirmation, origine et CSRF ; verrou de ligne et audit minimal dans la
même transaction. La suppression du document ne supprime ni ne dépose ni n’annule
aucun paiement. Une erreur d’audit conserve le document. Un UUID déjà supprimé
renvoie 404. La migration 009 n’est pas rejouée lors d’une suppression.
