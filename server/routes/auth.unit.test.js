const express = require('express');
const bcrypt = require('bcryptjs');
const request = require('supertest');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  return {
    ...actual,
    generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
    generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
    blacklistToken: jest.fn(),
  };
});

const { pool } = require('../config/db');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');

const router = require('./auth');

describe('Auth Routes - Unit Tests with Mocks', () => {
  let app;

  beforeEach(() => {
    // 注意：jest.clearAllMocks() 不清除 mockResolvedValueOnce 队列（once 属于实现），
    // 队列会跨测试残留导致 mock 数据错位。pool.query 必须单独 mockReset() 清空队列。
    pool.query.mockReset();
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // 实现查询序列（测试环境跳过锁定检查）：findUser -> recordLoginAttempt -> cleanupLoginAttempts -> UPDATE last_login_at -> auditLog(兜底)
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'admin',
          password_hash: await bcrypt.hash('admin123', 10),
          real_name: '管理员',
          role: 'admin',
          department: '安全部',
          phone: '13800138000',
          email: 'admin@example.com',
          avatar: null,
          is_active: true,
        }]
      });
      pool.query.mockResolvedValueOnce({ rows: [] }); // recordLoginAttempt (INSERT)
      pool.query.mockResolvedValueOnce({ rows: [] }); // cleanupLoginAttempts (DELETE)
      pool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE users SET last_login_at
      pool.query.mockResolvedValue({ rows: [] });     // auditLog 等后续查询兜底

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBe('mock-access-token');
      expect(res.body.data.refreshToken).toBe('mock-refresh-token');
      expect(res.body.data.user.username).toBe('admin');
      expect(generateAccessToken).toHaveBeenCalled();
      expect(generateRefreshToken).toHaveBeenCalled();
    });

    it('should return 401 for wrong password', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'admin',
          password_hash: await bcrypt.hash('admin123', 10),
          real_name: '管理员',
          role: 'admin',
          is_active: true,
        }]
      });
      pool.query.mockResolvedValueOnce({ rows: [] }); // recordLoginAttempt（失败登录也记录）
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 for non-existent user', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // findUser 无结果
      pool.query.mockResolvedValueOnce({ rows: [] }); // recordLoginAttempt
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'anypass' });

      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for missing fields (validation)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'a' });

      expect(res.statusCode).toBe(400);
    });

    it('should return 403 for disabled account', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          username: 'disabled',
          password_hash: await bcrypt.hash('pass1234', 10),
          real_name: '禁用用户',
          role: 'viewer',
          is_active: false,
        }]
      });
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'disabled', password: 'pass1234' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle logout with bearer token', async () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 1, username: 'admin', jti: 'test-jti', exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_SECRET || 'test-jwt-secret-e2e-only-do-not-use-in-prod'
      );

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // 查重：用户不存在
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 10,
          username: 'newuser',
          real_name: '新用户',
          role: 'viewer',
          department: null,
          phone: null,
          email: 'new@example.com',
        }]
      });
      pool.query.mockResolvedValue({ rows: [] }); // auditLog 等兜底

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          realName: '新用户',
          password: 'Newpass123',
          confirmPassword: 'Newpass123',
          email: 'new@example.com',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('newuser');
    });

    it('should return 409 if username already exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'admin',
          realName: '管理员',
          password: 'Admin1234',
          confirmPassword: 'Admin1234',
          email: 'admin@example.com',
        });

      expect(res.statusCode).toBe(409);
    });

    it('should return 400 for weak password (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          realName: '测试用户',
          password: 'password1',
          email: 'test@example.com',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/current-user', () => {
    it('should return current user info with valid token', async () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 1, username: 'admin' },
        process.env.JWT_SECRET || 'test-jwt-secret-e2e-only-do-not-use-in-prod',
        { expiresIn: '1h' }
      );

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'admin',
          real_name: '管理员',
          role: 'admin',
          department: '安全部',
          phone: '13800138000',
          email: 'admin@example.com',
          avatar: null,
          is_active: true,
          last_login_at: new Date(),
        }]
      });

      const res = await request(app)
        .get('/api/auth/current-user')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('admin');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/current-user');
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/current-user')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
    });
  });
});
