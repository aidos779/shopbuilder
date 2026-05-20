process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_deployment_tests_123456';
process.env.DATABASE_URL = 'postgresql://shopbuilder:shopbuilder_pass@localhost:5432/shopbuilder';
process.env.ALLOWED_ORIGINS = 'https://frontend.example.com';
process.env.FRONTEND_URL = 'https://frontend.example.com/';
process.env.API_URL = 'https://api.example.com/';

jest.mock('../src/config/database', () => ({}));

const request = require('supertest');
const app = require('../src/app');
const swaggerSpec = require('../src/config/swagger');

describe('Deployment surface', () => {
  test('GET / returns production readiness payload', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      message: 'ShopBuilder API running',
    });
  });

  test('GET /docs serves Swagger UI', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Swagger UI/i);
  });

  test('GET /openapi.json exposes generated swagger-jsdoc spec', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toBe('ShopBuilder API');
  });

  test('CORS allows configured frontend origin and rejects wildcard behavior', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'https://frontend.example.com');
    const rejected = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://frontend.example.com');
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.path).toBe('/health');
  });

  test('Swagger production server URL is generated from API_URL without trailing slash', () => {
    expect(swaggerSpec.servers[0]).toEqual({
      url: 'https://api.example.com',
      description: 'Production',
    });
  });
});
