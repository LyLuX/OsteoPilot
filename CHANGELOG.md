# Journal des modifications

## Non publié

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
