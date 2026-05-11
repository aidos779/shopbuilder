process.env.JWT_SECRET = 'test_secret_for_unit_tests';
process.env.NODE_ENV = 'test';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { findUnique: jest.fn() },
  $transaction: jest.fn().mockImplementation(async (arg) =>
    typeof arg === 'function' ? arg({}) : Promise.all(arg)
  ),
}));

const request = require('supertest');
const app = require('../src/app');

describe('Auth — Protected Route Access', () => {
  test('GET /auth/me returns 401 with no token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /auth/me returns 401 with a malformed Bearer token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  test('GET /auth/me returns 401 when Authorization header is missing Bearer prefix', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  test('GET /health returns 200 (public route)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
