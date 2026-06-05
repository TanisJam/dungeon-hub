import { randomBytes } from 'node:crypto';
import { env } from '../env.js';

const TOKEN_BYTES = 24; // 192 bits → 48 hex chars

/**
 * Generates a cryptographically random 48-character hex token (192-bit entropy).
 * Shared by the discord-link flow and the campaign-invite flow.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Builds a full web-app URL for a given path segment and token.
 *
 * Examples:
 *   buildAppUrl('link', token)   → `${WEB_APP_URL}/link/${token}`
 *   buildAppUrl('invite', token) → `${WEB_APP_URL}/invite/${token}`
 *
 * Trailing slashes on WEB_APP_URL are stripped before joining.
 */
export function buildAppUrl(segment: string, token: string): string {
  return `${env.WEB_APP_URL.replace(/\/$/, '')}/${segment}/${token}`;
}
