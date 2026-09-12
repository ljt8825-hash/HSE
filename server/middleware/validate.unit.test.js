const { z } = require('zod');
const { validate, validateBody, validateQuery, validateParams } = require('./validate');

describe('validate middleware', () => {
  const schema = z.object({
    username: z.string().min(2),
    age: z.number().int().min(1).max(120).optional(),
  });

  function mockReq(data) {
    return { body: {}, query: {}, params: {}, ...data };
  }

  function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  const next = jest.fn();

  beforeEach(() => {
    next.mockClear();
  });

  describe('validateBody', () => {
    it('should pass valid body data to next()', async () => {
      const req = mockReq({ body: { username: 'testuser', age: 25 } });
      const res = mockRes();
      const middleware = validateBody(schema);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body.username).toBe('testuser');
      expect(req.body.age).toBe(25);
    });

    it('should return 400 for invalid body', async () => {
      const req = mockReq({ body: { username: 'a' } });
      const res = mockRes();
      const middleware = validateBody(schema);
      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should return structured errors for Zod validation failures', async () => {
      const req = mockReq({ body: { username: '' } });
      const res = mockRes();
      const middleware = validateBody(schema);
      await middleware(req, res, next);
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.code).toBe(400);
      expect(jsonArg.errors).toBeDefined();
      expect(Array.isArray(jsonArg.errors)).toBe(true);
    });
  });

  describe('validateQuery', () => {
    it('should pass valid query data', async () => {
      const req = mockReq({ query: { username: 'testuser' } });
      const res = mockRes();
      const middleware = validateQuery(schema);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should validate query string and coerce types', async () => {
      const numSchema = z.object({ page: z.coerce.number().int().min(1) });
      const req = mockReq({ query: { page: '5' } });
      const res = mockRes();
      const middleware = validateQuery(numSchema);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(5);
    });
  });

  describe('validateParams', () => {
    it('should pass valid params', async () => {
      const idSchema = z.object({ id: z.coerce.number().int().min(1) });
      const req = mockReq({ params: { id: '42' } });
      const res = mockRes();
      const middleware = validateParams(idSchema);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.params.id).toBe(42);
    });

    it('should fail for invalid id', async () => {
      const idSchema = z.object({ id: z.coerce.number().int().min(1) });
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();
      const middleware = validateParams(idSchema);
      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
