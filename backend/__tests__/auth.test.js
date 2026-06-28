const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const db = require('../config/db');

describe('Auth module', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret';
    process.env.BCRYPT_ROUNDS = '12';
  });

  beforeEach(() => {
    db.query.mockReset();
    db.getClient.mockReset();
  });

  test('GET /api/health returns 200', async () => {
    const app = require('../index');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  test('POST /api/auth/register registers a patient user', async () => {
    const app = require('../index');

    db.query.mockResolvedValueOnce({ rows: [] }); // email not exists

    const clientQuery = jest.fn();
    clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Carlos', email: 'c@v.com', role: 'patient' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
    ;
    db.getClient.mockResolvedValueOnce({
      query: clientQuery,
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Carlos', email: 'c@v.com', password: 'PasswordSeguro2026!', role: 'patient' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('patient');
    expect(res.body.data.token).toBeTruthy();
  });

  test('POST /api/auth/login returns accessToken + refreshToken', async () => {
    const app = require('../index');

    const passwordHash = await bcrypt.hash('PasswordSeguro2026!', 12);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Carlos', email: 'c@v.com', role: 'patient', is_active: true, password_hash: passwordHash }] }) // user lookup
      .mockResolvedValueOnce({ rows: [] }); // insert refresh token

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'c@v.com', password: 'PasswordSeguro2026!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('c@v.com');
  });
});

