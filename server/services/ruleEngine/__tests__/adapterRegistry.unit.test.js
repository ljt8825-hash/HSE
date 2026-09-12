/**
 * 测试：services/ruleEngine/adapterRegistry.js
 * 覆盖：注册、按 key 获取、重复注册覆盖、列出全部 key、reset 清空。
 * 纯内存模块，无需数据库。
 */

const {
  registerAdapter,
  getAdapter,
  listActiveAdapterKeys,
  resetAdapters,
} = require('../adapterRegistry');

beforeEach(() => {
  // 每个用例从干净状态开始（注册表是模块级单例）
  resetAdapters();
});

afterAll(() => {
  // 归还干净状态，避免影响同进程内其他套件
  resetAdapters();
});

describe('adapterRegistry', () => {
  it('初始为空注册表', () => {
    expect(listActiveAdapterKeys()).toEqual([]);
    expect(getAdapter('grid_unchecked')).toBeNull();
  });

  it('注册后可按 key 获取', () => {
    const adapter = { key: 'grid_unchecked', scan: jest.fn() };
    registerAdapter('grid_unchecked', adapter);
    expect(getAdapter('grid_unchecked')).toBe(adapter);
    expect(listActiveAdapterKeys()).toEqual(['grid_unchecked']);
  });

  it('获取不存在的 key → null', () => {
    registerAdapter('grid_unchecked', { key: 'grid_unchecked' });
    expect(getAdapter('not_exist')).toBeNull();
  });

  it('重复注册同一 key → 后者覆盖前者', () => {
    const first = { key: 'grid_unchecked', version: 1 };
    const second = { key: 'grid_unchecked', version: 2 };
    registerAdapter('grid_unchecked', first);
    registerAdapter('grid_unchecked', second);

    expect(getAdapter('grid_unchecked')).toBe(second);
    expect(getAdapter('grid_unchecked').version).toBe(2);
    // 覆盖不应产生重复 key
    expect(listActiveAdapterKeys()).toHaveLength(1);
  });

  it('多适配器按注册顺序返回 key 列表', () => {
    registerAdapter('a_adapter', { key: 'a_adapter' });
    registerAdapter('b_adapter', { key: 'b_adapter' });
    registerAdapter('c_adapter', { key: 'c_adapter' });
    expect(listActiveAdapterKeys()).toEqual(['a_adapter', 'b_adapter', 'c_adapter']);
  });

  it('reset 清空注册表', () => {
    registerAdapter('grid_unchecked', { key: 'grid_unchecked' });
    resetAdapters();
    expect(listActiveAdapterKeys()).toEqual([]);
    expect(getAdapter('grid_unchecked')).toBeNull();
  });

  it('key 或 adapter 缺失 → 抛错（防止静默注册空适配器）', () => {
    expect(() => registerAdapter('', { key: 'x' })).toThrow();
    expect(() => registerAdapter(null, { key: 'x' })).toThrow();
    expect(() => registerAdapter('only_key')).toThrow();
    expect(() => registerAdapter('k', null)).toThrow();
    expect(listActiveAdapterKeys()).toEqual([]);
  });
});
