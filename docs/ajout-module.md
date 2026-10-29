# Ajouter un module

1. Définir le besoin, la minimisation et les permissions existantes réutilisables.
2. Ajouter le modèle dans src/modules et ses attributs au registre Sequelize.
3. Ajouter une migration versionnée sans modifier une migration appliquée.
   Le runner reconnaît aujourd’hui la seule migration initiale : étendre sa liste
   ordonnée, ses gardes d’historique et les contrôles avec chaque nouvelle migration.
   Préparer sauvegarde, compatibilité, reprise et retour arrière documentés.
4. Créer le repository. Les mutations exigent requireTransaction ; les lectures
   sont bornées et filtrées sans transaction systématique.
5. Créer le service : validation, withTransaction, relecture des droits et recordAudit
   dans la même transaction. Aucun effet externe avant commit.
6. Déclarer routes/permissions/schémas dans routes/registry.js et les controllers.
   Ajouter les projections et mettre à jour openapi-paths.js/openapi-components.js.
7. Ajouter les permissions dans permissions.js et une migration de référence
   pour les bases existantes, jamais un seed automatique au démarrage.
8. Ajouter pages, protections de routes et navigation configurée.
   Réutiliser composants shared, thème et api/client.js.
9. Tester succès, refus, confidentialité, rollback avant/après audit, concurrence
   et idempotence pertinentes, avec MySQL isolé.
10. Actualiser documentation et changelog, exécuter les checks, suivre AGENTS.md.

patients fournit l’exemple modèle/repository/service/API/interface.
Les petits modules users/roles/permissions/settings partagent le service
d’administration pour garder un socle proportionné.

## Extension financière

Aucune table ni logique comptable aujourd’hui. Un futur module aura migrations,
droits et audit propres. Montants en DECIMAL MySQL et calcul décimal exact, jamais
FLOAT. Définir devise, arrondis, dates, fuseau et invariants avec le besoin réel.
Les emails/fichiers futurs nécessitent outbox ou traitement sûr après commit.
