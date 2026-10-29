import { version } from './version.js';
import { components } from './openapi-components.js';
import { paths } from './openapi-paths.js';
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'OsteoPilot',
    version,
    description:
      'Cabinet unique. UUID publics. Écritures et audit atomiques. UTC en base, Europe/Paris pour le calendrier. Cookie HttpOnly et CSRF. Pas d’inscription publique.',
  },
  servers: [{ url: 'http://localhost:3008' }],
  components,
  paths,
};
