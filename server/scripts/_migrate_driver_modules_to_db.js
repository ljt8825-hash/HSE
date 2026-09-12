/**
 * 驾驶员三模块「内存 → PostgreSQL」迁移脚本（幂等，可重跑）
 * 目标表：
 *   driver_assessment  ← /site-mgmt/driver-assessments（交通安全档案）
 *   driver_violation   ← /site-mgmt/driver-violations（驾驶员违章记录）
 *   driver_monthly     ← /site-mgmt/driver-monthly   （驾驶员月度考核）
 *
 * 行为：
 *   1) CREATE TABLE IF NOT EXISTS（含索引）
 *   2) 若目标表为空，则通过运行中的后端(5800)拉取当前内存数据并灌入（保持字段语义，snake_case 落库）
 *   3) 目标表非空则跳过数据导入（幂等保护，防重跑重复）
 *
 * 用法：node scripts/_migrate_driver_modules_to_db.js
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const API_BASE = 'http://127.0.0.1:5800/api';

// ---------- 1. 现签 admin JWT（读 server/.env 的 JWT_SECRET；payload 必须含 jti） ----------
function signToken() {
  const jwt = require(path.join(__dirname, '..', 'node_modules', 'jsonwebtoken'));
  const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = envText.match(/^JWT_SECRET\s*=\s*(.+)$/m);
  const secret = m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  return jwt.sign(
    {
      id: 1,
      username: 'admin',
      role: 'admin',
      realName: '管理员',
      type: 'access',
      jti: `mig-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    },
    secret,
    { expiresIn: '10m' },
  );
}

// ---------- 2. 从运行中后端翻页拉取内存数据 ----------
async function fetchAll(endpoint, token) {
  const out = [];
  let page = 1;
  const pageSize = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${API_BASE}${endpoint}?page=${page}&pageSize=${pageSize}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`${endpoint} HTTP ${resp.status}`);
    const j = await resp.json();
    if (j.code !== 0) throw new Error(`${endpoint} code=${j.code} msg=${j.message}`);
    const list = j.data?.list || [];
    out.push(...list);
    if (list.length < pageSize) break;
    page += 1;
  }
  return out;
}

// ---------- 3. 建表 ----------
const DDL = `
CREATE TABLE IF NOT EXISTS driver_assessment (
  id SERIAL PRIMARY KEY,
  archive_no VARCHAR(50) NOT NULL DEFAULT '',
  name VARCHAR(100) NOT NULL DEFAULT '',
  id_card VARCHAR(50) NOT NULL DEFAULT '',
  license_type VARCHAR(50) NOT NULL DEFAULT '',
  department VARCHAR(100) NOT NULL DEFAULT '',
  vehicle_no VARCHAR(50) NOT NULL DEFAULT '',
  assessment_date VARCHAR(20),
  assessment_result TEXT,
  assessment_level VARCHAR(50) NOT NULL DEFAULT '',
  assessment_type VARCHAR(50) NOT NULL DEFAULT '驾驶证评估',
  control_measures TEXT,
  status VARCHAR(20) NOT NULL DEFAULT '未完成',
  expiry_date VARCHAR(20),
  phone VARCHAR(50) NOT NULL DEFAULT '',
  remark TEXT,
  created_by INT,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_driver_assessment_name ON driver_assessment(name);
CREATE INDEX IF NOT EXISTS idx_driver_assessment_dept ON driver_assessment(department);
CREATE INDEX IF NOT EXISTS idx_driver_assessment_level ON driver_assessment(assessment_level);

CREATE TABLE IF NOT EXISTS driver_violation (
  id SERIAL PRIMARY KEY,
  seq INT,
  name VARCHAR(100) NOT NULL DEFAULT '',
  plate_no VARCHAR(50) NOT NULL DEFAULT '',
  violation_time VARCHAR(30),
  violation_location VARCHAR(200) NOT NULL DEFAULT '',
  violation_type VARCHAR(100) NOT NULL DEFAULT '',
  violation_desc TEXT,
  demerit_points INT NOT NULL DEFAULT 0,
  fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  handle_status VARCHAR(20) NOT NULL DEFAULT '待处理',
  handle_method VARCHAR(200) NOT NULL DEFAULT '',
  handle_result TEXT,
  remark TEXT,
  created_by INT,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_driver_violation_name ON driver_violation(name);
CREATE INDEX IF NOT EXISTS idx_driver_violation_status ON driver_violation(handle_status);

CREATE TABLE IF NOT EXISTS driver_monthly (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) NOT NULL DEFAULT '',
  name VARCHAR(100) NOT NULL DEFAULT '',
  department VARCHAR(100) NOT NULL DEFAULT '',
  personnel_id INT,
  safety_score INT NOT NULL DEFAULT 0,
  discipline_score INT NOT NULL DEFAULT 0,
  training_score INT NOT NULL DEFAULT 0,
  total_score INT NOT NULL DEFAULT 0,
  assessment_level VARCHAR(50) NOT NULL DEFAULT '',
  main_problem TEXT,
  assessor VARCHAR(100) NOT NULL DEFAULT '',
  three_check_management INT NOT NULL DEFAULT 0,
  lamp_dirty INT NOT NULL DEFAULT 0,
  lamp_failure INT NOT NULL DEFAULT 0,
  safety_monitor INT NOT NULL DEFAULT 0,
  fire_management INT NOT NULL DEFAULT 0,
  remark TEXT,
  created_by INT,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_driver_monthly_month ON driver_monthly(month);
CREATE INDEX IF NOT EXISTS idx_driver_monthly_name ON driver_monthly(name);

CREATE TABLE IF NOT EXISTS driver_three_violation (
  id SERIAL PRIMARY KEY,
  seq INT,
  name VARCHAR(100) NOT NULL DEFAULT '',
  plate_no VARCHAR(50) NOT NULL DEFAULT '',
  violation_time VARCHAR(30),
  violation_location VARCHAR(200) NOT NULL DEFAULT '',
  violation_type VARCHAR(100) NOT NULL DEFAULT '',
  violation_desc TEXT,
  demerit_points INT NOT NULL DEFAULT 0,
  fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  handle_status VARCHAR(20) NOT NULL DEFAULT '待处理',
  handle_method VARCHAR(200) NOT NULL DEFAULT '',
  handle_result TEXT,
  remark TEXT,
  created_by INT,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_driver_three_violation_name ON driver_three_violation(name);
CREATE INDEX IF NOT EXISTS idx_driver_three_violation_status ON driver_three_violation(handle_status);
`;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ---------- 4. 导入器 ----------
const importers = {
  driver_assessment: {
    endpoint: '/site-mgmt/driver-assessments',
    map: (r) => [
      r.archiveNo || '',
      r.name || '',
      r.idCard || '',
      r.licenseType || '',
      r.department || '',
      r.vehicleNo || '',
      r.assessmentDate || null,
      r.assessmentResult || '',
      r.assessmentLevel || '',
      r.assessmentType || '驾驶证评估',
      r.controlMeasures || '',
      r.status || '未完成',
      r.expiryDate || null,
      r.phone || '',
      r.remark || '',
      r.createdAt ? new Date(r.createdAt) : new Date(),
      r.updatedAt ? new Date(r.updatedAt) : new Date(),
      !!r.is_deleted,
    ],
    sql: `INSERT INTO driver_assessment
      (archive_no, name, id_card, license_type, department, vehicle_no,
       assessment_date, assessment_result, assessment_level, assessment_type,
       control_measures, status, expiry_date, phone, remark,
       created_at, updated_at, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
  },
  driver_violation: {
    endpoint: '/site-mgmt/driver-violations',
    map: (r) => [
      r.seq == null ? null : num(r.seq),
      r.name || '',
      r.plateNo || '',
      r.violationTime || null,
      r.violationLocation || '',
      r.violationType || '',
      r.violationDesc || '',
      num(r.demeritPoints) || 0,
      num(r.fineAmount) || 0,
      r.handleStatus || '待处理',
      r.handleMethod || '',
      r.handleResult || '',
      r.remark || '',
      r.createdAt ? new Date(r.createdAt) : new Date(),
      r.updatedAt ? new Date(r.updatedAt) : new Date(),
      !!r.is_deleted,
    ],
    sql: `INSERT INTO driver_violation
      (seq, name, plate_no, violation_time, violation_location, violation_type,
       violation_desc, demerit_points, fine_amount, handle_status, handle_method,
       handle_result, remark, created_at, updated_at, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
  },
  driver_monthly: {
    endpoint: '/site-mgmt/driver-monthly',
    map: (r) => [
      r.month || '',
      r.name || '',
      r.department || '',
      r.personnelId == null ? null : num(r.personnelId),
      num(r.safetyScore) || 0,
      num(r.disciplineScore) || 0,
      num(r.trainingScore) || 0,
      num(r.totalScore) || 0,
      r.assessmentLevel || '',
      r.mainProblem || '',
      r.assessor || '',
      num(r.threeCheckManagement) || 0,
      num(r.lampDirty) || 0,
      num(r.lampFailure) || 0,
      num(r.safetyMonitor) || 0,
      num(r.fireManagement) || 0,
      r.remark || '',
      r.createdAt ? new Date(r.createdAt) : new Date(),
      r.updatedAt ? new Date(r.updatedAt) : new Date(),
      !!r.is_deleted,
    ],
    sql: `INSERT INTO driver_monthly
      (month, name, department, personnel_id,
       safety_score, discipline_score, training_score, total_score,
       assessment_level, main_problem, assessor,
       three_check_management, lamp_dirty, lamp_failure, safety_monitor, fire_management,
       remark, created_at, updated_at, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
  },
  driver_three_violation: {
    endpoint: '/site-mgmt/driver-three-violations',
    map: (r) => [
      r.seq == null ? null : num(r.seq),
      r.name || '',
      r.plateNo || '',
      r.violationTime || null,
      r.violationLocation || '',
      r.violationType || '',
      r.violationDesc || '',
      num(r.demeritPoints) || 0,
      num(r.fineAmount) || 0,
      r.handleStatus || '待处理',
      r.handleMethod || '',
      r.handleResult || '',
      r.remark || '',
      r.createdAt ? new Date(r.createdAt) : new Date(),
      r.updatedAt ? new Date(r.updatedAt) : new Date(),
      !!r.is_deleted,
    ],
    sql: `INSERT INTO driver_three_violation
      (seq, name, plate_no, violation_time, violation_location, violation_type,
       violation_desc, demerit_points, fine_amount, handle_status, handle_method, handle_result,
       remark, created_at, updated_at, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
  },
};

const TABLE_LABEL = {
  driver_assessment: '交通安全档案(driver_assessment)',
  driver_violation: '驾驶员违章(driver_violation)',
  driver_monthly: '驾驶员月度考核(driver_monthly)',
  driver_three_violation: '三违扣分记录(driver_three_violation)',
};

async function main() {
  // 1) 建表
  await pool.query(DDL);
  console.log('[1/3] 三张表已就绪（CREATE TABLE IF NOT EXISTS）');

  // 2) 探测后端连通性（仅当有表为空需导入时才需要 token）
  const token = signToken();
  let apiOk = true;
  try {
    const h = await fetch(`${API_BASE}/health`, { headers: { Authorization: `Bearer ${token}` } });
    if (!h.ok) apiOk = false;
  } catch {
    apiOk = false;
  }

  // 3) 逐表导入
  for (const [table, cfg] of Object.entries(importers)) {
    const cnt = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
    if (cnt.rows[0].c > 0) {
      console.log(`[skip] ${TABLE_LABEL[table]} 已有 ${cnt.rows[0].c} 行，跳过数据导入（幂等）`);
      continue;
    }
    if (!apiOk) {
      console.log(`[warn] ${TABLE_LABEL[table]} 为空，且 5800 后端不可达，跳过数据导入（仅建表）`);
      continue;
    }
    const rows = await fetchAll(cfg.endpoint, token);
    if (rows.length === 0) {
      console.log(`[info] ${TABLE_LABEL[table]} 当前内存无数据，跳过`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        await client.query(cfg.sql, cfg.map(r));
      }
      await client.query('COMMIT');
      console.log(`[ok]   ${TABLE_LABEL[table]} 已导入 ${rows.length} 行（来自运行中后端内存）`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 汇总
  const summary = {};
  for (const t of Object.keys(importers)) {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    summary[t] = r.rows[0].c;
  }
  console.log('[done] 表行数:', JSON.stringify(summary));
}

main()
  .catch((e) => {
    console.error('MIGRATE ERR:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
