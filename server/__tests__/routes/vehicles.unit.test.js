/**
 * 测试: routes/vehicles — 内存模式 CRUD
 * 策略: mock isConnected() 返回 false，走内存路径，无需真实数据库
 */

// 在加载路由之前 mock db 模块
jest.mock('../../config/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  isConnected: () => false,
  testConnection: jest.fn(),
}));

// mock upload 模块（避免 multer 依赖问题）
jest.mock('../../middleware/upload', () => {
  const noopMiddleware = (req, res, next) => next();
  const uploader = { single: () => noopMiddleware, array: () => noopMiddleware };
  return {
    ensureDir: jest.fn(),
    deleteFile: jest.fn(),
    validateUploadedFile: jest.fn(),
    fixFilenameEncoding: jest.fn((name) => name),
    createUploader: jest.fn(() => ({ single: () => noopMiddleware, array: () => noopMiddleware })),
    uploadExcel: uploader,
    uploadImage: uploader,
    uploadDocument: uploader,
    uploadInsurance: uploader,
    uploadHazard: uploader,
  };
});

// mock auth 中间件（放行）：本套件目标是车辆 CRUD 内存模式，不测认证，
// 避免 app 全局 authMiddleware 将所有请求拦为 401。
jest.mock('../../middleware/auth', () => ({
  JWT_SECRET: 'test-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  generateAccessToken: jest.fn(() => 'mock-access-token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
  isTokenBlacklisted: jest.fn(() => false),
  blacklistToken: jest.fn(),
  cleanupBlacklist: jest.fn(),
  authMiddleware: (req, res, next) => next(),
  optionalAuthMiddleware: (req, res, next) => next(),
  requireRole: (...roles) => (req, res, next) => next(),
  ROLE_PERMISSIONS_MAP: {},
  getPermissionsForRole: jest.fn(() => []),
  requirePermission: (...perms) => (req, res, next) => next(),
  createPermissionMiddleware: jest.fn(() => (req, res, next) => next()),
}));

const request = require('supertest');
const app = require('../../app');

describe('车辆管理 API（内存模式）', () => {

  // GET /api/vehicles — 列表查询
  describe('GET /api/vehicles', () => {
    test('返回车辆列表，包含分页信息', async () => {
      const res = await request(app).get('/api/vehicles');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(Array.isArray(res.body.data.list)).toBe(true);
      expect(res.body.data.total).toBeGreaterThan(0);
    });

    test('支持关键词搜索', async () => {
      const res = await request(app).get('/api/vehicles?keyword=大众');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // 内存数据中有大众迈腾和大众帕萨特
      const list = res.body.data.list;
      list.forEach(v => {
        const matchPlate = v.plate && v.plate.includes('大众');
        const matchModel = v.model && v.model.includes('大众');
        const matchOwner = v.owner && v.owner.includes('大众');
        expect(matchPlate || matchModel || matchOwner).toBe(true);
      });
    });

    test('支持分页', async () => {
      const res = await request(app).get('/api/vehicles?page=1&pageSize=3');
      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeLessThanOrEqual(3);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(3);
    });

    test('支持保险类型筛选', async () => {
      const res = await request(app).get('/api/vehicles?insuranceType=交强险');
      expect(res.status).toBe(200);
      res.body.data.list.forEach(v => {
        expect(v.insurance_type).toBe('交强险');
      });
    });
  });

  // GET /api/vehicles/:id — 单条查询
  describe('GET /api/vehicles/:id', () => {
    test('返回指定车辆', async () => {
      const res = await request(app).get('/api/vehicles/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    test('不存在的 ID 返回失败', async () => {
      const res = await request(app).get('/api/vehicles/99999');
      expect(res.status).toBe(200);
      // 内存模式应返回记录不存在
      expect(res.body.success === false || res.body.data === null || !res.body.data.id).toBeTruthy();
    });
  });

  // POST /api/vehicles — 创建
  describe('POST /api/vehicles', () => {
    test('创建新车辆记录', async () => {
      const newVehicle = {
        plate: '鲁TEST01',
        vin: 'TESTVIN001',
        model: '测试车型',
        owner: '测试用户',
        insurance_type: '交强险',
        status: '在用'
      };
      const res = await request(app)
        .post('/api/vehicles')
        .send(newVehicle);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  // PUT /api/vehicles/:id — 更新
  describe('PUT /api/vehicles/:id', () => {
    test('更新车辆信息', async () => {
      const res = await request(app)
        .put('/api/vehicles/1')
        .send({ remark: '测试更新备注' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // DELETE /api/vehicles/:id — 删除
  describe('DELETE /api/vehicles/:id', () => {
    test('删除车辆（软删除）', async () => {
      const res = await request(app).delete('/api/vehicles/2');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
