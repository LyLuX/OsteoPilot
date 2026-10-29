# Journal des modifications

## Non publié

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
