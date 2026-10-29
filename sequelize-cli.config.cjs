// Diagnostic CLI uniquement. Utiliser les scripts db:* gardés pour les migrations.
// Les migrations ESM sont pilotées par scripts/database.js, sans sync ni db:create.
require('dotenv').config();
const config = {
  dialect: 'mysql',
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: Number(process.env.DATABASE_PORT || 3306),
  database: process.env.DATABASE_NAME || 'osteopilot',
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  logging: false,
};
module.exports = { development: config, test: config, production: config };
