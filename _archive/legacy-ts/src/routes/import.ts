/**
 * HSE 智能导入 API 路由 — 类型安全版
 * 文件: src/routes/import.ts
 * 接口:
 *   POST /api/import/parse     — 解析文件（调 Python 引擎）
 *   POST /api/import/confirm   — 确认入库
 *   POST /api/import/rollback  — 回滚
 *   GET  /api/import/logs      — 查询导入日志
 *   GET  /api/import/config    — 查询字段映射配置
 *   GET  /api/import/stats     — 导入统计
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { pool } from '../config/db';
import { success, error } from '../middleware/response';
import { uploadExcel } from '../middleware/upload';
import type { ParseResult, ConfirmResult, RollbackResult } from '../types';

const router = Router();

// Python 解释器路径
const PYTHON_PATH = process.env.PYTHON_PATH || 'C:/Users/honey/.workbuddy/binaries/python/versions/3.13.12/python.exe';
// 解析脚本路径（统一用正斜杠，避免 Windows 路径混合问题）
const PARSER_SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'import_parser.py').replace(/\\/g, '/');

// ============================================================
// POST /api/import/upload — 上传 Excel 文件（顶栏入口）
// 接收 multipart/form-data，保存后返回 filePath + fileName
// ============================================================
router.post('/upload', uploadExcel.single('file'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.json(error(-1, '请选择要上传的文件'));
      return;
    }

    // 统一路径为正斜杠（Python 引擎要求）
    const filePath = req.file.path.replace(/\\/g, '/');
    const fileName = req.file.originalname;

    res.json(success({
      filePath,
      fileName,
      fileSize: req.file.size,
      savedAs: req.file.filename,
    }, `文件上传成功: ${fileName}`));
  } catch (err: any) {
    console.error('[Import] upload error:', err.message);
    res.json(error(-1, '文件上传失败: ' + err.message));
  }
});

// ============================================================
// POST /api/import/parse — 解析文件
// ============================================================
router.post('/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileRecordId, filePath, fileName } = req.body;

    if (!filePath || !fileName) {
      res.json(error(-1, '缺少必要参数: filePath, fileName'));
      return;
    }

    const args: string[] = [
      PARSER_SCRIPT,
      '--action=parse',
      `--file-path=${filePath}`,
      `--file-name=${fileName}`,
    ];

    if (fileRecordId) {
      args.push(`--file-record-id=${fileRecordId}`);
    }

    const result: ParseResult = await callPython(args);

    if (result.success) {
      res.json(success(result, `解析成功: 模块=${result.module_name}, 表=${result.target_table}, 共${result.total_rows}行`));
    } else {
      res.json(error(-2, result.error || '解析失败', result));
    }
  } catch (err: any) {
    console.error('[Import] parse error:', err.message);
    res.json(error(-3, '解析异常: ' + err.message));
  }
});

// ============================================================
// POST /api/import/confirm — 确认入库
// ============================================================
router.post('/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileRecordId, operator } = req.body;

    if (!fileRecordId) {
      res.json(error(-1, '缺少必要参数: fileRecordId'));
      return;
    }

    const jobId = crypto.randomUUID();

    const args: string[] = [
      PARSER_SCRIPT,
      '--action=confirm',
      `--job-id=${jobId}`,
      `--file-record-id=${fileRecordId}`,
      `--operator=${operator || 'web-user'}`,
    ];

    const result: ConfirmResult = await callPython(args);

    if (result.success) {
      res.json(success(result, `入库成功: 新增${result.inserted}, 更新${result.updated}, 跳过${result.skipped}`));
    } else {
      res.json(error(-2, result.error || '入库失败', result));
    }
  } catch (err: any) {
    console.error('[Import] confirm error:', err.message);
    res.json(error(-3, '入库异常: ' + err.message));
  }
});

// ============================================================
// POST /api/import/rollback — 回滚
// ============================================================
router.post('/rollback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      res.json(error(-1, '缺少必要参数: jobId'));
      return;
    }

    const args: string[] = [
      PARSER_SCRIPT,
      '--action=rollback',
      `--job-id=${jobId}`,
    ];

    const result: RollbackResult = await callPython(args);

    if (result.success) {
      res.json(success(result, `回滚成功: 删除${result.deleted_rows}行数据`));
    } else {
      res.json(error(-2, result.error || '回滚失败', result));
    }
  } catch (err: any) {
    console.error('[Import] rollback error:', err.message);
    res.json(error(-3, '回滚异常: ' + err.message));
  }
});

// ============================================================
// GET /api/import/logs — 查询导入日志
// ============================================================
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { moduleType, status } = req.query as any;
    const pageNum = parseInt((req.query.page as string) || '1', 10) || 1;
    const limitNum = Math.min(parseInt((req.query.limit as string) || '50', 10) || 50, 200);
    const offset = (pageNum - 1) * limitNum;

    const where: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (moduleType) {
      where.push(`module_type = $${idx++}`);
      params.push(moduleType);
    }
    if (status) {
      where.push(`status = $${idx++}`);
      params.push(status);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM import_logs WHERE ${where.join(' AND ')}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limitNum);
    params.push(offset);
    const result = await pool.query(
      `SELECT l.*, f.original_name, f.file_type, f.size
       FROM import_logs l
       LEFT JOIN file_records f ON l.file_record_id = f.id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json(success({
      logs: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
    }, '查询成功'));
  } catch (err: any) {
    console.error('[Import] logs error:', err.message);
    res.json(error(-1, '查询日志失败: ' + err.message));
  }
});

// ============================================================
// GET /api/import/config — 查询字段映射配置
// ============================================================
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { moduleType } = req.query as any;

    let query = 'SELECT * FROM field_mapping_config WHERE is_active = true';
    const params: any[] = [];

    if (moduleType) {
      query += ' AND module_type = $1';
      params.push(moduleType);
    }

    query += ' ORDER BY module_type, id';

    const result = await pool.query(query, params);

    res.json(success({
      configs: result.rows,
      total: result.rows.length,
    }, '查询成功'));
  } catch (err: any) {
    console.error('[Import] config error:', err.message);
    res.json(error(-1, '查询配置失败: ' + err.message));
  }
});

// ============================================================
// GET /api/import/stats — 导入统计
// ============================================================
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const moduleStats = await pool.query(`
      SELECT module_type,
             COUNT(*) as total_imports,
             SUM(inserted_rows) as total_inserted,
             SUM(updated_rows) as total_updated,
             SUM(skipped_rows) as total_skipped,
             SUM(error_count) as total_errors
      FROM import_logs
      WHERE status = 'completed'
      GROUP BY module_type
      ORDER BY total_imports DESC
    `);

    const recent = await pool.query(`
      SELECT l.*, f.original_name
      FROM import_logs l
      LEFT JOIN file_records f ON l.file_record_id = f.id
      ORDER BY l.created_at DESC
      LIMIT 10
    `);

    const totals = await pool.query(`
      SELECT COUNT(*) as total_jobs,
             SUM(inserted_rows) as total_inserted,
             SUM(updated_rows) as total_updated,
             SUM(skipped_rows) as total_skipped
      FROM import_logs WHERE status = 'completed'
    `);

    res.json(success({
      byModule: moduleStats.rows,
      recent: recent.rows,
      totals: totals.rows[0],
    }, '查询成功'));
  } catch (err: any) {
    console.error('[Import] stats error:', err.message);
    res.json(error(-1, '查询统计失败: ' + err.message));
  }
});

// ============================================================
// 辅助函数: 调用 Python（通过临时 JSON 文件传递参数）
// Windows 下 __pycache__ 文件锁会导致偶发失败，添加重试机制
// ============================================================
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

function callPython(args: string[]): Promise<any> {
  return callPythonWithRetry(args, 0);
}

function callPythonWithRetry(args: string[], attempt: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const tmpFile = path.join(os.tmpdir(), `hse_import_${Date.now()}_${attempt}.json`);
    const argObj: Record<string, string> = {};

    for (const a of args) {
      if (a.startsWith('--')) {
        const eqIdx = a.indexOf('=');
        if (eqIdx > 0) {
          const key = a.substring(2, eqIdx).replace(/-/g, '_');
          argObj[key] = a.substring(eqIdx + 1);
        }
      }
    }

    fs.writeFileSync(tmpFile, JSON.stringify(argObj), 'utf-8');

    // 使用 exec 通过 cmd.exe 执行，避免 Windows 下 spawn 的偶发进程创建失败
    const cmd = `"${PYTHON_PATH}" "${PARSER_SCRIPT}" --json-input "${tmpFile}"`;
    const child = exec(cmd, {
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

    child.on('close', (code: number | null) => {
      const elapsed = Date.now() - startTime;
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

      if (code !== 0) {
        console.error(`[Import] Python执行失败 (attempt=${attempt+1}/${MAX_RETRIES+1}, ${elapsed}ms, code=${code}):`, stderr);

        // 重试：仅在未输出任何内容时（疑似启动失败），且未达到最大重试次数
        if (attempt < MAX_RETRIES && !stdout && !stderr) {
          console.log(`[Import] ${RETRY_DELAY_MS}ms 后重试 (attempt ${attempt + 2})...`);
          setTimeout(() => {
            callPythonWithRetry(args, attempt + 1).then(resolve).catch(reject);
          }, RETRY_DELAY_MS);
          return;
        }

        reject(new Error(stderr || `Python进程退出码: ${code}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(`[Import] Python执行完成 (attempt=${attempt+1}, ${elapsed}ms)`);
        resolve(result);
      } catch (parseErr: any) {
        console.error('[Import] JSON解析失败:', parseErr.message);
        console.error('[Import] stdout:', stdout.substring(0, 500));
        reject(new Error('Python输出JSON解析失败: ' + parseErr.message));
      }
    });

    child.on('error', (err: Error) => {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
      reject(err);
    });
  });
}

// 保留 spawn 引用避免未使用警告
void 0;

export default router;
