export class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const assert = (condition, message, status = 400) => {
  if (!condition) throw new AppError(message, status);
};
export function errorHandler(error, _req, res, _next) {
  let status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
  let message = error.status ? error.message : 'Erreur interne. Réessayez ultérieurement.';
  if (error.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    message = 'Un enregistrement identique existe déjà.';
  }
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    status = 409;
    message = 'Cet enregistrement est encore utilisé.';
  }
  if (error instanceof SyntaxError && error.status === 400) message = 'JSON invalide.';
  res.status(status).json({
    success: false,
    error: { message, ...(error.details ? { details: error.details } : {}) },
  });
}
export const success = (data) => ({ success: true, data });
