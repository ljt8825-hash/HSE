/**
 * 培训台账 OCR 路由 —— PDF / 图片识别 → Excel / 入库
 *
 * 端点：
 *   POST /recognize     multipart file → 本地 Tesseract 识别为结构化行（预览）
 *   POST /export        body {rows,columns} → 生成 Excel 下载
 *   POST /confirm       body {rows}        → 写入 training_records
 *
 * 三个端点均 requireRole('admin','safety_manager')。
 * 识别脚本：scripts/ocr_ledger.py（Python 3 + pytesseract + PyMuPDF + Pillow）。
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const { hashSensitive } = require('../utils/encryption');
const { resolveTrainingPersonId, resolveTrainingPersonName } = require('./training');
const { SigninAttribution } = require('../services/signinAttribution');

const router = express.Router();

// ---------- Python 解释器解析 ----------
function resolvePythonPath() {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  // 回退：读取 server/.env 中的 PYTHON_PATH
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    const m = envFile.match(/^PYTHON_PATH\s*=\s*(.+)$/m);
    if (m) {
      const p = m[1].trim().replace(/^["']|["']$/g, '');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* 忽略 */ }
  return 'python';
}

const OCR_SCRIPT = path.join(__dirname, '../../scripts/ocr_ledger.py');
const SIGNIN_OCR_SCRIPT = path.join(__dirname, '../../scripts/training_signin_ocr.py');

// 花名册匹配/归属服务（懒加载单例，加载全量在册员工）
let _attribution = null;
async function getAttribution() {
  if (!_attribution) {
    _attribution = new SigninAttribution(pool);
    await _attribution.load();
  }
  return _attribution;
}

// ---------- 上传（PDF / 图片） ----------
const _tmpDir = path.join(os.tmpdir(), 'hse-training-ocr');
if (!fs.existsSync(_tmpDir)) fs.mkdirSync(_tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, _tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.img';
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

function isSupported(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(ext);
}

function runOcr(filePath, scriptPath = OCR_SCRIPT, extraEnv = {}) {
  const py = resolvePythonPath();
  return new Promise((resolve, reject) => {
    const child = spawn(py, [scriptPath, filePath], {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    // 子进程总超时保护：脚本内部有 OCR_SCAN_BUDGET(默认1800s) 兜底，这里再加一层保险，
    // 防止极端情况下 tesseract 挂起导致后端进程泄漏。前端请求超时(40min)需大于此值。
    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS) || 45 * 60 * 1000;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { /* 忽略 */ }
      reject(new Error(`OCR 识别超时（超过 ${Math.round(timeoutMs / 60000)} 分钟），请重试或改用 Excel 模板`));
    }, timeoutMs);
    const clearTimer = () => clearTimeout(timer);
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', (err) => { clearTimer(); reject(err); });
    child.on('close', (code) => {
      clearTimer();
      if (code !== 0) {
        return reject(new Error(`OCR 脚本失败(code=${code}): ${stderr.trim()}`));
      }
      // 兼容 stdout 前带 Python 第三方库打印的警告/日志，提取其中 JSON 对象
      const s = stdout;
      const start = s.indexOf('{');
      const end = s.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        return reject(new Error(`OCR 输出解析失败: ${s.slice(0, 500)}`));
      }
      try {
        const data = JSON.parse(s.slice(start, end + 1));
        resolve(data);
      } catch (e) {
        reject(new Error(`OCR 输出解析失败: ${s.slice(0, 500)}`));
      }
    });
  });
}

// ---------- Excel 列展示映射 ----------
const FIELD_LABELS = {
  name: '姓名',
  id_card: '身份证号',
  dept: '部门',
  position: '岗位',
  grid_level: '网格级别',
  frequency: '培训频次',
  training_type: '培训类型',
  training_date: '培训日期',
  duration_minutes: '时长(分钟)',
  content: '培训内容',
  result: '培训结果',
  score: '成绩',
  trainer: '培训人',
  remark: '备注',
};

// ---------- 1. 识别 ----------
router.post('/recognize', requireRole('admin', 'safety_manager'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    const tmp = req.file ? path.join(_tmpDir, req.file.filename) : null;
    try {
      if (err) return res.json(error(-1, `文件上传失败: ${err.message}`));
      if (!req.file) return res.json(error(-2, '未接收到文件'));
      const originalName = (req.file.originalname || '').replace(/\.(pdf|png|jpe?g|bmp|webp)$/i, '');
      if (!isSupported(tmp)) return res.json(error(-3, '仅支持 PDF / PNG / JPG / BMP / WebP 文件'));

      // 先探测：是否为「培训会议签到表」扫描合集（前 2 页快速判定）
      let probe = null;
      try {
        probe = await runOcr(tmp, SIGNIN_OCR_SCRIPT, { SIGNIN_PROBE: '1' });
      } catch (e) { probe = null; }

      if (probe && probe.ok && probe.mode === 'signin_probe' && probe.isSignin) {
        // 签到表合集：全量识别 → 花名册匹配/归属/计数
        const result = await runOcr(tmp, SIGNIN_OCR_SCRIPT);
        if (!result || result.ok !== true) {
          return res.json(error(-4, (result && result.message) || '识别失败'));
        }
        const attr = await getAttribution();
        const sessions = (result.sessions || [])
          .filter((s) => s.kind === 'team' || s.kind === 'company')
          .map((s) => {
            const built = attr.buildSession(s);
            built.trainingDate = normalizeDate(built.trainingDateText);
            if (built.kind === 'company') {
              // 公司级表无印刷应到名单（序号|签名|备注）：应到按实签计、缺少恒 0，
              // 不纳入乡镇/班组统计、不做人员比对（签名者非"新入职"语义），仅保留头部完整性检查
              built.expectedCount = built.actualCount;
              built.missingCount = 0;
              built.untrainedCount = 0;
              built.groups = { onPostUntrained: [], resignedUntrained: [], unknownUntrained: [], newcomers: [] };
              built.people = [];
            }
            return built;
          });
        const m = result.meta || {};
        return res.json(success({
          mode: 'signin_ledger',
          sessions,
          message: `识别到 ${sessions.length} 场培训（跳过照片/非表格页 ${m.photoPages || 0} 页`
            + `${m.unknownPages ? `，未识别 ${m.unknownPages} 页` : ''}）`,
          sourceName: originalName,
          meta: m,
        }, '识别成功，请核对场次预览'));
      }

      // 普通培训台账：走通用 OCR 脚本
      const result = await runOcr(tmp);
      if (!result || result.ok !== true) {
        return res.json(error(-4, (result && result.message) || '识别失败'));
      }
      return res.json(success({
        sourceType: result.sourceType,
        mode: result.mode || 'record',
        columns: result.columns || [],
        rows: result.rows || [],
        signin: result.signin || null,
        message: result.message || `识别到 ${(result.rows || []).length} 行`,
        sourceName: originalName,
        meta: result.meta || null,
      }, '识别成功，请核对预览'));
    } catch (e) {
      return res.json(error(-1, `OCR 识别失败: ${e.message}`));
    } finally {
      if (tmp && fs.existsSync(tmp)) {
        try { fs.unlinkSync(tmp); } catch (e) { /* 忽略 */ }
      }
    }
  });
});

// ---------- 2. 导出 Excel（GET，rows/columns 以 JSON 字符串经 query 传入） ----------
function parseJsonParam(raw) {
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
  } catch (e) {
    return undefined;
  }
}

router.get('/export', requireRole('admin', 'safety_manager'), (req, res) => {
  try {
    let rows = parseJsonParam(req.query.rows) || [];
    const columns = parseJsonParam(req.query.columns) || [];
    const sourceName = req.query.sourceName || '';
    const fileName = req.query.fileName || '';
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json(error(-2, '没有可导出的数据'));
    }

    // 表头：优先用 columns（中文标签），否则用字段映射
    const colDefs = [];
    if (Array.isArray(columns) && columns.length > 0) {
      for (const c of columns) colDefs.push({ label: String(c), field: null });
    }
    // 若 columns 为空，从行数据的键推断
    if (colDefs.length === 0) {
      const keys = Object.keys(rows[0] || {});
      for (const k of keys) colDefs.push({ label: FIELD_LABELS[k] || k, field: k });
    } else {
      // 用 columns 时,尝试把已知字段标签映射回对应行键
      const labelToField = {};
      for (const k of Object.keys(FIELD_LABELS)) labelToField[FIELD_LABELS[k]] = k;
      for (const cd of colDefs) {
        if (labelToField[cd.label]) cd.field = labelToField[cd.label];
      }
    }

    const sheetData = [colDefs.map((c) => c.label)];
    for (const row of rows) {
      const line = colDefs.map((c) => {
        const v = c.field ? row[c.field] : undefined;
        if (v !== undefined && v !== null) return String(v);
        // columns 无字段映射时，按原顺序取行值（row 为对象）
        return '';
      });
      sheetData.push(line);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = colDefs.map((c) => ({ wch: Math.max(10, String(c.label).length * 2 + 6) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '培训台账');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const base = (fileName || sourceName || '培训台账OCR');
    const safe = base.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '培训台账OCR';
    const finalName = `${safe}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`);
    return res.send(buf);
  } catch (e) {
    return res.json(error(-1, `导出失败: ${e.message}`));
  }
});

// 清洗 PDF 字体缺映射产生的替换字符（U+FFFD / 方块 / 菱形）
function cleanNoise(v) {
  if (v == null) return v;
  return String(v).replace(/[\ufffd\u25a0\u25a1\u25c6\u25cf\ufffc]/g, '').trim();
}

// 归一化日期：2025.11.18 / 2025-11-18 / 25.11.18 / 025.11.18 → YYYY-MM-DD；无法解析返回空串
function normalizeDate(v) {
  const raw = cleanNoise(v);
  if (!raw) return '';
  const m = raw.match(/(?:^|[^\d])(\d{2,4})[^\d](\d{1,2})[^\d](\d{1,2})(?:[^\d]|$)/);
  if (!m) return '';
  let y = m[1];
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y.length === 2) y = '20' + y;
  else if (y.length === 3 && y.startsWith('0')) y = '20' + y.slice(1);
  if (y.length !== 4 || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return '';
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ---------- 3. 确认入库 ----------
router.post('/confirm', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.json(error(-2, '没有可入库的数据'));
    if (!isConnected()) {
      return res.json(error(-3, '当前为内存模式，不支持入库'));
    }

    let inserted = 0;
    for (const r of rows) {
      const idCard = cleanNoise(r.id_card || r.idCard || '') || null;
      const employeeId = r.employee_id || r.employeeId || null;
      // 阶段5：复用 training 路由同口径落键（显式 ID > 身份证 hash > 姓名唯一匹配）
      let resolvedEmployeeId = await resolveTrainingPersonId(
        cleanNoise(r.name || ''), idCard, employeeId || r.personnel_id || null,
      );
      // 落键成功则以员工主数据为准同步标准姓名，避免 OCR/自由文本错名
      const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;

      const trainingDate = normalizeDate(r.training_date || r.trainingDate || '') || null;
      const duration = (r.duration_minutes !== undefined && r.duration_minutes !== null)
        ? Number(r.duration_minutes) : (Number(r.durationMinutes || 0) || 0);
      const score = (r.score !== undefined && r.score !== null)
        ? (Number(r.score) || null) : (r.scoreNum !== undefined ? Number(r.scoreNum) || null : null);

      await pool.query(`
        INSERT INTO training_records
          (personnel_id, name, id_card, dept, position, grid_level, frequency,
           training_type, training_date, duration_minutes, content, result, score,
           trainer, remark, employee_id, trainer_id, training_plan_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          resolvedEmployeeId != null ? resolvedEmployeeId : (r.personnel_id || null),
          standardName || cleanNoise(r.name || '') || '',
          idCard || '',
          cleanNoise(r.dept || r.dept_name || '') || '',
          cleanNoise(r.position || r.position_name || '') || '',
          cleanNoise(r.grid_level || '') || '',
          cleanNoise(r.frequency || '') || '',
          cleanNoise(r.training_type || 'HSE') || 'HSE',
          trainingDate,
          Number.isFinite(duration) ? duration : 0,
          cleanNoise(r.content || '') || '',
          cleanNoise(r.result || '合格') || '合格',
          score,
          cleanNoise(r.trainer || '') || '',
          cleanNoise(r.remark || '') || '',
          resolvedEmployeeId,
          r.trainer_id || null,
          r.training_plan_id || null,
        ],
      );
      inserted += 1;
    }

    return res.json(success({ inserted }, `成功入库 ${inserted} 条`));
  } catch (e) {
    return res.json(error(-1, `入库失败: ${e.message}`));
  }
});

// ==================== 签到表场次台账（扫描件 OCR） ====================

// ---------- 4. 签到场次入库 ----------
// body: { sourceName, sessions: [识别预览场次（可含用户校正 trainingDate/deptName）] }
router.post('/confirm-signin', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const sourceName = cleanNoise((req.body && req.body.sourceName) || '') || '签到表导入';
    const sessions = Array.isArray(req.body && req.body.sessions) ? req.body.sessions : [];
    if (sessions.length === 0) return res.json(error(-2, '没有可入库的场次'));
    if (!isConnected()) return res.json(error(-3, '当前为内存模式，不支持入库'));

    let insertedSessions = 0;
    let insertedRecords = 0;
    for (const s of sessions) {
      if (s.kind !== 'team' && s.kind !== 'company') continue;
      // 用户可在校正预览中修改日期/部门
      const trainingDate = normalizeDate(s.trainingDate || s.trainingDateText || '') || null;
      const deptName = cleanNoise(s.deptName || '') || null;
      const detail = {
        groups: s.groups || {},
        people: s.people || [],
        missingFields: s.missingFields || [],
        contentText: s.contentText || '',
      };
      const r = await pool.query(`
        INSERT INTO training_signin_sessions
          (source_name, page_no, kind, dept_name, team_unit_id, team_unit_name, center_name,
           training_date, expected_count, actual_count, missing_count, untrained_count,
           resigned_count, newcomer_count, tags, content, detail, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id`,
        [
          sourceName,
          Number(s.page) || null,
          s.kind,
          deptName,
          s.teamUnitId || null,
          cleanNoise(s.teamUnitName || '') || null,
          cleanNoise(s.centerName || '') || null,
          trainingDate,
          Number(s.expectedCount) || 0,
          Number(s.actualCount) || 0,
          Number(s.missingCount) || 0,
          Number(s.untrainedCount) || 0,
          (s.groups && s.groups.resignedUntrained ? s.groups.resignedUntrained.length : 0),
          (s.groups && s.groups.newcomers ? s.groups.newcomers.length : 0),
          Array.isArray(s.tags) ? s.tags : [],
          cleanNoise(s.contentText || '') || null,
          JSON.stringify(detail),
          (req.user && req.user.id) || null,
        ],
      );
      const sessionId = r.rows[0].id;
      insertedSessions += 1;

      // 逐人落痕：仅在册人员（花名册匹配命中）。已签=completed，未签=未培训
      const people = Array.isArray(s.people) ? s.people : [];
      for (const p of people) {
        if (!p.match || !p.match.employeeId) continue;
        // 同人重复印刷行（本人已在其他行签名）：不落痕，由其签名行记 completed
        if (p.status === 'signed_dup') continue;
        const signed = !!p.signed;
        await pool.query(`
          INSERT INTO training_records
            (training_title, training_type, training_date, dept_name, position,
             employee_id, name, has_checkin, result, remark, source_session_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            `HSE培训签到（${deptName || '公司级'} ${trainingDate || ''}）`.trim(),
            'HSE',
            trainingDate,
            p.match.teamName || deptName || '',
            p.match.positionName || '',
            p.match.employeeId,
            p.match.name,
            signed,
            signed ? '合格' : '未培训',
            signed
              ? `签到表导入-已签到（${sourceName} 第${s.page}页）`
              : `签到表导入-未签到（${sourceName} 第${s.page}页，在岗未培训）`,
            sessionId,
          ],
        );
        insertedRecords += 1;
      }
    }

    return res.json(success(
      { insertedSessions, insertedRecords },
      `成功入库 ${insertedSessions} 场培训、${insertedRecords} 条人员记录`,
    ));
  } catch (e) {
    return res.json(error(-1, `入库失败: ${e.message}`));
  }
});

// ---------- 5. 场次台账列表 ----------
router.get('/signin-sessions', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ list: [], total: 0 }));
    const where = ['is_deleted = false'];
    const params = [];
    const { kind, dept, dateFrom, dateTo, tag } = req.query;
    if (kind && (kind === 'team' || kind === 'company')) {
      params.push(kind); where.push(`kind = $${params.length}`);
    }
    if (dept) {
      params.push(`%${String(dept)}%`); where.push(`dept_name LIKE $${params.length}`);
    }
    if (dateFrom) { params.push(dateFrom); where.push(`training_date >= $${params.length}`); }
    if (dateTo) { params.push(dateTo); where.push(`training_date <= $${params.length}`); }
    if (tag) { params.push(String(tag)); where.push(`$${params.length} = ANY(tags)`); }

    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM training_signin_sessions WHERE ${where.join(' AND ')}`,
      params,
    );
    const r = await pool.query(`
      SELECT id, source_name, page_no, kind, dept_name, team_unit_name, center_name,
             training_date, expected_count, actual_count, missing_count, untrained_count,
             resigned_count, newcomer_count, tags, created_at
      FROM training_signin_sessions
      WHERE ${where.join(' AND ')}
      ORDER BY training_date DESC NULLS LAST, id DESC
      LIMIT 500`,
      params,
    );
    return res.json(success({ list: r.rows, total: cnt.rows[0].n }));
  } catch (e) {
    return res.json(error(-1, `查询失败: ${e.message}`));
  }
});

// ---------- 7. 导出场次台账（汇总 sheet + 未培训人员明细 sheet） ----------
// 注意：必须定义在 /signin-sessions/:id 之前，否则 export-signin 会被 :id 抢先匹配
router.get('/export-signin', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-3, '当前为内存模式'));
    const r = await pool.query(`
      SELECT * FROM training_signin_sessions
      WHERE is_deleted = false
      ORDER BY training_date DESC NULLS LAST, id DESC`);
    const sessions = r.rows;
    if (sessions.length === 0) return res.json(error(-2, '没有可导出的场次'));

    // Sheet1：场次汇总（一场一行）
    const sumHead = ['部门/班组', '类型', '培训日期', '应到', '实到', '缺少',
      '在岗未培训', '离职未培训', '新入职冲抵', '标签', '来源', '页码'];
    const sumRows = [sumHead];
    // Sheet2：未培训人员逐人展开（带在岗/离职状态）
    const detHead = ['部门/班组', '培训日期', '姓名', '状态', '作业中心', '岗位', '来源页码'];
    const detRows = [detHead];

    for (const s of sessions) {
      sumRows.push([
        s.dept_name || '',
        s.kind === 'company' ? '公司级' : '班组级',
        s.training_date ? String(s.training_date).slice(0, 10) : '',
        s.expected_count, s.actual_count, s.missing_count,
        s.untrained_count, s.resigned_count, s.newcomer_count,
        (s.tags || []).join('、'),
        s.source_name || '',
        s.page_no || '',
      ]);
      const detail = s.detail || {};
      const groups = detail.groups || {};
      const dateStr = s.training_date ? String(s.training_date).slice(0, 10) : '';
      for (const p of groups.onPostUntrained || []) {
        detRows.push([
          s.dept_name || '', dateStr, p.name || '', '在岗',
          p.centerName || s.center_name || '', p.positionName || '', s.page_no || '',
        ]);
      }
      for (const p of groups.resignedUntrained || []) {
        detRows.push([
          s.dept_name || '', dateStr, p.name || '', '离职',
          s.center_name || '', '', s.page_no || '',
        ]);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sumRows);
    ws1['!cols'] = sumHead.map((h) => ({ wch: Math.max(10, h.length * 2 + 6) }));
    XLSX.utils.book_append_sheet(wb, ws1, '培训场次汇总');
    const ws2 = XLSX.utils.aoa_to_sheet(detRows);
    ws2['!cols'] = detHead.map((h) => ({ wch: Math.max(10, h.length * 2 + 6) }));
    XLSX.utils.book_append_sheet(wb, ws2, '未培训人员明细');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const finalName = `培训签到台账_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`);
    return res.send(buf);
  } catch (e) {
    return res.json(error(-1, `导出失败: ${e.message}`));
  }
});

// ---------- 6. 场次明细（未培训人员悬浮；放在静态路径 export-signin 之后） ----------
router.get('/signin-sessions/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-3, '当前为内存模式'));
    const r = await pool.query(
      'SELECT * FROM training_signin_sessions WHERE id = $1 AND is_deleted = false',
      [Number(req.params.id)],
    );
    if (r.rows.length === 0) return res.json(error(-4, '场次不存在'));
    const row = r.rows[0];
    return res.json(success(row));
  } catch (e) {
    return res.json(error(-1, `查询失败: ${e.message}`));
  }
});

module.exports = router;