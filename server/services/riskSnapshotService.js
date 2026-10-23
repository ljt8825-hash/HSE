/**
 * riskSnapshotService —— 风险快照重建（方案A：以现场台账为明细底座）
 *
 * 供两处复用：
 *   - server/scripts/rebuildRiskSnapshot.js         （CLI，--write 落库 / 默认 dry）
 *   - server/routes/risk-snapshot-admin.js           （POST /rebuild，body: {action:'dry'|'write'}）
 *
 * 口径（用户已确认方案A + 培训空时按100分参与）：
 *   6 维加权（对照 server/sql/风险指标计算规则.md），明细底座改用现场台账：
 *   三违30%→driver_three_violation；交通安全10%→driver_violation；事故25%→accidents；
 *   隐患15%→hazard_record；培训20%→employee_training_status(空时按100)；网格10%→grid_areas(grid_leader)
 *   身份关联：硬关联(driver_monthly.personnel_id)优先 → 姓名唯一命中；重名/未命中跳过并列待关联清单
 */
const { pool } = require('../config/db');
const MONTH12 = new Date(Date.now() - 365 * 24 * 3600 * 1000);

const rule = (n, ranges) => {
  for (const [mn, mx, sc] of ranges) {
    if (mn == null && n <= mx) return sc;
    if (mx == null && n >= mn) return sc;
    if (mn != null && mx != null && n >= mn && n <= mx) return sc;
  }
  return 100;
};
const scoreThree = n => rule(n, [[null, 0, 100], [1, 1, 80], [2, 3, 60], [4, 5, 40], [6, null, 20]]);
const scoreTraffic = n => rule(n, [[null, 0, 100], [1, 1, 70], [2, 3, 40], [4, null, 10]]);
const scoreAccid = n => rule(n, [[null, 0, 100], [1, 1, 70], [2, 2, 40], [3, null, 10]]);
const scoreHazard = n => rule(n, [[null, 0, 100], [1, 2, 70], [3, 5, 40], [6, null, 10]]);
const scoreRate = p => { if (p >= 100) return 100; if (p >= 80) return 80; if (p >= 60) return 60; if (p >= 40) return 40; return 20; };
const toLevel = s => { if (s >= 80) return 'low'; if (s >= 60) return 'medium'; if (s >= 40) return 'high'; return 'critical'; };
const parseDate = s => { if (!s) return null; const m = String(s).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
async function q(label, sql, params) { try { return (await pool.query(sql, params)).rows; } catch (e) { throw new Error(`${label} -> ${e.message}`); } }

/**
 * 计算（可落库）风险快照。
 * @param {{write?: boolean}} opts write=true 才写入 hse_employee_risk_snapshot（授权生产操作，留痕）
 * @returns {Object} 结构化结果（mode、统计、身份关联质量、等级分布、最危险TOP）
 */
async function rebuildSnapshot({ write = false } = {}) {
  const SNAP_DATE = new Date().toISOString().slice(0, 10);

  const emps = await q('employee', `SELECT id, name, count(*) OVER (PARTITION BY name) AS name_cnt FROM employee WHERE is_deleted=false`);
  const nameCount = {}; emps.forEach(e => { nameCount[e.name] = Number(e.name_cnt); });

  const v = await q('driver_violation', `SELECT name, violation_time, created_at FROM driver_violation WHERE is_deleted=false`);
  const tv = await q('driver_three_violation', `SELECT name, violation_time, created_at FROM driver_three_violation WHERE is_deleted=false`);
  const mon = await q('driver_monthly', `SELECT name, personnel_id FROM driver_monthly WHERE is_deleted=false`);
  const acc = await q('accidents', `SELECT involved_person, personnel_id FROM accidents WHERE is_deleted=false`);
  const haz = await q('hazard_record', `SELECT employee_id, responsible_id FROM hazard_record WHERE is_deleted=false`);
  const trn = await q('training', `SELECT employee_id, compliance_rate FROM employee_training_status WHERE is_deleted=false`);
  const grd = await q('grid_areas', `SELECT personnel_id, completion_rate FROM grid_areas WHERE is_deleted=false`);

  const in12 = r => { const d = parseDate(r.violation_time) || new Date(r.created_at); return d >= MONTH12; };
  const v12 = v.filter(in12), tv12 = tv.filter(in12);

  // 身份关联
  const hard = {}; mon.forEach(m => { if (m.personnel_id) hard[m.name] = Number(m.personnel_id); });
  const emap = {}; emps.forEach(e => { if (nameCount[e.name] === 1) emap[e.name] = [e.id]; });
  const stat = { hard: 0, unique: 0, dup: 0, missing: 0 };
  const dupSet = new Set(), missSet = new Set();
  const resolve = name => {
    if (name == null || String(name).trim() === '') { stat.missing++; missSet.add('(空)'); return null; }
    const key = name;
    if (hard[key] != null) { stat.hard++; return hard[key]; }
    const ids = emap[key];
    if (ids && ids.length === 1) { stat.unique++; return ids[0]; }
    if (!ids || ids.length === 0) { stat.missing++; missSet.add(key); return null; }
    stat.dup++; dupSet.add(key); return null;
  };
  const dim = {};
  const push = (eid, k, val) => { (dim[eid] = dim[eid] || { three: 0, traffic: 0, accident: 0, hazard: 0, gridRate: null, trainingRate: null })[k] += val; };
  const setr = (eid, k, val) => { if (dim[eid]) dim[eid][k] = val; };

  tv12.forEach(r => { const e = resolve(r.name); if (e != null) push(e, 'three', 1); });
  v12.forEach(r => { const e = resolve(r.name); if (e != null) push(e, 'traffic', 1); });
  acc.forEach(r => { let e = r.personnel_id; if (e == null && r.involved_person) e = resolve(r.involved_person); if (e != null) push(e, 'accident', 1); });
  haz.forEach(r => { const e = r.employee_id || r.responsible_id; if (e != null) push(e, 'hazard', 1); });
  trn.forEach(t => setr(t.employee_id, 'trainingRate', Number(t.compliance_rate)));
  grd.forEach(g => setr(g.personnel_id, 'gridRate', Number(g.completion_rate)));

  const ids = Object.keys(dim).map(Number);

  // 计算
  const levelDist = { low: 0, medium: 0, high: 0, critical: 0 };
  let ratedCount = 0;
  const topRisky = [];
  for (const eid of ids) {
    const d = dim[eid];
    const w3 = scoreThree(d.three), wt = scoreTraffic(d.traffic), wa = scoreAccid(d.accident), wh = scoreHazard(d.hazard);
    const wr = d.trainingRate == null ? 100 : scoreRate(d.trainingRate);   // 方案B：培训空按100参与
    const wg = d.gridRate == null ? null : scoreRate(d.gridRate);
    let num = 0, den = 0;
    const addW = (w, wi) => { if (wi !== null) { num += w * wi; den += wi; } };
    addW(w3, 0.30); addW(wr, 0.20); addW(wa, 0.25); addW(wh, 0.15); addW(wg, 0.10);
    const total = den > 0 ? Math.round((num / den) * 10) / 10 : 0;
    levelDist[toLevel(total)]++; ratedCount++;
    topRisky.push({ employeeId: eid, total: Number(total), level: toLevel(total), three: d.three, traffic: d.traffic, accident: d.accident, hazard: d.hazard, trainingRate: d.trainingRate, gridRate: d.gridRate });
  }
  topRisky.sort((a, b) => a.total - b.total);

  const result = {
    mode: write ? 'write' : 'dry',
    snapshotDate: SNAP_DATE,
    counts: { violation: v.length, violation12m: v12.length, threeViolation: tv.length, threeViolation12m: tv12.length, monthly: mon.length, accident: acc.length, hazard: haz.length, trainingRows: trn.length, grid: grd.length },
    identity: { hard: stat.hard, unique: stat.unique, dup: stat.dup, missing: stat.missing, dupNames: [...dupSet], missNames: [...missSet] },
    ratedEmployees: ratedCount,
    levelDistribution: levelDist,
    topRisky: topRisky.slice(0, 15),
  };

  if (write) {
    const before = await q('before_count', `SELECT count(*)::int AS n FROM hse_employee_risk_snapshot`);
    const beforeTotal = before[0].n;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE hse_employee_risk_snapshot SET is_deleted=true WHERE snapshot_date=$1`, [SNAP_DATE]);
      for (const r of topRisky) {
        const d = dim[r.employeeId];
        const dimScores = { three: scoreThree(d.three), traffic: scoreTraffic(d.traffic), accident: scoreAccid(d.accident), hazard: scoreHazard(d.hazard), training: d.trainingRate == null ? 100 : scoreRate(d.trainingRate), grid: d.gridRate == null ? null : scoreRate(d.gridRate) };
        const dimDetails = { three_n: d.three, traffic_n: d.traffic, accident_n: d.accident, hazard_n: d.hazard, training_rate: d.trainingRate, grid_rate: d.gridRate };
        await client.query(
          `INSERT INTO hse_employee_risk_snapshot
             (employee_id, snapshot_date, total_score, risk_level, dimension_scores, dimension_details, calculated_at, is_deleted)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),false)
           ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET
             total_score=EXCLUDED.total_score, risk_level=EXCLUDED.risk_level,
             dimension_scores=EXCLUDED.dimension_scores, dimension_details=EXCLUDED.dimension_details,
             calculated_at=now(), is_deleted=false`,
          [r.employeeId, SNAP_DATE, r.total, r.level, JSON.stringify(dimScores), JSON.stringify(dimDetails)]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    result.mode = 'write';
    result.wroteRows = topRisky.length;
    result.beforeTotal = beforeTotal;
    result.rollbackHint = `DELETE FROM hse_employee_risk_snapshot WHERE snapshot_date='${SNAP_DATE}'`;
  }

  return result;
}

module.exports = { rebuildSnapshot, toLevel };