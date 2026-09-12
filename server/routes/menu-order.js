/**
 * 用户菜单拖拽排序 API
 * GET    /api/user/menu-order    → 获取当前用户的菜单排序
 * POST   /api/user/menu-order    → 保存用户自定义菜单排序
 * DELETE /api/user/menu-order    → 删除用户自定义排序（恢复默认）
 *
 * 安全策略:
 * - 只能操作当前登录用户的数据
 * - 用户 ID 从 JWT token 中解析(req.user.id),不可由客户端指定
 * - 防注入:使用参数化查询
 * - 数据校验:验证 orders 数组结构
 */
const express = require('express');
const router = express.Router();

const { success, error } = require('../middleware/response');
const { pool } = require('../config/db');

/** 最大菜单项数量 */
const MAX_ITEMS = 200;

/**
 * 校验 orders 数组
 * @param {Array} orders
 * @returns {string|null} 错误信息,null 表示通过
 */
function validateOrders(orders) {
  if (!Array.isArray(orders)) {
    return 'orders 必须为数组';
  }

  if (orders.length > MAX_ITEMS) {
    return `菜单数量不能超过 ${MAX_ITEMS} 个`;
  }

  const seen = new Set();
  for (let i = 0; i < orders.length; i++) {
    const item = orders[i];
    if (!item || typeof item !== 'object') {
      return `orders[${i}] 必须为对象`;
    }
    if (typeof item.path !== 'string' || item.path.length === 0 || item.path.length > 256) {
      return `orders[${i}].path 必须为非空字符串且长度不超过 256`;
    }
    if (!Number.isInteger(item.order) || item.order < 0) {
      return `orders[${i}].order 必须为非负整数`;
    }
    if (seen.has(item.path)) {
      return `orders[${i}].path "${item.path}" 重复`;
    }
    seen.add(item.path);
  }

  return null;
}

/**
 * GET /api/user/menu-order
 * 获取当前用户保存的菜单排序
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return error(res, '未识别用户身份', 401);
    }

    const result = await pool.query(
      'SELECT menu_order FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      return error(res, '用户不存在', 404);
    }

    const menuOrder = result.rows[0].menu_order;

    // 未设置过菜单排序时返回空数组
    if (!menuOrder) {
      return success(res, [], '使用默认菜单顺序');
    }

    return success(res, menuOrder, '获取成功');
  } catch (e) {
    console.error('[menu-order] GET 失败:', e);
    return next(e);
  }
});

/**
 * POST /api/user/menu-order
 * 保存用户自定义菜单排序
 * body: { orders: [{ path: string, order: number }] }
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return error(res, '未识别用户身份', 401);
    }

    const { orders } = req.body;

    // 校验
    const validationError = validateOrders(orders);
    if (validationError) {
      return error(res, validationError, 400);
    }

    // 写入数据库（参数化查询防注入）
    const result = await pool.query(
      'UPDATE users SET menu_order = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING id',
      [JSON.stringify(orders), userId],
    );

    if (result.rowCount === 0) {
      return error(res, '用户不存在或更新失败', 404);
    }

    return success(res, { success: true }, '菜单顺序已保存');
  } catch (e) {
    console.error('[menu-order] POST 失败:', e);
    return next(e);
  }
});

/**
 * DELETE /api/user/menu-order
 * 删除用户自定义排序（恢复默认）
 */
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return error(res, '未识别用户身份', 401);
    }

    await pool.query(
      'UPDATE users SET menu_order = NULL, updated_at = NOW() WHERE id = $1',
      [userId],
    );

    return success(res, { success: true }, '菜单顺序已重置');
  } catch (e) {
    console.error('[menu-order] DELETE 失败:', e);
    return next(e);
  }
});

module.exports = router;
