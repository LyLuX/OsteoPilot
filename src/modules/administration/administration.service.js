import { calendarSettingsInput } from './calendar-settings.js';
import { paymentMethodChangeInput, paymentMethodCodes } from './payment-methods.js';
import { SettingsRepository, publicSettings } from './settings.repository.js';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { assert } from '../../core/errors.js';
import {
  z,
  name,
  text,
  email,
  password,
  uuid,
  paging,
  parse,
  pageResult,
  optionalEmail,
} from '../../core/validation.js';
import { recordAudit } from '../audit/audit.service.js';
import { publicUser } from '../users/user.model.js';
export const userInput = z
  .object({
    firstName: name,
    lastName: name,
    email,
    password,
    active: z.boolean().default(true),
    roleIds: z.array(uuid).min(1).max(20),
  })
  .strict();
export const userUpdate = userInput
  .omit({ password: true })
  .extend({ password: password.optional() });
export const roleInput = z.object({ name: text(80).min(2) }).strict();
export const permissionInput = z.object({ permissionIds: z.array(uuid).max(100) }).strict();
export const settingsInput = z
  .object({
    name,
    address: text(300),
    phone: text(30).regex(/^[+()\d .-]*$/),
    email: optionalEmail,
    timezone: z.literal('Europe/Paris'),
  })
  .strict();
export const listInput = z.object({ ...paging }).strict();
export const historyInput = z
  .object({
    ...paging,
    actorId: uuid.optional(),
    action: text(80).optional(),
    entity: text(40).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to);
export class AdministrationService {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.settingsRepository = new SettingsRepository(db);
  }
  async list(kind, query) {
    query = parse(listInput, query);
    const model = this.db.models[kind];
    const include =
      kind === 'Users'
        ? [{ model: this.db.models.Roles, include: [this.db.models.Permissions] }]
        : kind === 'Roles'
          ? [this.db.models.Permissions]
          : [];
    const result = await model.findAndCountAll({
      include,
      distinct: true,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return pageResult(result, query, (row) =>
      kind === 'Users'
        ? publicUser(row)
        : kind === 'Roles'
          ? {
              id: row.id,
              name: row.name,
              system: row.system,
              permissionIds: row.Permissions.map((p) => p.id),
            }
          : { id: row.id, name: row.name },
    );
  }
  async assignRoles(user, ids, ctx, tx) {
    const roles = await this.db.models.Roles.findAll({
      where: { id: ids },
      include: [this.db.models.Permissions],
      transaction: tx,
    });
    assert(roles.length === ids.length, 'Un rôle est inconnu.', 422);
    assert(
      roles.every(
        (r) => !r.system && r.Permissions.every((p) => ctx.publicUser.permissions.includes(p.name)),
      ),
      'Attribution de rôle système ou de droits supérieurs interdite.',
      403,
    );
    await user.setRoles(roles, { transaction: tx });
  }
  async saveUser(token, csrf, id, values) {
    const input = parse(id ? userUpdate : userInput, values);
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
    return this.auth.write(token, csrf, id ? 'users.update' : 'users.create', async (ctx, tx) => {
      assert(id !== ctx.user.id, 'La modification de son propre compte est interdite ici.', 403);
      const { roleIds } = input;
      const fields = {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        active: input.active,
      };
      let user;
      if (id) {
        user = await this.auth.identity(id, tx);
        assert(user, 'Utilisateur introuvable.', 404);
        assert(
          !user.Roles.some((r) => r.system),
          'Le compte administrateur système est protégé.',
          403,
        );
        await user.update(
          { ...fields, ...(passwordHash ? { passwordHash } : {}) },
          { transaction: tx },
        );
        await this.db.models.Sessions.destroy({ where: { userId: id }, transaction: tx });
      } else
        user = await this.db.models.Users.create({ ...fields, passwordHash }, { transaction: tx });
      await this.assignRoles(user, roleIds, ctx, tx);
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: id ? 'users.update' : 'users.create',
          entity: 'user',
          entityId: user.id,
        },
        tx,
      );
      return publicUser(await this.auth.identity(user.id, tx));
    });
  }
  async saveRole(token, csrf, id, values) {
    const input = parse(roleInput, values);
    return this.auth.write(token, csrf, id ? 'roles.update' : 'roles.create', async (ctx, tx) => {
      let row;
      if (id) {
        row = await this.db.models.Roles.findByPk(id, { transaction: tx });
        assert(row, 'Rôle introuvable.', 404);
        assert(!row.system, 'Le rôle système est immuable.', 403);
        assert(
          !ctx.user.Roles.some((r) => r.id === id),
          'La modification de ses propres rôles est interdite.',
          403,
        );
        await row.update(input, { transaction: tx });
      } else row = await this.db.models.Roles.create(input, { transaction: tx });
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: id ? 'roles.update' : 'roles.create',
          entity: 'role',
          entityId: row.id,
        },
        tx,
      );
      return { id: row.id, name: row.name, system: row.system };
    });
  }
  async setPermissions(token, csrf, id, values) {
    const input = parse(permissionInput, values);
    return this.auth.write(token, csrf, 'permissions.update', async (ctx, tx) => {
      const role = await this.db.models.Roles.findByPk(id, { transaction: tx });
      assert(role, 'Rôle introuvable.', 404);
      assert(
        !role.system && !ctx.user.Roles.some((r) => r.id === id),
        'Ce rôle est protégé contre l’auto-élévation.',
        403,
      );
      const permissions = await this.db.models.Permissions.findAll({
        where: { id: input.permissionIds },
        transaction: tx,
      });
      assert(permissions.length === input.permissionIds.length, 'Permission inconnue.', 422);
      assert(
        permissions.every((p) => ctx.publicUser.permissions.includes(p.name)),
        'Droits supérieurs interdits.',
        403,
      );
      await role.setPermissions(permissions, { transaction: tx });
      await recordAudit(
        this.db,
        { actorId: ctx.user.id, action: 'permissions.update', entity: 'role', entityId: id },
        tx,
      );
      return { id, permissionIds: input.permissionIds };
    });
  }
  async settings() {
    const row = await this.settingsRepository.find();
    assert(row, 'Paramètres du cabinet introuvables.', 404);
    return publicSettings(row);
  }
  async calendarSettings() {
    const row = await this.settingsRepository.calendar();
    assert(row, 'Paramètres du calendrier introuvables.', 404);
    return { defaultCalendarView: row.defaultCalendarView };
  }
  async changeCalendarSettings(token, csrf, values) {
    const input = parse(calendarSettingsInput, values);
    return this.auth.write(token, csrf, 'settings.update', async (ctx, tx) => {
      const row = await this.settingsRepository.find(tx);
      assert(row, 'Paramètres du cabinet introuvables.', 404);
      if (row.defaultCalendarView !== input.defaultCalendarView) {
        await this.settingsRepository.update(row, input, tx);
        await recordAudit(
          this.db,
          {
            actorId: ctx.user.id,
            action: 'settings.calendar.update',
            entity: 'settings',
            entityId: row.id,
          },
          tx,
        );
      }
      return { defaultCalendarView: row.defaultCalendarView };
    });
  }
  async saveSettings(token, csrf, values) {
    const input = parse(settingsInput, values);
    return this.auth.write(token, csrf, 'settings.update', async (ctx, tx) => {
      const row = await this.settingsRepository.find(tx);
      assert(row, 'Paramètres du cabinet introuvables.', 404);
      await this.settingsRepository.update(row, input, tx);
      await recordAudit(
        this.db,
        { actorId: ctx.user.id, action: 'settings.update', entity: 'settings', entityId: row.id },
        tx,
      );
      return publicSettings(row);
    });
  }
  async changePaymentMethod(token, csrf, values) {
    const input = parse(paymentMethodChangeInput, values);
    return this.auth.write(token, csrf, 'settings.update', async (ctx, tx) => {
      const row = await this.settingsRepository.find(tx);
      assert(row, 'Paramètres du cabinet introuvables.', 404);
      const selected = new Set(row.paymentMethods ?? []);
      if (input.accepted) selected.add(input.method);
      else selected.delete(input.method);
      const paymentMethods = paymentMethodCodes.filter((code) => selected.has(code));
      await this.settingsRepository.update(row, { paymentMethods }, tx);
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: 'settings.payment-methods.update',
          entity: 'settings',
          entityId: row.id,
        },
        tx,
      );
      return { paymentMethods };
    });
  }
  async history(query) {
    query = parse(historyInput, query);
    const where = Object.fromEntries(
      ['actorId', 'action', 'entity'].filter((k) => query[k]).map((k) => [k, query[k]]),
    );
    if (query.from || query.to)
      where.createdAt = {
        ...(query.from ? { [Op.gte]: new Date(query.from + 'T00:00:00.000Z') } : {}),
        ...(query.to
          ? { [Op.lt]: new Date(new Date(query.to + 'T00:00:00.000Z').getTime() + 86400000) }
          : {}),
      };
    const rows = await this.db.models.AuditLogs.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return pageResult(rows, query, (r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      count: r.count,
      createdAt: r.createdAt,
    }));
  }
}
