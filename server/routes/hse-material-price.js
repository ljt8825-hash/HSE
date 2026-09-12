/**
 * 物资价格库路由（HSE · 安全费用预算及支出 → 三级菜单「物资价格库」）
 *
 * 端点（挂载于 /api/hse/material-price，全局 authMiddleware 已鉴权）：
 *   GET    /               列表（全部未删除，前端按 category 分组）
 *   POST   /               新增单条  { category, name, spec, unitPrice }
 *   POST   /batch          批量新增  { category, items: [{name, spec, unitPrice}] }
 *   PUT    /:id            更新单条  { name, spec, unitPrice }
 *   DELETE /:id            软删除
 *
 * 复用：middleware/response 的 success / error；全局 authMiddleware 注入 req.user。
 * 不修改其他模块，仅新增本文件并在 app.js 挂载。
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');

const VALID_CATEGORIES = ['fire', 'ad', 'safety', 'cert'];

// ── 初始化数据库表 ──
(async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_material_price (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL DEFAULT 'fire',
        name VARCHAR(200) NOT NULL,
        spec VARCHAR(200) DEFAULT '',
        unit_price NUMERIC(14,6) DEFAULT 0,
        measure_item VARCHAR(200) DEFAULT '',
        budget_subject VARCHAR(50) DEFAULT '',
        created_by VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    // 兼容已存在的旧表：补齐 2026-08-26 新增的措施项目/预算科目列
    await pool.query(
      `ALTER TABLE hse_material_price ADD COLUMN IF NOT EXISTS measure_item VARCHAR(200) DEFAULT ''`,
    );
    await pool.query(
      `ALTER TABLE hse_material_price ADD COLUMN IF NOT EXISTS budget_subject VARCHAR(50) DEFAULT ''`,
    );
    console.log('[MaterialPrice] 数据库表 hse_material_price 已就绪');
  } catch (err) {
    console.warn('[MaterialPrice] 数据库表初始化失败:', err.message);
  }
})();

// ── 行 → 前端 DTO ──
function toDTO(r) {
  return {
    id: String(r.id),
    category: r.category,
    name: r.name,
    spec: r.spec || '',
    unitPrice: Number(r.unit_price),
    measureItem: r.measure_item || '',
    budgetSubject: r.budget_subject || '',
  };
}

function currentUser(req) {
  const u = req.user || {};
  return u.username || u.realName || u.real_name || '';
}

// ══════════════ 路由 ══════════════

// GET /api/hse/material-price — 列表（全部未删除）
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM hse_material_price
       WHERE is_deleted = false
       ORDER BY category, id`,
    );
    const items = result.rows.map(toDTO);
    res.json(success({ items }, '查询成功'));
  } catch (err) {
    console.error('[MaterialPrice] 列表查询失败:', err.message);
    res.json(error(-1, '查询物资价格失败: ' + err.message));
  }
});

// POST /api/hse/material-price — 新增单条
router.post('/', async (req, res) => {
  try {
    const { category, name, spec, unitPrice } = req.body || {};
    if (!VALID_CATEGORIES.includes(category)) {
      return res.json(error(-1, '非法的分类'));
    }
    if (!name || !String(name).trim()) {
      return res.json(error(-1, '物资名称不能为空'));
    }
    const price = Number(unitPrice) || 0;
    const result = await pool.query(
      `INSERT INTO hse_material_price (category, name, spec, unit_price, measure_item, budget_subject, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        category,
        String(name).trim(),
        String(spec || '').trim(),
        price,
        String(req.body?.measureItem || '').trim(),
        String(req.body?.budgetSubject || '').trim(),
        currentUser(req),
      ],
    );
    res.json(success(toDTO(result.rows[0]), '新增成功'));
  } catch (err) {
    console.error('[MaterialPrice] 新增失败:', err.message);
    res.json(error(-2, '新增物资失败: ' + err.message));
  }
});

// POST /api/hse/material-price/batch — 批量新增（导入）
router.post('/batch', async (req, res) => {
  try {
    const { category, items } = req.body || {};
    if (!VALID_CATEGORIES.includes(category)) {
      return res.json(error(-1, '非法的分类'));
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.json(error(-1, '请传入要导入的物资列表'));
    }
    const created = [];
    for (const it of items) {
      const nm = it && it.name ? String(it.name).trim() : '';
      if (!nm) continue;
      const price = Number(it.unitPrice) || 0;
      const result = await pool.query(
        `INSERT INTO hse_material_price (category, name, spec, unit_price, measure_item, budget_subject, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          category,
          nm,
          String(it.spec || '').trim(),
          price,
          String(it.measureItem || '').trim(),
          String(it.budgetSubject || '').trim(),
          currentUser(req),
        ],
      );
      created.push(toDTO(result.rows[0]));
    }
    res.json(success(created, `成功导入 ${created.length} 条`));
  } catch (err) {
    console.error('[MaterialPrice] 批量导入失败:', err.message);
    res.json(error(-2, '批量导入失败: ' + err.message));
  }
});

// PUT /api/hse/material-price/:id — 更新单条
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json(error(-1, '无效的商品ID'));
    const { name, spec, unitPrice } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.json(error(-1, '物资名称不能为空'));
    }
    const price = Number(unitPrice) || 0;
    const result = await pool.query(
      `UPDATE hse_material_price
       SET name=$1, spec=$2, unit_price=$3, measure_item=$4, budget_subject=$5, updated_at=CURRENT_TIMESTAMP
       WHERE id=$6 AND is_deleted=false
       RETURNING *`,
      [
        String(name).trim(),
        String(spec || '').trim(),
        price,
        String(req.body?.measureItem || '').trim(),
        String(req.body?.budgetSubject || '').trim(),
        id,
      ],
    );
    if (result.rowCount === 0) return res.json(error(-2, '物资不存在或已删除'));
    res.json(success(toDTO(result.rows[0]), '更新成功'));
  } catch (err) {
    console.error('[MaterialPrice] 更新失败:', err.message);
    res.json(error(-3, '更新失败: ' + err.message));
  }
});

// DELETE /api/hse/material-price/:id — 软删除
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.json(error(-1, '无效的商品ID'));
    const result = await pool.query(
      `UPDATE hse_material_price
       SET is_deleted=true, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND is_deleted=false`,
      [id],
    );
    if (result.rowCount === 0) return res.json(error(-2, '物资不存在或已删除'));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error('[MaterialPrice] 删除失败:', err.message);
    res.json(error(-3, '删除失败: ' + err.message));
  }
});

module.exports = router;
