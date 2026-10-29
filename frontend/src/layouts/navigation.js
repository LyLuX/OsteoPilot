export const navigation = [
  {
    label: 'Vue d’ensemble',
    direct: true,
    items: [
      { label: 'Tableau de bord', path: '/dashboard', permission: 'dashboard.read', icon: '▦' },
    ],
  },
  {
    label: 'Gestion patientèle',
    key: 'patients',
    icon: '♧',
    items: [
      { label: 'Patientèle', path: '/patients', permission: 'patients.read', icon: '♧' },
      {
        label: 'Création d’un patient',
        path: '/patients/new',
        permission: 'patients.create',
        icon: '+',
      },
      {
        label: 'Importer / Exporter',
        path: '/patients/transfer',
        permission: 'patients.import',
        anyPermission: 'patients.export',
        icon: '⇄',
      },
    ],
  },
  {
    label: 'Administration',
    key: 'administration',
    icon: '⚙',
    items: [
      { label: 'Utilisateurs', path: '/administration/users', permission: 'users.read', icon: '♙' },
      {
        label: 'Paramétrage',
        path: '/administration/settings',
        permission: 'settings.read',
        icon: '⚙',
      },
      { label: 'Rôles', path: '/administration/roles', permission: 'roles.read', icon: '◇' },
      {
        label: 'Permissions',
        path: '/administration/permissions',
        permission: 'permissions.read',
        icon: '✓',
      },
    ],
  },
  {
    label: 'Traçabilité',
    direct: true,
    items: [{ label: 'Historique', path: '/history', permission: 'history.read', icon: '↺' }],
  },
];
