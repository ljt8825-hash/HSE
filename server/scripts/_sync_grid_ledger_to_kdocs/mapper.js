/**
 * 映射层：PG 行(snake_case) ↔ WPS 记录(按列名)
 * 所有字段口径集中在此，改字段只动 config.PG_TO_KDOCS。
 */
'use strict';

const config = require('./config');

// PG 行 → 有序 WPS 单元数组（与 config.KDOCS_COLUMNS 顺序一致）
function pgRowToKdocsCells(row) {
  return config.KDOCS_COLUMNS.map((col) => {
    // 找到该列对应的 PG 字段
    const pgField = Object.keys(config.PG_TO_KDOCS).find((k) => config.PG_TO_KDOCS[k] === col);
    if (!pgField) return '';
    const v = row[pgField];
    if (v === null || v === undefined) return '';
    // id 强制文本，避免 WPS 科学计数/数字精度问题
    if (pgField === 'id') return String(v);
    return v;
  });
}

// PG 行 → 以列名为 key 的对象（多维表格 dbsheet 写入用）
function pgRowToKdocsRecord(row) {
  const rec = {};
  for (const [pgField, col] of Object.entries(config.PG_TO_KDOCS)) {
    const v = row[pgField];
    rec[col] = v === null || v === undefined ? '' : (pgField === 'id' ? String(v) : v);
  }
  return rec;
}

// 从 WPS 记录(列名 key) → 仅白名单 PG 字段（阶段 B 回写用）
function kdocsRecordToPgWritable(record) {
  const out = {};
  for (const [pgField, col] of Object.entries(config.PG_TO_KDOCS)) {
    if (!config.TWOWAY_WRITABLE_PG.includes(pgField)) continue;
    const v = record[col];
    out[pgField] = v === null || v === undefined ? null : v;
  }
  return out;
}

module.exports = { pgRowToKdocsCells, pgRowToKdocsRecord, kdocsRecordToPgWritable };
