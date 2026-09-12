/**
 * 一次性回填：2025-10「月度安全生产检查表」驾驶/消防问题 → driver_monthly（月度考核台账）
 *
 * 数据源：G:/safety_vault/04_现场管理/27、HSE月度考核/2025年/10月/10月乡镇作业中心经理月度考核.xlsx
 *        工作表「月度安全生产检查表」（按镇汇总扣分次数）
 * 口径（2026-09-06 拍板）：
 *   - driver_monthly 为按记录一条的台账；本表为按镇汇总 → 每镇合并一条，
 *     department = 各镇作业中心，name 取该镇当月「乡镇作业中心经理」名（仅展示用，评分不看 name）
 *   - 仅导入：驾驶员管理（三检 three_check_management / 号牌转向灯 lamp_dirty / 摄像头 safety_monitor）
 *            + 消防管理（fire_management）——不含转运站管理等其它组
 *   - lamp_dirty 取「号牌、转向灯脏污；转向灯、刹车灯不亮」合并值（避免重复计分，整值记入 lamp_dirty）
 *   - 幂等：按 (month=2025-10, department) 查是否存在 → 存在则更新，否则插入
 * 用法：node scripts/_import_oct_check_to_driver_monthly.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

const FILE = 'G:/safety_vault/04_现场管理/27、HSE月度考核/2025年/10月/10月乡镇作业中心经理月度考核.xlsx';
const YEAR = 2025;
const MONTH = 10;
const MONTH_STR = '2025-10';
const CYCLE_ID = 46; // 2025年10月月度考核
const DRY_RUN = process.argv.includes('--dry-run');

// 城镇 → 作业中心全称（与项目经理 org_name 对齐）
const TOWN_DEPT = {
  长官: '长官镇作业中心',
  大柳: '大柳镇作业中心',
  时集: '时集镇作业中心',
  刘营伍: '刘营伍乡作业中心',
  杜集: '杜集镇作业中心',
  柴胡店: '柴胡店镇作业中心',
  津城: '津城街道作业中心',
  宁城: '宁城街道作业中心',
  保店: '保店镇作业中心',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 解析「月度安全生产检查表」→ { town: { threeCheck, lampDirty, safetyMonitor, fire } } */
function parseSheet(wb) {
  const sn = (wb.SheetNames || []).find((n) => /\u5b89\u5168\u751f\u4ea7\u68c0\u67e5\u8868/.test(String(n)));
  if (!sn) throw new Error('未找到「月度安全生产检查表」工作表');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });

  // 找表头行：col0=序号 且 col2=项目
  let head = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    if (num(r[0]) === 0 && String(r[1] || '') === '' && String(r[2] || '').trim() === '项目'
        || (String(r[0] || '').trim() === '序号' || String(r[2] || '').trim() === '项目')) {
      const hasTown = rows[i].slice(5).some((c) => typeof c === 'string' && c.trim() !== '');
      if (String(r[2] || '').trim() === '项目') { head = i; break; }
    }
  }
  if (head < 0) {
    // 兜底：表头行含「基本要求」「扣分标准」
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (String(r[3] || '').trim() === '基本要求' || String(r[2] || '').trim() === '项目') { head = i; break; }
    }
  }
  if (head < 0) throw new Error('无法定位表头行');
  const header = rows[head] || [];
  const towns = [];
  for (let j = 5; j < header.length && j < 14; j++) {
    const t = String(header[j] || '').trim();
    if (t) towns.push({ label: t, col: j });
  }

  const byTown = {};
  for (const t of towns) byTown[t.label] = { threeCheck: 0, lampDirty: 0, safetyMonitor: 0, fire: 0 };

  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const req = String(r[3] || '').trim(); // 基本要求
    if (!req) continue;
    const rec = { threeCheck: 0, lampDirty: 0, safetyMonitor: 0, fire: 0 };
    if (/三检/.test(req)) rec.threeCheck = 1;
    if (/号牌/.test(req) || /转向灯/.test(req)) rec.lampDirty = 1;
    if (/摄像头/.test(req)) rec.safetyMonitor = 1;
    if (/消防/.test(req)) rec.fire = 1;
    if (!(rec.threeCheck || rec.lampDirty || rec.safetyMonitor || rec.fire)) continue;
    for (const t of towns) {
      const v = num(r[t.col]);
      if (v > 0) byTown[t.label][Object.keys(rec).find((k) => rec[k])] = v;
    }
  }
  return { towns, byTown };
}

async function run() {
  if (!fs.existsSync(FILE)) { console.log('文件不存在: ' + FILE); return; }
  const wb = XLSX.readFile(FILE);
  const { towns, byTown } = parseSheet(wb);

  // 当月经理姓名（展示用）：按 org_name → 乡镇作业中心经理 name
  const nMgr = await pool.query(
    `SELECT e.org_name, t.employee_name
       FROM hse_assessment_target t
       LEFT JOIN v_employee_org_full e ON e.employee_id=t.employee_id AND e.relation_status='active'
      WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND t.is_deleted=FALSE`,
    [CYCLE_ID]
  );
  const mgrByDept = new Map(nMgr.rows.map((r) => [r.org_name, r.employee_name]));

  // 现有行（用于幂等）
  const existing = await pool.query(
    "SELECT id, department FROM driver_monthly WHERE month=$1 AND is_deleted=FALSE", [MONTH_STR]
  );
  const idByDept = new Map(existing.rows.map((r) => [r.department, r.id]));

  console.log(`===== 解析「月度安全生产检查表」（${MONTH_STR}）=====`);
  console.log('城镇列:', towns.map((t) => t.label).join('、'));

  const rows = [];
  for (const t of towns) {
    const d = byTown[t.label];
    if (!d.lampDirty && !d.safetyMonitor && !d.fire && !d.threeCheck) {
      console.log(`[${t.label}] 无驾驶/消防扣分，跳过`);
      continue;
    }
    const dept = TOWN_DEPT[t.label] || `${t.label}作业中心`;
    rows.push({
      town: t.label,
      dept,
      name: mgrByDept.get(dept) || dept,
      threeCheck: d.threeCheck,
      lampDirty: d.lampDirty,
      safetyMonitor: d.safetyMonitor,
      fire: d.fire,
    });
  }

  console.log('\n===== 待写入 =====');
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const id = idByDept.get(r.dept);
    const action = id ? 'UPDATE' : 'INSERT';
    console.log(
      `[${r.town}] ${action} dept=${r.dept} name=${r.name} ` +
      `三检=${r.threeCheck} 号牌=${r.lampDirty} 摄像头=${r.safetyMonitor} 消防=${r.fire}`
    );
    if (DRY_RUN) continue;
    if (id) {
      await pool.query(
        `UPDATE driver_monthly SET name=$2, three_check_management=$3, lamp_dirty=$4,
                safety_monitor=$5, fire_management=$6, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [id, r.name, r.threeCheck, r.lampDirty, r.safetyMonitor, r.fire]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO driver_monthly
           (month, name, department, three_check_management, lamp_dirty, lamp_failure, safety_monitor, fire_management, remark)
         VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8)`,
        [MONTH_STR, r.name, r.dept, r.threeCheck, r.lampDirty, r.safetyMonitor, r.fire, '由10月月度安全生产检查表导入']
      );
      inserted++;
    }
  }

  console.log(`\n===== 汇总 =====`);
  console.log(`待导入 ${rows.length} 镇，插入 ${inserted}，更新 ${updated}${DRY_RUN ? '（dry-run，未写库）' : ''}。`);
}

run().finally(() => pool.end());