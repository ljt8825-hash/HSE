/**
 * requireRole 中间件直接单元测试（任务2 第1条）
 * 覆盖：可变参数式 / 数组式 / 未认证 401 / 角色不允许 403 / 空集合与非法参数 fail-closed。
 * 纯函数测试，不涉及数据库。中间件为同步执行，直接捕获 next/status。
 */
const { requireRole } = require('../middleware/auth');

function invoke(mw, user) {
  const req = { user };
  let statusCode = null;
  let body = null;
  let nexted = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    },
  };
  mw(req, res, () => { nexted = true; });
  return { nexted, statusCode, body };
}

describe('requireRole 中间件契约', () => {
  test('可变参数式允许 admin 与 safety_manager', () => {
    const mw = requireRole('admin', 'safety_manager');
    for (const role of ['admin', 'safety_manager']) {
      const r = invoke(mw, { id: 1, username: 'u', role });
      expect(r.nexted).toBe(true);
    }
  });

  test('数组式允许相同角色', () => {
    const mw = requireRole(['admin', 'safety_manager']);
    for (const role of ['admin', 'safety_manager']) {
      const r = invoke(mw, { id: 1, username: 'u', role });
      expect(r.nexted).toBe(true);
    }
  });

  test('未认证返回 401', () => {
    const mw = requireRole('admin', 'safety_manager');
    const r = invoke(mw, null);
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  test('不允许的角色返回 403', () => {
    const mw = requireRole('admin', 'safety_manager');
    const r = invoke(mw, { id: 2, username: 'v', role: 'viewer' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('空集合 fail-closed（不意外放行）', () => {
    const mw = requireRole();
    const r = invoke(mw, { id: 1, username: 'admin', role: 'admin' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('合法角色 + 非法值混合：整体 fail-closed，admin 也不放行', () => {
    const mw = requireRole([123, null], 'admin');
    const r = invoke(mw, { id: 1, username: 'admin', role: 'admin' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('全非法参数时 fail-closed 不意外放行', () => {
    const mw = requireRole([123, null]);
    const r = invoke(mw, { id: 1, username: 'admin', role: 'admin' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('二层嵌套数组不放行（不扁平化二层）', () => {
    const mw = requireRole(['admin', ['safety_manager']]);
    const r = invoke(mw, { id: 1, username: 'admin', role: 'admin' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('空字符串角色导致整体 fail-closed', () => {
    const mw = requireRole('admin', '');
    const r = invoke(mw, { id: 1, username: 'admin', role: 'admin' });
    expect(r.nexted).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  test('混合数组式与可变参数式去重', () => {
    const mw = requireRole(['admin'], 'admin', 'safety_manager');
    const r = invoke(mw, { id: 1, username: 'a', role: 'admin' });
    expect(r.nexted).toBe(true);
  });
});
