/**
 * 一次性批量回填：现场管理-驾驶员管理-月度考核「三检表管理」（2025-08 ~ 2026-07）
 *
 * 数据源：G:/safety_vault/04_现场管理/27、HSE月度考核/<YYYY>年/<N>月/
 *         「<N>月乡镇作业中心经理月度考核结果」*.xlsx  → 工作表「三检表」
 *   三检表列结构：乡镇 | 车型 | 姓名 | 车牌号 | <月>   （末列为 √/✅ 打勾标记）
 *
 * 口径（2026-09-06 拍板）：
 *   - 未打 ✓（√/✅）的人 → three_check_management = 10
 *   - 已打 ✓ 的人         → three_check_management = 0
 *   - 按「姓名」与同月 driver_monthly 行匹配；无匹配则按 乡镇→XX作业中心 兜底新建（并回填姓名）
 *
 * 仅更新/新建三检表管理字段，不改动其它考核列（灯牌污损/灯具失效/安全监控/消防管理等）。
 * 复用防重跑原则的思想：先查同名同月是否已存在 → 存在则更新，不存在则插入（不做唯一约束冲突）。
 *
 * 用法：node scripts/_backfill_driver_monthly_sanjian.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

const BASE_DIR = process.env.DRIVER_SANJIAN_SOURCE_DIR || 'G:/safety_vault/04_现场管理/27、HSE月度考核';
const DRY_RUN = process.argv.includes('--dry-run');

function cellStr(v) {
  return String(v == null ? '' : v).trim();
}
function isChecked(v) {
  // 未打勾 = 空；打勾 = 该列非空（√/✅/✓/☑ 等任意标记）
  return cellStr(v) !== '';
}
function isBlankName(n) {
  return !n || n === '/' || n === '—' || n === '-';
}

/** 找某年月的「乡镇作业中心经理月度考核结果」文件 */
function findManagerFile(year, month) {
  const dir = path.join(BASE_DIR, `${year}年`, `${month}月`);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith('~$'))
    .filter((n) => /\.(xlsx|xls)$/i.test(n))
    .filter((n) => /乡镇作业中心经理/.test(n) && !/管理员/.test(n) && !/综管/.test(n));
  if (!files.length) return null;
  files.sort((a, b) => (/^[\d月]+乡镇作业中心经理月度考核结果/.test(a) ? 0 : 1) - (/^[\d月]+乡镇作业中心经理月度考核结果/.test(b) ? 0 : 1));
  return path.join(dir, files[0]);
}

/** 解析「三检表」工作表：返回 [{ town, name, checked }] */
function parseSanjianSheet(wb) {
  const sn = (wb.SheetNames || []).find((n) => n === '三检表' || /^三检表/.test(String(n)) || String(n).includes('三检'));
  if (!sn) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  let head = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    if (cellStr(r[0]) === '乡镇' && cellStr(r[2]) === '姓名') { head = i; break; }
  }
  if (head < 0) return null;
  const out = [];
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[2]);
    if (isBlankName(name)) continue;
    const town = cellStr(r[0]);
    const checkCell = r[4]; // 末列 = 月度打勾列
    out.push({ town, name, checked: isChecked(checkCell) });
  }
  return out;
}

async function run() {
  const months = [];
  for (const year of [2025, 2026]) {
    const ydir = path.join(BASE_DIR, `${year}年`);
    if (!fs.existsSync(ydir)) continue;
    for (const m of fs.readdirSync(ydir).filter((n) => /^\d{1,2}月$/.test(n))) {
      const mon = Number(m.replace('月', ''));
      const f = findManagerFile(year, mon);
      if (f) months.push({ year, month: mon, file: f, monthStr: `${year}-${String(mon).padStart(2, '0')}` });
    }
  }
  months.sort((a, b) => a.monthStr.localeCompare(b.monthStr));
  if (!months.length) { console.log('未找到任何月份，检查 BASE_DIR: ' + BASE_DIR); return; }

  let totalUpdated = 0;
  let totalCreated = 0;
  const report = [];

  for (const mo of months) {
    let wb;
    try { wb = XLSX.readFile(mo.file); } catch (e) { console.log(`[${mo.monthStr}] 读取失败: ${e.message}`); continue; }
    const list = parseSanjianSheet(wb);
    if (!list) { console.log(`[${mo.monthStr}] 无「三检表」工作表，跳过`); continue; }

    // 预取当月现有行（按 姓名 → id）
    const existing = [];
    {
      const r = await pool.query('SELECT id, name FROM driver_monthly WHERE month=$1 AND is_deleted=false', [mo.monthStr]);
      existing.push(...r.rows);
    }
    const idByName = new Map(existing.map((x) => [x.name, x.id]));

    let updated = 0, created = 0, skipped = 0;
    for (const rec of list) {
      const val = rec.checked ? 0 : 10;
      const id = idByName.get(rec.name);
      if (id != null) {
        if (!DRY_RUN) await pool.query('UPDATE driver_monthly SET three_check_management=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [val, id]);
        updated++;
      } else {
        // 兜底：由乡镇推断部门，新建该月行
        const dept = rec.town ? `${rec.town}作业中心` : '';
        if (!DRY_RUN) {
          const ins = await pool.query(
            `INSERT INTO driver_monthly (month, name, department, three_check_management)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [mo.monthStr, rec.name, dept, val]
          );
          idByName.set(rec.name, ins.rows[0].id);
        }
        created++;
      }
    }
    totalUpdated += updated;
    totalCreated += created;
    report.push({ month: mo.monthStr, file: path.basename(mo.file), rows: list.length, updated, created });
    console.log(`[${mo.monthStr}] 三检表 ${list.length} 人 → 更新 ${updated}，新建 ${created}${DRY_RUN ? '（dry-run）' : ''}`);
  }

  console.log('\n===== 汇总 =====');
  console.log(`更新 ${totalUpdated}，新建 ${totalCreated}${DRY_RUN ? '（dry-run，未写库）' : ''}`);
  if (DRY_RUN) {
    console.log('\n如需真正写库，去掉 --dry-run 重新运行。');
  }
  return report;
}

run()
  .finally(() => pool.end());