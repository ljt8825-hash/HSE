/**
 * 测试: utils/excel.js
 * 覆盖: mapHeaders, cleanRow, parseDate, formatDate, formatMoney（纯函数，无需数据库）
 */
const ExcelUtils = require('../../utils/excel');

describe('ExcelUtils 纯函数测试', () => {

  // ========== mapHeaders ==========
  describe('mapHeaders()', () => {
    const aliasMap = {
      plate: ['车牌号', '车牌', 'plate'],
      owner: ['车主', '所有人'],
      premium: ['保费', '金额']
    };

    test('精确匹配表头', () => {
      const headers = ['车牌号', '车主', '保费'];
      const mapping = ExcelUtils.mapHeaders(headers, aliasMap);
      expect(mapping).toEqual({
        plate: '车牌号',
        owner: '车主',
        premium: '保费'
      });
    });

    test('别名匹配', () => {
      const headers = ['车牌', '所有人', '金额'];
      const mapping = ExcelUtils.mapHeaders(headers, aliasMap);
      expect(mapping.plate).toBe('车牌');
      expect(mapping.owner).toBe('所有人');
      expect(mapping.premium).toBe('金额');
    });

    test('包含匹配（表头包含别名）', () => {
      const headers = ['车牌号码', '车主姓名', '保费(元)'];
      const mapping = ExcelUtils.mapHeaders(headers, aliasMap);
      expect(mapping.plate).toBe('车牌号码');
      expect(mapping.owner).toBe('车主姓名');
      expect(mapping.premium).toBe('保费(元)');
    });

    test('未匹配的字段不出现在映射中', () => {
      const headers = ['未知列1', '未知列2'];
      const mapping = ExcelUtils.mapHeaders(headers, aliasMap);
      expect(Object.keys(mapping)).toHaveLength(0);
    });

    test('空表头返回空映射', () => {
      const mapping = ExcelUtils.mapHeaders([], aliasMap);
      expect(mapping).toEqual({});
    });

    test('单别名（非数组）也能工作', () => {
      const simpleAlias = { name: '姓名' };
      const mapping = ExcelUtils.mapHeaders(['姓名', '年龄'], simpleAlias);
      expect(mapping.name).toBe('姓名');
    });
  });

  // ========== cleanRow ==========
  describe('cleanRow()', () => {
    const mapping = { plate: '车牌号', owner: '车主', premium: '保费' };

    test('基本清洗', () => {
      const row = { '车牌号': '鲁N12345', '车主': '张三', '保费': '950' };
      const result = ExcelUtils.cleanRow(row, mapping);
      expect(result.valid).toBe(true);
      expect(result.data.plate).toBe('鲁N12345');
      expect(result.data.owner).toBe('张三');
    });

    test('null/undefined 值转为 null', () => {
      const row = { '车牌号': '鲁N12345', '车主': null, '保费': undefined };
      const result = ExcelUtils.cleanRow(row, mapping);
      expect(result.valid).toBe(true);
      expect(result.data.owner).toBeNull();
      expect(result.data.premium).toBeNull();
    });

    test('带类型配置的清洗', () => {
      const fieldsConfig = {
        premium: { type: 'number' },
        plate: { type: 'uppercase' }
      };
      const row = { '车牌号': '  鲁n12345  ', '车主': '张三', '保费': '950.50' };
      const result = ExcelUtils.cleanRow(row, mapping, fieldsConfig);
      expect(result.data.plate).toBe('鲁N12345');
      expect(result.data.premium).toBe(950.50);
    });

    test('必填字段为空时返回错误', () => {
      const fieldsConfig = { plate: { type: 'string', required: true } };
      const row = { '车牌号': '', '车主': '张三', '保费': '950' };
      const result = ExcelUtils.cleanRow(row, mapping, fieldsConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('plate');
    });
  });

  // ========== parseDate ==========
  describe('parseDate()', () => {
    test('YYYY-MM-DD 格式', () => {
      expect(ExcelUtils.parseDate('2024-01-15')).toBe('2024-01-15');
    });

    test('YYYY/MM/DD 格式', () => {
      expect(ExcelUtils.parseDate('2024/1/15')).toBe('2024-01-15');
    });

    test('YYYY.MM.DD 格式', () => {
      expect(ExcelUtils.parseDate('2024.01.15')).toBe('2024-01-15');
    });

    test('中文日期格式', () => {
      expect(ExcelUtils.parseDate('2024年1月15日')).toBe('2024-01-15');
    });

    test('空值返回 null', () => {
      expect(ExcelUtils.parseDate('')).toBeNull();
      expect(ExcelUtils.parseDate(null)).toBeNull();
      expect(ExcelUtils.parseDate(undefined)).toBeNull();
    });

    test('无法解析的字符串返回 null', () => {
      expect(ExcelUtils.parseDate('未知日期')).toBeNull();
    });
  });

  // ========== formatDate ==========
  describe('formatDate()', () => {
    test('有效日期格式化', () => {
      expect(ExcelUtils.formatDate('2024-01-15')).toBe('2024-01-15');
    });

    test('空值返回空字符串', () => {
      expect(ExcelUtils.formatDate('')).toBe('');
      expect(ExcelUtils.formatDate(null)).toBe('');
    });

    test('无效日期返回原字符串', () => {
      expect(ExcelUtils.formatDate('不是日期')).toBe('不是日期');
    });
  });

  // ========== formatMoney ==========
  describe('formatMoney()', () => {
    test('数字格式化为两位小数', () => {
      expect(ExcelUtils.formatMoney(950)).toBe('950.00');
      expect(ExcelUtils.formatMoney(3500.5)).toBe('3500.50');
    });

    test('字符串数字也能格式化', () => {
      expect(ExcelUtils.formatMoney('1234.5')).toBe('1234.50');
    });

    test('null/undefined 返回空字符串', () => {
      expect(ExcelUtils.formatMoney(null)).toBe('');
      expect(ExcelUtils.formatMoney(undefined)).toBe('');
    });

    test('非数字返回原字符串', () => {
      expect(ExcelUtils.formatMoney('免费')).toBe('免费');
    });
  });
});
