const { paginationSchema, idParamSchema, keywordSchema, statusQuerySchema } = require('./common');

describe('common schemas', () => {
  describe('paginationSchema', () => {
    it('should use defaults when no params provided', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    });

    it('should coerce string numbers', () => {
      const result = paginationSchema.safeParse({ page: '3', pageSize: '50' });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    });

    it('should fail when page < 1', () => {
      const result = paginationSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should fail when page > 1000', () => {
      const result = paginationSchema.safeParse({ page: 1001 });
      expect(result.success).toBe(false);
    });

    it('should fail when pageSize > 200', () => {
      const result = paginationSchema.safeParse({ pageSize: 201 });
      expect(result.success).toBe(false);
    });

    it('should fail with non-numeric page', () => {
      const result = paginationSchema.safeParse({ page: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('idParamSchema', () => {
    it('should accept valid positive integer', () => {
      const result = idParamSchema.safeParse({ id: 42 });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(42);
    });

    it('should coerce string id', () => {
      const result = idParamSchema.safeParse({ id: '123' });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(123);
    });

    it('should fail for zero', () => {
      expect(idParamSchema.safeParse({ id: 0 }).success).toBe(false);
    });

    it('should fail for negative', () => {
      expect(idParamSchema.safeParse({ id: -1 }).success).toBe(false);
    });

    it('should fail for non-numeric', () => {
      expect(idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });
  });

  describe('keywordSchema', () => {
    it('should accept valid keyword', () => {
      const result = keywordSchema.safeParse({ keyword: 'search term' });
      expect(result.success).toBe(true);
    });

    it('should accept empty keyword', () => {
      const result = keywordSchema.safeParse({ keyword: '' });
      expect(result.success).toBe(true);
    });

    it('should accept missing keyword', () => {
      const result = keywordSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should fail for too long keyword', () => {
      const result = keywordSchema.safeParse({ keyword: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('statusQuerySchema', () => {
    it('should accept valid status', () => {
      const result = statusQuerySchema.safeParse({ status: 'active' });
      expect(result.success).toBe(true);
    });

    it('should accept empty status', () => {
      const result = statusQuerySchema.safeParse({ status: '' });
      expect(result.success).toBe(true);
    });

    it('should accept missing status', () => {
      const result = statusQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
