/**
 * WPS 写入端（集成接缝 / integration seam）
 * ----------------------------------------------------------------------------
 * 关键说明：
 *  kdocs 的读写只能通过 WorkBuddy 的「金山文档连接器」(MCP) 完成，
 *  凭据由连接器托管，Node 脚本无法直接持有 token。
 *
 *  本文件把所有 kdocs 操作收敛到一个桥接函数 callKdocsTool(tool, args)：
 *   - 默认 noopBridge：仅把将要调用的工具+参数打印成 JSON（骨架即可"空跑"，
 *     用于 dry-run / 生成操作清单）。
 *   - 真实环境（WorkBuddy 自动化里）：把 callKdocsTool 替换成真正发起
 *     kdocs MCP 工具调用的实现（见文件底部 bridge 说明）。
 *
 *  无论哪种实现，必须实现 429 限频退避（见 withRateLimit）。
 * ----------------------------------------------------------------------------
 */
'use strict';

const config = require('./config');
const { pgRowToKdocsRecord, pgRowToKdocsCells } = require('./mapper');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 限频退避包装：捕获 429001/429002，按要求停止并等待恢复时间后重试。
 * err.recoverAfterSec 由真实桥接实现从连接器响应中提取。
 */
async function withRateLimit(fn, maxRetry = 5) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const code = err && err.code;
      if ((code === 429001 || code === 429002) && attempt < maxRetry) {
        const waitSec = Math.max(1, Number(err.recoverAfterSec) || 5);
        console.warn(`[kdocs] 触发限频(${code})，停止并等待 ${waitSec}s 后重试 (${attempt + 1}/${maxRetry})`);
        await sleep(waitSec * 1000);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// ========== 桥接实现（默认 noop，真实环境替换）==========
// noop：把操作打印成 JSON，便于核查/生成清单。返回伪成功。
const noopBridge = async (tool, args) => {
  console.log('[kdocs:noop]', JSON.stringify({ tool, args }));
  return { code: 0, data: { echoed: true } };
};

// ↓↓↓ 真实环境：把下面这行换成调用 WorkBuddy 金山文档连接器的实现。
//     参考 references/dbsheet.md 确认精确工具名（本骨架使用以下约定名）：
//       dbsheet.list_records / add_records / update_records / delete_records
//       dbsheet.list_fields  / add_fields
let callKdocsTool = noopBridge;

// 允许外部（如自动化运行时）注入真实桥接
function setKdocsBridge(fn) {
  if (typeof fn === 'function') callKdocsTool = fn;
}

// ========== 高层操作 ==========

// 确保表头存在（多维表格：检查字段；普通表格：检查首行）
async function ensureHeader() {
  if (config.DOC_TYPE === 'dbsheet') {
    // 约定：若字段缺失则用 add_fields 补齐（按 config.KDOCS_COLUMNS）
    return withRateLimit(() =>
      callKdocsTool('dbsheet.add_fields', {
        file_id: config.KDOCS_FILE_ID,
        drive_id: config.KDOCS_DRIVE_ID || undefined,
        fields: config.KDOCS_COLUMNS.map((name, i) => ({ name, type: i === 0 ? 'text' : 'text' })),
      })
    );
  }
  // 普通表格：写首行表头
  return withRateLimit(() =>
    callKdocsTool('sheet.update_range', {
      file_id: config.KDOCS_FILE_ID,
      drive_id: config.KDOCS_DRIVE_ID || undefined,
      range: 'A1',
      values: [config.KDOCS_COLUMNS],
    })
  );
}

// 拉取 WPS 当前快照（用于 diff）。返回 { id: record }
async function pullSnapshot() {
  if (config.DOC_TYPE === 'dbsheet') {
    const res = await withRateLimit(() =>
      callKdocsTool('dbsheet.list_records', {
        file_id: config.KDOCS_FILE_ID,
        drive_id: config.KDOCS_DRIVE_ID || undefined,
        page_size: 200,
      })
    );
    const records = (res && res.data && res.data.records) || [];
    const map = {};
    for (const r of records) {
      const id = String(r.fields && r.fields.id != null ? r.fields.id : r.id);
      if (id) map[id] = r;
    }
    return map;
  }
  // 普通表格：读首列找 id
  const res = await withRateLimit(() =>
    callKdocsTool('sheet.get_range', {
      file_id: config.KDOCS_FILE_ID,
      drive_id: config.KDOCS_DRIVE_ID || undefined,
      range: 'A:A',
    })
  );
  const rows = (res && res.data && res.data.values) || [];
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i][0] != null ? String(rows[i][0]) : '';
    if (id) map[id] = { rowIndex: i + 1, cells: rows[i] };
  }
  return map;
}

// 新增/更新分批推送
async function pushUpserts(pgRows, onChange) {
  const batches = chunk(pgRows, config.BATCH_SIZE);
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const ops = batch.map((row) => {
      if (config.DOC_TYPE === 'dbsheet') {
        const rec = pgRowToKdocsRecord(row);
        return { tool: 'dbsheet.add_records', args: { file_id: config.KDOCS_FILE_ID, drive_id: config.KDOCS_DRIVE_ID || undefined, records: [rec] } };
      }
      // 普通表格：追加一行
      return { tool: 'sheet.append_data', args: { file_id: config.KDOCS_FILE_ID, drive_id: config.KDOCS_DRIVE_ID || undefined, values: [pgRowToKdocsCells(row)] } };
    });
    for (const op of ops) {
      await withRateLimit(() => callKdocsTool(op.tool, op.args));
    }
    if (onChange) onChange(`批次 ${bi + 1}/${batches.length} 已推送 ${batch.length} 行`);
    if (config.BATCH_INTERVAL_MS) await sleep(config.BATCH_INTERVAL_MS);
  }
}

// 删除指定 id 的行（WPS 侧软镜像：通常不物理删，仅标记；此处提供删除能力）
async function deleteRows(ids) {
  if (!ids.length) return;
  if (config.DOC_TYPE === 'dbsheet') {
    await withRateLimit(() =>
      callKdocsTool('dbsheet.delete_records', {
        file_id: config.KDOCS_FILE_ID,
        drive_id: config.KDOCS_DRIVE_ID || undefined,
        record_ids: ids.map(String),
      })
    );
  } else {
    // 普通表格：标记删除列更稳妥；此处占位
    console.log('[kdocs] 普通表格删除需按行号，建议在 WPS 增加"已删除"标记列');
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

module.exports = {
  setKdocsBridge,
  ensureHeader,
  pullSnapshot,
  pushUpserts,
  deleteRows,
  withRateLimit,
};
