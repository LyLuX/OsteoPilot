import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { assert, errorHandler, success } from './core/errors.js';
import { parse } from './core/validation.js';
import { routes } from './routes/registry.js';
import { createControllers } from './routes/controller.js';
import { AuthService, accessCookie } from './modules/auth/auth.service.js';
import { PatientService } from './modules/patients/patient.service.js';
import { AdministrationService } from './modules/administration/administration.service.js';
import { version } from './config/version.js';
import { openapi } from './config/openapi.js';
import { logDenial } from './core/security-logger.js';

export function createApp({ db, config, services }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxies);
  app.use(helmet());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.on('finish', () => {
      if ([401, 403, 429].includes(res.statusCode)) logDenial(res.statusCode);
    });
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '600kb', strict: true }), cookieParser());
  app.get('/health', (_req, res) => res.json(success({ status: 'ok', version })));
  const limiter = (limit) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: { message: 'Trop de requêtes. Réessayez ultérieurement.' },
      },
    });
  app.use('/api', limiter(config.apiLimit));
  app.use('/api/v1/auth/login', limiter(config.loginLimit));
  if (!config.production) {
    app.get('/api-docs.json', (_req, res) => res.json(openapi));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
  }
  const auth = services?.auth || new AuthService(db, config);
  const patients = services?.patients || new PatientService(db, auth);
  const administration = services?.administration || new AdministrationService(db, auth);
  const controllers = createControllers({ auth, patients, administration });
  for (const route of routes) {
    app[route.method]('/api/v1' + route.path, async (req, res) => {
      if (!['get', 'head', 'options'].includes(req.method.toLowerCase())) {
        assert(config.corsOrigins.includes(req.get('Origin')), 'Origine de requête refusée.', 403);
        assert(req.is('application/json'), 'Le contenu doit être JSON.', 415);
      }
      if (!route.public) {
        req.context = await auth.authenticate(req.cookies[accessCookie]);
        auth.permit(req.context, route.permission);
        if (route.method !== 'get') auth.csrf(req.context, req.get('X-CSRF-Token'));
      }
      if (route.body) req.body = parse(route.body, req.body);
      if (route.query) parse(route.query, req.query);
      const data = await controllers[route.action](req, res);
      if (!res.headersSent) res.status(route.status || 200).json(success(data));
    });
  }
  app.use((_req, res) =>
    res.status(404).json({ success: false, error: { message: 'Route introuvable.' } }),
  );
  app.use(errorHandler);
  return app;
}
