/**
 * HSE 智能导入 · 共享内部逻辑（从 server/routes/import.js 顶部/内联迁移）
 * 收敛：Python 调用辅助 / Node 原生 Excel 解析 / 编码乱码(Mojibake)防御 / 三违&网格台账内嵌图片抽取 /
 *       值归一化纯函数 / NATIVE_IMPORT_MODULES 配置 / 模板数据。
 * 无 express 依赖（不含 req/res/路由绑定），供各 import 域 service 与 controller 复用。
 * 行为与原内联定义逐字节一致，不可在此存放路由 handler / express 依赖。
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const XLSX = require('xlsx');
const { execFile, spawn } = require('child_process');
const { camelKeys } = require('../utils/commonResponse');

// Python 解释器路径 — 必须通过环境变量配置，禁止硬编码本地路径
const PYTHON_PATH = process.env.PYTHON_PATH;
if (!PYTHON_PATH) {
  console.error('[FATAL] import.js: PYTHON_PATH 环境变量未设置，智能导入功能不可用');
}
// 解析脚本路径
const PARSER_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'import_parser.py');
const EXTRACT_IMG_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'extract_violation_images.py');
const EXTRACT_GRID_IMG_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'extract_embedded_images.py');
// WPS 单元格内嵌图片(cellimages) → 标准 drawing 转换脚本（导入前先探测/转换，见 attachGridImages）
const CONVERT_WPS_CELLIMG_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'convert_wps_cellimages_to_drawings.py');

// ============================================================
// 冲突键规范化（date/时间戳 → 'YYYY-MM-DD'，保证 库内 Date 与导入行字符串 可比）
// ============================================================
function normalizeConflictValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}
function buildConflictKey(row, conflictKeys) {
  return conflictKeys.map((k) => normalizeConflictValue(row[k])).join('|||');
}

// ============================================================
// 值归一化纯函数（NATIVE_IMPORT_MODULES 的 valueTransforms 引用）
// ============================================================

/**
 * 金额值解析（雇主险清单常见"80万"/"10万"中文单位格式）。
 * 规则：支持 "80万"/"80万 元"/"800000"/"800,000"/"800000元"；
 * 无法识别返回 NaN（调用方据此报行级类型错误）。
 */
function parseAmountToNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/,/g, '').replace(/，/g, '');
  if (!s) return null;
  const wan = s.match(/^(\d+(?:\.\d+)?)\s*万\s*(?:元|块)?$/);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  const plain = s.match(/^(\d+(?:\.\d+)?)\s*(?:元|块)?$/);
  if (plain) return parseFloat(plain[1]);
  return NaN;
}

/**
 * 驾驶员违章「罚款」值归一化：从 "200元" / "0元" / "100 元" / 200 提取金额数字。
 * 无法识别返回 0（不报行级错误，避免汇总表格式差异阻断导入）。
 */
function parseFineAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim().replace(/,/g, '').replace(/，/g, '');
  if (!s) return 0;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/**
 * 驾驶员违章「计分」值归一化：从 "记1分" / "记0分" / "1" 提取扣分数字。
 * 无法识别返回 0。
 */
function parseDemeritPoints(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/**
 * 驾驶员违章「违章日期」脏数据抢救（仅 driver-violation 模块使用）：
 * 汇总表个别单元格把"日期+时间"连写成一坨（如 2025/1/910:36:00）。
 */
function parseViolationTime(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return v;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return v;
  const dh = m[3];
  const mi = parseInt(m[4], 10);
  const se = m[5] ? parseInt(m[5], 10) : 0;
  if (mi > 59 || se > 59) return v;
  const candidates = [];
  for (let hl = 2; hl >= 1; hl--) {
    if (dh.length < hl + 1) continue;
    const d = parseInt(dh.slice(0, dh.length - hl), 10);
    const h = parseInt(dh.slice(dh.length - hl), 10);
    if (d >= 1 && d <= 31 && h >= 0 && h <= 23) candidates.push({ d, h });
  }
  if (!candidates.length) return v;
  const best = candidates.sort((a, b) => a.d - b.d)[0];
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(best.d)} ${pad(best.h)}:${pad(mi)}:${pad(se)}`;
}

/**
 * 三违「查处来源」值归一化（阶段2a，依据提示词-02 B3）。
 * 已是字典英文值原样返回；中文按包含匹配归类；无法识别返回空串（落 NULL，不报错）。
 */
function normalizeCheckSource(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'company') return 'company';
  if (lower === 'township' || lower === 'town') return 'township';
  if (lower === 'self') return 'self';
  if (s.includes('公司')) return 'company';
  if (s.includes('乡镇') || s.includes('管理区') || s.includes('项目')) return 'township';
  if (s.includes('自查') || s.includes('自纠') || s.includes('自检')) return 'self';
  return '';
}

// ============================================================
// 辅助函数: 调用 Python（通过 stdin 传递 JSON 参数，避免中文编码问题）
// ============================================================
function callPython(args) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // 将参数写入临时 JSON 文件，避免命令行中文编码问题
    const tmpFile = path.join(os.tmpdir(), `hse_import_${Date.now()}.json`);
    const argObj = {};
    for (const a of args) {
      if (a.startsWith('--')) {
        const eqIdx = a.indexOf('=');
        if (eqIdx > 0) {
          const key = a.substring(2, eqIdx).replace(/-/g, '_');
          argObj[key] = a.substring(eqIdx + 1);
        }
      }
    }
    // PARSER_SCRIPT 不写入 JSON
    delete argObj['undefined'];

    // 写入临时文件（必须在 spawn 之前完成）
    fs.writeFileSync(tmpFile, JSON.stringify(argObj), 'utf-8');

    // 安全校验: 仅允许已知的合法脚本和文件路径
    const ALLOWED_SCRIPTS = new Set([
      path.resolve(__dirname, '..', '..', 'scripts', 'import_parser.py'),
    ]);
    const resolvedScript = path.resolve(PARSER_SCRIPT);
    if (!ALLOWED_SCRIPTS.has(resolvedScript)) {
      return reject(new Error('不允许的脚本路径'));
    }

    // 通过 require('child_process').spawn 动态取值而非模块顶层的解构绑定：运行时同一函数，
    // 但允许单测用 jest.spyOn(child_process,'spawn') 在加载后替换（解构绑定无法被 spy 命中）。
    const child = require('child_process').spawn(PYTHON_PATH, [
      PARSER_SCRIPT,
      '--json-input', tmpFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString('utf-8'); });
    child.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });

    // 超时保护：30秒
    const PYTHON_TIMEOUT = parseInt(process.env.PYTHON_TIMEOUT) || 30000;
    const timeoutId = setTimeout(() => {
      console.error(`[Import] Python执行超时 (${PYTHON_TIMEOUT}ms)，强制终止`);
      child.kill('SIGTERM');
      // 给 3 秒优雅退出时间
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
      }, 3000);
    }, PYTHON_TIMEOUT);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch (e) {}

      if (code !== 0) {
        console.error(`[Import] Python执行失败 (${elapsed}ms, code=${code}):`, stderr);
        return reject(new Error(stderr || `Python进程退出码: ${code}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(`[Import] Python执行完成 (${elapsed}ms)`);
        resolve(result);
      } catch (parseErr) {
        console.error('[Import] JSON解析失败:', parseErr.message);
        console.error('[Import] stdout:', stdout.substring(0, 500));
        reject(new Error('Python输出JSON解析失败: ' + parseErr.message));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      try { fs.unlinkSync(tmpFile); } catch (e) {}
      reject(err);
    });
  });
}

// ============================================================
// Node.js 原生导入 — 日期解析
// ============================================================
function fixDateValue(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    return null;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const dashMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dashMatch) {
      const y = parseInt(dashMatch[1], 10);
      const m = parseInt(dashMatch[2], 10);
      const d = parseInt(dashMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    const dotMatch = cleaned.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (dotMatch) {
      const y = parseInt(dotMatch[1], 10);
      const m = parseInt(dotMatch[2], 10);
      const d = parseInt(dotMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    const slashMatch = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) {
      const y = parseInt(slashMatch[1], 10);
      const m = parseInt(slashMatch[2], 10);
      const d = parseInt(slashMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    // 中文日期格式：2026年09月19日 / 2026年09月19日08:00 等
    const cjkMatch = cleaned.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cjkMatch) {
      const y = parseInt(cjkMatch[1], 10);
      const m = parseInt(cjkMatch[2], 10);
      const d = parseInt(cjkMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return null;
  }
  return null;
}

// ============================================================
// 编码乱码（Mojibake）防御：GBK 字节被按 UTF-8 解读的检测
// ============================================================
// 背景（2026-08-29 事故）：培训导入曾写入 82 行乱码数据。根因是源文件单元格内容本身
// 已是 GBK 字节，被按 UTF-8 解读后生成 U+01E9「ǩ」/ U+03F8「ϸ」等字符——它们是合法
// UTF-8 序列且不含替换符 U+FFFD，因此既有守卫无法拦截。
// 对策：对业务文本字段做字符集白名单校验——中文业务数据只应包含 ASCII 可打印、CJK 汉字、
// CJK 标点、全角兼容区（FF01-FF5E，不含 U+FFFD）及少量常用符号。
const SAFE_TEXT_RE =
  /^[\u0020-\u007E\u4E00-\u9FFF\u3000-\u303F\uFF01-\uFF5E\u00B0\u00B1\u00D7\u00F7\u00B2\u00B3\u2014\u2018\u2019\u201C\u201D\u2026\u2212]*$/;

/**
 * 检测单元格文本是否疑似编码乱码（GBK 被按 UTF-8 解读等）
 * @param {*} value 单元格原值
 * @returns {boolean} true = 疑似乱码
 */
function looksLikeMojibake(value) {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return !SAFE_TEXT_RE.test(s);
}

// ============================================================
// 厂牌车型清洗：去掉关键字前方文字/字母/数字，仅保留关键字及其后内容
// ============================================================
function cleanModel(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const keywords = ['吸污车', '车厢可卸式垃圾车', '自装卸式垃圾车', '载货汽车'];
  let cut = -1;
  for (const kw of keywords) {
    const i = raw.indexOf(kw);
    if (i >= 0 && (cut === -1 || i < cut)) cut = i;
  }
  return cut >= 0 ? raw.slice(cut) : raw;
}

// ============================================================
// 中文文件名 Mojibake 检测与修复（upload 使用）
// ============================================================
function repairMojibakeFileName(original, fallback) {
  if (!original) return fallback || 'unknown.xlsx';

  // 检测特征：含 â¤ çš å½ ç› ç‰ 典型 Mojibake 子串（UTF-8 被 Latin-1 解码的特征）
  const mojibakePattern = /[â€¦â€°â€¡â€¢â€™â€œâ€â€œå¤§éˆ™©ç®¡æŽ§æ¸…å•]/;

  if (mojibakePattern.test(original)) {
    // 尝试 Latin-1 → UTF-8 反向转换
    try {
      const repaired = Buffer.from(original, 'latin1').toString('utf-8');
      // 验证修复结果是否包含合理的中文字符（Unicode CJK 范围）
      if (/[\u4e00-\u9fff\u3000-\u303f]/.test(repaired)) {
        console.log('[Import] Mojibake 修复:', original.substring(0, 30), '→', repaired);
        return repaired;
      }
    } catch (e) { /* 忽略 */ }
  }

  // 如果提供了回退名且当前名看起来不像正常的中文文件名，使用回退名
  if (fallback && /[\x80-\xff]{2,}/.test(original) && !/[\u4e00-\u9fff]/.test(original)) {
    console.log('[Import] 使用回退文件名:', fallback);
    return fallback;
  }

  return original;
}

// ============================================================
// 将 Python 引擎的 ParseResult 转换为前端 preview 契约结构
// ============================================================
function buildFrontendPreview(parseResult, jobId) {
  const sampleData = parseResult.sample_data || [];
  // 预览数据统一 camelCase 输出，与前端列表显示一致
  const preview = sampleData.map((row, i) => ({
    rowIndex: i + 1,
    data: camelKeys(row),
    errors: [],
  }));
  const totalRows = parseResult.total_rows || sampleData.length;
  return {
    jobId: jobId != null ? String(jobId) : undefined,
    totalRows,
    validRows: totalRows,
    invalidRows: 0,
    preview,
    moduleType: parseResult.module_type,
    moduleName: parseResult.module_name || parseResult.module_type,
    targetTable: parseResult.target_table,
    sheets: parseResult.sheets || [],
  };
}

// ============================================================
// Node.js 原生导入模块配置（用于 Python 不可用时的 fallback）
// 直接解析 Excel 并写入标准业务表
// ============================================================
const NATIVE_IMPORT_MODULES = {
  regulations: {
    targetTable: 'regulations',
    moduleName: '规章制度',
    conflictKey: 'name',
    memoryMode: false,
    // 表含 title 列，允许 name/title 双向互补（titleFromName 由写库前 title 互补逻辑读取）
    titleFromName: true,
    dateFields: ['issue_date', 'effective_date'],
    fieldMapping: {
      '制度名称': 'name',
      '制度标题': 'title',
      '标题': 'title',
      '名称': 'name',
      '制度编号': 'document_no',
      '文号': 'document_no',
      '编号': 'document_no',
      '文件号': 'document_no',
      '制度类型': 'category',
      '分类': 'category',
      '类型': 'type',
      '制度类别': 'type',
      '类别': 'type',
      '版本': 'version',
      '版本号': 'version',
      '状态': 'status',
      '发布日期': 'issue_date',
      '发布时间': 'issue_date',
      '公布日期': 'issue_date',
      '生效日期': 'effective_date',
      '实施日期': 'effective_date',
      '生效时间': 'effective_date',
      '实施时间': 'effective_date',
      '有效期': 'validity_period',
      '有效期月': 'validity_period',
      '有效期(月)': 'validity_period',
      '制定部门': 'department',
      '发布机构': 'issuer',
      '发布部门': 'department',
      '责任部门': 'department',
      '部门': 'department',
      '发文单位': 'issuer',
      '发布单位': 'issuer',
      '摘要': 'summary',
      '内容摘要': 'summary',
      '内容': 'content',
      '制度内容': 'content',
      '正文': 'content',
      '备注': 'remark',
      '说明': 'remark',
    },
    statusMap: {
      '已发布': 'published',
      '发布': 'published',
      '正式发布': 'published',
      '有效': 'active',
      '现行有效': 'active',
      '在用': 'active',
      '现行': 'active',
      '修订中': 'revising',
      '修订': 'revising',
      '待更新': 'revising',
      '待修订': 'revising',
      '草稿': 'draft',
      '草案': 'draft',
      '待制定': 'draft',
      '编制中': 'draft',
      '作废': 'obsolete',
      '废止': 'obsolete',
      '已废止': 'obsolete',
      '失效': 'obsolete',
    },
  },
  hazards: {
    targetTable: 'hazards',
    moduleName: '隐患排查治理',
    conflictKey: 'description',
    fieldMapping: {
      '序号': 'no',
      '隐患描述': 'description',
      '整改措施': 'measure',
      '检查时间': 'hazard_date',
      '检查人员': 'checker',
      '整改人员': 'fixer',
      '整改时间': 'fix_date',
      '是否整改完成': 'status',
      '备注': 'remark',
    },
    statusMap: {
      '是': '已完成',
      '否': '未完成',
    },
  },
  'fire-facility': {
    targetTable: 'memory_fire_equipment',
    moduleName: '消防设施管理',
    conflictKey: ['name', 'location'],
    memoryMode: true,
    fieldMapping: {
      '设施名称': 'name',
      '名称': 'name',
      '器材名称': 'name',
      '设施类型': 'type',
      '类型': 'type',
      '器材类型': 'type',
      '型号规格': 'model',
      '规格型号': 'model',
      '型号': 'model',
      '规格': 'model',
      '安装位置': 'location',
      '位置': 'location',
      '配置地点': 'location',
      '放置位置': 'location',
      '转运站名称': 'siteName',
      '设施状态': 'status',
      '状态': 'status',
      '数量': 'quantity',
      '安装日期': 'installDate',
      '购置日期': 'installDate',
      '购置日期\n（维修日期）': 'installDate',
      '购置日期（维修日期）': 'installDate',
      '有效期至': 'expiryDate',
      '有效期': 'expiryDate',
      '下次维修日期': 'expiryDate',
      '到期日期': 'expiryDate',
      '上次检查': 'lastCheckDate',
      '上次维修日期': 'lastCheckDate',
      '维修日期': 'lastCheckDate',
      '下次检查': 'nextCheckDate',
      '负责人': 'manager',
      '管理责任人': 'manager',
      '联系电话': 'phone',
      '电话': 'phone',
      '手机号': 'phone',
      '钢印号': 'serialNo',
      '车牌号': 'plateNo',
      '备注': 'remark',
      '说明': 'remark',
    },
    statusMap: {
      '正常': '正常',
      '良好': '正常',
      '过期': '过期',
      '损坏': '损坏',
      '维修中': '维修中',
    },
  },
  violation: {
    targetTable: 'violation_records',
    moduleName: '三违管理',
    conflictKey: ['area_team', 'upload_time', 'violator_name', 'violation_behavior', 'grid_level', 'inspector_name'],
    memoryMode: false,
    fieldMapping: {
      '片区/班组': 'area_team',
      '片区_班组': 'area_team',
      '片区': 'area_team',
      '班组': 'area_team',
      '上传时间': 'upload_time',
      '检查人姓名': 'inspector_name',
      '检查人': 'inspector_name',
      '发现人': 'inspector_name',
      '网格等级': 'grid_level',
      '网格层级': 'grid_level',
      '所属岗位': 'position',
      '岗位': 'position',
      '职务': 'position',
      '违章人姓名': 'violator_name',
      '违章人': 'violator_name',
      '违章人员': 'violator_name',
      '违章人性别': 'violator_gender',
      '性别': 'violator_gender',
      '违章人年龄': 'violator_age',
      '年龄': 'violator_age',
      '车辆类型/保洁员': 'vehicle_type_or_cleaner',
      '车辆类型_保洁员': 'vehicle_type_or_cleaner',
      '车辆类型': 'vehicle_type_or_cleaner',
      '保洁员': 'vehicle_type_or_cleaner',
      '上报状态': 'report_status',
      '状态': 'report_status',
      '图片内容': 'image_content',
      '图片': 'image_content',
      '“三违”行为': 'violation_behavior',
      '三违行为': 'violation_behavior',
      '三违_行为': 'violation_behavior',
      '违章描述': 'description',
      '描述': 'description',
      '三违类型.输出结果': 'violation_type_result',
      '三违类型_输出结果': 'violation_type_result',
      '三违类型输出结果': 'violation_type_result',
      '违章类型': 'violation_type',
      '类型': 'violation_type',
      '违章级别': 'violation_level',
      '级别': 'violation_level',
      '严重程度': 'violation_level',
      '需要整改': 'need_rectification',
      '是否需要整改': 'need_rectification',
      '整改执行人': 'rectification_executor',
      '整改人': 'rectification_executor',
      '整改后的照片': 'rectification_photos',
      '整改照片': 'rectification_photos',
      '示意图': 'schematic_diagram',
      '违章日期': 'violation_date',
      '发现日期': 'violation_date',
      '日期': 'violation_date',
      '发生地点': 'location',
      '地点': 'location',
      '整改措施': 'rectification',
      '风险等级': 'risk_level',
      '备注': 'remark',
      // 每日"三违"检查汇总模板（2026.8.1-13.xlsx）表头映射
      '昵称': 'nickname',
      '分组名称': 'area_team',
      '姓名': 'inspector_name',
      '提交时间': 'upload_time',
      '编号': 'no',
      '三违照片：图片1': 'image_content',
      '整改后照片：图片1': 'rectification_photos',
      '当日是否报名': 'report_status',
      '标记': 'mark',
      '是否补交': 'is_supplementary',
      // 阶段2a（提示词-02 B3）：查处来源，用于阶段3 三违扣分分级计分
      '查处来源': 'check_source',
      '检查来源': 'check_source',
      '来源': 'check_source',
      '查处层级': 'check_source',
      '查处单位': 'check_source',
    },
    // 值归一化：中文/英文写法统一落字典值（company / township / self）
    valueTransforms: {
      check_source: normalizeCheckSource,
    },
    statusMap: {
      '待处理': '待处理',
      '整改中': '整改中',
      '待复查': '待复查',
      '已关闭': '已关闭',
      '已完成': '已关闭',
    },
    dateFields: ['violation_date', 'upload_time'],
  },
  // 任务四：grid 导入改为「网格检查（巡查）记录」，写入 grid_inspection_records
  grid: {
    targetTable: 'grid_inspection_records',
    moduleName: '网格管理',
    // 去重键：同一 片区/班组 + 上传时间 + 检查人 + 三违行为 + 违章人 视为同一条记录
    conflictKey: ['area_team', 'upload_time', 'personnel_name', 'violation_behavior', 'violator_name'],
    memoryMode: false,
    // 显式数据库列白名单（grid_inspection_records 真实列，顺序即 INSERT 列顺序）
    dbColumns: [
      'area_team', 'upload_time', 'inspection_date', 'personnel_name', 'grid_level',
      'position', 'violator_name', 'violator_gender', 'violator_age', 'vehicle_type',
      'report_status', 'image_content', 'violation_behavior', 'violation_type_result',
      'need_rectification', 'rectifier', 'rectified_photo', 'schematic', 'grid_id',
      // 来源「每日三违检查汇总」表头扩展字段（与 2026.8.1-28.xlsx 表头对齐）
      'nickname', 'signup_today', 'marker', 'is_resubmit', 'serial_no',
    ],
    excludeSheetPatterns: [/^统计分析$/, /^未提交名单$/, /^打卡次数统计$/, /^名单-/],
    fieldMapping: {
      '片区/班组': 'area_team',
      '片区': 'area_team',
      '班组': 'area_team',
      '分组名称': 'area_team',
      '姓名': 'personnel_name',
      '提交时间': 'upload_time',
      '上传时间': 'upload_time',
      '检查人姓名': 'personnel_name',
      '日期': 'inspection_date',
      '巡查日期': 'inspection_date',
      '检查日期': 'inspection_date',
      '网格等级': 'grid_level',
      '网格层级': 'grid_level',
      '所属岗位': 'position',
      '岗位': 'position',
      '违章人姓名': 'violator_name',
      '违章人性别': 'violator_gender',
      '违章人年龄': 'violator_age',
      '车辆类型/保洁员': 'vehicle_type',
      '车辆类型': 'vehicle_type',
      '保洁员': 'vehicle_type',
      '上报状态': 'report_status',
      '图片内容': 'image_content',
      '“三违”行为': 'violation_behavior',
      '“三违”行为2': 'violation_behavior',
      '"三违"行为': 'violation_behavior',
      '三违行为': 'violation_behavior',
      '三违类型.输出结果': 'violation_type_result',
      '三违类型': 'violation_type_result',
      '需要整改': 'need_rectification',
      '整改执行人': 'rectifier',
      '整改后的照片': 'rectified_photo',
      '三违照片：图片1': 'image_content',
      '整改后照片：图片1': 'rectified_photo',
      '示意图': 'schematic',
      '昵称': 'nickname',
      '当日是否报名': 'signup_today',
      '标记': 'marker',
      '是否补交': 'is_resubmit',
      '编号': 'serial_no',
    },
    dateFields: [],
    statusMap: {},
  },
  'over-age': {
    targetTable: 'over_age_personnel',
    moduleName: '超龄人员管控',
    conflictKey: ['name', 'id_card'],
    memoryMode: false,
    dateFields: ['hire_date', 'birth_date', 'expire_date'],
    fieldMapping: {
      '员工编码': 'personnel_id',
      '姓名': 'name',
      '所属部门': 'dept',
      '部门': 'dept',
      '职位': 'position',
      '岗位': 'position',
      '入职日期': 'hire_date',
      '身份证号码': 'id_card',
      '身份证号': 'id_card',
      '性别': 'gender',
      '出生日期': 'birth_date',
      '年龄': 'age',
      '管控类型': 'control_type',
      '人员类型': 'person_type',
      '到期日期': 'expire_date',
      '是否有工伤险': 'has_injury',
      '工伤险': 'has_injury',
      '是否有雇主险': 'has_employer',
      '雇主险': 'has_employer',
      '备注': 'remark',
    },
    statusMap: {},
  },
  objectives: {
    targetTable: 'safety_goals',
    moduleName: '目标职责',
    conflictKey: ['title', 'year', 'department'],
    memoryMode: false,
    // 表含 title 列且为冲突键，必须保留 name/title 互补
    titleFromName: true,
    dateFields: ['deadline'],
    fieldMapping: {
      '目标标题': 'title', '标题': 'title', 'title': 'title', 'Title': 'title', '目标名称': 'title',
      '责任部门': 'department', '部门': 'department', '所属部门': 'department', 'Department': 'department', 'department': 'department',
      '目标状态': 'status', '状态': 'status', 'Status': 'status', 'status': 'status',
      '年度': 'year', '年份': 'year', 'Year': 'year', 'year': 'year',
      '目标类型': 'type', '类型': 'type', 'Type': 'type', 'type': 'type',
      '目标值': 'target_value', '目标数值': 'target_value', 'targetValue': 'target_value', 'target_value': 'target_value',
      '当前值': 'current_value', '当前数值': 'current_value', 'currentValue': 'current_value', 'current_value': 'current_value',
      '单位': 'unit', 'Unit': 'unit', 'unit': 'unit',
      '责任人': 'responsible_person', '负责人': 'responsible_person', 'responsiblePerson': 'responsible_person', 'responsible_person': 'responsible_person',
      '截止日期': 'deadline', '截止时间': 'deadline', 'deadline': 'deadline', 'Deadline': 'deadline',
      '描述': 'description', '目标描述': 'description', 'description': 'description',
      '进度': 'progress', '完成进度': 'progress', 'progress': 'progress',
      '备注': 'remark', 'remark': 'remark',
    },
    statusMap: {
      '已完成': 'achieved', '达成': 'achieved', 'achieved': 'achieved',
      '进行中': 'on_track', '正常': 'on_track', 'on_track': 'on_track', 'onTrack': 'on_track',
      '有风险': 'at_risk', '预警': 'at_risk', 'at_risk': 'at_risk', 'atRisk': 'at_risk',
      '滞后': 'behind', '落后': 'behind', 'behind': 'behind',
      '已结束': 'achieved', '已签订': 'achieved', '生效': 'on_track', '待签': 'at_risk', '草稿': 'behind',
    },
  },
  training: {
    targetTable: 'training_records',
    moduleName: '培训考核',
    // 落键后以人员 id 参与冲突判定，避免同名不同人互相覆盖；无键行（employee_id 为空）行为同前
    conflictKey: ['employee_id', 'name', 'training_date', 'training_type'],
    // 编码乱码防御字段（2026-08-29 培训乱码事故后新增，配合 looksLikeMojibake）
    mojibakeCheck: ['name', 'dept', 'position', 'content', 'result', 'trainer', 'remark', 'training_type'],
    memoryMode: false,
    dateFields: ['training_date'],
    fieldMapping: {
      '姓名': 'name', '参训人': 'name', '参训人姓名': 'name', '员工姓名': 'name',
      '身份证号': 'id_card', '身份证': 'id_card', '证件号': 'id_card',
      '部门': 'dept', '所属部门': 'dept',
      '岗位': 'position', '职位': 'position',
      '网格层级': 'grid_level', '层级': 'grid_level',
      '培训频次': 'frequency', '频次': 'frequency',
      '培训类型': 'training_type', '类型': 'training_type',
      '培训日期': 'training_date', '日期': 'training_date',
      '培训时长': 'duration_minutes', '时长': 'duration_minutes', '时长分钟': 'duration_minutes',
      '培训内容': 'content', '内容': 'content',
      '考核结果': 'result', '结果': 'result',
      '分数': 'score', '考试分数': 'score',
      '讲师': 'trainer', '培训讲师': 'trainer', '讲师姓名': 'trainer',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '合格': '合格', '不合格': '不合格', '优秀': '优秀',
    },
  },
  emergency: {
    targetTable: 'emergency_plans',
    moduleName: '应急预案',
    // 冲突键仅用 name：表无 version 列，含 version 的冲突查询/写库均会报「字段不存在」
    conflictKey: ['name'],
    memoryMode: false,
    dateFields: ['effective_date'],
    fieldMapping: {
      '预案名称': 'name', '名称': 'name', 'name': 'name', 'title': 'name', '标题': 'name',
      '预案类型': 'type', '类型': 'type', '类别': 'type',
      '预案级别': 'level', '级别': 'level', '等级': 'level',
      '状态': 'status', '预案状态': 'status',
      '责任部门': 'responsible_dept', '所属部门': 'responsible_dept', '部门': 'responsible_dept',
      '责任人': 'responsible_person', '负责人': 'responsible_person',
      '联系电话': 'contact_phone', '电话': 'contact_phone', '联系方式': 'contact_phone',
      '预案描述': 'description', '描述': 'description', '内容': 'description', '预案内容': 'description',
      '生效日期': 'effective_date', '实施日期': 'effective_date',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      'active': 'active', '启用': 'active', '在用': 'active', '有效': 'active',
      'draft': 'draft', '草稿': 'draft', '编制中': 'draft',
      'archived': 'archived', '归档': 'archived', '已归档': 'archived',
      'obsolete': 'obsolete', '作废': 'obsolete', '废止': 'obsolete',
    },
  },
  drill: {
    targetTable: 'emergency_drills',
    moduleName: '应急演练',
    conflictKey: ['plan_name', 'drill_date'],
    memoryMode: false,
    dateFields: ['drill_date'],
    fieldMapping: {
      '预案名称': 'plan_name', '演练预案': 'plan_name', '预案': 'plan_name',
      '演练名称': 'name', '名称': 'name', '标题': 'title',
      '演练类型': 'type', '类型': 'type', '演练方式': 'type',
      '演练日期': 'drill_date', '演练时间': 'drill_date', '日期': 'drill_date',
      '演练地点': 'location', '地点': 'location', '场所': 'location',
      '参加人数': 'participants_count', '参训人数': 'participants_count', '人数': 'participants_count',
      '演练时长': 'duration_minutes', '时长': 'duration_minutes', '时长分钟': 'duration_minutes',
      '演练结果': 'result', '结果': 'result', '演练效果': 'result',
      '评估人': 'evaluator', '评估人员': 'evaluator', '评审人': 'evaluator',
      '演练总结': 'summary', '总结': 'summary', '演练报告': 'summary',
      '改进建议': 'improvement_suggestions', '改进措施': 'improvement_suggestions', '建议': 'improvement_suggestions',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      'excellent': '优秀', '优秀': '优秀', '好': '优秀',
      'good': '良好', '良好': '良好',
      'pass': '合格', '合格': '合格', '通过': '合格',
      'fail': '不合格', '不合格': '不合格', '未通过': '不合格',
    },
  },
  'risk-control': {
    targetTable: 'risk_sources',
    moduleName: '风险分级管控',
    conflictKey: ['name', 'location'],
    memoryMode: false,
    dateFields: ['assessment_date', 'last_hazard_check_date'],
    fieldMapping: {
      '风险名称': 'name', '名称': 'name', '风险点': 'name', '风险源': 'name',
      '风险等级': 'level', '等级': 'level', '风险级别': 'level',
      '风险类型': 'type', '类型': 'type', '风险类别': 'type', '类别': 'type',
      '责任部门': 'responsible_dept', '部门': 'responsible_dept', '所属部门': 'responsible_dept',
      '责任人': 'responsible_person', '负责人': 'responsible_person',
      '所在区域': 'location', '区域': 'location', '位置': 'location',
      '管控措施': 'measures', '控制措施': 'measures', '防控措施': 'measures',
      '风险状态': 'status', '状态': 'status', '管控状态': 'status',
      '评估日期': 'assessment_date', '评价日期': 'assessment_date',
      '复评周期': 'review_cycle', '复评周期月': 'review_cycle',
      '评价方法': 'assessment_method', '评估方法': 'assessment_method',
      '评价分数': 'assessment_score', '评估分数': 'assessment_score',
      '所属作业': 'job_name', '作业活动': 'job_name',
      '作业类型': 'job_type',
      '岗位': 'post_name',
      '事故类型': 'accident_type',
      '可能性': 'likelihood',
      '严重性': 'severity',
      '风险值': 'risk_value',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '管控中': 'active', '正常': 'active', '有效': 'active',
      '已消除': 'eliminated', '消除': 'eliminated',
      '需整改': 'pending', '待整改': 'pending',
    },
  },
  accidents: {
    targetTable: 'accidents',
    moduleName: '事故管理',
    conflictKey: ['accident_date', 'accident_type', 'description'],
    dedupInBatch: true, // 重叠表重复导入时按业务键(日期+类型+描述)去重，避免产生重复行
    validKey: ['accident_date', 'accident_type', 'description'], // 事故时间/事故类别/描述任一非空即真实事故行
    validKeySkipErrors: true, // 宽容模式：真实事故行其他列空白不剔除
    // 占位行过滤：「X 月份无事故」等非真实记录自动跳过（不计有效、不计错误）
    placeholderField: '事故经过简要描述',
    placeholderPattern: /^\s*\d{1,2}\s*月份?(无事故|没有事故|无事|无隐患)\s*$/,
    // 排除非数据 sheet（数据字典/借款统计/单位关联等辅助 sheet；表2事故借款统计直接不需要）
    excludeSheetPatterns: [/借款/, /单位$/, /关联/, /^Sheet\d*$/, /类别/],
    // 序号列：表1 事故统计的「序号」列只有数字、其余列全空的行视为空占位行（跳过，不报错、不入库）
    serialColumn: '序号',
    // validKey 全空的行直接跳过（有辅助列如序号/区域但无事故时间/类别/描述 → 非事故行，不报缺字段错误）
    skipRowsWithoutValidKey: true,
    memoryMode: false,
    dateFields: ['accident_date', 'report_date', 'close_date'],
    fieldMapping: {
      '事故日期': 'accident_date', '发生日期': 'accident_date', '事故时间': 'accident_date', '事故发生时间': 'accident_date', '日期': 'accident_date',
      '事故类型': 'accident_type', '类型': 'accident_type', '类别': 'accident_type', '事故类别': 'accident_type',
      '事故等级': 'level', '等级': 'level', '严重程度': 'level',
      '发生地点': 'location', '地点': 'location', '事故地点': 'location',
      '事故描述': 'description', '描述': 'description', '事故经过': 'description', '经过': 'description', '事故经过简要描述': 'description',
      '损失金额': 'loss_amount', '经济损失': 'loss_amount', '金额': 'loss_amount',
      '直接经济损失/元': 'loss_amount', '实际经济损失/元': 'loss_amount', '保险理赔金额/元': 'compensation',
      '处理状态': 'status', '状态': 'status', '事故状态': 'status', '是否结案': 'status',
      '涉事人员': 'involved_person', '相关人员': 'involved_person', '伤者姓名': 'involved_person', '伤者   姓名': 'involved_person',
      '涉事车辆': 'involved_vehicle', '车牌': 'involved_vehicle',
      '受伤人数': 'injuries', '受伤': 'injuries', '死亡人数': 'casualties', '死亡': 'casualties',
      '报告日期': 'close_date', '上报日期': 'close_date',
      '结案日期': 'close_date', '处理完成日期': 'close_date', '预计结案时间': 'close_date',
      '处理措施': 'remark', '整改措施': 'remark',
      '事故性质': 'cause_analysis', '事故原因': 'cause_analysis', '责任分析': 'responsibility', '定责依据': 'responsibility',
      '预防措施': 'remark', '防范措施': 'remark',
      '备注': 'remark', '说明': 'remark',
      '月份': 'month', '年份': 'year',
    },
    statusMap: {
      '待处理': 'pending', '未处理': 'pending', '待结案': 'pending',
      '处理中': 'in_progress', '调查中': 'in_progress',
      '已结案': 'closed', '已完成': 'closed', '已处理': 'closed', '是': 'closed', '否': 'pending',
    },
  },
  committee: {
    targetTable: 'hse_safety_committee',
    moduleName: '安全人员',
    conflictKey: ['name', 'position'],
    memoryMode: false,
    dateFields: ['appointment_date'],
    fieldMapping: {
      '姓名': 'name', '成员姓名': 'name', '人员姓名': 'name',
      '部门': 'department', '所属部门': 'department',
      '职务': 'position', '职位': 'position', '岗位': 'position',
      '委员会类型': 'committee_type', '类型': 'committee_type', '安委会类型': 'committee_type',
      '联系电话': 'phone', '电话': 'phone', '手机': 'phone', '联系方式': 'phone',
      '任职日期': 'appointment_date', '任命日期': 'appointment_date', '入职日期': 'appointment_date',
      '状态': 'status', '在职状态': 'status',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '在职': 'active', '在岗': 'active', '正常': 'active',
      '离职': 'inactive', '离岗': 'inactive', '不在岗': 'inactive',
    },
  },
  budget: {
    targetTable: 'hse_safety_budget',
    moduleName: '安全费用预算',
    conflictKey: ['item_name', 'plan_time', 'serial_no'],
    memoryMode: false,
    dateFields: ['plan_time'],
    numericFields: ['budget_amount', 'spent_amount', 'plan_quantity', 'plan_unit_price', 'plan_total', 'actual_quantity', 'actual_unit_price', 'actual_total', 'annual_plan_total', 'serial_no', 'actual_expenditure_quantity', 'actual_expenditure_unit_price', 'actual_expenditure_total'],
    // 表头为两行：第一行是分组，第二行是数量/单价/总价子列
    multiRowHeader: {
      groupLabels: ['计划', '预算计划', '支出', 'OA计划支出', '实际支出'],
      groupAlias: { '预算计划': '计划', 'OA计划支出': '支出', '实际支出': '实际支出' },
    },
    // 序号列为非数字时视为汇总/空行，不计入错误
    serialColumn: '序号',
    skipSummaryRows: true,
    fieldMapping: {
      '预算年度': 'budget_year', '年度': 'budget_year',
      '措施项目': 'measure_item', '预算项目': 'measure_item', '项目': 'measure_item',
      '预算科目': 'budget_subject', '科目': 'budget_subject',
      '名称': 'item_name', '项目名称': 'item_name',
      '用途及依据': 'purpose', '用途': 'purpose', '依据': 'purpose',
      '计划使用时间': 'plan_time', '使用时间': 'plan_time',
      '使用部门/地点': 'location', '使用地点': 'location', '使用部门': 'department', '责任部门': 'department', '部门': 'department', '所属部门': 'department',
      '规格/品牌': 'spec', '规格': 'spec', '品牌': 'spec',
      '计划-数量': 'plan_quantity', '计划数量': 'plan_quantity', '数量': 'plan_quantity',
      '计划-单价(万)': 'plan_unit_price', '计划单价(万)': 'plan_unit_price', '计划单价': 'plan_unit_price', '单价': 'plan_unit_price',
      '计划-总价(万)': 'plan_total', '计划总价(万)': 'plan_total', '计划总价': 'plan_total', '总价': 'plan_total',
      '支出-数量': 'actual_quantity', '实际数量': 'actual_quantity', '已用数量': 'actual_quantity',
      '支出-单价(万)': 'actual_unit_price', '实际单价(万)': 'actual_unit_price', '实际单价': 'actual_unit_price',
      '支出-总价(万)': 'actual_total', '支出总价(万)': 'actual_total', '实际总价(万)': 'actual_total', '支出总价': 'actual_total',
      '实际支出-数量': 'actual_expenditure_quantity', '实际支出数量': 'actual_expenditure_quantity',
      '实际支出-单价(万)': 'actual_expenditure_unit_price', '实际支出单价(万)': 'actual_expenditure_unit_price',
      '实际支出-总价(万)': 'actual_expenditure_total', '实际支出总价(万)': 'actual_expenditure_total', '实际支出总价': 'actual_expenditure_total',
      '预算金额': 'budget_amount', '金额': 'budget_amount',
      '已用金额': 'spent_amount', '实际金额': 'spent_amount', '已支出': 'spent_amount',
      '使用状态': 'use_status', '状态': 'status',
      '预算类别': 'category', '类别': 'category', '类型': 'category',
      '备注': 'remark', '说明': 'remark',
      '序号': 'serial_no',
    },
    statusMap: {
      '执行中': 'active', '进行中': 'active', '有效': 'active',
      '已完成': 'completed', '已结束': 'completed',
      '待审批': 'pending', '草稿': 'draft',
    },
  },
  assessment: {
    targetTable: 'hse_responsibility_assessment',
    moduleName: '责任制考核',
    conflictKey: ['assessment_name', 'period', 'department'],
    memoryMode: false,
    dateFields: ['assessment_date'],
    fieldMapping: {
      '考核名称': 'assessment_name', '名称': 'assessment_name', '标题': 'assessment_name',
      '考核周期': 'period', '周期': 'period', '年度': 'period',
      '被考核部门': 'department', '部门': 'department', '考核部门': 'department',
      '考核分数': 'score', '分数': 'score', '得分': 'score',
      '考核等级': 'grade', '等级': 'grade', '评级': 'grade',
      '考核人': 'assessor', '考核人员': 'assessor', '评估人': 'assessor',
      '考核日期': 'assessment_date', '日期': 'assessment_date', '评价日期': 'assessment_date',
      '备注': 'remark', '说明': 'remark', '考核意见': 'remark',
    },
    statusMap: {
      '优秀': 'excellent', '良好': 'good', '合格': 'pass', '不合格': 'fail',
    },
  },
  personnel: {
    targetTable: 'personnel_insurance',
    moduleName: '人员保险',
    // 冲突键：稳定员工 ID + 险种 + 保单号（任务4.2；name/id_card 非实际列，禁用）
    conflictKey: ['employee_id', 'insurance_type', 'policy_no'],
    memoryMode: false,
    dateFields: ['start_date', 'expire_date'],
    // 任务1（提示词08）：显式数据库列白名单（personnel_insurance 真实列，顺序即 INSERT 列顺序）
    dbColumns: [
      'employee_id', 'personnel_id', 'person_name', 'department', 'position',
      'insurance_type', 'coverage_amount', 'premium', 'start_date', 'expire_date',
      'is_current', 'policy_no', 'remark',
    ],
    fieldMapping: {
      '姓名': 'person_name', '员工姓名': 'person_name', '雇员姓名': 'person_name',
      '员工编号': 'employee_code', '员工号': 'employee_code', '工号': 'employee_code',
      '证件号码': 'id_card', '身份证号': 'id_card', '身份证号码': 'id_card', '身份证': 'id_card',
      '保险类型': 'insurance_type', '险种': 'insurance_type',
      '保单号': 'policy_no', '保险单号': 'policy_no',
      '保险起期': 'start_date', '开始日期': 'start_date', '生效日期': 'start_date',
      '保险到期': 'expire_date', '保险止期': 'expire_date', '结束日期': 'expire_date', '失效日期': 'expire_date',
      '保费': 'premium', '保险费': 'premium', '保费金额': 'premium',
      '保额': 'coverage_amount', '保额金额': 'coverage_amount', '保险金额': 'coverage_amount',
      '雇主险保额': 'coverage_amount', '工伤险保额': 'coverage_amount',
      '是否当前': 'is_current', '是否当前保单': 'is_current', '是否在保': 'is_current',
      '岗位名称': 'position', '岗位': 'position',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {},
    // ========== 解析健壮性（雇主险/工伤险清单通用） ==========
    requiredColumnGroups: [
      ['姓名', '雇员姓名', '员工姓名'],
      ['员工编号', '员工号', '工号', '证件号码', '身份证号', '身份证号码', '身份证'],
    ],
    // 单次导入最大数据行数（超出拒绝，保护后端与 PG）
    maxRows: 5000,
    fieldTypes: {
      coverage_amount: 'number',
      premium: 'number',
      start_date: 'date',
      expire_date: 'date',
      is_current: 'boolean',
    },
    valueTransforms: {
      coverage_amount: parseAmountToNumber,
      premium: parseAmountToNumber,
    },
    validKey: ['person_name', 'id_card', 'employee_code'],
    dedupeKey: null,
  },
  vehicle: {
    targetTable: 'vehicles',
    moduleName: '车辆保险',
    conflictKey: ['plate'],
    memoryMode: false,
    // 软删记录重导时重新激活（is_deleted=false 并更新字段），避免撞 uk_vehicle_plate 被跳过
    reactivateSoftDeleted: true,
    dateFields: [
      'reg_date', 'insurance_start', 'insurance_end',
      'compulsory_start', 'compulsory_end',
      'commercial_start', 'commercial_end'
    ],
    fieldMapping: {
      '车牌号': 'plate', '车牌': 'plate', '号码': 'plate',
      '车架号': 'vin', '车辆识别码': 'vin', 'VIN': 'vin',
      '发动机号': 'engine_no', '引擎号': 'engine_no',
      '注册日期': 'reg_date', '上牌日期': 'reg_date', '购置日期': 'reg_date', '初次登记年月': 'reg_date',
      '车型': 'model', '车辆型号': 'model', '厂牌车型': 'model',
      '车主': 'owner', '车辆所有人': 'owner', '行驶证车主': 'registered_owner',
      '投保人、被保险人': 'policy_holder', '投保人': 'policy_holder', '被保险人': 'policy_holder',
      '保险类型': 'insurance_type', '险种': 'insurance_type', '类型': 'insurance_type',
      '保险起期': 'compulsory_start', '开始日期': 'insurance_start', '生效日期': 'insurance_start',
      '保险止期': 'compulsory_end',
      '保险起期_1': 'commercial_start', '保险止期_1': 'commercial_end',
      '保险到期': 'insurance_end', '结束日期': 'insurance_end', '失效日期': 'insurance_end',
      '保费': 'vehicle_damage_premium', '保险费': 'premium', '保费金额': 'premium',
      '车辆类型': 'vehicle_type', '车辆种类': 'vehicle_type',
      '状态': 'status', '车辆状态': 'status',
      '交强险保险起期': 'compulsory_start', '交强险起期': 'compulsory_start',
      '交强险保险止期': 'compulsory_end', '交强险止期': 'compulsory_end', '交强险到期': 'compulsory_end',
      '商业险保险起期': 'commercial_start', '商业险起期': 'commercial_start',
      '商业险保险止期': 'commercial_end', '商业险止期': 'commercial_end', '商业险到期': 'commercial_end',
      '车损险保额': 'vehicle_damage_amount', '车损险-保额': 'vehicle_damage_amount',
      '车损险保费': 'vehicle_damage_premium', '车损险-保费': 'vehicle_damage_premium',
      '保额': 'vehicle_damage_amount', '保额_1': 'passenger_amount', '保额_2': 'passenger_amount',
      '保费_1': 'passenger_premium', '保费_2': 'passenger_premium',
      '三者险保额': 'third_party_amount', '三者险-保额': 'third_party_amount', '第三者责任险保额': 'third_party_amount', '商业险保额': 'third_party_amount',
      '三者险保费': 'third_party_premium', '三者险-保费': 'third_party_premium', '第三者责任险保费': 'third_party_premium', '商业险保费': 'third_party_premium',
      '司乘险保额': 'passenger_amount', '司乘险-保额': 'passenger_amount',
      '司乘险保费': 'passenger_premium', '司乘险-保费': 'passenger_premium',
      '商业险合计': 'commercial_total', '商业险保费合计': 'commercial_total',
      '交强险': 'compulsory_premium', '交强险保费': 'compulsory_premium',
      '车船税': 'vehicle_tax', '车船使用税': 'vehicle_tax',
      '合计': 'total_premium', '总保费': 'total_premium', '保费合计': 'total_premium',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {},
  },
  other: {
    targetTable: 'other_insurance',
    moduleName: '其他保险',
    // 冲突键：险种 + 保单号。保单号缺失的行会匹配库内 policy_no 为空的记录（非 personnel 模块
    // 空值也参与查重），若库里已存在同险种空保单号记录会被合并更新，属预期行为。
    conflictKey: ['insurance_type', 'policy_no'],
    memoryMode: false,
    dateFields: ['start_date', 'expire_date'],
    fieldMapping: {
      '保险类型': 'insurance_type', '险种': 'insurance_type', '类型': 'insurance_type',
      '保单号': 'policy_no', '保单编号': 'policy_no', '保险单号': 'policy_no',
      '投保标的': 'insured_subject', '保险标的': 'insured_subject', '标的': 'insured_subject',
      '保额': 'coverage_amount', '保险金额': 'coverage_amount', '保额(元)': 'coverage_amount',
      '保费': 'premium', '保险费': 'premium', '保费(元)': 'premium',
      '保险起期': 'start_date', '起保日期': 'start_date', '起期': 'start_date',
      '保险止期': 'expire_date', '到期日期': 'expire_date', '保险到期': 'expire_date', '止期': 'expire_date',
      '保险公司': 'insurance_company', '承保公司': 'insurance_company', '保险人': 'insurance_company',
      '部门': 'department', '投保部门': 'department', '所属部门': 'department',
      '联系人': 'contact_person', '经办人': 'contact_person',
      '联系电话': 'contact_phone', '电话': 'contact_phone', '手机号': 'contact_phone',
      '状态': 'status', '保单状态': 'status',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '有效': '有效', '生效': '有效', '正常': '有效',
      '失效': '失效', '过期': '失效', '终止': '失效',
    },
  },
  audit: {
    targetTable: 'audit_logs',
    moduleName: '审计日志',
    conflictKey: ['operator', 'action_type', 'action_time'],
    memoryMode: false,
    dateFields: ['action_time'],
    fieldMapping: {
      '操作人': 'operator', '操作人员': 'operator', '用户': 'operator',
      '操作类型': 'action_type', '类型': 'action_type', '行为': 'action_type',
      '操作对象': 'target', '对象': 'target', '操作模块': 'target',
      '操作时间': 'action_time', '时间': 'action_time', '日期': 'action_time',
      'IP地址': 'ip_address', 'IP': 'ip_address',
      '操作结果': 'result', '结果': 'result', '状态': 'result',
      '备注': 'remark', '详情': 'remark', '说明': 'remark',
    },
    statusMap: {
      '成功': 'success', '正常': 'success', '通过': 'success',
      '失败': 'failed', '错误': 'failed', '异常': 'failed',
    },
  },
  workflow: {
    targetTable: 'hse_workflows',
    moduleName: '审批任务',
    conflictKey: ['code', 'name'],
    memoryMode: false,
    dateFields: [],
    fieldMapping: {
      '流程编码': 'code', '编码': 'code', '流程编号': 'code', '编号': 'code',
      '流程名称': 'name', '名称': 'name', '标题': 'title',
      '流程描述': 'description', '描述': 'description', '说明': 'description',
      '状态': 'status', '流程状态': 'status',
      '排序': 'sort_order', '序号': 'sort_order', '优先级': 'sort_order',
      '备注': 'remark',
    },
    statusMap: {
      '启用': 'enabled', '启用中': 'enabled', '有效': 'enabled',
      '禁用': 'disabled', '停用': 'disabled', '无效': 'disabled',
    },
  },
  'new-employee': {
    targetTable: 'new_employee_training',
    moduleName: '新员工培训',
    conflictKey: ['name', 'department', 'hire_date'],
    memoryMode: false,
    dateFields: ['hire_date', 'training_date'],
    fieldMapping: {
      '姓名': 'name', '员工姓名': 'name',
      '员工编号': 'employee_id', '工号': 'employee_id',
      '部门': 'department', '所属部门': 'department',
      '岗位': 'position', '职位': 'position',
      '入职日期': 'hire_date', '入职时间': 'hire_date',
      '培训完成': 'training_completed', '是否培训': 'training_completed', '培训状态': 'training_completed',
      '考试分数': 'exam_score', '分数': 'exam_score', '成绩': 'exam_score',
      '师傅姓名': 'master_name', '带教师傅': 'master_name', '导师': 'master_name',
      '考核结果': 'assessment_result', '结果': 'assessment_result',
      '培训日期': 'training_date', '培训时间': 'training_date',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '合格': 'pass', '通过': 'pass', '达标': 'pass',
      '不合格': 'fail', '未通过': 'fail', '不达标': 'fail',
      '是': true, '已完成': true, '完成': true,
      '否': false, '未完成': false,
    },
  },
  ledger: {
    targetTable: 'training_records',
    moduleName: '培训台账',
    // 同 training：落键后以人员 id 参与冲突判定；无键行行为同前
    conflictKey: ['employee_id', 'name', 'training_date', 'training_type'],
    // 编码乱码防御字段（2026-08-29 培训乱码事故后新增，配合 looksLikeMojibake）
    mojibakeCheck: ['name', 'dept', 'position', 'content', 'result', 'trainer', 'remark', 'training_type'],
    memoryMode: false,
    dateFields: ['training_date'],
    fieldMapping: {
      '姓名': 'name', '参训人': 'name', '参训人姓名': 'name', '员工姓名': 'name',
      '培训人': 'name', '参训人员': 'name', '人员姓名': 'name',
      '身份证号': 'id_card', '身份证': 'id_card', '证件号': 'id_card',
      '部门': 'dept', '所属部门': 'dept', '培训部门': 'dept', '培训部门/班组': 'dept', '部门/班组': 'dept',
      '岗位': 'position', '职位': 'position', '工种': 'position', '工种/岗位': 'position', '岗位/工种': 'position',
      '网格层级': 'grid_level', '层级': 'grid_level',
      '培训频次': 'frequency', '频次': 'frequency',
      '培训类型': 'training_type', '类型': 'training_type',
      '培训日期': 'training_date', '日期': 'training_date',
      '培训时长': 'duration_minutes', '时长': 'duration_minutes', '时长分钟': 'duration_minutes',
      '培训内容': 'content', '内容': 'content',
      '考核结果': 'result', '结果': 'result',
      '分数': 'score', '考试分数': 'score',
      '讲师': 'trainer', '培训讲师': 'trainer', '讲师姓名': 'trainer',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '合格': '合格', '不合格': '不合格', '优秀': '优秀',
    },
  },
  driver: {
    targetTable: 'driver_assessment',
    moduleName: '驾驶员实操',
    conflictKey: ['name', 'department', 'license_no'],
    memoryMode: false,
    dateFields: ['hire_date', 'assessment_date'],
    fieldMapping: {
      '姓名': 'name', '驾驶员姓名': 'name', '司机姓名': 'name',
      '员工编号': 'employee_id', '工号': 'employee_id',
      '部门': 'department', '所属部门': 'department', '车队': 'department',
      '岗位': 'position', '职位': 'position',
      '驾驶证号': 'license_no', '驾照号': 'license_no', '驾驶证': 'license_no',
      '准驾车型': 'license_type', '准驾': 'license_type', '驾照类型': 'license_type',
      '入职日期': 'hire_date', '入职时间': 'hire_date', '上岗日期': 'hire_date',
      '实操考核日期': 'assessment_date', '考核日期': 'assessment_date', '考核时间': 'assessment_date',
      '考核结果': 'assessment_result', '结果': 'assessment_result', '考核等级': 'assessment_result',
      '安全行驶里程': 'safe_mileage', '行驶里程': 'safe_mileage', '里程': 'safe_mileage',
      '年龄': 'age',
      '联系电话': 'phone', '电话': 'phone', '手机': 'phone',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '优秀': 'excellent', '良好': 'good', '合格': 'qualified', '不合格': 'unqualified',
    },
  },
  'driver-assessment': {
    targetTable: 'memory_driver_assessment',
    moduleName: '交通安全评估档案',
    conflictKey: ['name', 'idCard'],
    memoryMode: true,
    dateFields: ['assessmentDate', 'expiryDate'],
    fieldMapping: {
      '档案编号': 'archiveNo', '编号': 'archiveNo',
      '姓名': 'name', '驾驶员姓名': 'name', '驾车人': 'name', '司机姓名': 'name',
      '驾驶证件号': 'idCard', '证件号': 'idCard', '驾驶证号': 'idCard', '驾驶证': 'idCard',
      '准驾车型': 'licenseType', '准驾': 'licenseType', '驾照类型': 'licenseType',
      '所属部门': 'department', '部门': 'department', '车队': 'department',
      '车辆编号': 'vehicleNo', '车辆': 'vehicleNo', '车牌号': 'vehicleNo',
      '评估日期': 'assessmentDate', '考核日期': 'assessmentDate', '建档日期': 'assessmentDate',
      '评估结果': 'assessmentResult', '结果': 'assessmentResult',
      '评估等级': 'assessmentLevel', '等级': 'assessmentLevel',
      '有效期至': 'expiryDate', '有效期': 'expiryDate', '到期日期': 'expiryDate',
      '联系电话': 'phone', '电话': 'phone', '手机': 'phone',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {},
  },
  'driver-violation': {
    targetTable: 'driver_violation',
    moduleName: '驾驶员违章记录',
    conflictKey: ['name', 'violation_time'],
    memoryMode: false,
    dateFields: ['violation_time'],
    // 档案表等表格常预填"序号"占位空行（只有序号、其余为空），据此识别为占位行并跳过
    serialColumn: '序号',
    fieldMapping: {
      '序号': 'seq',
      '违章日期': 'violation_time', '违章时间': 'violation_time', '发生时间': 'violation_time', '时间': 'violation_time',
      '司机姓名': 'name', '姓名': 'name', '驾驶员姓名': 'name', '驾车人': 'name',
      '违章事由': 'violation_desc', '违章事实描述': 'violation_desc', '事实描述': 'violation_desc', '违章事实': 'violation_desc', '描述': 'violation_desc',
      '计分': 'demerit_points', '扣分': 'demerit_points', '扣分数': 'demerit_points',
      '罚款': 'fine_amount', '罚款金额': 'fine_amount', '罚款(元)': 'fine_amount',
      '车牌号': 'plate_no', '车牌': 'plate_no',
      '违章地点': 'violation_location', '地点': 'violation_location',
      '违章类别': 'violation_type', '类别': 'violation_type', '违章类型': 'violation_type',
      '处理状态': 'handle_status', '状态': 'handle_status',
      '处理方式': 'handle_method', '处理措施': 'handle_method',
      '处理结果': 'handle_result', '处理结果说明': 'handle_result',
      '备注': 'remark', '说明': 'remark',
    },
    // 汇总表罚款/计分为带单位字符串（"200元" / "记1分"），入库前归一化为数字
    valueTransforms: {
      fine_amount: parseFineAmount,
      demerit_points: parseDemeritPoints,
      violation_time: parseViolationTime,
    },
    statusMap: {
      '待处理': '待处理', '未处理': '待处理', '已处理': '已处理',
    },
  },
  'driver-three-violation': {
    targetTable: 'driver_three_violation',
    moduleName: '三违扣分记录',
    conflictKey: ['name', 'violation_time'],
    memoryMode: false,
    dateFields: ['violation_time'],
    // 「司机交通安全专项行动档案表」（含 档案表 + 表2 扣分标准 两个 sheet）：跳过「表2扣分标准」
    excludeSheetPatterns: [/扣分标准|表2/],
    // 档案表预填"序号"占位空行（只有序号、其余为空），据此识别为占位行并跳过
    serialColumn: '序号',
    fieldMapping: {
      '序号': 'seq',
      '违章日期': 'violation_time', '违章时间': 'violation_time', '发生时间': 'violation_time', '时间': 'violation_time',
      '日期': 'violation_time',
      '司机姓名': 'name', '姓名': 'name', '驾驶员姓名': 'name', '驾车人': 'name',
      '违章事由': 'violation_desc', '违章事实描述': 'violation_desc', '事实描述': 'violation_desc', '违章事实': 'violation_desc', '描述': 'violation_desc',
      '违章行为描述': 'violation_desc',
      '计分': 'demerit_points', '扣分': 'demerit_points', '扣分数': 'demerit_points',
      '扣分值': 'demerit_points',
      '罚款': 'fine_amount', '罚款金额': 'fine_amount', '罚款(元)': 'fine_amount',
      '车牌号': 'plate_no', '车牌': 'plate_no',
      '违章地点': 'violation_location', '地点': 'violation_location',
      '违章类别': 'violation_type', '类别': 'violation_type', '违章类型': 'violation_type',
      '处理状态': 'handle_status', '状态': 'handle_status',
      '处理方式': 'handle_method', '处理措施': 'handle_method',
      '处理结果': 'handle_result', '处理结果说明': 'handle_result',
      '备注': 'remark', '说明': 'remark',
    },
    valueTransforms: {
      fine_amount: parseFineAmount,
      demerit_points: parseDemeritPoints,
      violation_time: parseViolationTime,
    },
    statusMap: {
      '待处理': '待处理', '未处理': '待处理', '已处理': '已处理',
    },
  },
  'driver-monthly': {
    targetTable: 'memory_driver_monthly',
    moduleName: '月度考核',
    conflictKey: ['name', 'month'],
    memoryMode: true,
    numericFields: ['safetyScore', 'disciplineScore', 'trainingScore', 'totalScore'],
    dateFields: [],
    fieldMapping: {
      '考核月份': 'month', '月份': 'month', '考核月': 'month',
      '姓名': 'name', '驾驶员姓名': 'name', '驾车人': 'name',
      '所属部门': 'department', '部门': 'department', '车队': 'department',
      '安全驾驶得分': 'safetyScore', '安全得分': 'safetyScore',
      '遵章守纪得分': 'disciplineScore', '守纪得分': 'disciplineScore',
      '培训学习得分': 'trainingScore', '培训得分': 'trainingScore',
      '得分': 'totalScore', '总分': 'totalScore',
      '考核等级': 'assessmentLevel', '等级': 'assessmentLevel',
      '主要问题': 'mainProblem', '问题': 'mainProblem',
      '评定人': 'assessor', '评定': 'assessor', '考核人': 'assessor',
      '备注': 'remark', '说明': 'remark',
    },
    statusMap: {
      '优秀': '优秀', '良好': '良好', '合格': '合格', '不合格': '不合格',
    },
  },
};

// ============================================================
// Node.js 原生导入 — 解析 Excel 文件
// ============================================================
function parseExcelNative(filePath, moduleConfig, selectedSheets = null) {
  // 读文件失败：损坏 / 编码不受支持（如 GBK 编码 CSV）统一给出可操作提示
  let workbook;
  try {
    workbook = XLSX.readFile(filePath);
  } catch (e) {
    return { success: false, error: `文件无法读取或编码不受支持：请将 CSV 另存为 UTF-8 编码，或重新导出 Excel（.xlsx）后重试${e && e.message ? '（' + e.message + '）' : ''}` };
  }
  const sheetNames = workbook.SheetNames;
  if (!sheetNames.length) {
    return { success: false, error: '文件为空：没有可解析的工作表' };
  }
  const fieldMapping = moduleConfig.fieldMapping;
  const expectedHeaders = Object.keys(fieldMapping);
  const maxRows = moduleConfig.maxRows || 0;
  const fieldTypes = moduleConfig.fieldTypes || {};
  const valueTransforms = moduleConfig.valueTransforms || {};
  const requiredGroups = Array.isArray(moduleConfig.requiredColumnGroups) ? moduleConfig.requiredColumnGroups : [];
  const dedupeKey = moduleConfig.dedupeKey ? (Array.isArray(moduleConfig.dedupeKey) ? moduleConfig.dedupeKey : [moduleConfig.dedupeKey]) : null;

  function findHeaderRow(ws, maxScanRows = 20) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const numCols = range.e.c - range.s.c + 1;
    const numRows = Math.min(maxScanRows, range.e.r - range.s.r + 1);

    let bestRow = 0;
    let bestMatch = 0;

    for (let r = 0; r < numRows; r++) {
      const rowVals = [];
      for (let c = 0; c < numCols; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellAddr];
        const v = cell ? String(cell.v).trim() : '';
        rowVals.push(v);
      }
      const matched = expectedHeaders.filter(h => rowVals.includes(h)).length;
      if (matched > bestMatch) {
        bestMatch = matched;
        bestRow = r;
      }
      if (matched >= Math.min(expectedHeaders.length, 3)) {
        return r;
      }
    }
    return bestMatch >= 2 ? bestRow : 0;
  }

  // 当前 sheet 的物理表头行（0 基）。sheet_to_json(range=headerRow) 会跳过表头行，
  // 待 mapRows 计算源 Excel 物理行号（1 基）时需补偿该偏移，使 _imp_row 与内嵌图片锚点对齐。
  let curSheetHeaderRow = 0;

  function parseSheet(ws) {
    const headerRow = findHeaderRow(ws);
    if (headerRow >= 0) curSheetHeaderRow = headerRow;
    const multiHeader = moduleConfig.multiRowHeader;

    if (multiHeader && Array.isArray(multiHeader.groupLabels) && multiHeader.groupLabels.length) {
      const groupSet = new Set(multiHeader.groupLabels);
      const groupAlias = multiHeader.groupAlias || {};
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      const readRowValues = (r) => {
        const vals = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          vals.push(cell ? String(cell.v).trim() : '');
        }
        return vals;
      };
      const h1 = readRowValues(headerRow);
      const h2 = readRowValues(headerRow + 1);
      let currentGroup = '';
      const subAlias = (b) => {
        if (b === '单价/万元') return '单价(万)';
        if (b === '总价/万元') return '总价(万)';
        return b;
      };
      const combinedHeaders = h1.map((a, i) => {
        const b = h2[i] || '';
        if (a && groupSet.has(a)) {
          currentGroup = groupAlias[a] || a;
          if (b) return `${currentGroup}-${subAlias(b)}`;
          return null;
        }
        if (a) { currentGroup = ''; return a; }
        if (currentGroup && b) return `${currentGroup}-${subAlias(b)}`;
        return b || '';
      });
      return XLSX.utils.sheet_to_json(ws, {
        header: combinedHeaders,
        range: headerRow + 2,
        defval: '',
      });
    }

    const jsonData = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      range: headerRow,
    });
    return jsonData;
  }

  const statusMap = moduleConfig.statusMap;
  const dateFields = moduleConfig.dateFields || [
    'hazard_date', 'fix_date', 'issue_date', 'effective_date', 'deadline',
    'installDate', 'expiryDate', 'lastCheckDate', 'nextCheckDate',
  ];

  function mapRows(jsonData, sheetName = '') {
    const allErrors = [];
    const seen = new Map(); // 文件内重复识别（按 dedupeKey 组合值）

    // 预算表：预扫描汇总行"年度安全费用预算计划总额"，提取其右侧数值（万元）作为年度计划总额
    let sheetAnnualPlanTotal = null;
    if (moduleConfig.moduleName === '安全费用预算') {
      for (const row of jsonData) {
        const keys = Object.keys(row);
        const labelIdx = keys.findIndex(k => String(row[k] == null ? '' : row[k]).includes('年度安全费用预算计划总额'));
        if (labelIdx >= 0) {
          for (let j = labelIdx + 1; j < keys.length; j++) {
            const v = parseFloat(row[keys[j]]);
            if (!Number.isNaN(v) && String(row[keys[j]]).trim() !== '') { sheetAnnualPlanTotal = v; break; }
          }
          if (sheetAnnualPlanTotal !== null) break;
        }
      }
    }

    const mapped = jsonData.map((row, rowIdx) => {
      const result = {};
      const rowErrors = [];
      const actualRowNum = curSheetHeaderRow + rowIdx + 2;

      // 占位行过滤：如「X 月份无事故」等非真实记录，直接跳过——不计入有效行、也不计入错误行
      if (moduleConfig.placeholderField && moduleConfig.placeholderPattern) {
        const pv = row[moduleConfig.placeholderField] != null ? String(row[moduleConfig.placeholderField]) : '';
        if (moduleConfig.placeholderPattern.test(pv)) {
          return { data: {}, errors: [], originalRow: row, rowIndex: actualRowNum };
        }
      }

      // 预算表末尾常有"年度安全费用预算计划总额"等汇总行，直接跳过
      if (moduleConfig.skipSummaryRows && moduleConfig.serialColumn) {
        const serialValue = String(row[moduleConfig.serialColumn] || '').trim();
        const summaryMarkers = /合计|汇总|总计|年度安全费用|结余|计划总额|支出总额/;
        const isLikelySummary = (serialValue && !/^\d+$/.test(serialValue)) || Object.values(row).some(v => v && summaryMarkers.test(String(v)));
        if (isLikelySummary) {
          return { data: {}, errors: [] };
        }
      }

      for (const [excelField, dbField] of Object.entries(fieldMapping)) {
        if (row[excelField] !== undefined && row[excelField] !== '') {
          let value = row[excelField];
          // 值转换（如 "80万" → 800000；转换失败 → 行级类型错误）
          const transform = valueTransforms[dbField];
          if (transform) {
            const transformed = transform(value);
            if (Number.isNaN(transformed)) {
              rowErrors.push({
                field: excelField,
                dbField,
                reason: `数值格式错误："${value}"，无法识别为金额（支持 800000 或 80万 格式）`
              });
              continue;
            }
            value = transformed;
          } else {
            // 字段类型校验（number/boolean；date 走下方 dateFields 分支）
            const ftype = fieldTypes[dbField];
            if (ftype === 'number') {
              const num = typeof value === 'number' ? value : parseFloat(String(value).trim().replace(/,/g, '').replace(/，/g, ''));
              if (Number.isNaN(num)) {
                rowErrors.push({ field: excelField, dbField, reason: `数值格式错误："${value}"，请输入数字` });
                continue;
              }
              value = num;
            } else if (ftype === 'boolean') {
              const s = String(value).trim();
              if (s === '是' || s === 'true' || s === 'TRUE' || s === '1' || s === 'yes' || s === 'YES') value = true;
              else if (s === '否' || s === 'false' || s === 'FALSE' || s === '0' || s === 'no' || s === 'NO') value = false;
              else value = (value === true || value === 1);
            }
          }
          if (dbField === 'status' && statusMap && statusMap[value]) {
            value = statusMap[value];
          }
          if (dateFields.includes(dbField)) {
            const originalValue = value;
            value = fixDateValue(value);
            if (value === null || value === 'Invalid Date') {
              rowErrors.push({
                field: excelField,
                dbField: dbField,
                reason: `日期格式错误："${originalValue}"，请使用 YYYY-MM-DD 或 YYYY/MM/DD 格式`
              });
              value = originalValue;
            }
          }
          if (value !== null && value !== '' && value !== 'Invalid Date') {
            // 预算表 item_name 常因 Excel 换行显示为多行，统一压缩空格避免冲突键匹配失败
            if (moduleConfig.moduleName === '安全费用预算' && dbField === 'item_name') {
              value = String(value).replace(/\s+/g, ' ').trim();
            }
            result[dbField] = value;
          }
        }
      }

      // 预算表：回填年度计划总额（来自汇总行扫描），仅在有效数据行上生效
      if (moduleConfig.moduleName === '安全费用预算' && sheetAnnualPlanTotal !== null) {
        result.annual_plan_total = sheetAnnualPlanTotal;
      }

      const requiredField = moduleConfig.validKey || moduleConfig.conflictKey || 'name';
      const requiredFields = Array.isArray(requiredField) ? requiredField : [requiredField];
      const hasRequiredValue = requiredFields.some(f => result[f] && String(result[f]).trim() !== '');

      if (!hasRequiredValue) {
        const isEmptyRow = Object.keys(row).every(k => !row[k] || String(row[k]).trim() === '');
        const serialValue = moduleConfig.serialColumn ? String(row[moduleConfig.serialColumn] || '').trim() : '';
        const summaryMarkers = /合计|汇总|总计|年度安全费用|结余|计划总额|支出总额/;
        const isSummaryLike = (serialValue && !/^\d+$/.test(serialValue)) || Object.values(row).some(v => v && summaryMarkers.test(String(v)));
        // 只有序号列有数字、其余列为空或 0 的填充行，视为空行
        let isFillerRow = false;
        if (moduleConfig.serialColumn && /^\d+$/.test(serialValue)) {
          isFillerRow = Object.keys(row).every(k => {
            if (k === moduleConfig.serialColumn) return true;
            const v = row[k];
            if (v === null || v === undefined || String(v).trim() === '') return true;
            return typeof v === 'number' && v === 0;
          });
        }
        if (!isEmptyRow && !isFillerRow && !isSummaryLike) {
          // 模块配置 skipRowsWithoutValidKey=true 时：validKey 字段全空的行视为非业务行直接跳过
          if (moduleConfig.skipRowsWithoutValidKey) {
            return { data: {}, errors: [], originalRow: row, rowIndex: actualRowNum };
          }
          const requiredLabels = requiredFields.map(f => {
            const labelEntry = Object.entries(fieldMapping).find(([_, v]) => v === f);
            return labelEntry ? labelEntry[0] : f;
          });
          rowErrors.push({
            field: requiredLabels.join(' / '),
            dbField: requiredFields.join(','),
            reason: `缺少必填字段，至少需要填写：${requiredLabels.join('、')}`
          });
        }
      }

      // name/title 双向互补仅对明确声明 titleFromName 的模块生效
      if (moduleConfig.titleFromName) {
        if (!result.name && result.title) {
          result.name = result.title;
        }
        if (!result.title && result.name) {
          result.title = result.name;
        }
      }
      if (moduleConfig.moduleName === '消防设施管理' && result.siteName) {
        if (result.location) {
          result.location = `${result.siteName} - ${result.location}`;
        } else {
          result.location = result.siteName;
        }
        delete result.siteName;
      }
      if (moduleConfig.moduleName === '目标职责') {
        delete result.name;
        const parts = [];
        if (row['年度']) parts.push(`年度：${row['年度']}`);
        if (row['目标值']) parts.push(`目标值：${row['目标值']}`);
        if (row['完成值']) parts.push(`完成值：${row['完成值']}`);
        if (row['考核周期']) parts.push(`考核周期：${row['考核周期']}`);
        if (parts.length) result.content_summary = parts.join('；');
      }

      // 文件内重复识别：同 dedupeKey 组合值出现多次 → 标记重复行（避免重复投保/重复录入）
      if (dedupeKey && rowErrors.length === 0) {
        const keyStr = dedupeKey
          .map(k => (result[k] !== undefined && result[k] !== null ? String(result[k]).trim() : ''))
          .join('||');
        if (keyStr && keyStr.replace(/\|\|/g, '')) {
          if (seen.has(keyStr)) {
            rowErrors.push({
              field: dedupeKey.join('+'),
              dbField: 'duplicate',
              reason: `与第 ${seen.get(keyStr)} 行重复（${dedupeKey.join('+')} 相同），请检查清单`
            });
          } else {
            seen.set(keyStr, actualRowNum);
          }
        }
      }

      if (rowErrors.length > 0) {
        allErrors.push({
          rowIndex: actualRowNum,
          sheetName: sheetName,
          errors: rowErrors
        });
      }

      return { data: result, errors: rowErrors, originalRow: row, rowIndex: actualRowNum };
    });
    return { mapped, allErrors };
  }

  const sheets = [];
  let allData = [];
  let allRowErrors = [];
  let globalRowOffset = 0;
  let totalScannedRows = 0;
  // 表头必填列检测：仅对第一个"数据表"（表头匹配 >=2）执行，避免封面/说明 sheet 误伤
  let firstDataSheetChecked = false;

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawData = parseSheet(ws);

    // 行数限制（累计所有 sheet 数据行）
    totalScannedRows += rawData.length;
    if (maxRows > 0 && totalScannedRows > maxRows) {
      return {
        success: false,
        error: `数据行数超出限制（最多 ${maxRows} 行），请拆分文件后分批导入`,
        sheets,
      };
    }

    // 表头必填列检测（requiredColumnGroups 每组至少匹配一个别名）
    if (!firstDataSheetChecked && requiredGroups.length && rawData.length > 0) {
      const headerKeys = Object.keys(rawData[0]).map(h => String(h).trim());
      const matchedColsCount = expectedHeaders.filter(h => headerKeys.includes(h)).length;
      if (matchedColsCount >= 2) {
        firstDataSheetChecked = true;
        const missing = [];
        for (const group of requiredGroups) {
          const hasAny = group.some(alias => headerKeys.includes(alias) || headerKeys.some(k => k.includes(alias)));
          if (!hasAny) missing.push(group.join('/'));
        }
        if (missing.length) {
          return {
            success: false,
            error: `缺少必填列：${missing.join('、')}。请使用模板表头（如 ${requiredGroups.map(g => g[0]).join('、')}），当前表头：${headerKeys.join('、') || '（空）'}`,
            sheets,
          };
        }
      }
    }

    const { mapped, allErrors } = mapRows(rawData, sheetName);
    const requiredField = moduleConfig.validKey || moduleConfig.conflictKey || 'name';
    const requiredFields = Array.isArray(requiredField) ? requiredField : [requiredField];
    // validKeySkipErrors：true 时只判断 requiredFields 是否非空，不再过滤 errors.length
    const validRows = mapped.filter((item) => {
      const valid = requiredFields.some((f) => item.data[f] != null && String(item.data[f]).trim() !== '');
      return moduleConfig.validKeySkipErrors ? valid : (valid && item.errors.length === 0);
    });
    const matchedCols = expectedHeaders.filter(h => {
      if (rawData.length === 0) return false;
      const firstRow = rawData[0];
      return Object.keys(firstRow).includes(h);
    }).length;
    // 模块自定义的辅助 sheet 黑名单（如事故管理的「单位」「类别关联」等数据字典）
    const excludedByName = Array.isArray(moduleConfig.excludeSheetPatterns)
      && moduleConfig.excludeSheetPatterns.some((re) => re.test(sheetName));

    const sheetInfo = {
      name: sheetName,
      row_count: rawData.length,
      valid_count: validRows.length,
      error_count: allErrors.length,
      matched_cols: matchedCols,
      is_data_sheet: !excludedByName && (validRows.length > 0 || allErrors.length > 0) && matchedCols >= 2,
    };
    sheets.push(sheetInfo);

    // 默认仅合并真正的"数据 sheet"（matched_cols >= 2 且有数据/错误）
    const shouldMerge = excludedByName
      ? false
      : (selectedSheets === null
        ? sheetInfo.is_data_sheet
        : selectedSheets.includes(sheetName));
    if (shouldMerge) {
      allData = allData.concat(mapped);
      allRowErrors = allRowErrors.concat(allErrors.map(e => ({ ...e, rowIndex: e.rowIndex + globalRowOffset })));
      globalRowOffset += rawData.length;
    }
  }

  // 编码乱码防御：对 moduleConfig.mojibakeCheck 声明的业务文本字段做字符集白名单校验。
  // 命中即整文件拒绝（说明是文件级编码问题），避免部分乱码数据静默入库。
  if (Array.isArray(moduleConfig.mojibakeCheck) && moduleConfig.mojibakeCheck.length > 0) {
    for (const item of allData) {
      for (const field of moduleConfig.mojibakeCheck) {
        const val = item.data && item.data[field];
        if (looksLikeMojibake(val)) {
          const sample = String(val).slice(0, 20);
          console.warn(`[Import] 检测到疑似编码乱码 module=${moduleConfig.moduleName} field=${field} value=${sample}`);
          return {
            success: false,
            error: `文件编码异常：字段「${field}」检测到无法识别的字符（样例：${sample}）。` +
              '常见于 GBK 编码的文件被按 UTF-8 读取。请将文件另存为 UTF-8 编码后重试',
            sheets,
          };
        }
      }
    }
  }

  const requiredField = moduleConfig.validKey || moduleConfig.conflictKey || 'name';
  const requiredFields = Array.isArray(requiredField) ? requiredField : [requiredField];
  // 与 per-sheet validRows 一致：validKeySkipErrors=true 时只看 requiredFields 非空，忽略 errors
  const validItems = allData.filter((item) => {
    const valid = requiredFields.some((f) => item.data[f] != null && String(item.data[f]).trim() !== '');
    return moduleConfig.validKeySkipErrors ? valid : (valid && item.errors.length === 0);
  });
  // grid 模块附加源 Excel 行号（1 基），供确认入库时把内嵌图片锚点对应到正确数据行。
  const validData = moduleConfig.moduleName === '网格管理'
    ? validItems.map((item) => ({ ...item.data, _imp_row: item.rowIndex }))
    : validItems.map((item) => item.data);
  const errorItems = allData.filter(item => item.errors.length > 0);

  // 编码异常启发式：所有 sheet 表头均无法匹配（matched_cols < 2）且首行含 UTF-8 解码失败特征（U+FFFD）
  if (totalScannedRows > 0 && sheets.every((s) => s.matched_cols < 2)) {
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const firstGrid = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { defval: '', header: 1, range: 0, limit: 1 }) : [];
    const joined = JSON.stringify(firstGrid || []);
    if (joined.includes('\uFFFD')) {
      return {
        success: false,
        error: '文件编码异常：检测到无法识别的字符（常见于 GBK 编码的 CSV 文件）。请将文件另存为 UTF-8 编码后重试',
        sheets,
      };
    }
  }

  if (!validData.length && errorItems.length === 0) {
    return { success: false, error: '文件中没有有效数据，请检查表头是否匹配', sheets };
  }

  const preview = validData.slice(0, 10).map((row, i) => ({
    rowIndex: i + 1,
    data: camelKeys(row),
    errors: [],
  })).concat(
    errorItems.slice(0, 5).map(item => ({
      rowIndex: item.rowIndex,
      data: camelKeys(item.data),
      errors: item.errors,
    }))
  );

  return {
    success: true,
    module_type: moduleConfig.moduleName,
    target_table: moduleConfig.targetTable,
    total_rows: validData.length,
    error_count: errorItems.length,
    errors: allRowErrors,
    sample_data: validData,
    preview,
    sheets,
  };
}

// ============================================================
// 三违图片通用抽取（被 confirmImportNative 调用）
// ============================================================
function attachViolationImages(filePath, data) {
  if (!data || data.length === 0) return Promise.resolve({ attached: 0, skipped: true });
  const mapPath = path.join(os.tmpdir(), `violation_img_map_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  return new Promise((resolve) => {
    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const child = execFile(
      PYTHON_PATH,
      [EXTRACT_IMG_SCRIPT, '--xlsx', filePath, '--out', uploadsRoot, '--map', mapPath],
      { timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(mapPath); } catch (e) { /* ignore */ }
        if (err) {
          console.warn('[Import] 三违图片抽取失败（不影响数据导入）:', err.message);
          if (stderr) console.warn('[Import] extract stderr:', stderr.slice(0, 500));
          return resolve({ attached: 0, error: err.message });
        }
        try {
          const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
          const norm = (s) => (s == null ? '' : String(s).trim().replace(/\s+/g, ' '));
          const noMap = new Map();
          const keyMap = new Map();
          for (const e of map) {
            const urls = { threeViolation: e.threeViolation || [], rectification: e.rectification || [] };
            if (e.no) noMap.set(norm(e.no), urls);
            const k = [norm(e.area_team), norm(e.inspector_name), norm(e.violator_name), norm(e.violation_behavior), norm(e.grid_level), norm(e.violation_date)].join('\u0001');
            if (k.replace(/\u0001/g, '')) keyMap.set(k, urls);
          }
          let attached = 0;
          for (const row of data) {
            const hit = noMap.get(norm(row.no)) || keyMap.get(
              [norm(row.area_team), norm(row.inspector_name), norm(row.violator_name), norm(row.violation_behavior), norm(row.grid_level), norm(row.violation_date)].join('\u0001')
            );
            if (hit) {
              row.image_content = hit.threeViolation.join(',');
              row.rectification_photos = hit.rectification.join(',');
              attached++;
            }
          }
          console.log('[Import] 三违图片关联完成，命中', attached, '行（共', data.length, '行）');
          resolve({ attached });
        } catch (parseErr) {
          console.warn('[Import] 三违图片映射解析失败（不影响数据导入）:', parseErr.message);
          resolve({ attached: 0, error: parseErr.message });
        }
      }
    );
  });
}

// ============================================================
// 网格台账内嵌图片抽取（被 confirmImportNative 调用）
// 依赖 extract_embedded_images.py：按物理行号锚点落盘并输出 row→{threeViolation,rectification}
// 与源解析行的 _imp_row（源 Excel 物理行号，1 基）对齐。
// ============================================================

// 探测源文件是否 WPS cellimages 格式（xl/cellimages.xml + DISPIMG 公式）。
// 返回 true 表示需先用 convert_wps_cellimages_to_drawings.py 转成标准 drawing 再抽取。
function isWpsCellimagesFile(filePath) {
  return new Promise((resolve) => {
    const probe = `import sys,zipfile
p = sys.argv[1]
try:
    names = zipfile.ZipFile(p).namelist()
    has_cell = 'xl/cellimages.xml' in names
    has_draw = any('/drawings/' in n for n in names)
    print('CELLIMG' if (has_cell and not has_draw) else 'NONE')
except Exception as e:
    print('NONE')
`;
    execFile(PYTHON_PATH, ['-c', probe, filePath], { timeout: 30000 }, (err, stdout, stderr) => {
      if (!err && String(stdout || '').trim() === 'CELLIMG') return resolve(true);
      return resolve(false);
    });
  });
}

// 把 WPS cellimages 文件转换为标准 drawing 文件（返回新临时文件名；失败返回 null）
function convertWpsCellimages(filePath) {
  const outPath = path.join(os.tmpdir(), `wps_cell_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.xlsx`);
  return new Promise((resolve) => {
    execFile(
      PYTHON_PATH,
      [CONVERT_WPS_CELLIMG_SCRIPT, '--xlsx', filePath, '--out', outPath],
      { timeout: 300000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          console.warn('[Import] WPS cellimages 转换失败，回退原文件抽取:', (stderr || err.message || '').slice(0, 300));
          return resolve(null);
        }
        resolve(outPath);
      }
    );
  });
}

async function attachGridImages(filePath, data) {
  if (!data || data.length === 0) return Promise.resolve({ attached: 0, skipped: true });

  // —— WPS cellimages 文件先转换为标准 drawing，保证照片可被抽取 ——
  let srcFile = filePath;
  let cleanupPath = null;
  try {
    if (await isWpsCellimagesFile(filePath)) {
      console.log('[Import] 检测到 WPS cellimages 格式，先转换为标准 drawing 再抽取图片');
      const conv = await convertWpsCellimages(filePath);
      if (conv) {
        srcFile = conv;
        cleanupPath = conv;
      }
    }
  } catch (detectErr) {
    console.warn('[Import] WPS cellimages 探测异常，按原文件抽取:', detectErr.message);
  }

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mapPath = path.join(os.tmpdir(), `grid_img_map_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  return new Promise((resolve) => {
    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const child = execFile(
      PYTHON_PATH,
      [EXTRACT_GRID_IMG_SCRIPT, '--xlsx', srcFile, '--out', uploadsRoot, '--map', mapPath, '--run', runId],
      { timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          try { fs.unlinkSync(mapPath); } catch (e) { /* ignore */ }
          console.warn('[Import] 网格内嵌图片抽取失败（不影响数据导入）:', err.message);
          if (stderr) console.warn('[Import] grid extract stderr:', stderr.slice(0, 500));
          return resolve({ attached: 0, error: err.message, runId });
        }
        try {
          const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
          const byRow = new Map();
          for (const e of map) {
            if (e && e.row != null) byRow.set(Number(e.row), e);
          }
          let attached = 0;
          for (const row of data) {
            if (row._imp_row == null) continue;
            const hit = byRow.get(Number(row._imp_row));
            if (hit) {
              const three = Array.isArray(hit.threeViolation) ? hit.threeViolation : [];
              const rect = Array.isArray(hit.rectification) ? hit.rectification : [];
              if (three.length) row.image_content = three.join(',');
              if (rect.length) row.rectified_photo = rect.join(',');
              attached++;
            }
          }
          console.log('[Import] 网格台账图片关联完成，命中', attached, '行（共', data.length, '行）');
          resolve({ attached, runId });
        } catch (parseErr) {
          console.warn('[Import] 网格图片映射解析失败（不影响数据导入）:', parseErr.message);
          resolve({ attached: 0, error: parseErr.message, runId });
        } finally {
          try { fs.unlinkSync(mapPath); } catch (e) { /* ignore */ }
        }
      }
    );
    if (child && typeof child.on === 'function') {
      child.on('close', () => {
        if (cleanupPath) {
          try { fs.unlinkSync(cleanupPath); } catch (e) { /* ignore */ }
        }
      });
    }
  });
}

// ============================================================
// 模板下载数据（GET /api/import/template/:module）
// ============================================================
const IMPORT_TEMPLATES = {
  hazards: [
    { 序号: 1, 隐患描述: '柴胡店收运车570Q左刹车灯不亮、右转向不亮', 整改措施: '立即前往车辆维修厂修理', 检查时间: '2026.6.16', 检查人员: '刘金涛、刘菲、王明轩', 整改人员: '张康', 整改时间: '2026.6.18', 是否整改完成: '是' },
  ],
  accidents: [
    { 事故日期: '2026-01-10', 事故类型: '交通事故', 事故等级: '一般', 发生地点: 'Highway 101', 事故描述: '车辆碰撞', 损失金额: 5000, 处理状态: '处理中' },
  ],
  training: [
    { 姓名: '王五', 部门: '市政部', 岗位: '司机', 培训类型: '安全培训', 培训日期: '2026-01-05', 培训时长分钟: 120, 培训内容: '交通安全知识', 考核结果: '合格', 分数: 90, 讲师: '赵六' },
  ],
  personnel: [
    // 任务7：模板表头必须与 personnel fieldMapping 一一对应（可被当前预处理成功解析）。
    { 工号: 'E001', 姓名: '张三', 保险类型: '雇主责任险', 保单号: 'POL001', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '示例行' },
  ],
  objectives: [
    { 年度: 2026, 季度: 1, 部门: '市政部', 责任人: '张三', 考核分数: 95, 等级: '优秀', 状态: '有效' },
  ],
  emergency: [
    { 预案名称: '火灾应急预案', 类型: 'fire', 级别: 'level1', 状态: 'active', 责任部门: '安全部', 责任人: '李四', 联系电话: '13900139000', 描述: '火灾应急处理流程', 版本: '1.0' },
  ],
  drill: [
    { 预案名称: '火灾应急预案', 演练类型: 'tabletop', 演练日期: '2026-01-15', 演练地点: '厂区A区', 参加人数: 50, 时长分钟: 60, 演练结果: 'excellent', 评估人: '评估组-张组长', 总结: '演练组织有序，达到预期目标', 改进建议: '建议加强初期处置训练' },
  ],
  insurance: [
    { 姓名: '张三', 身份证号: '110101199001011234', 部门: '市政部', 岗位: '司机', 保险状态: '已参保', 保险类型: '意外险', 保单号: 'POL001', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保费: 500 },
  ],
  vehicle: [
    {
      序号: 1,
      '投保人、被保险人': '宁津北控城市环境服务有限公司',
      '行驶证车主': '宁津北控城市环境服务有限公司',
      车牌号: '鲁ND1021',
      车架号: 'LZ0BFPD42J1017981',
      发动机号: 'BD10143525',
      初次登记年月: '2019-01-24',
      厂牌车型: '飞碟FD5161GXWP63K5吸污车',
      交强险保险起期: '2026-02-27',
      交强险保险止期: '2027-02-26',
      商业险保险起期: '2026-02-27',
      商业险保险止期: '2027-02-26',
      车损险保额: '200万',
      车损险保费: 3826.53,
      三者险保额: '200万',
      三者险保费: 3826.53,
      司乘险保额: '',
      司乘险保费: 0,
      商业险合计: 3826.53,
      交强险: 1944,
      车船税: 105.68,
      合计: 5876.21,
    },
  ],
  other: [
    { 保险类型: '公众责任险', 保单号: 'POL-OTHER-001', 投保标的: '厂区公共区域', 保额: 500000, 保费: 1200, 保险起期: '2026-01-01', 保险止期: '2027-01-01', 保险公司: '中国人民财产保险', 部门: '安全管理部', 联系人: '张三', 联系电话: '13800138000', 状态: '有效', 备注: '示例行' },
  ],
  regulations: [
    { 制度名称: '安全生产责任制', 制度编号: 'HSE-001', 制度类型: '管理制度', 发布日期: '2026-01-01', 实施日期: '2026-01-15', 制定部门: '安全管理部', 状态: '已发布', 版本: '1.0' },
  ],
  workflow: [
    { 流程编码: 'WF001', 流程名称: '隐患整改审批', 流程描述: '隐患发现→整改→验收闭环', 状态: '启用', 排序: 1 },
  ],
  inspection: [
    { 检查项目: '消防设施检查', 检查类型: '月度检查', 检查日期: '2026-01-15', 责任部门: '安全管理部', 检查结果: '合格', 整改期限: '2026-01-20', 备注: '' },
  ],
  audit: [
    { 操作人: 'admin', 操作类型: '登录', 操作对象: '系统', 操作时间: '2026-01-15 08:30:00', IP地址: '127.0.0.1', 操作结果: '成功', 备注: '' },
  ],
  'risk-control': [
    { 风险名称: '高处坠落', 风险等级: '重大', 风险类型: '作业风险', 责任部门: '安全管理部', 控制措施: '佩戴安全带、设置防护网', 状态: '管控中' },
  ],
  committee: [
    { 姓名: '张三', 部门: '安全管理部', 职务: '主任', 联系电话: '13800138000', 委员会类型: '安委会', 任职日期: '2026-01-01', 状态: '在职' },
  ],
  assessment: [
    { 考核名称: '年度安全考核', 考核周期: '2026年度', 被考核部门: '市政部', 考核分数: 95, 考核等级: '优秀', 考核人: '李四', 考核日期: '2026-12-25' },
  ],
  budget: [
    { '预算年度': 2026, '措施项目': '安全培训费用', '预算科目': '费用化', '名称': '年度安全培训', '用途及依据': '年度培训计划', '计划使用时间': '2026-03-15', '使用部门/地点': '安全管理部', '规格/品牌': '', '计划-数量': 1, '计划-单价(万)': 5, '计划-总价(万)': 5, '支出-数量': 0, '支出-单价(万)': 0, '使用状态': '未支出', '备注': '' },
  ],
  ledger: [
    { 姓名: '王五', 身份证号: '371422199001011234', 部门: '市政部', 岗位: '司机', 网格层级: '三级', 培训频次: '年度', 培训类型: '安全培训', 培训日期: '2026-01-05', 培训时长: 120, 培训内容: '交通安全知识', 考核结果: '合格', 分数: 90, 讲师: '赵六', 备注: '' },
  ],
  'new-employee': [
    { 姓名: '王五', 部门: '运营一部', 岗位: '保洁员', 入职日期: '2026-01-01', 培训完成: '是', 考试分数: 92, 师傅姓名: '张师傅', 考核结果: '合格' },
  ],
  driver: [
    { 姓名: '赵六', 部门: '车队', 岗位: '司机', 驾驶证号: '371422199001011234', 准驾车型: 'A2', 入职日期: '2020-01-01', 实操考核日期: '2026-01-10', 考核结果: '优秀', 安全行驶里程: 120000 },
  ],
  'driver-assessment': [
    { 档案编号: '', 姓名: '', 驾驶证件号: '', 准驾车型: '', 所属部门: '', 车辆编号: '', 评估日期: '', 评估结果: '', 评估等级: '', 有效期至: '', 联系电话: '', 备注: '' },
  ],
  'driver-violation': [
    { 姓名: '', 车牌号: '', 违章时间: '', 违章地点: '', 违章类别: '', 违章事实描述: '', 扣分: '', 罚款金额: '', 处理状态: '', 处理方式: '', 处理结果: '', 备注: '' },
  ],
  'driver-three-violation': [
    { 序号: 1, 日期: '2026-08-31', 驾驶员姓名: '杨占刚', 违章类别: '车辆安全管理——违反劳动纪律', 违章照片: '', 违章行为描述: '关闭/遮挡/移动车辆驾驶室内摄像头', 违规类型: '违反劳动纪律', 违规等级: '一般违规', 扣分值: '10分' },
  ],
  'driver-monthly': [
    { 考核月份: '', 姓名: '', 所属部门: '', 安全驾驶得分: '', 遵章守纪得分: '', 培训学习得分: '', 得分: '', 考核等级: '', 主要问题: '', 评定人: '', 备注: '' },
  ],
  violation: [
    { 违章标题: '未佩戴安全帽', 违章类型: '违章作业', 违章级别: '一般', 违章状态: '待整改', 违章人员: '张三', 所属部门: '生产运行部', 发现区域: '生产车间A', 发现人: '李四', 发现日期: '2026-01-15', 整改措施: '立即停止作业，进行安全教育', 整改期限: '2026-01-22', 整改人: '王五' },
  ],
  'fire-facility': [
    { 设施名称: '灭火器-001', 设施类型: '灭火器', 型号规格: 'MFZ/ABC4', 安装位置: '办公楼1层', 设施状态: '正常', 数量: 4, 安装日期: '2025-01-01', 有效期至: '2027-01-01', 上次检查: '2026-01-10', 下次检查: '2026-02-10', 负责人: '赵消防', 联系电话: '13800001234' },
  ],
  // 网格管理导入模板（检查记录/三违检查记录表，依据用户上传 Excel 列结构定制）
  grid: [
    {
      '片区/班组': '大柳镇',
      '上传时间': '2026-07-01 07:09:12',
      '检查人姓名': '李新国',
      '网格等级': '三级网格长',
      '所属岗位': '管理员',
      '违章人姓名': '贾吨林',
      '违章人性别': '男',
      '违章人年龄': 65,
      '车辆类型/保洁员': '',
      '上报状态': '已完成',
      '图片内容': '1782860835349.jpg',
      '"三违"行为': '未穿工作服',
      '三违类型.输出结果': '无',
      '需要整改': '否',
      '整改执行人': '无',
      '整改后的照片': '1782860658027.jpg',
      '示意图': '',
    },
  ],
  'over-age': [
    { 姓名: '张大爷', 身份证号: '371422196001011234', 部门: '运营一部', 岗位: '保洁员', 年龄: 66, 超龄年限: 6, 管控类型: '一般超龄', 审批状态: '已审批', 保险状态: '已参保' },
  ],
  cockpit: [
    { 指标名称: '事故发生率', 指标值: 0.05, 目标值: 0.1, 单位: '‰', 状态: '达标', 同比变化: '-15%' },
  ],
  bi: [
    { 报表名称: '安全趋势分析', 报表类型: '趋势图', 统计周期: '月度', 数据维度: '部门', 生成日期: '2026-01-15', 状态: '已生成' },
  ],
  'ai-analysis': [
    { 分析名称: '隐患预测分析', 分析类型: '预测模型', 数据源: '隐患数据库', 模型版本: 'v2.0', 分析日期: '2026-01-15', 准确率: '92%', 状态: '完成' },
  ],
  iot: [
    { 设备编号: 'IOT001', 设备名称: '温湿度传感器', 设备类型: '传感器', 安装位置: '转运站一号车间', 状态: '在线', 最后上报: '2026-01-15 10:30:00', 信号强度: '强' },
  ],
  'supply-chain': [
    { 供应商名称: '劳保用品批发公司', 供应类型: '劳保用品', 评估日期: '2026-01-10', 评估结果: '合格', 风险等级: '低', 联系人: '王经理', 联系电话: '13900139000' },
  ],
  reports: [
    { 报表名称: '月度安全报告', 报表类型: '定期报告', 统计周期: '2026年1月', 生成日期: '2026-02-01', 状态: '已生成', 负责人: '李四', 备注: '' },
  ],
};

/**
 * 构建模板下载载荷（GET /template/:module，format=csv|xlsx）
 * @returns {{kind:'stream', contentType, contentDisposition, body} | {kind:'error', code, message}}
 */
function buildImportTemplate(module, format) {
  const templateData = IMPORT_TEMPLATES[module] || [
    { 字段1: '', 字段2: '', 字段3: '', 字段4: '', 字段5: '' },
  ];
  const fmt = (format || 'xlsx').toLowerCase();

  if (fmt === 'csv') {
    const headers = Object.keys(templateData[0]).join(',') + '\n';
    const rows = templateData.map(row =>
      Object.values(row).map(v => {
        if (typeof v === 'string') return `"${v}"`;
        return v;
      }).join(',')
    ).join('\n');

    return {
      kind: 'stream',
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: `attachment; filename="${module}_template.csv"`,
      body: '\uFEFF' + headers + rows,
    };
  }
  const ws = XLSX.utils.json_to_sheet(templateData);
  const colWidths = Object.keys(templateData[0]).map(k => ({ wch: Math.max(k.length * 2, 12) }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 网格管理模板按需求特化文件名（任务三要求：网格管理导入模板_YYYYMMDD.xlsx）
  const tplDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tplFileName = module === 'grid' ? `网格管理导入模板_${tplDateStr}.xlsx` : `${module}_template.xlsx`;
  return {
    kind: 'stream',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentDisposition: `attachment; filename="${tplFileName}"`,
    body: buffer,
  };
}

module.exports = {
  // 常量
  PYTHON_PATH,
  PARSER_SCRIPT,
  EXTRACT_IMG_SCRIPT,
  EXTRACT_GRID_IMG_SCRIPT,
  // 配置
  NATIVE_IMPORT_MODULES,
  IMPORT_TEMPLATES,
  // 纯函数 / 工具
  normalizeConflictValue,
  buildConflictKey,
  parseAmountToNumber,
  parseFineAmount,
  parseDemeritPoints,
  parseViolationTime,
  normalizeCheckSource,
  callPython,
  fixDateValue,
  SAFE_TEXT_RE,
  looksLikeMojibake,
  cleanModel,
  repairMojibakeFileName,
  buildFrontendPreview,
  parseExcelNative,
  attachViolationImages,
  attachGridImages,
  buildImportTemplate,
};