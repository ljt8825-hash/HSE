#!/usr/bin/env node
/**
 * validate-employee-deps.mjs
 * 校验 src/views 下各模块的 employee-deps.json（Q2 第6节 / Q5）
 *
 * 功能（Q5 第3节）：
 *   1. 递归扫描 src/views（含子目录）下所有 employee-deps.json
 *   2. JSON Schema 校验（顶层 / dependsOn / provides 键名枚举化）
 *   3. 完整性校验：8 个核心模块齐备；employeeFields 至少含 employeeId/employeeName
 *   4. 一致性校验：events 在 4 枚举内；components 在 {EmployeeSelector, EmployeeName} 内；
 *      module 字段与文件所在目录名一致
 *   5. 输出依赖关系矩阵
 *
 * 运行：node scripts/validate-employee-deps.mjs
 * 退出码：通过 0；失败 1
 * 依赖：仅 Node.js 内置模块（fs / path / url）
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsDir = resolve(__dirname, '../src/views');

// Q5 第2节：8 个核心模块（module 字段值）
const EXPECTED_MODULES = [
  'violations',
  'hazards',
  'training',
  'accidents',
  'emergency',
  'objectives',
  'insurance',
  'assessment-monthly',
];

const VALID_EVENTS = new Set([
  'EMPLOYEE_TRANSFERRED',
  'EMPLOYEE_RESIGNED',
  'EMPLOYEE_STATUS_CHANGED',
  'EMPLOYEE_INFO_UPDATED',
]);
const VALID_COMPONENTS = new Set(['EmployeeSelector', 'EmployeeName']);

const TOP_LEVEL_KEYS = new Set(['module', 'dependsOn', 'provides']);
const DEPENDSON_KEYS = new Set(['employeeFields', 'events', 'queries', 'components']);
const PROVIDES_KEYS = new Set(['employeeStats', 'events']);

const errors = [];

/** 递归查找所有 employee-deps.json */
function findDepsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...findDepsFiles(full));
    } else if (name === 'employee-deps.json') {
      out.push(full);
    }
  }
  return out;
}

const files = findDepsFiles(viewsDir);
const foundModules = new Set();
const matrix = [];

for (const file of files) {
  const dir = dirname(file);
  const mod = basename(dir);

  let raw;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch (e) {
    errors.push(`${file}: 读取失败 - ${e.message}`);
    continue;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    errors.push(`${file}: JSON 解析失败 - ${e.message}`);
    continue;
  }

  // 顶层键
  for (const k of Object.keys(json)) {
    if (!TOP_LEVEL_KEYS.has(k)) {
      errors.push(`${file}: 顶层含未声明键 "${k}"（仅允许 module/dependsOn/provides）`);
    }
  }

  // module 字段
  if (typeof json.module !== 'string') {
    errors.push(`${file}: module 字段缺失或非字符串`);
  } else {
    if (json.module !== mod) {
      errors.push(`${file}: module 字段 "${json.module}" 与目录名 "${mod}" 不一致`);
    }
    foundModules.add(json.module);
  }

  // dependsOn
  const depends = json.dependsOn || {};
  for (const k of Object.keys(depends)) {
    if (!DEPENDSON_KEYS.has(k)) {
      errors.push(`${file}: dependsOn 含未声明键 "${k}"`);
    }
  }

  const fields = depends.employeeFields;
  if (!Array.isArray(fields) || fields.length === 0) {
    errors.push(`${file}: dependsOn.employeeFields 必须为非空数组`);
  } else {
    for (const f of ['employeeId', 'employeeName']) {
      if (!fields.includes(f)) {
        errors.push(`${file}: dependsOn.employeeFields 至少需包含 employeeId/employeeName（缺 "${f}"）`);
      }
    }
  }

  if (Array.isArray(depends.events)) {
    for (const ev of depends.events) {
      if (!VALID_EVENTS.has(ev)) {
        errors.push(`${file}: dependsOn.events 含未知事件类型 "${ev}"`);
      }
    }
  }

  if (Array.isArray(depends.components)) {
    for (const c of depends.components) {
      if (!VALID_COMPONENTS.has(c)) {
        errors.push(`${file}: dependsOn.components 含未知组件 "${c}"（仅允许 EmployeeSelector/EmployeeName）`);
      }
    }
  }

  // provides
  const provides = json.provides || {};
  for (const k of Object.keys(provides)) {
    if (!PROVIDES_KEYS.has(k)) {
      errors.push(`${file}: provides 含未声明键 "${k}"`);
    }
  }

  matrix.push({
    module: json.module,
    fields: Array.isArray(fields) ? fields.join(', ') : '-',
    events: Array.isArray(depends.events) ? depends.events.join(', ') : '-',
    stats: Array.isArray(provides.employeeStats) ? provides.employeeStats.join(', ') : '-',
    outEvents: Array.isArray(provides.events) ? provides.events.join(', ') : '-',
  });
}

// 完整性：8 个核心模块齐备
const missing = EXPECTED_MODULES.filter((m) => !foundModules.has(m));
if (missing.length) {
  errors.push(`完整性校验失败：缺少模块 [${missing.join(', ')}] 的 employee-deps.json`);
}

// 输出
console.log('\n=== employee-deps.json 校验 ===\n');

if (errors.length) {
  console.log('校验失败：');
  for (const e of errors) console.log('  - ' + e);
  console.log('');
  process.exit(1);
}

console.log(`通过：${EXPECTED_MODULES.length}/${EXPECTED_MODULES.length} modules valid\n`);
console.log('# 员工数据依赖关系矩阵\n');
console.log('| 模块 | 依赖字段 | 订阅事件 | 提供统计 | 提供事件 |');
console.log('|------|----------|----------|----------|----------|');
for (const m of matrix.sort((a, b) => a.module.localeCompare(b.module))) {
  console.log(`| ${m.module} | ${m.fields} | ${m.events} | ${m.stats} | ${m.outEvents} |`);
}
console.log('');
process.exit(0);
