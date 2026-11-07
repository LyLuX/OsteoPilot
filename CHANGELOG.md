# Journal des modifications

## Non publié

## 0.11.0 - 2026-11-07

- [PATCH] Intégration des ajustements du propriétaire : retrait du lien
  Création d’un patient du menu et activation de changeOrigin dans le proxy
  de développement Vite.

- [MINOR] Historique des dépôts accessible à côté des actions de dépôt et
  d’annulation : liste paginée et réimpression des bordereaux sans modifier
  les paiements. Les nouveaux documents sont archivés avec leurs informations
  d’origine dans la transaction du dépôt. La migration 009 récupère les anciens
  lots complets identifiables, signalés comme reconstitués à partir des données
  disponibles ; les paiements et leurs statuts sont préservés.

- [PATCH] Les lignes des tableaux de patients, paiements et historique sont
  surlignées au passage de la souris et lorsqu’une commande de la ligne reçoit
  le focus clavier. Le fond reprend le vert du thème ; les en-têtes et les
  bordereaux imprimés sont préservés.

- [PATCH] La lisibilité du thème commun est renforcée : fond de page mieux
  séparé des panneaux blancs, textes secondaires plus foncés, champs et focus
  plus visibles. Boutons, notifications, tableaux, sélecteurs et états désactivés
  reprennent des couleurs cohérentes et contrastées sur tout le site.

- [PATCH] Un type de paiement reste sélectionnable lorsqu’il existe des
  paiements à déposer ou déjà déposés, sur toutes les pages. Déposer est
  désactivé sans paiement à déposer ; Annuler les dépôts permet de revenir
  sur un dépôt même si tous les paiements de ce type sont déposés. Les états
  se mettent à jour après dépôt, suppression ou annulation. Après une annulation
  confirmée et réussie, le type et les paiements sont désélectionnés.

- [PATCH] La pagination reste sur une seule ligne : Précédent et Suivant sont
  remplacés par des chevrons accessibles et les liens directs s’adaptent à la
  largeur du panneau, sans défilement horizontal. Les flèches et la page courante
  restent visibles, avec les cibles tactiles conservées.

## 0.10.0 - 2026-11-07

- [MINOR] Annuler les dépôts, à côté de Déposer, annule après confirmation tous
  les dépôts du type sélectionné, espèces ou chèques, sur toutes les pages.
  Le bouton est désactivé si aucun dépôt correspondant n’existe. Le serveur
  contrôle droits, confirmation et versions sous verrou ; annulations, audits
  minimaux et idempotence sont atomiques. Un conflit recharge les dépôts sans
  annulation partielle ; les montants et dates restent inchangés.

- [PATCH] La pagination commune reste entièrement visible dans les panneaux
  étroits : les commandes passent à la ligne sans défilement horizontal, avec
  des boutons compacts à la souris et des cibles tactiles de 44 px conservées.
  La page Déposer affiche cinq paiements par défaut, avec les choix 5, 10 ou 25.

- [MINOR] Déposer ouvre un bordereau A4 inspiré des fiches de maintenance
  GreenDesk, avec noms, dates, montants et total. Imprimer valide atomiquement
  les paiements sélectionnés avant d’ouvrir la boîte d’impression ; l’aperçu
  n’écrit rien. Versions, permissions et idempotence protègent les reprises et
  les conflits. Une coche verte remplace la case des paiements déposés et une
  flèche d’annulation remplace leur corbeille. Une annulation rend le paiement
  de nouveau sélectionnable, sans modifier son montant ni sa date. Le bouton
  Déposer est aligné à droite des cases de sélection ; le bordereau porte le nom
  du cabinet configuré et affiche les numéros de chèques, zéros initiaux compris.
  L’impression exclut les notifications et tous les éléments hors bordereau ;
  le nombre de paiements figure sur une ligne au-dessus du montant total.
  Les virements n’affichent aucune case de sélection dans la colonne Déposer.
  Le bandeau du cabinet, le titre, les colonnes et le pied de page se répètent
  sur chaque feuille imprimée ; le récapitulatif reste uniquement à la fin.

## 0.9.0 - 2026-11-07

- [MINOR] La saisie d’un paiement par chèque propose un numéro facultatif de
  1 à 30 chiffres, conservé avec ses zéros initiaux. Le serveur valide ce champ
  uniquement pour les chèques et le restitue dans les paiements, sans audit du
  numéro. La migration additive 008 conserve les paiements existants sans numéro.

- [MINOR] Le menu Gestion paiements > Déposer ouvre un tableau paginé de tous
  les paiements, toutes dates confondues. La colonne Dépôt affiche uniquement
  les statuts, dont Sur le compte pour les virements, sans commande de dépôt.
  Le panneau du calendrier conserve le badge À déposer ou Déposé aligné à droite
  sur la ligne du moyen de paiement, dans deux spans enfants de la même div. La
  suppression avec confirmation est déplacée du calendrier vers ce tableau.
  Une première colonne Déposer permet une sélection individuelle ou globale,
  sur toutes les pages, des espèces ou des chèques à déposer, exclusivement.
  La sélection globale permet des exceptions et conserve les choix à la pagination.
  Les cases sont carrées et de taille standard, avec une cible tactile conservée ;
  les icônes et libellés des moyens de paiement sont centrés sur la même ligne.
  Les choix de sélection sont libellés Paiements en espèces et Paiements par chèque.

- [PATCH] Le menu de sélection du patient est limité à 16 rem de hauteur avec
  défilement vertical, adapté à l’espace disponible dans la modale. La sélection
  conserve les labels, la validation Bootstrap et la navigation au clavier. Un fond
  vert doux, une ombre légère et des options arrondies mettent la liste en valeur,
  avec un repère plus visible pour le patient sélectionné.

## 0.8.0 - 2026-11-03

- [PATCH] La pagination et le sélecteur de taille de page sont retirés de la
  modale de paiement. Tous les patients actifs restent disponibles dans la
  liste déroulante : le chargement parcourt les pages de l’API en interne,
  sans afficher une liste partielle en cas d’erreur.

- [PATCH] Le champ Rechercher un patient est retiré de la modale de paiement,
  ainsi que son filtrage temporisé. Le choix du patient s’effectue directement
  dans la liste déroulante des patients actifs.

- [MINOR] Le paramétrage dispose d’un panneau Tarifs indépendant pour modifier
  les prix et ajouter des prestations, avec contrôle de version et audit atomique.
  Les tarifs initiaux sont Consultation enfant/nourrisson à 45 € et Consultation
  adulte à 55 €. La saisie des paiements utilise une liste déroulante de tarifs ;
  le serveur contrôle le tarif et son prix, refuse un montant obsolète et préserve
  les montants déjà enregistrés. La migration 007 initialise le catalogue sans
  modifier les paiements existants et dispose d’un down de développement.

## 0.7.0 - 2026-11-03

- [PATCH] L’enregistrement d’un paiement à une date future est bloqué : bouton
  du dashboard désactivé, date de saisie limitée à aujourd’hui et bouton de
  validation inactif avec retour Bootstrap si la date est future. Le serveur
  applique la même règle à chaque création selon le jour courant Europe/Paris,
  sans paiement, clé d’idempotence ou audit créé en cas de refus.

- [MINOR] La suppression définitive d’un paiement erroné dispose du droit dédié
  payments.delete, d’une corbeille compacte à droite du montant, d’une confirmation
  détaillée et d’un contrôle de version. La corbeille dispose d’un libellé accessible
  et d’une cible tactile adaptée au mobile. Montant et corbeille sont groupés et
  alignés sur la première ligne, au-dessus du moyen de règlement. La corbeille
  neutralise la marge haute des boutons du dashboard pour conserver cet alignement.
  La suppression et son audit sont atomiques, les totaux sont actualisés et
  le rejeu d’une ancienne création ne peut pas rétablir un paiement supprimé.
  La migration 006 attribue ce droit au rôle ADMIN uniquement par défaut et
  propose un retour arrière de développement.

- [MINOR] La fiche patient propose les onglets Informations et Paiements,
  inspirés de GreenDesk et accessibles au clavier. Le récapitulatif affiche
  les paiements paginés, leur total et la répartition par moyen de règlement,
  y compris pour les patients et moyens désactivés, sous contrôle des droits
  patients.read et payments.read. Dépôt et suppression restent soumis à leurs droits propres.

## 0.6.0 - 2026-10-31

- [PATCH] Le libellé de page et la date dans la barre supérieure gagnent en
  lisibilité avec un texte plus grand, plus contrasté et semi-gras, ainsi
  qu’un séparateur mieux espacé, tout en conservant le retour à la ligne mobile.

- [MINOR] Les cinq migrations proposent un retour arrière de développement,
  une étape à la fois, avec confirmation de la base, verrou partagé et refus
  en production. Les allers-retours restaurent le schéma par étape et sont
  vérifiés sur une base MySQL éphémère ; les pertes de données sont documentées.

- [PATCH] Le champ de mot de passe et son bouton œil partagent une bordure
  continue et cohérente, y compris au focus et en cas d’erreur de validation,
  sans arrondi intérieur à leur jonction.

## 0.5.0 - 2026-10-31

- [PATCH] Les lectures HTTP identiques déjà en cours partagent une seule requête,
  notamment lors du double montage des effets React en développement. Aucun cache
  de réponse n’est conservé ; les écritures et changements de session isolent
  les nouvelles lectures pour préserver leur fraîcheur.

- [MINOR] Le paramétrage propose une vue initiale du calendrier, semaine, mois
  ou année, enregistrée automatiquement et indépendamment des autres réglages.
  Le panneau Calendrier se place sous les moyens de paiement sur mobile et à côté
  sur ordinateur. Le dashboard charge ce réglage partagé avant son premier affichage.

- [PATCH] Tous les boutons d’action reprennent le style à contour de « Déconnexion » :
  connexion, formulaires, listes, confirmations, modales et dashboard utilisent
  un fond transparent et un remplissage au survol, avec leurs couleurs d’action.
  Le thème commun applique également ce style aux futurs boutons.

## 0.4.1 - 2026-10-31

- [PATCH] Le bouton de consultation de toute la semaine, du mois ou de l’année
  apparaît sous « Enregistrer un paiement », en bleu contrasté sur toute la
  largeur du panneau.

- [PATCH] Le libellé de section des pages apparaît dans la barre supérieure
  à la place de « Gestion du cabinet », suivi de la date du jour à Paris avec
  un séparateur visuel. Le bloc redondant du dashboard est retiré et ce repère
  reste visible sur mobile.

- [PATCH] Le panneau des paiements du dashboard affiche cinq enregistrements
  par page par défaut, avec le choix de taille de page toujours disponible.

- [PATCH] Le suivi du dépôt utilise un bouton compact « Déposer » et un badge
  plus discret, alignés aux deux extrémités d’une même ligne ; l’annulation reste accessible
  avec un libellé court et les cibles tactiles sont conservées. Le badge et le
  bouton partagent les mêmes couleurs, jaunes à déposer et vertes une fois déposé.

- [PATCH] Dans le panneau des paiements du dashboard, le résumé de pagination
  affiche seulement le nombre de paiements, sans « page X sur Y » ; les commandes
  de navigation entre les pages sont conservées.

## 0.4.0 - 2026-10-29

- [MINOR] Les paiements en espèces et par chèque disposent d’un statut de dépôt
  en banque, modifiable et réversible depuis leur liste avec le droit dédié
  payments.deposit, contrôle de version et audit atomique. Les totaux encaissés
  restent inchangés ; les paiements existants sont initialisés « À déposer ».

- [PATCH] Le panneau des paiements suit immédiatement la case sélectionnée lors
  des changements de vue et de période. Les anciens totaux et listes sont masqués
  pendant le chargement et les réponses dépassées ne remplacent pas la sélection.

- [PATCH] Le calendrier est plus compact : petits boutons de sélection regroupés
  dans l’en-tête, espacements verticaux réduits et hauteur minimale des cases
  adaptée, avec cibles tactiles conservées.

## 0.3.0 - 2026-10-29

- [MINOR] Le calendrier propose les vues semaine avec numéro ISO, mois par défaut
  et année avec cumuls mensuels. Le panneau des paiements suit la période, permet
  de consulter le détail d’un jour ou d’un mois et conserve sa pagination. Seuls
  les moyens acceptés apparaissent dans les cases et la légende ; les anciens
  moyens restent comptés dans les totaux et regroupés sous « Autres ».

- [PATCH] Toutes les paginations utilisent le composant repris de GreenDesk :
  numéros de pages, ellipses et choix de 5, 10 ou 25 éléments par page, avec
  retour à la première page lors d’un changement de taille et contrôles accessibles.

- [PATCH] Le calendrier distingue les moyens de paiement par des icônes et
  couleurs dédiées, avec légende, libellés accessibles et variantes fondées
  sur des variables CSS réutilisables et color-mix.

- [PATCH] Le jour sélectionné du calendrier se distingue par un dégradé vert
  renforcé, un contour intérieur et un numéro contrasté, y compris au survol.

## 0.2.0 - 2026-10-29

- [PATCH] Les notifications utilisent les Toasts Bootstrap, se ferment après deux
  secondes et peuvent être fermées manuellement avec une croix.

- [PATCH] En développement, les traces HTTP présentent une heure, des colonnes alignées
  et des statuts colorés dans le terminal API ;
  les traces SQL masquées peuvent être activées avec DATABASE_LOGGING=true.

- [PATCH] La navigation et la favicon partagent un nouveau logo inspiré de
  l’identité GreenDesk, adapté au suivi administratif et comptable du cabinet,
  sur ordinateur comme dans le menu mobile.

- [PATCH] Les notifications et boutons partagent une couleur selon leur action,
  avec connexion verte et déconnexion rouge ; les notifications affichent leur
  message sans titre d’état, centré verticalement avec la croix. Cette convention
  s’applique aux développements futurs.

- [PATCH] Le pied de page centre le nom OstéoPilot et la version, séparés par un point médian.

- [PATCH] La création de patient et l’import/export restent accessibles en HTTP
  sur le réseau local : les clés de requête UUID utilisent un générateur
  cryptographique compatible lorsque crypto.randomUUID est indisponible.

- [PATCH] Le formulaire de création d’un patient demande uniquement le nom
  et le prénom, tous deux obligatoires.

- [PATCH] La navigation reprend les groupes dépliables de GreenDesk : un seul
  groupe ouvert, section active ouverte automatiquement, liens filtrés par droits
  et menus accessibles au clavier sur ordinateur et mobile.

- [PATCH] Le logo OstéoPilot remplace le titre Connexion sur la page de connexion,
  sans la phrase « Bienvenue dans votre espace ».

- [MINOR] La liste des patients propose Désactiver et Activer selon le statut,
  avec confirmation, couleurs adaptées, permission patients.archive, contrôle
  de version et audit transactionnel. Le filtre Tous est sélectionné par défaut.

- [PATCH] Sur le tableau de bord, « Votre espace au quotidien » et la date
  sont alignés sur la même ligne, y compris sur mobile ; le panneau de droite
  affiche la date sans le libellé « Date sélectionnée ».

- [PATCH] Les filtres utilisent un composant indépendant repris de GreenDesk,
  partagé entre patientèle et historique, avec repli accessible sur mobile.
  La recherche patient est dynamique après 300 ms de pause, sans bouton Rechercher.

- [MINOR] Le paramétrage permet de sélectionner les moyens de règlement acceptés :
  Espèces, Carte, Chèque et Virement. La sélection est conservée en base, validée
  et protégée par les droits, avec audit transactionnel et migration additive.
  Un panneau dédié sauvegarde chaque case immédiatement, indépendamment
  des informations générales, sans bouton Enregistrer.

- [MINOR] Le calendrier affiche les montants journaliers par moyen de paiement
  et leur total, à zéro en l’absence de paiement. Le panneau du jour liste les
  paiements et permet une saisie en modale : patient actif obligatoire, date,
  montant en centimes et moyen accepté. Droits dédiés, audit transactionnel,
  protection contre les doubles envois et migration additive accompagnent la saisie.

## 0.1.1 - 2026-10-29

- [PATCH] Tous les formulaires présentent les erreurs de validation avec Bootstrap,
  au niveau des champs et avec des messages français accessibles.

- [PATCH] Le mot de passe de connexion peut être affiché ou masqué avec une icône
  œil pour vérifier la saisie, sans soumettre le formulaire.

- [PATCH] La connexion affiche uniquement un formulaire centré et allégé ; l’onglet
  porte le nom OstéoPilot et une favicon de registre comptable avec un symbole euro.

- [PATCH] Le serveur de développement accepte les accès via osteopilot.org ;
  la configuration locale autorise aussi cette origine pour la connexion.

- [PATCH] Le frontend peut être lancé sur le réseau local avec npm run dev:lan,
  depuis la racine du projet ou le dossier frontend.

## 0.1.0 - 2026-10-29

- [MINOR] Premier socle OsteoPilot : connexion sécurisée, calendrier mensuel,
  gestion de patientèle et transferts CSV, administration des accès et historique
  commun, utilisables sur mobile et ordinateur dans un cabinet unique.
