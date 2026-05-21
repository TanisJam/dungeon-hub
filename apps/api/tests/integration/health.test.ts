import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/health', () => {
  beforeAll(async () => {
    await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('returns ok with DB up', async () => {
    const app = await getTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(typeof body.uptime).toBe('number');
  });
});
