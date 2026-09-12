/**
 * 台账 controller 工厂（转运站管理 / 车辆三检共用）
 *
 * 为“补充缺失业务模块”提供同构的 CRUD + Excel 模板/导入(两段式预览)/导出。
 * 设计要点：
 *  - 完全独立：不依赖通用导入网关 server/routes/import.js，不改既有的 site-mgmt.js 等模块。
 *  - 防注入：所有列名/表名来自配置白名单（非用户输入），数值用 $n 占位符绑定。
 *  - 软删：沿用 is_deleted + created_at/updated_at 项目约定。
 *  - 导入为两段式：importPreview 上传解析并存内存 job → importConfirm 按 jobId 落库。
 *
 * 用法：const { createCheckLedgerController } = require('./checkLedgerFactory');
 *       module.exports = createCheckLedgerController({ table, searchCols, filterMap, orderBy, createCols, exportColumns });
 */
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const ExcelUtils = require('../utils/excel');
const { auditLog } = require('../routes/audit');

/** 内存 job 缓存：{ [moduleKey]: Map<jobId, {columns, rows}> } */
const jobsByModule = new Map();

function randStr(len = 8) {
  const chars = 'abcdef0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function createCheckLedgerController(cfg) {
  const { table, moduleKey, searchCols, filterMap = {}, orderBy = 'id DESC' } = cfg;
  // createCols 语义：{ camel: snake }；列名一律用 snake（value），取值兼容 camel 的入参
  const createEntries = Object.entries(cfg.createCols);
  const exportColumns = cfg.exportColumns; // [{header,key,type,width}]
  const aliasMap = cfg.aliasMap;
  const fieldsConfig = cfg.fieldsConfig;

  if (!jobsByModule.has(moduleKey)) jobsByModule.set(moduleKey, new Map());
  const jobs = jobsByModule.get(moduleKey);

  /** GET / 列表（服务端分页 + 关键字 + 精确过滤） */
  async function list(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;

      const conditions = [];
      const params = [];
      let pIdx = 1;

      const keyword = (req.query.keyword || '').trim();
      if (keyword && searchCols.length) {
        const cols = searchCols.map((c) => `${c} ILIKE $${pIdx}`);
        params.push(`%${keyword}%`);
        conditions.push(`(${cols.join(' OR ')})`);
        pIdx++;
      }
      for (const [queryKey, col] of Object.entries(filterMap)) {
        const v = req.query[queryKey];
        if (v !== undefined && v !== '' && v !== null) {
          params.push(v);
          conditions.push(`${col} = $${pIdx}`);
          pIdx++;
        }
      }

      conditions.push('is_deleted = false');
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countSql = `SELECT COUNT(*)::int AS total FROM ${table} ${whereClause}`;
      const cnt = await pool.query(countSql, params);
      const total = cnt.rows[0].total;

      params.push(pageSize, offset);
      const dataSql = `SELECT * FROM ${table} ${whereClause} ORDER BY ${orderBy} LIMIT $${pIdx} OFFSET $${pIdx + 1}`;
      const res2 = await pool.query(dataSql, params);

      res.json(success({ list: res2.rows, total, page, pageSize }, '查询成功'));
    } catch (e) {
      next(e);
    }
  }

  /** GET /:id 详情 */
  async function detail(req, res, next) {
    try {
      const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND is_deleted = false`, [req.params.id]);
      if (r.rows.length === 0) return res.json(error(-2, '记录不存在'));
      res.json(success(r.rows[0], '查询成功'));
    } catch (e) {
      next(e);
    }
  }

  /** POST / 新增 */
  async function create(req, res, next) {
    try {
      const b = req.body || {};
      const cols = [];
      const params = [];
      createEntries.forEach(([camel, snake]) => {
        if (b[camel] === undefined && b[snake] === undefined) return;
        const v = b[camel] !== undefined ? b[camel] : b[snake];
        cols.push(snake);
        params.push(v === undefined ? null : v);
      });
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colsSql = cols.join(', ');
      const r = await pool.query(
        `INSERT INTO ${table} (${colsSql}) VALUES (${placeholders}) RETURNING *`,
        params,
      );
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'create',
        module: moduleKey,
        description: `新增${cfg.displayName} #${r.rows[0].id}（${describeNew(b)}）`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success(r.rows[0], '新增成功'));
    } catch (e) {
      next(e);
    }
  }

  /** PUT /:id 更新（仅白名单字段） */
  async function update(req, res, next) {
    try {
      const b = req.body || {};
      const sets = [];
      const params = [];
      let pIdx = 1;
      createEntries.forEach(([camel, snake]) => {
        if (b[camel] !== undefined || b[snake] !== undefined) {
          const v = b[camel] !== undefined ? b[camel] : b[snake];
          sets.push(`${snake} = $${pIdx}`);
          params.push(v === undefined ? null : v);
          pIdx++;
        }
      });
      if (sets.length === 0) return res.json(error(-4, '没有需要更新的字段'));
      params.push(req.params.id);
      const r = await pool.query(
        `UPDATE ${table} SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${pIdx} AND is_deleted = false RETURNING *`,
        params,
      );
      if (r.rows.length === 0) return res.json(error(-2, '记录不存在'));
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'update',
        module: moduleKey,
        description: `更新${cfg.displayName} #${req.params.id}`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success(r.rows[0], '更新成功'));
    } catch (e) {
      next(e);
    }
  }

  /** DELETE /:id 软删 */
  async function remove(req, res, next) {
    try {
      const r = await pool.query(
        `UPDATE ${table} SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_deleted = false RETURNING id`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.json(error(-2, '记录不存在'));
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'delete',
        module: moduleKey,
        description: `删除${cfg.displayName} #${req.params.id}`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success(null, '删除成功'));
    } catch (e) {
      next(e);
    }
  }

  /** DELETE /batch 批量软删（body: {ids: []}） */
  async function batchRemove(req, res, next) {
    try {
      const ids = (req.body?.ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) return res.json(error(-1, '未选择要删除的记录'));
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `UPDATE ${table} SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
        ids,
      );
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'delete',
        module: moduleKey,
        description: `批量删除${cfg.displayName} ${ids.length} 条`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success({ deleted: ids.length }, '删除成功'));
    } catch (e) {
      next(e);
    }
  }

  /** POST /continue 延续上月生成空页面（幂等，≥ continueBoundary 生效）
   *  诉求：该模块为“月度台账 + check_date 月份下拉”模型（对齐安全文化建设/三违分析）。
   *  切到尚无台账的目标月时，把“上一个月”的站点身份（站编号/名称/片区）复制成目标月空页，
   *  考核数值走 DB DEFAULT(=0)，由人工在系统里录入/修改，无需靠 Excel 导入。
   * */
  async function continueMonth(req, res, next) {
    try {
      const month = String((req.body || {}).month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month) || +month.slice(5, 7) < 1 || +month.slice(5, 7) > 12) {
        return res.json(error(-1, '月份格式需为 YYYY-MM 且月为 1-12'));
      }
      // 历史月份保留 Excel 导入/手工模式，不做自动延续
      if (cfg.continueBoundary && month < cfg.continueBoundary) {
        return res.json(success({ month, sourceMonth: null, generated: false, existing: 0, inserted: 0 }, '该月不启用自动延续'));
      }
      // 幂等：目标月已有非删除行 → 不重复生成
      const exist = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ${table} WHERE check_date = $1 AND is_deleted = false`,
        [month],
      );
      const existing = exist.rows[0].c;
      if (existing > 0) {
        return res.json(success({ month, sourceMonth: null, generated: false, existing, inserted: 0 }, '本月已有台账，无需生成'));
      }
      // 找最近有台账的源月（< target 的最大月）
      const src = await pool.query(
        `SELECT MAX(check_date) AS m FROM ${table}
          WHERE check_date < $1 AND check_date ~ '^[0-9]{4}-[0-9]{2}$' AND is_deleted = false`,
        [month],
      );
      const sourceMonth = src.rows[0]?.m ?? null;
      if (!sourceMonth) {
        return res.json(success({ month, sourceMonth: null, generated: false, existing: 0, inserted: 0 }, '无可延续的上月数据'));
      }
      // 复制源月站点身份（按站编号去重）到目标月空页；考核数值列缺失走 DB DEFAULT(=0)
      const ins = await pool.query(
        `INSERT INTO ${table} (station_code, station_name, area_team, check_date)
         SELECT station_code, station_name, area_team, $1
           FROM ${table}
          WHERE check_date = $2 AND is_deleted = false
            AND station_code IS NOT NULL AND TRIM(station_code) <> ''
          GROUP BY station_code, station_name, area_team`,
        [month, sourceMonth],
      );
      const inserted = ins.rowCount ?? 0;
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'create',
        module: moduleKey,
        description: `延续上月生成${cfg.displayName} ${month} 空页 ${inserted} 条`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success({ month, sourceMonth, generated: inserted > 0, existing: 0, inserted }, '已按上月站点生成空页'));
    } catch (e) {
      next(e);
    }
  }

  /** GET /template 下载导入模板（仅表头） */
  async function templateRoute(req, res, next) {
    try {
      const workbook = ExcelUtils.generateExcel([], exportColumns, cfg.exportSheet);
      const buffer = ExcelUtils.toBuffer(workbook);
      const filename = `${cfg.exportSheet}导入模板.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  /** POST /import-preview 上传解析（两段式第一步，生成 job） */
  async function importPreview(req, res, next) {
    try {
      if (!req.file) return res.json(error(-1, '请上传Excel文件'));
      const filePath = req.file.path;
      try {
        const { headers, rows } = ExcelUtils.readFile(filePath);
        if (rows.length === 0) return res.json(error(-2, 'Excel无有效数据'));
        const mapping = ExcelUtils.mapHeaders(headers, aliasMap);
        const cleaned = [];
        let invalid = 0;
        rows.forEach((row, i) => {
          const r = ExcelUtils.cleanRow(row, mapping, fieldsConfig);
          if (!r.valid) {
            invalid++;
            cleaned.push({ rowIndex: i + 2, data: row, errors: [r.error], valid: false });
          } else {
            cleaned.push({ rowIndex: i + 2, data: r.data, errors: [], valid: true });
          }
        });
        const jobId = `${moduleKey}-${Date.now()}-${randStr()}`;
        jobs.set(jobId, { columns: exportColumns, rows: cleaned });
        res.json(success({
          jobId,
          totalRows: rows.length,
          validRows: rows.length - invalid,
          invalidRows: invalid,
          columns: exportColumns.map((c) => ({ title: c.header, field: c.key })),
          preview: cleaned.map((p) => ({ rowIndex: p.rowIndex, data: p.data, errors: p.errors })),
        }, '解析完成'));
      } finally {
        const { deleteFile } = require('../middleware/upload');
        await deleteFile(filePath).catch(() => {});
      }
    } catch (e) {
      next(e);
    }
  }

  /** POST /import-confirm 确认入库（两段式第二步） */
  async function importConfirm(req, res, next) {
    try {
      const { jobId } = req.body || {};
      if (!jobId || !jobs.has(jobId)) return res.json(error(-1, '导入会话不存在或已过期，请重新上传'));
      const job = jobs.get(jobId);
      const validRows = job.rows.filter((r) => r.valid);

      // 只对任一有效行实际存在的 snake 字段建列，缺失字段走 DB DEFAULT（如 NOT NULL DEFAULT 0）
      const cols = createEntries
        .map(([, snake]) => snake)
        .filter((snake) => validRows.some((r) => r.data && snake in r.data));
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colsSql = cols.join(', ');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of validRows) {
          const params = cols.map((snake) => (r.data[snake] === undefined ? null : r.data[snake]));
          await client.query(`INSERT INTO ${table} (${colsSql}) VALUES (${placeholders})`, params);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      jobs.delete(jobId);
      await auditLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'import',
        module: moduleKey,
        description: `导入${cfg.displayName} ${validRows.length}/${job.rows.length} 条`,
        ip: req.ip,
      }).catch(() => {});
      res.json(success({ inserted: validRows.length, skipped: job.rows.length - validRows.length, outcome: validRows.length > 0 ? 'imported' : 'failed' }, '导入完成'));
    } catch (e) {
      next(e);
    }
  }

  /** GET /export 导出全部（过滤同列表） */
  async function exportExcel(req, res, next) {
    try {
      const conditions = [];
      const params = [];
      let pIdx = 1;
      const keyword = (req.query.keyword || '').trim();
      if (keyword && searchCols.length) {
        const cols = searchCols.map((c) => `${c} ILIKE $${pIdx}`);
        params.push(`%${keyword}%`);
        conditions.push(`(${cols.join(' OR ')})`);
        pIdx++;
      }
      for (const [queryKey, col] of Object.entries(filterMap)) {
        const v = req.query[queryKey];
        if (v !== undefined && v !== '' && v !== null) {
          params.push(v);
          conditions.push(`${col} = $${pIdx}`);
          pIdx++;
        }
      }
      conditions.push('is_deleted = false');
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const r = await pool.query(`SELECT * FROM ${table} ${whereClause} ORDER BY ${orderBy}`, params);
      const workbook = ExcelUtils.generateExcel(r.rows, exportColumns, cfg.exportSheet);
      const buffer = ExcelUtils.toBuffer(workbook);
      const filename = `${cfg.exportSheet}_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  function describeNew(b) {
    const key = cfg.displayKey;
    if (key && b[key]) return String(b[key]);
    return '';
  }

  return {
    list,
    detail,
    create,
    update,
    remove,
    batchRemove,
    templateRoute,
    importPreview,
    importConfirm,
    exportExcel,
    continueMonth,
  };
}

module.exports = { createCheckLedgerController };