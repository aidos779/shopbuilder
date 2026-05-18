// Mock native modules so the full app can be loaded in a sandboxed test env
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/config/database', () => ({
  user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
  tenant: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  merchant: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  store: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  product: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  variant: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  order: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
  refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn().mockImplementation(async (arg) => typeof arg === 'function' ? arg(require('../src/config/database')) : Promise.all(arg)),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_rbac';

const makeToken = (role, tenantId = 'tenant-test-id') =>
  jwt.sign(
    { sub: `user-${role}`, email: `${role.toLowerCase()}@test.com`, role, tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'shopbuilder-api', audience: 'shopbuilder-clients' }
  );

describe('RBAC — Unauthorized (no token)', () => {
  const protectedRoutes = [
    ['GET', '/admin/users'],
    ['GET', '/admin/tenants'],
    ['GET', '/admin/stats'],
    ['GET', '/merchants'],
    ['GET', '/stores'],
    ['GET', '/products'],
    ['GET', '/orders'],
  ];

  protectedRoutes.forEach(([method, path]) => {
    it(`${method} ${path} → 401`, async () => {
      const res = await request(app)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    });
  });
});

describe('RBAC — CUSTOMER role', () => {
  let token;
  beforeAll(() => { token = makeToken('CUSTOMER'); });

  it('GET /admin/users → 403', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/tenants → 403', async () => {
    const res = await request(app).get('/admin/tenants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/stats → 403', async () => {
    const res = await request(app).get('/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('POST /merchants → 403', async () => {
    const res = await request(app).post('/merchants').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  it('DELETE /merchants/some-id → 403', async () => {
    const res = await request(app).delete('/merchants/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('POST /stores → 403', async () => {
    const res = await request(app).post('/stores').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  it('POST /products → 403', async () => {
    const res = await request(app).post('/products').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  it('GET /auth/me → 200', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('CUSTOMER');
  });
});

describe('RBAC — STORE_MANAGER role', () => {
  let token;
  beforeAll(() => { token = makeToken('STORE_MANAGER'); });

  it('GET /admin/users → 403', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /merchants/some-id → 403', async () => {
    const res = await request(app).delete('/merchants/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /stores/some-id → 403', async () => {
    const res = await request(app).delete('/stores/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /auth/me → 200', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STORE_MANAGER');
  });
});

describe('RBAC — MERCHANT_OWNER role', () => {
  let token;
  beforeAll(() => { token = makeToken('MERCHANT_OWNER'); });

  it('GET /admin/users → 403', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /merchants/some-id → 403 (only SUPER_ADMIN can delete)', async () => {
    const res = await request(app).delete('/merchants/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('POST /admin/tenants → 403', async () => {
    const res = await request(app).post('/admin/tenants').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });
});

describe('RBAC — PLATFORM_ADMIN role', () => {
  let token;
  beforeAll(() => { token = makeToken('PLATFORM_ADMIN', null); });

  it('PATCH /admin/users/:id/role → 403 (SUPER_ADMIN only)', async () => {
    const res = await request(app)
      .patch('/admin/users/some-id/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'CUSTOMER' });
    expect(res.status).toBe(403);
  });

  it('DELETE /admin/users/:id → 403 (SUPER_ADMIN only)', async () => {
    const res = await request(app)
      .delete('/admin/users/some-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Invalid token', () => {
  it('returns 401 for malformed token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired token', async () => {
    const expired = jwt.sign(
      { sub: 'u1', email: 'e@e.com', role: 'CUSTOMER', tenantId: null },
      process.env.JWT_SECRET,
      { expiresIn: '-1s', issuer: 'shopbuilder-api', audience: 'shopbuilder-clients' }
    );
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is missing Bearer prefix', async () => {
    const token = makeToken('CUSTOMER');
    const res = await request(app).get('/auth/me').set('Authorization', token);
    expect(res.status).toBe(401);
  });
});
