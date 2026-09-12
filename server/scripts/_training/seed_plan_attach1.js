/**
 * 导入《宁津项目2026年度安全教育培训计划》附件1「安全培训教育实施计划表」34 条计划
 * 到 training_plans 表。
 *
 * 幂等：以 (plan_no, title, target_audience) 三元组判重，已存在则 UPDATE，不存在则 INSERT。
 * 回滚：node seed_plan_attach1.js --revert  → 软删除本脚本导入的记录（remark 标记匹配）
 *
 * 用法：
 *   node server/scripts/_training/seed_plan_attach1.js
 *   node server/scripts/_training/seed_plan_attach1.js --dry
 *   node server/scripts/_training/seed_plan_attach1.js --revert
 */
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../../config/db');

const SOURCE_TAG = '附件1·2026年度安全培训教育实施计划表';
const YEAR = 2026;
const JSON_PATH = path.join(__dirname, 'plan_attach1.json');

/** 「1月」→ 当月起止；非月份文本 → 全年 */
function resolveDateRange(trainingTime) {
  const m = String(trainingTime || '').match(/^(\d{1,2})月$/);
  if (m) {
    const mo = Number(m[1]);
    const last = new Date(YEAR, mo, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return [`${YEAR}-${pad(mo)}-01`, `${YEAR}-${pad(mo)}-${pad(last)}`];
  }
  return [`${YEAR}-01-01`, `${YEAR}-12-31`];
}

/** 「12学时」→ 12；「按实际确定学时」→ null；「1」→ 1 */
function parseHours(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const revert = argv.includes('--revert');

  if (revert) {
    const r = await pool.query(
      `UPDATE training_plans SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
       WHERE is_deleted = false AND remark LIKE $1 RETURNING id, plan_no, title`,
      [`%${SOURCE_TAG}%`],
    );
    console.log(`[revert] 软删除 ${r.rowCount} 条`);
    await pool.end();
    return;
  }

  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`[seed] 读取 ${rows.length} 条附件1记录${dry ? '（dry-run，不写库）' : ''}`);

  let inserted = 0;
  let updated = 0;

  for (const cells of rows) {
    const [planNo, title, trainingTime, targetAudience, content, responsibleDept, hoursRaw] = cells;
    const [startDate, endDate] = resolveDateRange(trainingTime);
    const planHours = parseHours(hoursRaw);
    const remark = `${SOURCE_TAG}｜原始学时：${hoursRaw}`;

    const found = await pool.query(
      `SELECT id FROM training_plans
       WHERE is_deleted = false AND plan_no = $1 AND title = $2 AND COALESCE(target_audience,'') = $3
       LIMIT 1`,
      [planNo, title, targetAudience || ''],
    );

    if (dry) {
      console.log(
        `  ${found.rows.length ? 'UPDATE' : 'INSERT'} #${planNo} ${title} / ${trainingTime} → ${startDate}~${endDate} / ${planHours ?? '按实际'}`,
      );
      found.rows.length ? updated++ : inserted++;
      continue;
    }

    if (found.rows.length > 0) {
      await pool.query(
        `UPDATE training_plans SET
           plan_name = $1, training_time = $2, target_audience = $3, content = $4,
           responsible_dept = $5, plan_hours = $6, duration_hours = COALESCE($6, duration_hours),
           start_date = $7, end_date = $8, plan_type = 'annual', training_type = '安全教育培训',
           status = 'approved', remark = $9, updated_at = CURRENT_TIMESTAMP
         WHERE id = $10`,
        [title, trainingTime, targetAudience, content, responsibleDept, planHours, startDate, endDate, remark, found.rows[0].id],
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO training_plans
           (plan_no, title, plan_name, plan_type, training_type, training_time, target_audience,
            content, responsible_dept, plan_hours, duration_hours, start_date, end_date,
            status, exam_required, pass_score, remark)
         VALUES ($1,$2,$2,'annual','安全教育培训',$3,$4,$5,$6,$7,$7,$8,$9,'approved',false,60,$10)`,
        [planNo, title, trainingTime, targetAudience, content, responsibleDept, planHours, startDate, endDate, remark],
      );
      inserted++;
    }
  }

  console.log(`[seed] 完成：新增 ${inserted} 条，更新 ${updated} 条`);
  const total = await pool.query(
    `SELECT count(*)::int AS c FROM training_plans WHERE is_deleted = false AND remark LIKE $1`,
    [`%${SOURCE_TAG}%`],
  );
  console.log(`[seed] 表内附件1来源记录合计：${total.rows[0].c} 条`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('[seed] 失败：', e.message);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
