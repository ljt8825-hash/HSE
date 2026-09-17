// CF-WPS-12A v2：诊断 + 多策略 Attachment 写入
// 收到 argv {recordId, fileName, fileData(base64)}，recordId 由外部 OpenAPI 预创建。
// 先返回 Application 对象诊断信息，再按顺序尝试多种 API 形态写「测试图片」。
// 勿在日志输出 base64 全文。

var a = Context.argv;
var info = { argvKeys: Object.keys(a || {}) };
try { info.appKeys = Object.keys(Application); } catch (e) { info.appKeysErr = String(e); }
var cands = ['Record', 'Sheet', 'Sheets', 'ActiveSheet', 'ActiveView', 'ActiveCell', 'Selection', 'DBCellValue', 'OpenApi', 'Worksheets'];
for (var i = 0; i < cands.length; i++) {
  try { info[cands[i]] = typeof Application[cands[i]]; } catch (e) { info[cands[i]] = 'ERR'; }
}
console.log('DIAG: ' + JSON.stringify(info));

if (!a.recordId || !a.fileData) return { diag: info, error: 'missing argv recordId/fileData' };

var b64 = a.fileData;
var fileName = a.fileName || 'cfwps12a.jpg';
var tried = [];

function trySet(label, fn) {
  try {
    var r = fn();
    tried.push({ step: label, ok: true });
    return r;
  } catch (e) {
    tried.push({ step: label, ok: false, err: String(e && e.message ? e.message : e).slice(0, 160) });
    return null;
  }
}

var setResult = null;
// S1: Sheets(名).Views(1).RecordRange(recordId, '@字段')
setResult = trySet('S1 Sheets(name).Views(1).RecordRange', function () {
  Application.Sheets('H5提交测试').Views(1).RecordRange(a.recordId, '@测试图片').Value =
    Application.DBCellValue([{ fileData: b64, fileName: fileName }]);
  return 'S1 done';
});
// S2: Sheets(名).RecordRange(recordId, '@字段')（无 Views 层）
if (!setResult) setResult = trySet('S2 Sheets(name).RecordRange', function () {
  Application.Sheets('H5提交测试').RecordRange(a.recordId, '@测试图片').Value =
    Application.DBCellValue([{ fileData: b64, fileName: fileName }]);
  return 'S2 done';
});
// S3: 数字索引 Sheets(13)
if (!setResult) setResult = trySet('S3 Sheets(13).Views(1).RecordRange', function () {
  Application.Sheets(13).Views(1).RecordRange(a.recordId, '@测试图片').Value =
    Application.DBCellValue([{ fileData: b64, fileName: fileName }]);
  return 'S3 done';
});
// S4: ActiveView.RecordRange
if (!setResult) setResult = trySet('S4 ActiveView.RecordRange', function () {
  Application.ActiveView.RecordRange(a.recordId, '@测试图片').Value =
    Application.DBCellValue([{ fileData: b64, fileName: fileName }]);
  return 'S4 done';
});

// 回读验证单元格值
var readBack = null;
trySet('READBACK Sheets(name).Views(1).RecordRange', function () {
  var v = Application.Sheets('H5提交测试').Views(1).RecordRange(a.recordId, '@测试图片').Value;
  readBack = JSON.stringify(v).slice(0, 400);
  return 'rb';
});

return { diag: info, tried: tried, setResult: setResult, readBack: readBack };
