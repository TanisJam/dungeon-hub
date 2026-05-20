#!/usr/bin/env node
/**
 * Generates Supabase-compatible JWT secret + anon key + service role key.
 * Run: node scripts/gen-keys.mjs
 */
import crypto from 'node:crypto';

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const jwtSecret = randomHex(32);
const postgresPassword = randomHex(24);
const dashboardPassword = randomHex(16);
const secretKeyBase = randomHex(32);
const vaultEncKey = randomHex(16);

const tenYears = 10 * 365 * 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);

const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat: now, exp: now + tenYears }, jwtSecret);
const serviceRoleKey = signJwt(
  { role: 'service_role', iss: 'supabase', iat: now, exp: now + tenYears },
  jwtSecret,
);

console.log('# Pegá esto en tu .env (ajustá lo que necesites)\n');
console.log(`POSTGRES_PASSWORD=${postgresPassword}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ANON_KEY=${anonKey}`);
console.log(`SERVICE_ROLE_KEY=${serviceRoleKey}`);
console.log(`DASHBOARD_USERNAME=supabase`);
console.log(`DASHBOARD_PASSWORD=${dashboardPassword}`);
console.log(`SECRET_KEY_BASE=${secretKeyBase}`);
console.log(`VAULT_ENC_KEY=${vaultEncKey}`);
console.log('');
console.log('# Y para apps/api/.env:');
console.log(`DATABASE_URL=postgres://postgres:${postgresPassword}@localhost:5432/postgres`);
console.log(`SUPABASE_JWT_SECRET=${jwtSecret}`);
console.log(`SUPABASE_URL=http://localhost:8000`);
console.log(`SUPABASE_ANON_KEY=${anonKey}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
