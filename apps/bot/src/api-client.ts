import { env } from './env.js';

interface SupabaseLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
  user: { id: string; email: string };
}

interface SupabaseRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
}

/**
 * Cliente HTTP del bot contra la API de Dungeon Hub.
 *
 * Maneja:
 * - Login inicial contra Supabase GoTrue con email/password del bot.
 * - Refresh automático del JWT antes de que expire (margen de 60s).
 * - Bearer token en cada request al API backend.
 *
 * El bot se autentica como un user "real" de Supabase con role `player`,
 * agregado como member de la campaña que atiende. Es deliberadamente simple:
 * cero infraestructura nueva en el backend, solo reusa el flow de auth
 * existente.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  /** Epoch seconds en que expira el access_token actual. */
  private expiresAt = 0;

  async ensureToken(): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    // Margen de 60s para evitar usar un token al filo del vencimiento.
    if (this.accessToken && this.expiresAt - nowSec > 60) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      try {
        await this.refresh();
        if (this.accessToken) return this.accessToken;
      } catch (err) {
        console.warn('[bot] refresh failed, doing full login:', err);
      }
    }
    await this.login();
    if (!this.accessToken) {
      throw new Error('Login succeeded but no access token was set');
    }
    return this.accessToken;
  }

  private async login(): Promise<void> {
    const url = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: env.BOT_EMAIL,
        password: env.BOT_PASSWORD,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase login failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as SupabaseLoginResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = data.expires_at;
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) throw new Error('no refresh token available');
    const url = `${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase refresh failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as SupabaseRefreshResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = data.expires_at;
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const token = await this.ensureToken();
    const url = new URL(`${env.API_BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text);
    }
    return (await res.json()) as T;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
  }
}

export const api = new ApiClient();
