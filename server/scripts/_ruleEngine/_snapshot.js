/**
 * 规则引擎阶段1 · 扣分快照工具
 *
 * 用途：导出指定考核周期 hse_assessment_deduction 的关键字段，用于「迁移前 / 迁移后」逐人比对（parity diff=0）。
 * 用法：node server/scripts/_ruleEngine/_snapshot.js <cycleId> [outFile]
 *      outFile 缺省时打印到 stdout。
 * 只读脚本，不写任何业务表。
 */

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { pool, isConnected } = require('../../config/db');

const KEY_FIELDS = [
  'kind',
  'deductKey',
  'ruleName',
  'category',
  'eventType',
  'expected',
  'actual',
  'missing',
  'unit',
  'rawScore',
  'cap',
  'cappedScore',
  'otherCatScore',
  'year',
  'month',
  'summary',
];

async function snapshot(cycleId) {
  const r = await pool.query(
    `SELECT d.id, d.target_id, d.metric_id, d.metric_code, d.deduction_item, d.deduction_type,
            d.deduction_source, d.source_table, d.source_id, d.source_detail,
            d.suggested_score, d.confirmed_score, d.current_version, d.review_status,
            d.is_transmission, d.is_deleted
       FROM hse_assessment_deduction d
      WHERE d.cycle_id = $1
      ORDER BY d.target_id, d.id`,
    [cycleId]
  );

  const rows = r.rows.map((row) => {
    const sd = row.source_detail || {};
    const detail = {};
    for (const k of KEY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(sd, k)) detail[k] = sd[k];
    }
    return {
      id: row.id,
      targetId: row.target_id,
      metricId: row.metric_id,
      metricCode: row.metric_code,
      deductionItem: row.deduction_item,
      deductionType: row.deduction_type,
      deductionSource: row.deduction_source,
      sourceTable: row.source_table,
      sourceId: row.source_id,
      suggestedScore: row.suggested_score != null ? Number(row.suggested_score) : null,
      confirmedScore: row.confirmed_score != null ? Number(row.confirmed_score) : null,
      currentVersion: row.current_version,
      reviewStatus: row.review_status,
      isTransmission: row.is_transmission,
      isDeleted: row.is_deleted,
      detail,
    };
  });

  const active = rows.filter((x) => !x.isDeleted);
  return {
    cycleId: Number(cycleId),
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    activeRows: active.length,
    distinctTargets: new Set(active.map((x) => x.targetId)).size,
    sumSuggested: Math.round(active.reduce((s, x) => s + (x.suggestedScore || 0), 0) * 100) / 100,
    rows,
  };
}

async function main() {
  const cycleId = Number(process.argv[2] || 24);
  const outFile = process.argv[3];
  if (!isConnected() && !(await pool.connect().then((c) => { c.release(); return true; }).catch(() => false))) {
    console.error('DB 未连接');
    process.exit(1);
  }
  const snap = await snapshot(cycleId);
  const text = JSON.stringify(snap, null, 2);
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), text, 'utf8');
    console.log(`snapshot written: ${outFile} (cycle=${cycleId}, rows=${snap.totalRows}, sum=${snap.sumSuggested})`);
  } else {
    console.log(text);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
