import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { assert, AppError } from '../../core/errors.js';
import { withTransaction } from '../../core/database/transaction.js';
import { recordAudit } from '../audit/audit.service.js';
import { publicUser } from '../users/user.model.js';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const idleMs = 15 * 60 * 1000;
const lifetimeMs = 8 * 60 * 60 * 1000;
const cookieName = 'osteopilot.access';
export class AuthService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }
  async identity(id, transaction) {
    return this.db.models.Users.findByPk(id, {
      transaction,
      include: [
        {
          model: this.db.models.Roles,
          include: [this.db.models.Permissions],
        },
      ],
    });
  }
  csrfToken(sessionId) {
    return createHmac('sha256', this.config.secret)
      .update('csrf:' + sessionId)
      .digest('hex');
  }
  sign(user, session) {
    return jwt.sign({ sid: session.id }, this.config.secret, {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: session.tokenId,
      expiresIn: '15m',
      issuer: 'osteopilot',
      audience: 'osteopilot-web',
    });
  }
  claims(token) {
    try {
      const claims = jwt.verify(token, this.config.secret, {
        algorithms: ['HS256'],
        issuer: 'osteopilot',
        audience: 'osteopilot-web',
        maxAge: '15m',
      });
      assert(
        typeof claims.sub === 'string' &&
          typeof claims.sid === 'string' &&
          typeof claims.jti === 'string' &&
          typeof claims.exp === 'number',
        'Session invalide.',
        401,
      );
      return claims;
    } catch {
      throw new AppError('Session expirée. Reconnectez-vous.', 401);
    }
  }
  async authenticate(token, transaction) {
    assert(token, 'Veuillez vous connecter.', 401);
    const claims = this.claims(token);
    const session = await this.db.models.Sessions.findByPk(claims.sid, { transaction });
    assert(
      session &&
        session.tokenId === claims.jti &&
        session.userId === claims.sub &&
        Date.now() - new Date(session.lastActivityAt).getTime() < idleMs &&
        new Date(session.expiresAt).getTime() > Date.now(),
      'Session expirée. Reconnectez-vous.',
      401,
    );
    const user = await this.identity(claims.sub, transaction);
    assert(user?.active, 'Session invalide.', 401);
    return { user, session, publicUser: publicUser(user) };
  }
  csrf(context, token) {
    const hash = digest(typeof token === 'string' ? token : '');
    assert(
      timingSafeEqual(Buffer.from(hash), Buffer.from(context.session.csrfHash)),
      'Protection CSRF : requête refusée.',
      403,
    );
  }
  permit(context, permission) {
    assert(
      !permission || context.publicUser.permissions.includes(permission),
      'Vous ne disposez pas de cette permission.',
      403,
    );
  }
  async write(token, csrfToken, permission, work) {
    return withTransaction(this.db, async (transaction) => {
      const context = await this.authenticate(token, transaction);
      this.csrf(context, csrfToken);
      this.permit(context, permission);
      return work(context, transaction);
    });
  }
  async login(email, password) {
    const keyHash = createHmac('sha256', this.config.secret).update(email).digest('hex');
    const result = await withTransaction(this.db, async (transaction) => {
      const { LoginAttempts, Sessions } = this.db.models;
      let attempt = await LoginAttempts.findOne({ where: { keyHash }, transaction });
      if (attempt && Date.now() - new Date(attempt.windowAt).getTime() >= idleMs) {
        await attempt.update({ attempts: 0, windowAt: new Date() }, { transaction });
      }
      if (attempt?.attempts >= 10) return { denied: 429 };
      const found = await this.db.models.Users.findOne({ where: { email }, transaction });
      // Coût bcrypt constant même si l'adresse est inconnue.
      const hash =
        found?.passwordHash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5NQ8VEHN9E9wpTqvdFh4EFHDC4yfJ7a';
      const valid = await bcrypt.compare(password, hash);
      if (!found?.active || !valid) {
        if (attempt) await attempt.update({ attempts: attempt.attempts + 1 }, { transaction });
        else
          await LoginAttempts.create(
            { keyHash, attempts: 1, windowAt: new Date() },
            { transaction },
          );
        await recordAudit(this.db, { action: 'auth.login.denied', entity: 'auth' }, transaction);
        return { denied: 401 };
      }
      if (attempt) await attempt.destroy({ transaction });
      const user = await this.identity(found.id, transaction);
      const sessionId = randomUUID();
      const csrfToken = this.csrfToken(sessionId);
      const session = await Sessions.create(
        {
          id: sessionId,
          userId: user.id,
          tokenId: randomUUID(),
          csrfHash: digest(csrfToken),
          lastActivityAt: new Date(),
          expiresAt: new Date(Date.now() + lifetimeMs),
        },
        { transaction },
      );
      await recordAudit(
        this.db,
        { actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id },
        transaction,
      );
      return { token: this.sign(user, session), csrfToken, user: publicUser(user) };
    });
    if (result.denied)
      throw new AppError(
        result.denied === 429
          ? 'Trop de tentatives. Réessayez dans 15 minutes.'
          : 'Adresse email ou mot de passe incorrect.',
        result.denied,
      );
    return result;
  }
  async refresh(token, csrfToken) {
    return this.write(token, csrfToken, null, async (context, transaction) => {
      await context.session.update(
        { tokenId: randomUUID(), lastActivityAt: new Date() },
        { transaction },
      );
      await recordAudit(
        this.db,
        {
          actorId: context.user.id,
          action: 'auth.refresh',
          entity: 'session',
          entityId: context.session.id,
        },
        transaction,
      );
      return { token: this.sign(context.user, context.session), user: context.publicUser };
    });
  }
  async logout(token, csrfToken) {
    return this.write(token, csrfToken, null, async (context, transaction) => {
      await context.session.destroy({ transaction });
      await recordAudit(
        this.db,
        {
          actorId: context.user.id,
          action: 'auth.logout',
          entity: 'session',
          entityId: context.session.id,
        },
        transaction,
      );
      return {};
    });
  }
  cookie(res, token) {
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'strict',
      path: '/api/v1',
      maxAge: idleMs,
    });
  }
  clearCookie(res) {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'strict',
      path: '/api/v1',
    });
  }
}
export const accessCookie = cookieName;
