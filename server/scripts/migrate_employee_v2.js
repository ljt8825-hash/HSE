/**
 * @deprecated since v1.2
 * 本脚本写入 hse_employee_relation 表（已冻结，只允许 SELECT）。
 * 员工导入请使用 employee-import-v2 路由。
 * 本文件保留仅用于历史审计，禁止在生产环境执行。
 *
 * HSE V2.1 员工组织关系迁移脚本
 * 版本: v68
 * 功能: 读取花名册Excel，生成 hse_operation_unit 和 hse_employee_relation 记录
 * 执行: node scripts/migrate_employee_v2.js --excel=../数据源/02_保险及人员管理/人员保险/花名册.xlsx
 * 回滚: DELETE FROM hse_employee_relation WHERE created_by='migration_v68';
 *       DELETE FROM hse_operation_unit WHERE unit_code LIKE 'UNIT-MIG-%';
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

// 加载环境变量
require('dotenv').config();

// 命令行参数解析
const args = process.argv.slice(2);
const excelPathArg = args.find(a => a.startsWith('--excel='))?.replace('--excel=', '');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

const EXCEL_PATH = excelPathArg || path.join(__dirname, '..', '..', '数据源', '02_保险及人员管理', '人员保险', '花名册.xlsx');

// 数据库连接
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'hse_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

// ============================================================
// 乡镇编码映射（12个乡镇）
// ============================================================
const TOWN_CODE_MAP = {
  '长官镇': { code: 'TOWN-CHANGGUAN', short: 'CG' },
  '张大庄镇': { code: 'TOWN-ZHANGDAZHUANG', short: 'ZDZ' },
  '大曹镇': { code: 'TOWN-DACAO', short: 'DC' },
  '杜集镇': { code: 'TOWN-DUJI', short: 'DJ' },
  '柴胡店镇': { code: 'TOWN-CHAIHUDIAN', short: 'CHD' },
  '保店镇': { code: 'TOWN-BAODIAN', short: 'BD' },
  '大柳镇': { code: 'TOWN-DALIU', short: 'DL' },
  '相衙镇': { code: 'TOWN-XIANGYA', short: 'XY' },
  '刘营伍乡': { code: 'TOWN-LIUYINGWU', short: 'LYW' },
  '时集镇': { code: 'TOWN-SHIJI', short: 'SJ' },
  '宁城街道': { code: 'TOWN-NINGCHENG', short: 'NC' },
  '津城街道': { code: 'TOWN-JINCHENG', short: 'JC' },
};

// 岗位映射
const POSITION_MAP = {
  '项目总经理': 'POS-GM',
  '环卫中心副经理': 'POS-HW-MGR',
  '生产作业中心副经理（人工）': 'POS-HW-MGR',
  '人工片区长': 'POS-AREA-MGR',
  '人工班长': 'POS-FOREMAN',
  '司机': 'POS-DRIVER',
  '垃圾收运车驾驶员': 'POS-DRIVER',
  '乡镇保洁员': 'POS-CLEANER',
  '保洁员': 'POS-CLEANER',
  '中转站管理员': 'POS-STATION',
  '垃圾收运辅助工': 'POS-COLLECT-HELPER',
  '安环副经理': 'POS-SAFETY-MGR',
  '安环专员': 'POS-SAFETY',
};

// 职能部门映射
const DEPT_CODE_MAP = {
  '项目管理层': 'DEPT-MANAGE',
  '人力综合部': 'DEPT-HR',
  '生产管理部': 'DEPT-PROD',
  '安环品质部': 'DEPT-SAFETY',
  '安环管理部': 'DEPT-SAFETY',
  '财务部': 'DEPT-FIN',
  '环卫作业中心': 'CENTER-HW',
};

// ============================================================
// 工具函数
// ============================================================

function log(msg, level = 'info') {
  const time = new Date().toISOString().slice(11, 19);
  const prefix = {
    info:  '[INFO]',
    warn:  '[WARN]',
    error: '[ERROR]',
    ok:    '[OK]  ',
    dry:   '[DRY] ',
  }[level] || '[INFO]';
  console.log(`${time} ${prefix} ${msg}`);
}

// 从部门名提取乡镇名
function extractTown(deptName) {
  for (const town of Object.keys(TOWN_CODE_MAP)) {
    if (deptName.includes(town)) {
      return town;
    }
  }
  return null;
}

// 从部门名提取班号（支持合并班如"三四班"、"六七班"）
function extractClassNum(deptName) {
  const match = deptName.match(/([一二三四五六七八九十]+)班/);
  if (!match) return null;
  const numStr = match[1];
  
  // 单个数字
  const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  if (numMap[numStr]) return numMap[numStr];
  
  // 合并班如"三四" → 返回字符串标识（用于命名和编码）
  // 三四 → 3-4, 六七 → 6-7
  const multiNumMap = {
    '三四': '3-4',
    '六七': '6-7',
    '七八': '7-8',
    '八九': '8-9',
  };
  if (multiNumMap[numStr]) return multiNumMap[numStr];
  
  // 兜底：直接返回字符串
  return numStr;
}

// 班号转为编码后缀（数字补零，字符串原样）
function classNumToSuffix(classNum) {
  if (typeof classNum === 'number') {
    return String(classNum).padStart(3, '0');
  }
  // 字符串类的合并班（如"3-4"）→ 转为特殊编码
  return classNum.replace('-', '');
}

// 班号转为显示名
function classNumToName(classNum) {
  if (typeof classNum === 'number') {
    return `第${classNum}`;
  }
  // 合并班
  const nameMap = {
    '3-4': '三四',
    '6-7': '六七',
    '7-8': '七八',
    '8-9': '八九',
  };
  return nameMap[classNum] || classNum;
}

// 判断是否为片区
function isArea(deptName) {
  return deptName.includes('片区') || deptName === '车队';
}

// 判断是否为职能部门
function isFunctionDept(deptName) {
  return DEPT_CODE_MAP.hasOwnProperty(deptName);
}

// ============================================================
// 读取Excel
// ============================================================

function readExcel(filePath) {
  log(`读取Excel文件: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel文件不存在: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  const headers = data[0];
  const rows = [];

  // 查找关键列索引
  const deptIdx = headers.findIndex(h => h === '所属部门');
  const positionIdx = headers.findIndex(h => h === '职位');
  const supervisorIdx = headers.findIndex(h => h === '直接上级');
  const nameIdx = headers.findIndex(h => h === '姓名');
  const codeIdx = headers.findIndex(h => h === '员工编码');
  const idCardIdx = headers.findIndex(h => h === '身份证号') || 2; // 备选位置

  log(`Excel解析完成: ${data.length - 1}条记录`);
  if (verbose) {
    log(`列索引: 部门=${deptIdx}, 职位=${positionIdx}, 上级=${supervisorIdx}, 姓名=${nameIdx}, 工号=${codeIdx}`);
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[nameIdx]) continue; // 跳过空行

    rows.push({
      rowNum: i + 1,
      employee_code: row[codeIdx] || '',
      name: row[nameIdx] || '',
      id_card: row[idCardIdx] || '',
      dept: row[deptIdx] || '',
      position: row[positionIdx] || '',
      supervisor: row[supervisorIdx] || '',
    });
  }

  return rows;
}

// ============================================================
// 生成作业单元（从Excel数据中提取）
// 三层拆分规则:
//   1. XX镇片区 → hse_org_unit (乡镇作业中心，管理组织)
//   2. XX镇X班 → hse_operation_unit (保洁组，生产作业单元，挂在乡镇org下)
//   3. 片区司机 → hse_operation_unit (收运车组，挂在乡镇org下)
//   4. 片区中转站管理员 → hse_operation_unit (转运站，挂在乡镇org下)
//   5. 片区长 → 只属于 org_unit (管理人员，无作业单元)
//   6. 车队 → hse_operation_unit (中心直属车组，挂在环卫作业中心下)
//   7. 职能部门员工 → 只属于 org_unit (职能部门，无作业单元)
// ============================================================

function generateOperationUnits(rows) {
  const units = [];

  // 按部门类型分组
  const townTeamDepts = [];  // XX镇X班 → 保洁组
  const townAreaDepts = [];  // XX镇片区 → 乡镇org(片区长无unit) + 收运车组 + 转运站
  const centerFleetDept = []; // 车队 → 中心直属车组
  const functionDepts = [];   // 职能部门 → 仅org，无unit

  for (const row of rows) {
    const dept = row.dept;

    if (dept === '车队') {
      centerFleetDept.push(row);
    } else if (dept.includes('片区')) {
      townAreaDepts.push(row);
    } else if (dept.match(/(镇|街道|乡).*班/)) {
      townTeamDepts.push(row);
    } else if (isFunctionDept(dept)) {
      functionDepts.push(row);
    } else {
      // 其他归为职能部门类
      functionDepts.push(row);
    }
  }

  // ========== 1. 保洁组（从XX镇X班生成）==========
  let unitNum = 0;
  const classMap = new Map(); // key: town_班号, value: members

  for (const row of townTeamDepts) {
    const town = extractTown(row.dept);
    if (!town) continue;

    const classNum = extractClassNum(row.dept);
    if (!classNum) continue;

    const key = `${town}_${classNum}`;
    if (!classMap.has(key)) {
      classMap.set(key, []);
    }
    classMap.get(key).push(row);
  }

  for (const [key, members] of classMap.entries()) {
    const [town, classNum] = key.split('_');
    const townInfo = TOWN_CODE_MAP[town];
    if (!townInfo) continue;

    unitNum++;
    units.push({
      town,
      town_code: townInfo.code,
      parent_org_code: townInfo.code, // 挂在乡镇作业中心下
      unit_name: `${town}${classNumToName(classNum)}保洁组`,
      unit_type: 'cleaning_team',
      unit_code: `UNIT-${townInfo.short}-CLEAN-${classNumToSuffix(classNum)}`,
      headcount: members.length,
      members,
    });
  }

  // ========== 2. 收运车组 + 转运站（从XX镇片区生成）==========
  const townAreaData = new Map(); // town → { drivers, stationManagers, areaMgrs, helpers }

  for (const row of townAreaDepts) {
    const town = extractTown(row.dept);
    if (!town) continue;

    if (!townAreaData.has(town)) {
      townAreaData.set(town, {
        drivers: [],
        stationManagers: [],
        areaMgrs: [],
        helpers: [],
      });
    }
    const data = townAreaData.get(town);
    const pos = row.position;

    if (pos === '司机') {
      data.drivers.push(row);
    } else if (pos === '中转站管理员') {
      data.stationManagers.push(row);
    } else if (pos === '人工片区长') {
      data.areaMgrs.push(row);
    } else if (pos === '垃圾收运辅助工') {
      data.helpers.push(row);
    }
  }

  for (const [town, data] of townAreaData.entries()) {
    const townInfo = TOWN_CODE_MAP[town];
    if (!townInfo) continue;

    // 收运车组（司机 + 收运辅助工）
    if (data.drivers.length > 0) {
      unitNum++;
      const allMembers = [...data.drivers, ...data.helpers];
      units.push({
        town,
        town_code: townInfo.code,
        parent_org_code: townInfo.code,
        unit_name: `${town}收运车组`,
        unit_type: 'collection_team',
        unit_code: `UNIT-${townInfo.short}-COLLECT-001`,
        headcount: allMembers.length,
        members: allMembers,
      });
    }

    // 转运站
    if (data.stationManagers.length > 0) {
      unitNum++;
      units.push({
        town,
        town_code: townInfo.code,
        parent_org_code: townInfo.code,
        unit_name: `${town}转运站`,
        unit_type: 'transfer_station',
        unit_code: `UNIT-${townInfo.short}-TRANSFER-001`,
        headcount: data.stationManagers.length,
        members: data.stationManagers,
      });
    }
  }

  // ========== 3. 中心直属车组（车队）==========
  if (centerFleetDept.length > 0) {
    unitNum++;
    units.push({
      town: null,
      town_code: null,
      parent_org_code: 'CENTER-HW', // 挂在环卫作业中心下
      unit_name: '中心垃圾转运车组',
      unit_type: 'vehicle_team',
      unit_code: 'UNIT-CENTER-VEHICLE-001',
      headcount: centerFleetDept.length,
      members: centerFleetDept,
    });
  }

  log(`生成作业单元: ${units.length}个`);
  if (verbose) {
    const types = {};
    for (const u of units) {
      types[u.unit_type] = (types[u.unit_type] || 0) + 1;
    }
    log(`作业单元类型分布: ${JSON.stringify(types)}`);

    // 人员统计
    let totalMembers = 0;
    for (const u of units) totalMembers += u.members.length;
    log(`作业单元内总人数: ${totalMembers}`);
    log(`仅组织(无作业单元)人数: ${rows.length - totalMembers} (片区长/职能部门/管理人员等)`);
  }

  return units;
}

// ============================================================
// 主迁移函数
// ============================================================

async function migrate() {
  const startTime = Date.now();
  let client;

  try {
    log('========================================');
    log('HSE V2.1 员工组织关系迁移开始');
    log('========================================');

    if (dryRun) {
      log('DRY RUN 模式 - 不写入数据库', 'warn');
    }

    // 1. 读取Excel
    const rows = readExcel(EXCEL_PATH);

    // 2. 连接数据库
    if (!dryRun) {
      client = await pool.connect();
      log('数据库连接成功');

      // 检查v68迁移是否已执行
      const checkResult = await client.query(
        "SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_name = 'hse_org_unit'"
      );
      if (checkResult.rows[0].count === 0) {
        throw new Error('hse_org_unit表不存在，请先执行 v68 表结构迁移');
      }
    }

    // 3. 生成作业单元
    const operationUnits = generateOperationUnits(rows);

    // 4. 构建员工→作业单元映射
    const employeeUnitMap = new Map(); // key: 员工姓名+工号, value: unit_code
    for (const unit of operationUnits) {
      for (const member of unit.members) {
        const key = `${member.name}_${member.employee_code}`;
        employeeUnitMap.set(key, unit.unit_code);
      }
    }

    // 5. 统计
    const stats = {
      total: rows.length,
      matched_org: 0,
      matched_unit: 0,
      matched_position: 0,
      matched_supervisor: 0,
      skipped: 0,
    };

    // 6. 执行迁移
    if (!dryRun) {
      await client.query('BEGIN');

      // 6.1 插入作业单元
      log('插入作业单元...');
      let insertedUnits = 0;
      for (const unit of operationUnits) {
        // 获取父组织 org_unit_id (使用 parent_org_code)
        const orgResult = await client.query(
          'SELECT id FROM hse_org_unit WHERE org_code = $1 AND is_deleted = false',
          [unit.parent_org_code]
        );
        if (orgResult.rows.length === 0) {
          log(`跳过作业单元 ${unit.unit_name}: 找不到父组织 ${unit.parent_org_code}`, 'warn');
          continue;
        }
        const orgUnitId = orgResult.rows[0].id;

        // 检查是否已存在
        const existResult = await client.query(
          'SELECT id FROM hse_operation_unit WHERE unit_code = $1 AND is_deleted = false',
          [unit.unit_code]
        );
        
        if (existResult.rows.length > 0) {
          // 更新 headcount
          await client.query(
            'UPDATE hse_operation_unit SET headcount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [unit.headcount, existResult.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO hse_operation_unit 
              (org_unit_id, unit_name, unit_type, unit_code, headcount, status, description)
             VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
            [orgUnitId, unit.unit_name, unit.unit_type, unit.unit_code, unit.headcount, '迁移生成']
          );
          insertedUnits++;
        }
      }
      log(`作业单元处理完成: 新增${insertedUnits}个，更新${operationUnits.length - insertedUnits}个`, 'ok');

      // 6.2 构建员工ID映射（通过employee_code或name）
      log('构建员工映射...');
      const empMap = new Map(); // key: name_code, value: id
      
      // 获取所有员工
      const allEmps = await client.query(
        'SELECT id, employee_code, name FROM employee WHERE is_deleted = false'
      );
      for (const emp of allEmps.rows) {
        empMap.set(`${emp.name}_${emp.employee_code || ''}`, emp.id);
        empMap.set(emp.employee_code, emp.id);
        empMap.set(emp.name, emp.id); // 兜底：仅按姓名
      }
      log(`员工映射构建完成: ${allEmps.rows.length}人`);

      // 6.3 构建岗位ID映射
      const posMap = new Map();
      const positions = await client.query(
        'SELECT id, position_code, name FROM position WHERE is_deleted = false'
      );
      for (const p of positions.rows) {
        if (p.position_code) posMap.set(p.position_code, p.id);
        posMap.set(p.name, p.id);
      }

      // 6.4 插入人员关系
      log('生成人员组织关系...');
      let insertedRelations = 0;
      let updatedRelations = 0;
      let skipped = 0;
      let errorCount = 0;

      // 先清空本次迁移生成的旧关系（如果重跑）
      await client.query(
        "DELETE FROM hse_employee_relation WHERE created_by = 'migration_v68'"
      );

      for (const row of rows) {
        try {
          // 匹配员工ID
          let employeeId = empMap.get(`${row.name}_${row.employee_code}`)
            || empMap.get(row.employee_code)
            || empMap.get(row.name);

          if (!employeeId) {
            if (verbose) {
              log(`跳过 ${row.name}(${row.employee_code}): 找不到员工记录`, 'warn');
            }
            skipped++;
            continue;
          }

          // 匹配组织ID
          let orgUnitId = null;
          const town = extractTown(row.dept);
          
          if (town && TOWN_CODE_MAP[town]) {
            // 乡镇作业中心 (XX镇片区 / XX镇X班 都归属于对应乡镇作业中心)
            const orgResult = await client.query(
              'SELECT id FROM hse_org_unit WHERE org_code = $1 AND is_deleted = false',
              [TOWN_CODE_MAP[town].code]
            );
            if (orgResult.rows.length > 0) {
              orgUnitId = orgResult.rows[0].id;
              stats.matched_org++;
            }
          } else if (row.dept === '车队') {
            // 车队 → 环卫作业中心
            const orgResult = await client.query(
              "SELECT id FROM hse_org_unit WHERE org_code = 'CENTER-HW' AND is_deleted = false"
            );
            if (orgResult.rows.length > 0) {
              orgUnitId = orgResult.rows[0].id;
              stats.matched_org++;
            }
          } else if (isFunctionDept(row.dept)) {
            // 职能部门/中心
            const deptCode = DEPT_CODE_MAP[row.dept];
            const orgResult = await client.query(
              'SELECT id FROM hse_org_unit WHERE org_code = $1 AND is_deleted = false',
              [deptCode]
            );
            if (orgResult.rows.length > 0) {
              orgUnitId = orgResult.rows[0].id;
              stats.matched_org++;
            }
          }

          if (!orgUnitId) {
            log(`跳过 ${row.name}: 找不到组织 "${row.dept}"`, 'warn');
            skipped++;
            continue;
          }

          // 匹配作业单元ID
          let opUnitId = null;
          const unitKey = `${row.name}_${row.employee_code}`;
          const unitCode = employeeUnitMap.get(unitKey);
          
          if (unitCode) {
            const unitResult = await client.query(
              'SELECT id FROM hse_operation_unit WHERE unit_code = $1 AND is_deleted = false',
              [unitCode]
            );
            if (unitResult.rows.length > 0) {
              opUnitId = unitResult.rows[0].id;
              stats.matched_unit++;
            }
          }

          // 匹配岗位ID
          let positionId = null;
          const posCode = POSITION_MAP[row.position];
          if (posCode && posMap.has(posCode)) {
            positionId = posMap.get(posCode);
            stats.matched_position++;
          } else if (posMap.has(row.position)) {
            positionId = posMap.get(row.position);
            stats.matched_position++;
          }

          // 匹配上级ID
          let supervisorId = null;
          if (row.supervisor) {
            supervisorId = empMap.get(row.supervisor) || null;
            if (supervisorId) stats.matched_supervisor++;
          }

          // 插入关系记录
          await client.query(
            `INSERT INTO hse_employee_relation
              (employee_id, org_unit_id, operation_unit_id, position_id, supervisor_id,
               is_current, status, start_date, is_primary, remark, created_by)
             VALUES ($1, $2, $3, $4, $5, true, 'active', CURRENT_DATE, true, $6, 'migration_v68')`,
            [
              employeeId,
              orgUnitId,
              opUnitId,
              positionId,
              supervisorId,
              `迁移自: ${row.dept} / ${row.position}`,
            ]
          );
          insertedRelations++;

        } catch (err) {
          errorCount++;
          log(`处理第${row.rowNum}行 ${row.name} 失败: ${err.message}`, 'error');
        }
      }

      log(`人员关系生成完成: 新增${insertedRelations}条，跳过${skipped}条，错误${errorCount}条`, 'ok');

      // 6.5 更新组织headcount
      log('更新组织编制人数...');
      await client.query(`
        UPDATE hse_org_unit ou SET headcount = sub.cnt
        FROM (
          SELECT org_unit_id, COUNT(*)::int as cnt
          FROM hse_employee_relation
          WHERE is_current = true AND is_deleted = false
          GROUP BY org_unit_id
        ) sub
        WHERE ou.id = sub.org_unit_id AND ou.is_deleted = false
      `);
      log('组织编制人数更新完成', 'ok');

      await client.query('COMMIT');
      log('数据库事务提交成功', 'ok');

      // 7. 更新统计
      stats.total = rows.length;
      stats.skipped = skipped;

    } else {
      // DRY RUN 模式
      log(`DRY RUN: 将生成 ${operationUnits.length} 个作业单元, ${rows.length} 条人员关系`, 'dry');
    }

    // 8. 输出统计
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('========================================');
    log('迁移统计');
    log('========================================');
    log(`总记录数:       ${stats.total || rows.length}`);
    log(`作业单元数:     ${operationUnits.length}`);
    if (!dryRun) {
      log(`组织匹配:       ${stats.matched_org}`);
      log(`单元匹配:       ${stats.matched_unit}`);
      log(`岗位匹配:       ${stats.matched_position}`);
      log(`上级匹配:       ${stats.matched_supervisor}`);
      log(`跳过记录:       ${stats.skipped}`);
    }
    log(`耗时:           ${duration}秒`);
    log('========================================');
    log('迁移完成！', 'ok');

  } catch (err) {
    log(`迁移失败: ${err.message}`, 'error');
    if (client) {
      try { await client.query('ROLLBACK'); } catch (e) {}
      log('数据库已回滚', 'warn');
    }
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
    pool.end();
  }
}

// ============================================================
// 命令行帮助
// ============================================================

function showHelp() {
  console.log(`
HSE V2.1 员工组织关系迁移脚本

用法:
  node scripts/migrate_employee_v2.js [选项]

选项:
  --excel=<路径>    指定Excel文件路径
  --dry-run         试运行，不写入数据库
  --verbose         输出详细日志
  --help            显示帮助

示例:
  node scripts/migrate_employee_v2.js --dry-run
  node scripts/migrate_employee_v2.js --excel=../花名册.xlsx
  node scripts/migrate_employee_v2.js

回滚:
  DELETE FROM hse_employee_relation WHERE created_by = 'migration_v68';
  DELETE FROM hse_operation_unit WHERE unit_code LIKE 'UNIT-%' AND description = '迁移生成';
  `);
}

// 主入口
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

migrate();
