/**
 * V2.1 三层拆分验证脚本
 * 验证: 组织层级 + 生产作业单元 + 岗位 三层拆分正确性
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = 'F:\\deploy\\hse-dashboard\\数据源\\02_保险及人员管理\\人员保险\\花名册.xlsx';

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

const DEPT_CODE_MAP = {
  '项目管理层': 'DEPT-MANAGE',
  '人力综合部': 'DEPT-HR',
  '生产管理部': 'DEPT-PROD',
  '安环品质部': 'DEPT-SAFETY',
  '安环管理部': 'DEPT-SAFETY',
  '财务部': 'DEPT-FIN',
  '环卫作业中心': 'CENTER-HW',
};

const POSITION_MAP = {
  '项目总经理': 'POS-GM',
  '生产作业中心副经理（人工）': 'POS-HW-MGR',
  '人力综合部副经理': 'POS-HR-MGR',
  '生产管理部经理': 'POS-PROD-MGR',
  '安环管理部副经理': 'POS-SAFETY-MGR',
  '会计': 'POS-FIN',
  '人事专员': 'POS-HR',
  '行政综合主管': 'POS-ADMIN',
  '库管专员': 'POS-STOCK',
  '主管': 'POS-SUPERVISOR',
  '标准化专员': 'POS-STD',
  '维保管理专员': 'POS-MAINT',
  '安环专员': 'POS-SAFETY',
  '文员': 'POS-CLERK',
  '人工片区长': 'POS-AREA-MGR',
  '人工班长': 'POS-FOREMAN',
  '司机': 'POS-DRIVER',
  '垃圾收运车驾驶员': 'POS-DRIVER',
  '乡镇保洁员': 'POS-CLEANER',
  '保洁员': 'POS-CLEANER',
  '中转站管理员': 'POS-STATION',
  '垃圾收运辅助工': 'POS-COLLECT-HELPER',
};

function readExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  const headers = data[0];
  const rows = [];
  const deptIdx = headers.findIndex(h => h === '所属部门');
  const positionIdx = headers.findIndex(h => h === '职位');
  const nameIdx = headers.findIndex(h => h === '姓名');
  const codeIdx = headers.findIndex(h => h === '员工编码');
  const supervisorIdx = headers.findIndex(h => h === '直接上级');
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[nameIdx]) continue;
    rows.push({
      name: row[nameIdx] || '',
      employee_code: row[codeIdx] || '',
      dept: row[deptIdx] || '',
      position: row[positionIdx] || '',
      supervisor: row[supervisorIdx] || '',
    });
  }
  return rows;
}

function extractTown(deptName) {
  for (const town of Object.keys(TOWN_CODE_MAP)) {
    if (deptName.includes(town)) return town;
  }
  return null;
}

function extractClassNum(deptName) {
  const match = deptName.match(/([一二三四五六七八九十]+)班/);
  if (!match) return null;
  const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  return numMap[match[1]] || null;
}

function isFunctionDept(deptName) {
  return DEPT_CODE_MAP.hasOwnProperty(deptName);
}

function validate() {
  const rows = readExcel();
  
  console.log('='.repeat(70));
  console.log('V2.1 三层拆分验证报告');
  console.log('='.repeat(70));
  console.log(`总人数: ${rows.length}`);
  console.log('');

  // ============== 第一层: 组织层级 (hse_org_unit) ==============
  console.log('【第一层: 组织层级 hse_org_unit】');
  console.log('-'.repeat(70));
  
  const orgAssignments = [];
  const orgStats = new Map(); // org_code → count
  
  for (const row of rows) {
    let orgCode = null;
    let orgType = null;
    let orgName = null;
    const town = extractTown(row.dept);
    
    if (town && TOWN_CODE_MAP[town]) {
      // 乡镇作业中心 (片区 + 班组 都属于乡镇作业中心)
      orgCode = TOWN_CODE_MAP[town].code;
      orgType = 'town_center';
      orgName = `${town}作业中心`;
    } else if (row.dept === '车队') {
      orgCode = 'CENTER-HW';
      orgType = 'operation_center';
      orgName = '环卫作业中心';
    } else if (isFunctionDept(row.dept)) {
      orgCode = DEPT_CODE_MAP[row.dept];
      orgType = row.dept === '环卫作业中心' ? 'operation_center' : 'department';
      orgName = row.dept;
    } else {
      orgCode = 'UNKNOWN';
      orgType = 'unknown';
      orgName = row.dept;
    }
    
    orgAssignments.push({ ...row, orgCode, orgType, orgName });
    orgStats.set(orgCode, (orgStats.get(orgCode) || 0) + 1);
  }
  
  console.log(`\n组织分配: ${orgAssignments.filter(r => r.orgCode !== 'UNKNOWN').length}/${rows.length}人`);
  console.log(`未匹配组织: ${orgAssignments.filter(r => r.orgCode === 'UNKNOWN').length}人`);
  
  console.log('\n按组织类型统计:');
  const typeStats = new Map();
  for (const r of orgAssignments) {
    typeStats.set(r.orgType, (typeStats.get(r.orgType) || 0) + 1);
  }
  for (const [type, count] of typeStats.entries()) {
    console.log(`  ${type.padEnd(20)}: ${count}人`);
  }
  
  console.log('\n各组织人数:');
  const sortedOrgs = Array.from(orgStats.entries()).sort((a, b) => b[1] - a[1]);
  for (const [orgCode, count] of sortedOrgs) {
    console.log(`  ${orgCode.padEnd(25)}: ${count}人`);
  }

  // ============== 第二层: 生产作业单元 (hse_operation_unit) ==============
  console.log('\n');
  console.log('【第二层: 生产作业单元 hse_operation_unit】');
  console.log('-'.repeat(70));
  
  const unitAssignments = [];
  const unitStats = new Map();
  
  for (const row of rows) {
    let unitCode = null;
    let unitType = null;
    let unitName = null;
    const town = extractTown(row.dept);
    
    if (row.dept === '车队') {
      // 中心直属车组
      unitCode = 'UNIT-CENTER-VEHICLE-001';
      unitType = 'vehicle_team';
      unitName = '中心垃圾转运车组';
    } else if (town && row.dept.match(/(镇|街道|乡).*班/)) {
      // 保洁组
      const classNum = extractClassNum(row.dept);
      if (classNum) {
        const townInfo = TOWN_CODE_MAP[town];
        unitCode = `UNIT-${townInfo.short}-CLEAN-${String(classNum).padStart(3, '0')}`;
        unitType = 'cleaning_team';
        unitName = `${town}第${classNum}保洁组`;
      }
    } else if (town && row.dept.includes('片区')) {
      // 片区里的岗位按类型分配
      const pos = row.position;
      const townInfo = TOWN_CODE_MAP[town];
      if (pos === '司机' || pos === '垃圾收运辅助工') {
        unitCode = `UNIT-${townInfo.short}-COLLECT-001`;
        unitType = 'collection_team';
        unitName = `${town}收运车组`;
      } else if (pos === '中转站管理员') {
        unitCode = `UNIT-${townInfo.short}-TRANSFER-001`;
        unitType = 'transfer_station';
        unitName = `${town}转运站`;
      } else if (pos === '人工片区长') {
        // 片区长只有组织，没有作业单元
        unitCode = null;
        unitType = null;
        unitName = null;
      }
    }
    // 职能部门/管理层: 没有作业单元
    
    unitAssignments.push({ ...row, unitCode, unitType, unitName });
    if (unitCode) {
      unitStats.set(unitCode, (unitStats.get(unitCode) || 0) + 1);
    }
  }
  
  const withUnit = unitAssignments.filter(r => r.unitCode).length;
  const withoutUnit = unitAssignments.filter(r => !r.unitCode).length;
  
  console.log(`\n有作业单元: ${withUnit}人 (${((withUnit/rows.length)*100).toFixed(1)}%)`);
  console.log(`仅组织(无作业单元): ${withoutUnit}人 (${((withoutUnit/rows.length)*100).toFixed(1)}%)`);
  
  console.log('\n按作业单元类型统计:');
  const unitTypeStats = new Map();
  for (const r of unitAssignments) {
    if (r.unitType) {
      unitTypeStats.set(r.unitType, (unitTypeStats.get(r.unitType) || 0) + 1);
    }
  }
  for (const [type, count] of unitTypeStats.entries()) {
    const typeCount = Array.from(unitStats.keys()).filter(k => {
      if (type === 'cleaning_team') return k.includes('CLEAN');
      if (type === 'collection_team') return k.includes('COLLECT');
      if (type === 'transfer_station') return k.includes('TRANSFER');
      if (type === 'vehicle_team') return k.includes('VEHICLE');
      return false;
    }).length;
    console.log(`  ${type.padEnd(20)}: ${typeCount}个单元, ${count}人`);
  }
  
  console.log('\n无作业单元人员明细 (按岗位):');
  const noUnitPosStats = new Map();
  for (const r of unitAssignments) {
    if (!r.unitCode) {
      noUnitPosStats.set(r.position, (noUnitPosStats.get(r.position) || 0) + 1);
    }
  }
  const sortedNoUnit = Array.from(noUnitPosStats.entries()).sort((a, b) => b[1] - a[1]);
  for (const [pos, count] of sortedNoUnit) {
    console.log(`  ${pos.padEnd(25)}: ${count}人`);
  }

  // ============== 第三层: 岗位 (position) ==============
  console.log('\n');
  console.log('【第三层: 岗位 position】');
  console.log('-'.repeat(70));
  
  const posStats = new Map();
  let matchedPos = 0;
  for (const row of rows) {
    posStats.set(row.position, (posStats.get(row.position) || 0) + 1);
    if (POSITION_MAP[row.position]) matchedPos++;
  }
  
  console.log(`\n岗位匹配: ${matchedPos}/${rows.length}人 (${((matchedPos/rows.length)*100).toFixed(1)}%)`);
  console.log(`岗位种类: ${posStats.size}种`);
  
  console.log('\n各岗位人数:');
  const sortedPos = Array.from(posStats.entries()).sort((a, b) => b[1] - a[1]);
  for (const [pos, count] of sortedPos) {
    const mapped = POSITION_MAP[pos] ? '✓' : '✗';
    console.log(`  ${mapped} ${pos.padEnd(25)}: ${String(count).padStart(4)}人`);
  }

  // ============== 三层联动验证 ==============
  console.log('\n');
  console.log('【三层联动验证】');
  console.log('-'.repeat(70));
  
  let threeLayerCount = 0;
  let twoLayerCount = 0;
  let oneLayerCount = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const org = orgAssignments[i];
    const unit = unitAssignments[i];
    const hasOrg = org.orgCode !== 'UNKNOWN';
    const hasUnit = !!unit.unitCode;
    const hasPos = !!POSITION_MAP[rows[i].position];
    
    if (hasOrg && hasUnit && hasPos) {
      threeLayerCount++;
    } else if (hasOrg && hasPos) {
      twoLayerCount++; // 有组织+岗位，但无作业单元（正常：管理人员）
    } else if (hasOrg) {
      oneLayerCount++;
    }
  }
  
  console.log(`\n三层完整(组织+单元+岗位): ${threeLayerCount}人 (${((threeLayerCount/rows.length)*100).toFixed(1)}%)`);
  console.log(`二层(组织+岗位, 无单元):  ${twoLayerCount}人 (${((twoLayerCount/rows.length)*100).toFixed(1)}%) → 管理人员/职能部门正常`);
  console.log(`仅一层(只有组织):          ${oneLayerCount}人 (${((oneLayerCount/rows.length)*100).toFixed(1)}%)`);
  console.log(`完全无匹配:               ${rows.length - threeLayerCount - twoLayerCount - oneLayerCount}人`);

  // ============== 典型样例验证 ==============
  console.log('\n');
  console.log('【典型样例验证】');
  console.log('-'.repeat(70));
  
  const examples = [
    { dept: '长官镇片区', pos: '人工片区长', desc: '片区长 → 乡镇org + 无unit + 片区长岗位' },
    { dept: '长官镇一班', pos: '乡镇保洁员', desc: '保洁员 → 乡镇org + 保洁组unit + 保洁员岗位' },
    { dept: '长官镇片区', pos: '司机', desc: '片区司机 → 乡镇org + 收运车组unit + 司机岗位' },
    { dept: '长官镇片区', pos: '中转站管理员', desc: '中转站管理员 → 乡镇org + 转运站unit + 站管岗位' },
    { dept: '车队', pos: '司机', desc: '中心车队 → 环卫中心org + 中心车组unit + 司机岗位' },
    { dept: '人力综合部', pos: '人事专员', desc: '职能部门 → 职能部门org + 无unit + 专员岗位' },
    { dept: '项目管理层', pos: '项目总经理', desc: '管理层 → 公司org + 无unit + 总经理岗位' },
  ];
  
  for (const ex of examples) {
    const idx = rows.findIndex(r => r.dept === ex.dept && r.position === ex.pos);
    if (idx >= 0) {
      const org = orgAssignments[idx];
      const unit = unitAssignments[idx];
      console.log(`\n✓ ${ex.desc}`);
      console.log(`  姓名: ${rows[idx].name}, 部门: ${ex.dept}, 职位: ${ex.pos}`);
      console.log(`  → 组织: ${org.orgCode} (${org.orgName}, ${org.orgType})`);
      console.log(`  → 单元: ${unit.unitCode || '无'} (${unit.unitName || '-'}${unit.unitType ? ', ' + unit.unitType : ''})`);
      console.log(`  → 岗位: ${POSITION_MAP[ex.pos] || '未映射'} (${ex.pos})`);
    } else {
      console.log(`\n✗ 未找到样例: ${ex.dept} / ${ex.pos}`);
    }
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('验证完成');
  console.log('='.repeat(70));
}

validate();
