/**
 * 类别扣分上限路由（一期）
 *
 * 把「最大扣分」从规则层上移到类别层：
 *   类别（如 三违管理=40）统一承载该类别下的扣分上限，
 *   类别下所有启用的扣分规则合计不超过此上限。
 *
 * 对应表：hse_assessment_category_limit
 * 端点：
 *   GET  /limits          类别扣分上限列表（含规则数 / 启用规则数）
 *   POST /limits          全量保存类别上限（可新增/修改/删除行）
 *                         载荷：[{category, max_deduct|null, rule_count|null}]
 *                         —— 全量替换语义：提交列表即表的最终内容（不在列表中的旧行被删除）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// 「扣分对象（扣谁）」字段：self=扣本人 / manager=传导到乡镇作业中心经理 / admin=管理员 / 其它=自定义
// 「考核对象岗位(role)」字段：manager=乡镇作业中心经理 / admin=管理员（2026-09-05 起类别上限按岗位分设两套）
// 幂等确保列存在（随项目 ensureTables 约定，运行期自愈，无需手动迁移）
let schemaInitialized = false;
async function ensureSchema() {
  if (schemaInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(
      `ALTER TABLE hse_assessment_category_limit
       ADD COLUMN IF NOT EXISTS deduct_target VARCHAR(64) DEFAULT 'self'`
    );
    // 岗位维度：manager=乡镇作业中心经理 / admin=管理员；历史行回填为 manager（保持既有语义）
    await pool.query(
      `ALTER TABLE hse_assessment_category_limit
       ADD COLUMN IF NOT EXISTS target_role VARCHAR(20) NOT NULL DEFAULT 'manager'`
    );
    await pool.query(
      `UPDATE hse_assessment_category_limit SET target_role = 'manager'
        WHERE target_role NOT IN ('manager','admin')`
    );
    // 兼容建库早期唯一约束仅覆盖 (category)，加角色后升级为 (category, target_role)
    // 注：早期建库 SQL 的约束名为 uq_category_limit（UNIQUE (category)），后期改为
    // hse_assessment_category_limit_category_key，两者都需移除，否则跨岗位同类别无法各自落库。
    try {
      await pool.query(`DROP CONSTRAINT IF EXISTS uq_category_limit`);
    } catch { /* 约束名不存在时忽略 */ }
    try {
      await pool.query(`DROP CONSTRAINT IF EXISTS hse_assessment_category_limit_category_key`);
    } catch { /* 约束名不存在时忽略 */ }
    // 保证 ON CONFLICT (category, target_role) 走唯一索引（跨岗位同类目可各存一套）
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS hse_assessment_category_limit_cat_role_key
       ON hse_assessment_category_limit (category, target_role)`
    );
    schemaInitialized = true;
  } catch {
    /* 表未就绪时静默，待 GET/POST 幂等兜底 */
  }
}

// 解析岗位参数：manager=乡镇作业中心经理 / admin=管理员，缺省 manager（兼容既有调用方）
function normRole(raw) {
  const v = String(raw || '').trim();
  return v === 'admin' ? 'admin' : 'manager';
}

// GET /limits — 类别扣分上限列表（含每类别启用/全部规则数）
// 支持 role=manager|admin 按岗位取套；缺省 manager（兼容既有调用方）
router.get('/limits', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    await ensureSchema();
    const role = normRole(req.query.role);
    const rows = await pool.query(
      `SELECT c.id, c.category, c.max_deduct, c.remark, c.rule_count, c.rule_names, c.rule_items, c.sort_order, c.deduct_target, c.target_role,
              (SELECT COUNT(*)::int FROM hse_assessment_rule r
                WHERE r.category = c.category AND r.is_deleted = FALSE)::int AS rule_total,
              (SELECT COUNT(*)::int FROM hse_assessment_rule r
                WHERE r.category = c.category AND r.is_deleted = FALSE AND r.status = 'enabled')::int AS rule_enabled,
              COALESCE((SELECT json_agg(r.rule_name ORDER BY r.priority DESC, r.rule_code)
                        FROM hse_assessment_rule r
                        WHERE r.category = c.category AND r.is_deleted = FALSE), '[]') AS rule_names_derived,
              COALESCE((SELECT json_agg(r.deduct_score ORDER BY r.priority DESC, r.rule_code)
                        FROM hse_assessment_rule r
                        WHERE r.category = c.category AND r.is_deleted = FALSE), '[]') AS rule_scores_derived,
              COALESCE((SELECT json_agg(r.status ORDER BY r.priority DESC, r.rule_code)
                        FROM hse_assessment_rule r
                        WHERE r.category = c.category AND r.is_deleted = FALSE), '[]') AS rule_statuses_derived
       FROM hse_assessment_category_limit c
       WHERE c.target_role = $1
       ORDER BY c.sort_order NULLS LAST, c.max_deduct DESC NULLS LAST, c.category`,
      [role]
    );
    res.json(success(rows.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /limits — 全量保存类别上限（事务，支持新增/修改/删除行）
router.post('/limits', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    await ensureSchema();
    const role = normRole(req.query.role); // 岗位：manager|admin，缺省 manager
    const items = Array.isArray(req.body) ? req.body : [req.body];

    // 规范化每类别下的行级规则（考核内容/扣分/状态）；兼容旧数据（仅有 ruleNames 串）
    const normalizeRuleItems = (it) => {
      if (Array.isArray(it.ruleItems)) {
        return it.ruleItems
          .map((x) => ({
            name: String(x.name || '').trim(),
            deductScore:
              x.deductScore == null || x.deductScore === ''
                ? null
                : Number(x.deductScore),
            status: x.status === 'disabled' ? 'disabled' : 'enabled',
          }))
          .filter((x) => x.name);
      }
      return String(it.ruleNames || '')
        .split(/[、,，;；\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name, deductScore: null, status: 'enabled' }));
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 需求3：先把「类别改名」与「规则名称/扣分/状态」同步回规则表（基于每行提交的 originalCategory 基线）
      for (const it of items) {
        const category = String(it.category || '').trim();
        if (!category) continue;
        const originalCategory = it.originalCategory ? String(it.originalCategory).trim() : null;
        // 类别改名：把旧类别下的规则迁到新类别
        if (originalCategory && originalCategory !== category) {
          await client.query(
            `UPDATE hse_assessment_rule SET category = $1, updated_at = NOW()
             WHERE category = $2 AND is_deleted = FALSE`,
            [category, originalCategory]
          );
        }
        // 规则同步：按行（考核内容/扣分/状态）逐条对齐更新该类别下的规则；扣分为空则不覆盖原值
        const ruleItems = normalizeRuleItems(it);
        if (ruleItems.length) {
          const list = await client.query(
            `SELECT id FROM hse_assessment_rule
             WHERE category = $1 AND is_deleted = FALSE
             ORDER BY priority DESC, rule_code ASC
             LIMIT $2`,
            [category, ruleItems.length]
          );
          for (let i = 0; i < list.rows.length; i++) {
            const item = ruleItems[i];
            await client.query(
              `UPDATE hse_assessment_rule
               SET rule_name = $1,
                   deduct_score = CASE WHEN $3::numeric IS NOT NULL THEN $3::numeric ELSE deduct_score END,
                   status = $4,
                   updated_at = NOW()
               WHERE id = $2`,
              [item.name, list.rows[i].id, item.deductScore, item.status]
            );
          }
        }
      }

      // 全量替换语义（按岗位）：先清空该岗位，再按提交顺序写入（sort_order = 行序，供拖拽排序持久化）
      await client.query('DELETE FROM hse_assessment_category_limit WHERE target_role = $1', [role]);
      let cnt = 0;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const category = String(it.category || '').trim();
        if (!category) continue;
        const maxDeduct =
          it.maxDeduct === null || it.maxDeduct === undefined || it.maxDeduct === ''
            ? null
            : Number(it.maxDeduct);
        const ruleCount =
          it.ruleCount === null || it.ruleCount === undefined || it.ruleCount === ''
            ? null
            : Math.max(0, Math.round(Number(it.ruleCount)));
        const remark = it.remark ? String(it.remark) : null;
        const ruleItems = normalizeRuleItems(it);
        const ruleNames = ruleItems.length ? ruleItems.map((x) => x.name).join('、') : null;
        const ruleItemsJson = ruleItems.length ? JSON.stringify(ruleItems) : null;
        // 扣分对象：仅接受 self / manager / admin / 自定义文本，其余兜底为 self（本人）
        const rawTarget = it.deductTarget == null ? 'self' : String(it.deductTarget).trim();
        const deductTarget = ['self', 'manager', 'admin'].includes(rawTarget)
          ? rawTarget
          : (rawTarget || 'self');
        await client.query(
          `INSERT INTO hse_assessment_category_limit (category, max_deduct, rule_count, rule_names, rule_items, remark, deduct_target, target_role, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, NOW())
           ON CONFLICT (category, target_role) DO UPDATE
             SET max_deduct = EXCLUDED.max_deduct,
                 rule_count = EXCLUDED.rule_count,
                 rule_names = EXCLUDED.rule_names,
                 rule_items = EXCLUDED.rule_items,
                 remark     = EXCLUDED.remark,
                 deduct_target = EXCLUDED.deduct_target,
                 sort_order = EXCLUDED.sort_order,
                 updated_at = NOW()`,
          [category, maxDeduct, ruleCount, ruleNames, ruleItemsJson, remark, deductTarget, role, idx]
        );
        cnt += 1;
      }
      await client.query('COMMIT');
      res.json(success(cnt, '已保存 ' + cnt + ' 个类别上限（含规则同步）'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;