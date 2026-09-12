/**
 * WPS 多维表接入层 · 数据访问适配器（Sprint-WPS-01）
 *
 * 职责：
 *   - 把 WPS 多维表 API 转换成系统内部统一的数据访问接口（getSchema / list /
 *     get / create / update / delete），屏蔽 WPS 原始 API 形态变化；
 *   - 不包含任何业务逻辑（人员 / 网格 / 三违 / 巡查规则一律不在此）；
 *   - 附件字段统一归一为 { url, name, fieldId } 结构，不把 WPS 内部附件对象原样暴露；
 *   - 所有错误统一转成 wpsErrors.WpsError（分类化），上层可通过 err.kind 精确分支。
 *
 * 依赖：
 *   - ./wpsClient  （server/services/wpsClient.js，唯一直接接触 WPS HTTP 的模块）
 */
const wpsClient = require('../wpsClient');
const { classify } = require('./wpsErrors');

/**
 * 附件字段归一（链接镜像 v1）：把 WPS 单字段值归一为 attachment 结构。
 * 若未来接入「多维表附件字段/API」，此处扩展为从附件对象提取 url/name/fieldId。
 * @param {unknown} val           WPS 原始字段值（链接/附件对象/undefined）
 * @param {string}  [fieldId]     字段 ID（可空）
 * @returns {Array<{url:string, name?:string, fieldId?:string}>}
 */
function normalizeAttachments(val, fieldId) {
  if (val === undefined || val === null || val === '') return [];
  const items = Array.isArray(val) ? val : [val];
  const out = [];
  for (const it of items) {
    if (it === null || it === undefined || it === '') continue;
    const url = typeof it === 'string' ? it : (it && (it.url || it.value || '')) || '';
    if (!url) continue;
    out.push({ url, name: (it && it.name) || '', fieldId: fieldId || '' });
  }
  return out;
}

/** 读取数据表结构（归一化：数据表/视图/字段/字段类型/字段 ID） */
async function getSchema() {
  return wpsClient.getSchema();
}

/** 分页/全量列举记录 → [{ id, fields, lastModifiedTime, createdTime }] */
async function listRecords({ pageSize = 100 } = {}) {
  return wpsClient.listAllRecords({ pageSize });
}

/** 按 ID 读取单条记录 → { id, fields, ... } | null */
async function getRecord(id) {
  if (id === undefined || id === null || id === '') {
    const e = new Error('getRecord: 缺少记录 ID');
    e.code = -1; e.statusCode = 400;
    throw classify(e);
  }
  return wpsClient.getRecord(id);
}

/**
 * 创建记录。
 * @param {object[]} fieldMaps  [{ 字段名: 值, ... }, ...]
 * @returns {Promise<Array<{id, fields}>>}
 */
async function createRecord(fieldMaps) {
  const maps = Array.isArray(fieldMaps) ? fieldMaps : [fieldMaps];
  return wpsClient.createRecords(maps.filter((m) => m && typeof m === 'object'));
}

/**
 * 更新记录。
 * @param {string|number} id
 * @param {object} fieldsWps  { 字段名: 值, ... }
 */
async function updateRecord(id, fieldsWps) {
  if (id === undefined || id === null || id === '') {
    const e = new Error('updateRecord: 缺少记录 ID');
    e.code = -1; e.statusCode = 400;
    throw classify(e);
  }
  return wpsClient.updateRecords([{ id, fields: fieldsWps || {} }]);
}

/** 删除记录（按 ID，可批量） */
async function deleteRecord(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  return wpsClient.deleteRecords(list.map((x) => String(x)));
}

module.exports = {
  getSchema,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  normalizeAttachments,
};