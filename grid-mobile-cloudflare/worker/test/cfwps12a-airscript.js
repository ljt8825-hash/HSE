// CF-WPS-12A AirScript 隔离测试脚本（粘贴到 cn229thwalDs 多维表「脚本编辑器」内）
// 功能：接收 webhook argv {testNo, fileName, fileData(base64)}
//       → 在「H5提交测试」表创建 CF-WPS-12A-TEST- 记录
//       → 用官方 DBCellValue(fileData) 写「测试图片」Attachment 字段
//       → 回写 测试状态 并返回记录 id
// 注意：AirScript 为同步脚本，禁用 async/await。勿在日志输出 base64 全文。

var a = Context.argv;
var testNo = a.testNo;
var fileName = a.fileName || 'cfwps12a-test.jpg';
var b64 = a.fileData;
if (!testNo || !b64) {
  return { error: 'missing argv: testNo / fileData', got: Object.keys(a || {}) };
}
console.log('argv ok. testNo=' + testNo + ' fileName=' + fileName + ' b64len=' + b64.length);

try {
  // 1. 创建记录（SheetId=13 即「H5提交测试」）
  var created = Application.Record.CreateRecords({
    SheetId: 13,
    Records: [{
      fields: {
        '测试编号': testNo,
        'employee_code': 'CF-WPS-12A-TEST',
        '测试状态': 'record-created',
        'client_request_id': 'CID-12A-' + testNo,
        '创建时间': new Date().toISOString().slice(0, 10),
      },
    }],
  });
  console.log('CreateRecords ok, type=' + typeof created);
  var rec = Array.isArray(created) ? created[0] : (created && created.records ? created.records[0] : created);
  var recId = rec && (rec.id || rec.ID);
  if (!recId) return { error: 'create ok but no record id', raw: JSON.stringify(created).slice(0, 300) };
  console.log('record id = ' + recId);

  // 2. 官方 base64 → Attachment 写入（DBCellValue）
  Application.Sheets('H5提交测试').Views(1).RecordRange(recId, '@测试图片').Value =
    Application.DBCellValue([{ fileData: b64, fileName: fileName }]);
  console.log('DBCellValue setValue done');

  // 3. 回写状态
  Application.Sheets('H5提交测试').Views(1).RecordRange(recId, '@测试状态').Value = 'attachment-set';

  return { ok: true, recordId: recId, b64len: b64.length };
} catch (e) {
  console.log('ERROR: ' + (e && e.message ? e.message : String(e)));
  return { error: String(e && e.message ? e.message : e) };
}
