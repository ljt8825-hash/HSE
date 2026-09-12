/**
 * 测试: middleware/response.js
 * 覆盖: success() 和 error() 辅助函数
 */
const { success, error } = require('../../middleware/response');

describe('response 辅助函数', () => {

  describe('success()', () => {
    test('默认参数返回正确结构', () => {
      const result = success();
      expect(result).toEqual({
        code: 0,
        success: true,
        message: '操作成功',
        data: null
      });
    });

    test('传入 data 和 message', () => {
      const result = success({ id: 1, name: '测试' }, '查询成功');
      expect(result.code).toBe(0);
      expect(result.success).toBe(true);
      expect(result.message).toBe('查询成功');
      expect(result.data).toEqual({ id: 1, name: '测试' });
    });

    test('data 为数组', () => {
      const arr = [1, 2, 3];
      const result = success(arr);
      expect(result.data).toEqual(arr);
    });

    test('data 为 null', () => {
      const result = success(null, '无数据');
      expect(result.data).toBeNull();
      expect(result.message).toBe('无数据');
    });
  });

  describe('error()', () => {
    test('默认参数返回正确结构', () => {
      const result = error();
      expect(result).toEqual({
        code: -1,
        success: false,
        message: '操作失败',
        data: null
      });
    });

    test('自定义 code 和 message', () => {
      const result = error(-429, '请求过于频繁');
      expect(result.code).toBe(-429);
      expect(result.success).toBe(false);
      expect(result.message).toBe('请求过于频繁');
    });

    test('传入 data 附加信息', () => {
      const result = error(-2, '入库失败', { inserted: 5, failed: 3 });
      expect(result.data).toEqual({ inserted: 5, failed: 3 });
    });
  });
});
