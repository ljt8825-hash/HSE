/**
 * HSE月度安全履职考核模块 · 导入导出服务（第11节 /export /import）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / xlsx / error）。
 * 复用共享：TABLES / CYCLE_STATUS / TARGET_STATUS / DEDUCTION_SOURCE /
 *           resolveRuleForDeductionRows / recordAudit；computeManualCapWarning（categoryCap）。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  CYCLE_STATUS,
  TARGET_STATUS,
  DEDUCTION_SOURCE,
  resolveRuleForDeductionRows,
  recordAudit,
} = require('./assessmentMonthlyShared');
const categoryCap = require('./ruleEngine/categoryCap');
const XLSX = require('xlsx');

// 11.1 导出考核结果
async function exportResults(cycleId) {
  try {
    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const results = await pool.query(
      `SELECT employee_name, employee_code, position, township, department,
              score_auto, score_manual, score_bonus, score_total, grade, 
              rank_township, rank_all, status, review_status
       FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE
       ORDER BY rank_all ASC, score_total DESC`,
      [cycleId]
    );

    const gradeStats = await pool.query(
      `SELECT grade, count(*) as count
       FROM ${TABLES.target}
       WHERE cycle_id = $1 AND is_deleted = FALSE AND grade IS NOT NULL
       GROUP BY grade
       ORDER BY grade`,
      [cycleId]
    );

    return {
      __t: 'json',
      payload: {
        cycle: camelKeys(cycleResult.rows[0]),
        total: results.rows.length,
        data: results.rows.map(camelKeys),
        grade_stats: gradeStats.rows.map(camelKeys),
        columns: [
          { key: 'employee_name', label: '姓名' },
          { key: 'employee_code', label: '工号' },
          { key: 'position', label: '岗位' },
          { key: 'township', label: '乡镇' },
          { key: 'department', label: '部门' },
          { key: 'score_auto', label: '自动分' },
          { key: 'score_manual', label: '人工分' },
          { key: 'score_bonus', label: '加分' },
          { key: 'score_total', label: '总分' },
          { key: 'grade', label: '等级' },
          { key: 'rank_township', label: '乡镇排名' },
          { key: 'rank_all', label: '全员排名' },
          { key: 'status', label: '状态' },
        ],
      },
      message: '导出数据获取成功',
    };
  } catch (e) {
    logger.error(`[assessment-export] 导出失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '导出考核结果失败' };
  }
}

// 11.1.1 考核对象扣分明细（自动评分「查看」用）
async function getTargetDeductions(cycleId, targetId) {
  try {
    const r = await pool.query(
      `SELECT d.id, d.metric_code, d.deduction_item, d.deduction_type, d.deduction_source,
              d.source_table, d.source_detail, d.suggested_score, d.confirmed_score,
              d.review_status, d.violation_date, d.created_at,
              t.employee_id, t.employee_name, t.position, t.township
       FROM ${TABLES.deduction} d
       JOIN ${TABLES.target} t ON t.id = d.target_id AND t.is_deleted = FALSE
       WHERE d.cycle_id = $1 AND d.target_id = $2 AND d.is_deleted = FALSE
       ORDER BY d.id DESC`,
      [cycleId, targetId]
    );
    const resolved = await resolveRuleForDeductionRows(r.rows.map((x) => ({ ...x })));
    const list = resolved.map(({ deduction: d, ruleName, category }) => ({
      id: d.id,
      deductionItem: d.deduction_item,
      deductionType: d.deduction_type,
      deductionSource: d.deduction_source,
      category: category || null,
      ruleName: ruleName || null,
      suggestedScore: Number(d.suggested_score),
      confirmedScore: d.confirmed_score == null ? null : Number(d.confirmed_score),
      reviewStatus: d.review_status,
      violationDate: d.violation_date || null,
      createdAt: d.created_at || null,
      sourceTable: d.source_table || null,
      summary: (d.source_detail && d.source_detail.summary) || null,
    }));
    const gridLevelRow = await pool.query(
      `SELECT ga.grid_level FROM grid_areas ga
       WHERE ga.personnel_id = $1 AND COALESCE(ga.is_deleted, FALSE) = FALSE
         AND COALESCE(ga.grid_level, '') <> '' ORDER BY ga.id LIMIT 1`,
      [(r.rows[0] || {}).employee_id]
    );
    return {
      __t: 'json',
      payload: {
        cycleId: Number(cycleId),
        targetId: Number(targetId),
        employeeName: (r.rows[0] || {}).employee_name || null,
        gridLevel: gridLevelRow.rows.length ? gridLevelRow.rows[0].grid_level : null,
        list,
      },
      message: '查询成功',
    };
  } catch (e) {
    logger.error(`[assessment-target-deductions] 查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询扣分明细失败' };
  }
}

// 11.1.2 自动评分导出 xlsx
async function exportScoring(cycleId) {
  try {
    const cycleResult = await pool.query(
      `SELECT id, cycle_code, cycle_name FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }

    const targets = await pool.query(
      `SELECT t.id, t.employee_id, t.employee_name, t.position, t.township, t.score_total,
              (SELECT ga.grid_level FROM grid_areas ga
               WHERE ga.personnel_id = t.employee_id AND COALESCE(ga.is_deleted, FALSE) = FALSE
                 AND COALESCE(ga.grid_level, '') <> '' ORDER BY ga.id LIMIT 1) AS grid_level
       FROM ${TABLES.target} t
       WHERE t.cycle_id = $1 AND t.is_deleted = FALSE
         AND t.employee_id IN (
              SELECT ga.personnel_id FROM grid_areas ga
              WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE) = FALSE
                AND ga.grid_level IN ('二级网格长','三级网格长')
            )
       ORDER BY t.score_total DESC NULLS LAST, t.employee_name`,
      [cycleId]
    );
    const tMap = {};
    for (const t of targets.rows) tMap[t.id] = t;

    const ded = targets.rows.length
      ? await pool.query(
          `SELECT id, target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
           FROM hse_assessment_deduction
           WHERE cycle_id = $1 AND target_id = ANY($2::bigint[]) AND is_deleted = FALSE
             AND review_status <> 'rejected'`,
          [cycleId, targets.rows.map((t) => t.id)]
        )
      : { rows: [] };
    const resolved = await resolveRuleForDeductionRows(ded.rows);

    const aoa = [['序号', '姓名', '岗位', '乡镇', '网格级别', '扣分类型', '扣分规则名称', '扣分']];
    const pushRow = (no, t, c, rName, score) => {
      aoa.push([no, t.employee_name, t.position, t.township, t.grid_level || '', c || '', rName || '', score == null ? '' : Number(score)]);
    };
    let no = 0;
    for (const t of targets.rows) {
      const rows = resolved.filter((x) => x.deduction.target_id === t.id);
      if (!rows.length) {
        no += 1;
        pushRow(no, t, null, null, null);
        continue;
      }
      for (const { deduction: d, ruleName, category } of rows) {
        no += 1;
        const eff = (d.review_status === 'approved' || d.review_status === 'adjusted')
          ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
          : Number(d.suggested_score);
        pushRow(no, t, d.deduction_type, ruleName, eff);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 8 }];
    for (let c = 0; c < 8; c++) {
      const col = XLSX.utils.encode_col(c);
      ws[`${col}1`].s = { font: { bold: true }, alignment: { horizontal: 'center' } };
    }
    for (let r = 1; r < aoa.length; r++) {
      for (let c = 0; c < 8; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) continue;
        ws[ref].s = { alignment: { horizontal: 'center' } };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, '自动评分扣分明细');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const cycle = cycleResult.rows[0];
    const fname = encodeURIComponent(`自动评分扣分明细_${cycle.cycle_code || 'cycle'}.xlsx`);
    return {
      __t: 'xlsx',
      buffer: Buffer.from(buf),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentDisposition: `attachment; filename*=UTF-8''${fname}`,
    };
  } catch (e) {
    logger.error(`[assessment-scoring-export] 导出失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '导出自动评分扣分明细失败' };
  }
}

// 11.2 导入扣分明细
async function importDeductions(user, body) {
  try {
    const { cycle_id, items } = body;

    if (!cycle_id || !items || !Array.isArray(items)) {
      return { __t: 'error', code: 400, message: '周期ID和扣分明细列表不能为空' };
    }

    const cycleResult = await pool.query(
      `SELECT * FROM ${TABLES.cycle} WHERE id = $1 AND is_deleted = FALSE`,
      [cycle_id]
    );
    if (cycleResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核周期不存在' };
    }
    if (cycleResult.rows[0].status === CYCLE_STATUS.FROZEN) {
      return { __t: 'error', code: 409, message: '已冻结的周期不可导入扣分' };
    }

    const metricMap = {};
    const metricsResult = await pool.query(
      `SELECT id, metric_code, metric_name FROM ${TABLES.metric} WHERE status = 'active' AND is_deleted = FALSE`
    );
    for (const m of metricsResult.rows) {
      metricMap[m.metric_code] = m;
      metricMap[m.metric_name] = m;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let imported = 0;
      let failed = 0;
      const errors = [];
      const capWarnings = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (!item.employee_code && !item.employee_name) {
            failed++;
            errors.push({ row: i + 1, error: '员工工号或姓名不能为空' });
            continue;
          }
          if (!item.deduction_item || !item.suggested_score) {
            failed++;
            errors.push({ row: i + 1, error: '扣分项名称和建议扣分值不能为空' });
            continue;
          }

          let targetQuery = `SELECT id, employee_id, position FROM ${TABLES.target} WHERE cycle_id = $1 AND is_deleted = FALSE`;
          let targetParams = [cycle_id];
          let paramIdx = 2;

          if (item.employee_code) {
            targetQuery += ` AND employee_code = $${paramIdx++}`;
            targetParams.push(item.employee_code);
          }
          if (item.employee_name) {
            targetQuery += ` AND employee_name = $${paramIdx++}`;
            targetParams.push(item.employee_name);
          }

          const targetResult = await client.query(targetQuery + ' LIMIT 1', targetParams);
          if (targetResult.rows.length === 0) {
            failed++;
            errors.push({ row: i + 1, error: '未找到对应的考核对象' });
            continue;
          }
          const target = targetResult.rows[0];

          if (target.status === TARGET_STATUS.FROZEN) {
            failed++;
            errors.push({ row: i + 1, error: '考核对象已冻结，不可导入' });
            continue;
          }

          let metricId = null;
          let metricCode = null;
          if (item.metric_code && metricMap[item.metric_code]) {
            metricId = metricMap[item.metric_code].id;
            metricCode = item.metric_code;
          } else if (item.metric_name && metricMap[item.metric_name]) {
            metricId = metricMap[item.metric_name].id;
            metricCode = metricMap[item.metric_name].metric_code;
          } else {
            const defaultMetricResult = await client.query(
              `SELECT id, metric_code FROM ${TABLES.metric} 
               WHERE status = 'active' AND is_deleted = FALSE
               ORDER BY id ASC LIMIT 1`
            );
            if (defaultMetricResult.rows.length > 0) {
              metricId = defaultMetricResult.rows[0].id;
              metricCode = defaultMetricResult.rows[0].metric_code;
            }
          }

          if (!metricId) {
            failed++;
            errors.push({ row: i + 1, error: '未找到有效的考核指标' });
            continue;
          }

          let finalScore = item.suggested_score;
          if (item.deduction_item) {
            const stdResult = await client.query(
              `SELECT deduction_score, rule_type FROM ${TABLES.standard}
               WHERE (position = $1 OR position_name = $1) AND item_name = $2 AND is_deleted = FALSE AND is_active = TRUE
               ORDER BY id DESC LIMIT 1`,
              [target.position, item.deduction_item]
            );
            if (stdResult.rows.length > 0) {
              const std = stdResult.rows[0];
              if (std.rule_type === 'deduction' && std.deduction_score != null) {
                finalScore = Math.abs(Number(std.deduction_score));
              } else if (std.rule_type === 'veto' && std.deduction_score != null) {
                finalScore = Math.abs(Number(std.deduction_score));
              }
            }
          }

          let scoreResult = await client.query(
            `SELECT id FROM ${TABLES.score} 
             WHERE target_id = $1 AND metric_id = $2 AND is_deleted = FALSE
             LIMIT 1`,
            [target.id, metricId]
          );

          let scoreId = scoreResult.rows[0]?.id;
          if (!scoreId) {
            const baseScore = metricsResult.rows.find(m => m.id === metricId)?.base_score || 100;
            const insertScoreResult = await client.query(
              `INSERT INTO ${TABLES.score} 
                (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
                 deduction_total, original_score, final_score, is_auto, is_manual,
                 review_status, calc_time)
               VALUES ($1, $2, $3, $4, 0, '导入扣分', 0, $5, $5, FALSE, TRUE, 'pending', NOW())
               RETURNING id`,
              [target.id, cycle_id, metricId, metricCode, baseScore]
            );
            scoreId = insertScoreResult.rows[0].id;
          }

          const ins = await client.query(
            `INSERT INTO ${TABLES.deduction} 
              (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
               deduction_type, deduction_source, suggested_score, review_status,
               violation_level, violation_date, violator_id, violator_name,
               is_transmission, remark, current_version)
             VALUES ($1, $2, $3, $4, $5, $6,
                     $7, $8, $9, 'pending',
                     $10, $11, $12, $13,
                     FALSE, $14, 1)
             RETURNING id`,
            [scoreId, target.id, cycle_id, metricId, metricCode,
             item.deduction_item,
             item.deduction_type || 'import',
             DEDUCTION_SOURCE.IMPORT,
             finalScore,
             item.violation_level || null,
             item.violation_date || null,
             item.violator_id || null,
             item.violator_name || null,
             item.remark || `导入批次: ${new Date().toISOString()}`]
          );

          try {
            const rowWarning = await categoryCap.computeManualCapWarning({
              cycleId: cycle_id,
              targetId: target.id,
              deductionItem: item.deduction_item,
              sourceDetail: null,
              adding: finalScore,
              excludeId: ins.rows[0].id,
              role: target.position === '管理员' ? 'admin' : 'manager',
              executor: client,
            });
            if (rowWarning) {
              capWarnings.push({ row: i + 1, employee: item.employee_code || item.employee_name, ...rowWarning });
            }
          } catch (warnErr) {
            logger.warn(`[assessment-import] 上限提示计算失败(忽略): ${warnErr.message}`);
          }

          imported++;
        } catch (e) {
          failed++;
          errors.push({ row: i + 1, error: e.message });
        }
      }

      await client.query('COMMIT');

      await recordAudit(user.id, user.name, user.role, 'IMPORT', 'DEDUCTION', cycle_id, `周期${cycle_id}`,
        { imported, failed, total: items.length, errors }, '导入扣分明细', user.ip);

      return {
        __t: 'json',
        payload: camelKeys({
          imported,
          failed,
          total: items.length,
          errors: errors.slice(0, 50),
          capWarnings,
        }),
        message: `导入完成，成功${imported}条，失败${failed}条`,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[assessment-import] 导入失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '导入扣分明细失败' };
  }
}

module.exports = {
  exportResults,
  getTargetDeductions,
  exportScoring,
  importDeductions,
};