const { success, error } = require('./response');

describe('response middleware', () => {
  describe('success()', () => {
    it('should return success response with default values', () => {
      const result = success();
      expect(result.code).toBe(0);
      expect(result.success).toBe(true);
      expect(result.message).toBe('操作成功');
      expect(result.data).toBeNull();
    });

    it('should return success response with custom data and message', () => {
      const data = { id: 1, name: 'test' };
      const result = success(data, '创建成功');
      expect(result.code).toBe(0);
      expect(result.success).toBe(true);
      expect(result.message).toBe('创建成功');
      expect(result.data).toEqual(data);
    });

    it('should support null data with custom message', () => {
      const result = success(null, '删除成功');
      expect(result.data).toBeNull();
      expect(result.message).toBe('删除成功');
    });
  });

  describe('error()', () => {
    it('should return error response with default values', () => {
      const result = error();
      expect(result.code).toBe(-1);
      expect(result.success).toBe(false);
      expect(result.message).toBe('操作失败');
      expect(result.data).toBeNull();
    });

    it('should return error response with custom code and message', () => {
      const result = error(404, '资源不存在');
      expect(result.code).toBe(404);
      expect(result.success).toBe(false);
      expect(result.message).toBe('资源不存在');
    });

    it('should return error response with data', () => {
      const errors = [{ field: 'username', message: '必填' }];
      const result = error(400, '参数校验失败', errors);
      expect(result.code).toBe(400);
      expect(result.data).toEqual(errors);
    });
  });
});
