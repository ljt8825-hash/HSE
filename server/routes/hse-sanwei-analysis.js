/**
 * 三违分析「三违照片信息统计台账」月度分数（乡镇作业中心经理版）
 *   POST /api/hse/sanwei-analysis/import    json: year(年) + month(月) —— 从服务器目录按月导入三违分数
 *   GET  /api/hse/sanwei-analysis/list     query: month/year/town/keyword/page/page_size —— 月度三违分数台账
 *
 * 导入核心逻辑集中在 services/sanweiAnalysisImport.js（本路由与批量回填共用）：
 *   - 扫描服务器目录 <根>/<YYYY>年/<M>月 下的「乡镇作业中心经理月度考核」Excel
 *   - 仅解析工作簿内名含「三违照片」的工作表，取「总」未完成次数与「扣分」分数
 *   - 乡镇按表头列回填「乡镇作业中心经理」姓名/employee_id
 *   - 全量覆盖：目标月份先软删旧行再插入有效行（事务）
 */
const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { runImport, normMonth2, resolveManager } = require('../services/sanweiAnalysisImport');
const { getAdminRoster, listAdminMonths } = require('../services/sanweiAdminRoster');
const { deriveMonth } = require('../services/sanweiLedgerDerive');
// 公司查处扣分·共享口径（与「三违管理考核」共用，保证两处数值与乡镇归属完全一致）
const { buildCompanyDeduct, cleanVName } = require('../services/companyViolationDeduct');

const router = express.Router();

router.post(
  '/import',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const year = Number(req.body?.year);
    const month = Number(req.body?.month);
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ success: false, code: 400, message: '参数需为 year(年) 与 month(月)' });
    }
    try {
      const result = await runImport(normMonth2(year, month));
      return res.json({ success: true, code: 0, data: result });
    } catch (e) {
      const status = e.status || 500;
      console.error('[sanwei-analysis/import]', e.message);
      return res.status(status).json({ success: false, code: status, message: e.message });
    }
  }
);

// GET /api/hse/sanwei-analysis/list?month=YYYY-MM&town=&keyword=&page=1&page_size=20
router.get('/list', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { month = '', town = '', keyword = '' } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.page_size, 10) || 200));

    const conds = ['is_deleted = FALSE'];
    const params = [];
    if (/^\d{4}-\d{2}$/.test(String(month).trim())) {
      params.push(String(month).trim());
      conds.push(`month = $${params.length}`);
    }
    if (String(town).trim()) {
      params.push(`%${String(town).trim()}%`);
      conds.push(`town LIKE $${params.length}`);
    }
    if (String(keyword).trim()) {
      const kw = `%${String(keyword).trim()}%`;
      params.push(kw);
      conds.push(`(manager_name LIKE $${params.length} OR town LIKE $${params.length})`);
    }
    const where = conds.join(' AND ');

    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hse_sanwei_score_monthly WHERE ${where}`,
      params
    );
    const total = cnt.rows.length ? cnt.rows[0].c : 0;

    // 一次取出全部命中行（月度数据 = 12 乡镇 × 月份，量小），分页在 JS 内切片；汇总基于全量
    const q = await pool.query(
      `SELECT id, month, town, manager_name, employee_id, defect_count, photo_defect, info_defect, score, not_assessed, created_at
         FROM hse_sanwei_score_monthly
        WHERE ${where} ORDER BY month DESC, town`,
      params
    );

    // 「检查数量」= 该乡镇作业中心经理该月在「三违台账」(grid_inspection_records) 中
    // 由其「本人」作为检查人(personnel_name) 的记录条数 —— 只统计经理自己的，不含整个乡镇。
    // 归因：personnel_name 精确命中该行经理姓名；inspector_employee_id 基本未回填，无法用员工ID关联。
    // 网格长等其他检查人的记录不进入任何经理的「检查数量」。
    const checkCountMap = new Map(); // key: `${month}|${managerName}` -> 检查数量
    try {
      const mgrSet = new Set(
        (q.rows || [])
          .map((r) => r.manager_name)
          .filter(Boolean)
          .map((n) => String(n).trim())
          .filter(Boolean)
      );
      const cc = await pool.query(
        `SELECT to_char(inspection_date, 'YYYY-MM') AS m, TRIM(personnel_name) AS pn, COUNT(*)::int AS c
           FROM grid_inspection_records
          WHERE inspection_date IS NOT NULL AND personnel_name IS NOT NULL AND TRIM(personnel_name) <> ''
          GROUP BY 1, 2`
      );
      for (const row of cc.rows || []) {
        const pn = String(row.pn).trim();
        if (!pn || !mgrSet.has(pn)) continue; // 仅本人为检查人的记录才算数
        const key = `${row.m}|${pn}`;
        checkCountMap.set(key, (checkCountMap.get(key) || 0) + (Number(row.c) || 0));
      }
    } catch { /* grid_inspection_records 缺失时检查数量统一为 0 */ }

    // 「公司查处扣分」= 公司管理（总网格长+一级网格长）查处该乡镇班组三违所扣分数（共享口径，见 services/companyViolationDeduct.js）
    const candidateTowns = [...new Set((q.rows || []).map((r) => r.town).filter(Boolean))];
    const { map: companyDeductMap, unresolved: companyUnresolved } = await buildCompanyDeduct({ candidateTowns });

    // 「所属部门」= 从花名册拉取乡镇作业中心经理的部门名（如「柴胡店镇乡镇作业中心」）。
    // 归因优先级：employee_id 精确命中花名册 org_name；未回填员工时用 town 与 org_name 双向互含最长匹配兜底。
    // 命名口径：仅 town_center 级组织在「作业中心」前插入「乡镇」→「xx镇乡镇作业中心」；
    // 环卫作业中心等 center 级组织保持原样（不参与台账行匹配）。
    const deptByEmployee = new Map(); // employee_id -> 部门名
    const centerOrgs = new Set();     // 乡镇作业中心经理去重部门名（xx镇乡镇作业中心）
    try {
      const dept = await pool.query(
        `SELECT DISTINCT employee_id, org_name, org_type
           FROM v_employee_org_full
          WHERE relation_status = 'active' AND position_name = '乡镇作业中心经理'
            AND org_name IS NOT NULL AND TRIM(org_name) <> ''`
      );
      const townList = [...new Set((q.rows || []).map((r) => r.town).filter(Boolean))];
      for (const row of dept.rows || []) {
        let orgName = String(row.org_name).trim();
        if (row.org_type === 'town_center') {
          orgName = orgName.replace(/作业中心$/, '乡镇作业中心');
        }
        if (row.employee_id != null) deptByEmployee.set(String(row.employee_id), orgName);
        for (const t of townList) {
          if (orgName.includes(t) && orgName.endsWith('作业中心')) centerOrgs.add(orgName);
        }
      }
    } catch { /* v_employee_org_full 缺失时所属部门回退为台账 town */ }

    const all = (q.rows || []).map((r) => {
      const town = r.town;
      const managerName = String(r.manager_name || '').trim();
      // 部门：employee_id 精确匹配 → 花名册 org_name；否则 town 双向匹配花名册「xx作业中心」
      let department = town || '';
      const byEmp = r.employee_id != null ? deptByEmployee.get(String(r.employee_id)) : undefined;
      if (byEmp) {
        department = byEmp;
      } else {
        let best = '';
        let maxLen = 0;
        for (const org of centerOrgs) {
          if ((org.includes(town) || town.includes(org)) && org.length > maxLen) {
            best = org;
            maxLen = org.length;
          }
        }
        if (best) department = best;
      }
      return {
        id: r.id,
        month: r.month,
        town,
        department,                       // 所属部门（花名册「xx镇作业中心」）
        managerName: r.manager_name,
        employeeId: r.employee_id,
        matched: !!r.employee_id,
        defectCount: Number(r.defect_count) || 0,   // 未完成项数（2026-08 后列表列）
        photoDefect: Number(r.photo_defect) || 0,   // 「照片」未完成(×)次数（2026-07 前列表列）
        infoDefect: Number(r.info_defect) || 0,     // 「违章信息」未完成(×)次数（2026-07 前列表列）
        // 三违考核分数：该月三违考核未实施时强制 0（保留成绩数据，标注「不考核」）
        notAssessed: !!r.not_assessed,
        score: r.not_assessed ? 0 : (Number(r.score) || 0),
        inspectionCount: (managerName ? checkCountMap.get(`${r.month}|${managerName}`) : 0) || 0, // 检查数量（该经理解检查记录条数）
        // 公司查处扣分：公司管理(总+一级网格长)当月查处该乡镇三违扣分合计（头盔起×5 + 其他起×1）+ 逐条明细
        companyDeduct: {
          score: companyDeductMap.get(`${r.month}|${town}`)?.score || 0,
          helmetCount: companyDeductMap.get(`${r.month}|${town}`)?.helmetCount || 0,
          otherCount: companyDeductMap.get(`${r.month}|${town}`)?.otherCount || 0,
          details: companyDeductMap.get(`${r.month}|${town}`)?.details || [],
        },
        created_at: r.created_at,
      };
    });

    // 汇总（全量）：总行数 / 有扣分行数 / 扣分合计 / 未回填考核对象行数
    const summary = all.reduce(
      (acc, row) => {
        acc.total++;
        if (row.score > 0) {
          acc.deducted++;
          acc.deductSum = Math.round((acc.deductSum + row.score) * 100) / 100;
        }
        if (!row.matched) acc.unmatched++;
        return acc;
      },
      { total: 0, deducted: 0, deductSum: 0, unmatched: 0 }
    );

    const list = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    // 指定月份查不到台账 → 视为满分（0扣分）
    const fullMarks = total === 0 && /^\d{4}-\d{2}$/.test(String(month).trim());

    res.json({
      success: true, code: 0,
      data: {
        list, total, page, page_size: pageSize, summary, fullMarks,
        fullMarksNote: '该月无「三违照片信息统计台账」，按满分（0扣分）处理',
        companyUnresolved, // 公司查处·待人工审核的违章人名（冻结归并/花名册/人工映射均未命中）
      },
    });
  } catch (e) {
    console.error('[sanwei-analysis/list]', e.message);
    res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

// ===================== 公司查处·违章人人工审核（落库持久化） =====================

// GET /api/hse/sanwei-analysis/company-deduct/employee-search?keyword=
// 花名册姓名模糊搜索（人工审核选人用）；按姓名匹配，最多 20 条，附所属部门
router.get('/company-deduct/employee-search', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const kw = String(req.query.keyword || '').trim();
    if (!kw) return res.json({ success: true, code: 0, data: { list: [] } });
    const r = await pool.query(
      `SELECT id, name, roster_department FROM employee
        WHERE is_deleted = FALSE AND name ILIKE '%' || $1 || '%'
        ORDER BY name LIMIT 20`,
      [kw]
    );
    return res.json({
      success: true, code: 0,
      data: {
        list: (r.rows || []).map((x) => ({
          employeeId: x.id,
          name: x.name,
          department: String(x.roster_department || '').trim(),
        })),
      },
    });
  } catch (e) {
    console.error('[sanwei-analysis/employee-search]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

/**
 * POST /api/hse/sanwei-analysis/company-deduct/resolution —— 人工审核保存/更新
 * body: { source_name, employee_id?, remark? }
 *   - employee_id 提供 → 该违章人名归到该花名册员工（计入该员工乡镇的公司查处扣分）
 *   - employee_id 省略/null → 判定「确无此人/不计入」（抑制，不再进待审核）
 * 审核人取自 req.user（留痕）；source_name 唯一，重复提交即更新。
 */
router.post('/company-deduct/resolution', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const source_name = cleanVName(req.body?.source_name);
    if (!source_name) return res.status(400).json({ success: false, code: 400, message: 'source_name 必填' });
    let employee_id = req.body?.employee_id == null ? null : parseInt(req.body.employee_id, 10);
    if (employee_id != null && !Number.isFinite(employee_id)) {
      return res.status(400).json({ success: false, code: 400, message: 'employee_id 需为数字' });
    }
    const remark = String(req.body?.remark || '').trim();
    const resolvedBy = String(req.user?.account || req.user?.username || req.user?.id || '').trim();

    // 若给了 employee_id，校验员工存在并冗余取名
    let employee_name = '';
    if (employee_id != null) {
      const em = await pool.query(
        `SELECT id, name FROM employee WHERE id = $1 AND is_deleted = FALSE`, [employee_id]
      );
      if (!em.rows.length) {
        return res.status(400).json({ success: false, code: 400, message: '该员工不存在或被删除' });
      }
      employee_name = em.rows[0].name;
    }

    await pool.query(
      `INSERT INTO hse_violator_name_resolution (source_name, employee_id, employee_name, remark, resolved_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (source_name) DO UPDATE
          SET employee_id = EXCLUDED.employee_id,
              employee_name = EXCLUDED.employee_name,
              remark = EXCLUDED.remark,
              resolved_by = EXCLUDED.resolved_by,
              updated_at = now()`,
      [source_name, employee_id, employee_name || null, remark || null, resolvedBy]
    );
    return res.json({
      success: true, code: 0,
      data: { sourceName: source_name, resolvedToEmployee: employee_id != null, suppressed: employee_id == null },
    });
  } catch (e) {
    console.error('[sanwei-analysis/resolution]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

/**
 * DELETE /api/hse/sanwei-analysis/company-deduct/resolution?source_name=
 * 撤销一笔人工审核（使违章人名回到「待审核」状态）
 */
router.delete('/company-deduct/resolution', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const source_name = cleanVName(req.query.source_name);
    if (!source_name) return res.status(400).json({ success: false, code: 400, message: 'source_name 必填' });
    const r = await pool.query(
      `DELETE FROM hse_violator_name_resolution WHERE source_name = $1 RETURNING id`, [source_name]
    );
    return res.json({ success: true, code: 0, data: { deleted: r.rowCount > 0 } });
  } catch (e) {
    console.error('[sanwei-analysis/resolution DELETE]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

// GET /api/hse/sanwei-analysis/admin-months
// 返回目录下存在《管理员月度考核结果》Excel 的月份（YYYY-MM，倒序），供前端月份下拉并入管理员月
router.get('/admin-months', authMiddleware, requireRole('admin', 'safety_manager'), async (_req, res) => {
  try {
    const months = listAdminMonths();
    return res.json({ success: true, code: 0, data: { months } });
  } catch (e) {
    console.error('[sanwei-analysis/admin-months]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

// GET /api/hse/sanwei-analysis/admin-roster?month=YYYY-MM
// 管理员名单：2026-07(含)前从《管理员月度考核结果》主表「被考核人」按月解析名单+三违扣分，并按姓名匹配系统管理员
// （表中有但系统无 → 标记未匹配；系统有但当月表无 → removedNames，前端该月不展示）。2026-08 起返回 outOfRange，前端沿用系统花名册。
router.get('/admin-roster', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const result = await getAdminRoster(month);
    return res.json({ success: true, code: 0, data: result });
  } catch (e) {
    const status = e.status || 500;
    console.error('[sanwei-analysis/admin-roster]', e.message);
    return res.status(status).json({ success: false, code: status, message: e.message });
  }
});

/**
 * POST /api/hse/sanwei-analysis/continue —— 空月份自动延续生成（幂等）
 * body: { month: 'YYYY-MM' }
 *
 * 诉求：后期系统录入时每个月自动生成本月页面，供人工在系统里改，不再依赖 Excel 导入。
 * 仅对 ≥2026-08 的月份生效（历史月份保留 Excel 导入覆盖模式，避免误覆盖补录数据）。
 * 逻辑：目标月已有非删除行 → 不重复生成；否则以最新近源月(< 目标月 的最大月)为基准，
 *   1) 用目标月「三违台账」（grid_inspection_records）聚合各乡镇未完成整改 → 行（优先）
 *   2) 未被聚合覆盖、但源月存在的乡镇 → 延续源月数据（补全页面）
 *   聚合出的行与延续行均写入 hse_sanwei_score_monthly（真三违口径），人工可后续编辑。
 */
router.post(
  '/continue',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const month = String(req.body?.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) {
      return res.status(400).json({ success: false, code: 400, message: '月份格式需为 YYYY-MM 且月为 1-12' });
    }
    // 历史月份保留 Excel 导入模式，不做自动延续
    if (month < '2026-08') {
      return res.json({
        success: true, code: 0,
        data: { month, sourceMonth: null, generated: false, existing: 0, inserted: 0 },
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) 幂等：目标月已有非删除行 → 不生成
      const existRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM hse_sanwei_score_monthly WHERE month = $1 AND is_deleted = FALSE`,
        [month]
      );
      const existing = existRes.rows.length ? existRes.rows[0].c : 0;
      if (existing > 0) {
        await client.query('COMMIT');
        return res.json({
          success: true, code: 0,
          data: { month, sourceMonth: null, generated: false, existing, inserted: 0 },
        });
      }

      // 2) 最近有数据的源月（< month 的最大月）
      const srcRes = await client.query(
        `SELECT MAX(month) AS m FROM hse_sanwei_score_monthly WHERE month < $1 AND is_deleted = FALSE`,
        [month]
      );
      const sourceMonth = srcRes.rows.length ? srcRes.rows[0].m : null;
      if (!sourceMonth) {
        await client.query('COMMIT');
        return res.json({
          success: true, code: 0,
          data: { month, sourceMonth: null, generated: false, existing: 0, inserted: 0 },
        });
      }

      // 3) 目标月「三违台账」聚合（优先）
      const { towns: aggregatedTowns } = await deriveMonth(client, month);
      // 聚合行 town 为候选名（「XX作业中心」），归一化为既有台账短名（「XX镇」），
      // 保证与源月延续行（短名）按同一 key 合并，避免同一乡镇出现两行、且落库命名与历史一致。
      const aggTowns = aggregatedTowns.map((t) => ({
        ...t,
        town: t.town.replace(/作业中心$/, ''),
      }));
      const aggregatedMap = new Map(aggTowns.map((t) => [t.town, t]));

      // 4) 源月数据（延续未被聚合覆盖的乡镇）
      const srcTownsRes = await client.query(
        `SELECT town, manager_name, employee_id, defect_count, photo_defect, info_defect, score
           FROM hse_sanwei_score_monthly WHERE month = $1 AND is_deleted = FALSE`,
        [sourceMonth]
      );
      const sourceTowns = srcTownsRes.rows || [];

      // 5) 合并：先聚合行，再补源月延续行
      const targetTowns = aggTowns.map((t) => ({ ...t, from: 'aggregated' }));
      for (const srcTown of sourceTowns) {
        if (!aggregatedMap.has(srcTown.town)) {
          targetTowns.push({
            town: srcTown.town,
            defectCount: Number(srcTown.defect_count) || 0,
            photoDefect: Number(srcTown.photo_defect) || 0,
            infoDefect: Number(srcTown.info_defect) || 0,
            score: Number(srcTown.score) || 0,
            managerName: srcTown.manager_name,
            employeeId: srcTown.employee_id,
            from: 'continued',
          });
        }
      }

      // 6) upsert 目标月
      let inserted = 0;
      const insertQuery = `
        INSERT INTO hse_sanwei_score_monthly
          (month, town, manager_name, employee_id, defect_count, photo_defect, info_defect, score, is_deleted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)
        ON CONFLICT (month, town) DO UPDATE
           SET manager_name=EXCLUDED.manager_name, employee_id=EXCLUDED.employee_id,
               defect_count=EXCLUDED.defect_count, photo_defect=EXCLUDED.photo_defect,
               info_defect=EXCLUDED.info_defect, score=EXCLUDED.score, is_deleted=FALSE`;
      for (const town of targetTowns) {
        let { managerName, employeeId } = town;
        if (!managerName && !employeeId) {
          const mgr = await resolveManager(client, town.town);
          managerName = mgr.managerName;
          employeeId = mgr.employeeId;
        }
        await client.query(insertQuery, [
          month,
          town.town,
          managerName || '',
          employeeId || null,
          town.defectCount || 0,
          town.photoDefect || 0,
          town.infoDefect || 0,
          town.score || 0,
        ]);
        inserted++;
      }

      await client.query('COMMIT');
      return res.json({
        success: true, code: 0,
        data: { month, sourceMonth, generated: true, existing: 0, inserted },
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[sanwei-analysis/continue]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    } finally {
      client.release();
    }
  }
);

module.exports = router;