# Confidentialité

Même sans notes cliniques, le contexte de patientèle peut impliquer des données de
santé : la [définition CNIL](https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante)
inclut certaines informations d’identification collectées pour bénéficier de soins.

Avant usage réel, déterminer responsable, finalités, base juridique, information
des personnes, droits d’accès/rectification, registre, sous-traitants et rétention.
Limiter les habilitations, exports et sauvegardes. Voir le
[guide CNIL pour les professionnels libéraux](https://www.cnil.fr/fr/rgpd-et-professionnels-de-sante-liberaux-ce-que-vous-devez-savoir).

Selon le traitement et l’hébergement, vérifier les exigences applicables auprès
de l’[Agence du Numérique en Santé](https://esante.gouv.fr/produits-services/hds).
Stockage local, responsive ou cookies ne valent pas certification.
Aucune conformité RGPD ou certification HDS acquise par cette implémentation.

Les audits contiennent UUID, action, type, nombre et date, pas les fiches ni secrets.
Ils restent à protéger car les UUID sont reliables à des personnes.
Les fiches archivées restent conservées ; définir purge et traitement des droits
avant production, selon les obligations applicables. Chiffrer et restreindre
stockage/export/sauvegarde et tester les restaurations.
