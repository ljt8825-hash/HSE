/**
 * 网格长巡查 · 业务服务（Sprint-WPS-01）
 *
 * 定位：业务层唯一入口，向上为 Controller / 未来 H5 提供领域方法；向下依赖
 * WpsDbsheetAdapter，不直接接触 WPS API。未来若数据源切到 PostgreSQL，只需
 * 替换 adapter 实现（GridInspectionRepository），本业务方法签名保持稳定。
 *
 * 边界（Sprint 硬约束）：
 *   - 本 Sprint 不切换 PC「网格长巡查台账」数据源，仅为新增接入层做能力准备；
 *   - 不迁移历史数据、不批量改 339 条历史记录、不开发 H5 / GPS / 人员选择 / 照片；
 *   - 人员关联键为 employeeId（postgres 主数据），昵称仅展示不作身份键。
 *
 * 提供的领域能力：
 *   - schema()                      读取多维表结构
 *   - list({limit, mark})           列举记录（mark 用于受控测试过滤）
 *   - get(id)                       读取单条
 *   - probe(recordNo)               按业务编号定位记录（测试 / 后续 H5 复用）
 *   - integrationTest()             受控 CRUD 演练（WPS-INTEGRATION-TEST 标记，自清理）
 */
const adapter = require('./wpsDbsheetAdapter');
const { byBiz } = require('./wpsFieldMap');
const { classify } = require('./wpsErrors');

// 受控测试记录的唯一前缀：用于识别 / 清理，绝不可能与正式业务编号撞车
const TEST_PREFIX = 'WPS-INTEGRATION-TEST';
const TEST_NO_MARK = `${TEST_PREFIX}-${_dateStamp()}`;

function _dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** 记录是否为受控测试记录（按唯一标记字段判断） */
function isTestRecord(fields = {}) {
  const probe = _testProbeValue(fields);
  return typeof probe === 'string' && probe.indexOf(TEST_PREFIX) === 0;
}

/** 在记录的多个候选业务字段里取「测试序列号」（当前板用 姓名/编号，后续用 巡查编号/巡查人员ID） */
function _testProbeValue(fields) {
  const k1 = (byBiz('inspectionId') || {}).wps;       // 巡查编号（预留）
  const k2 = (byBiz('record_no') || {}).wps;          // 编号
  const k3 = (byBiz('inspector_name') || {}).wps;     // 姓名
  for (const k of [k1, k2, k3]) {
    if (k && fields[k] && String(fields[k]).indexOf(TEST_PREFIX) === 0) return String(fields[k]);
  }
  return '';
}

function _serialNo(seq) {
  return `${TEST_NO_MARK}-${String(seq).padStart(3, '0')}`;
}

async function schema() {
  return adapter.getSchema();
}

/** 列举记录；可传 limit 截断、mark 过滤（供受控测试），不落库 */
async function list({ limit = 20, mark } = {}) {
  const records = await adapter.listRecords({ pageSize: 100 });
  let list = records;
  if (mark) list = list.filter((r) => _testProbeValue(r.fields) === mark);
  return list.slice(0, limit);
}

/** 按业务编号定位记录（精确匹配测试序列号或编号） */
async function probe(serialNo) {
  if (!serialNo) throw classify(new Error('probe: 缺少业务编号'));
  const records = await adapter.listRecords({ pageSize: 200 });
  return records.find((r) => {
    const v = _testProbeValue(r.fields);
    return v === serialNo || String(r.fields[byBiz('record_no').wps] || '') === serialNo;
  }) || null;
}

/**
 * 受控 CRUD 演练（WPS-INTEGRATION-TEST）：
 *   schema → list → create → get → update → delete，每步都立即清理，最后兜底清扫
 *   同名测试记录，确保正式业务数据零残留。
 * 结果含每条操作的 kind/ok/detail。
 */
async function integrationTest() {
  const report = { marker: TEST_NO_MARK, startedAt: new Date().toISOString(), steps: [] };
  const step = (kind, fn) => report.steps.push({ kind, ...(fn()) });

  step('schema', () => adapter.getSchema().then((s) => filterSchema(s)));
  step('list-before', () => adapter.listRecords({ pageSize: 5 }).then((r) => summarize(r)));

  // create
  const created = await adapter.createRecord([{
    [byBiz('record_no').wps]: _serialNo(1),
    [byBiz('inspector_name').wps]: TEST_PREFIX,
    [byBiz('violation_behavior').wps]: '集成测试·无三违行为',
    [byBiz('grid_level').wps]: '测试网格',
  }]);
  const recId = created && created[0] && created[0].id;
  report.steps.push({ kind: 'create', ok: !!recId, id: recId });

  // get
  let getOk = false;
  if (recId) {
    const got = await adapter.getRecord(recId);
    getOk = !!got;
    report.steps.push({ kind: 'get', ok: getOk, id: recId });
  }

  // update
  let updateOk = false;
  if (recId) {
    await adapter.updateRecord(recId, { [byBiz('marker').wps]: 'updated-by-integration-test' });
    const after = await adapter.getRecord(recId);
    updateOk = !!(after && String(after.fields[byBiz('marker').wps] || '') === 'updated-by-integration-test');
    report.steps.push({ kind: 'update', ok: updateOk, id: recId });
  }

  // delete
  if (recId) {
    await adapter.deleteRecord(recId);
    const gone = await adapter.getRecord(recId);
    report.steps.push({ kind: 'delete', ok: !gone, id: recId });
  }

  // 兜底清扫：任何残留的测试记录一并删除
  report.cleanup = await cleanupTestRecords();

  // list-after（确认无测试残留）
  const after = await adapter.listRecords({ pageSize: 200 });
  report.steps.push({ kind: 'list-after', residual: after.filter((r) => isTestRecord(r.fields)).length });

  report.finishedAt = new Date().toISOString();
  return report;
}

/** 删除所有带测试标记的记录，返回删除数量（幂等，可反复执行） */
async function cleanupTestRecords() {
  const records = await adapter.listRecords({ pageSize: 200 });
  const ids = records.filter((r) => isTestRecord(r.fields)).map((r) => r.id);
  if (ids.length) await adapter.deleteRecord(ids);
  return { deleted: ids.length };
}

// ---- 摘要辅助（避免报告过大） ----
function filterSchema(s) {
  return {
    fileId: s.fileId,
    sheetId: s.sheetId,
    sheetCount: (s.sheets || []).length,
    inferred: !!s.inferred,
  };
}
function summarize(rows) {
  return { count: rows.length, sampleId: rows[0] ? rows[0].id : null };
}

module.exports = {
  TEST_PREFIX,
  schema,
  list,
  get: adapter.getRecord,
  probe,
  integrationTest,
  cleanupTestRecords,
  isTestRecord,
};