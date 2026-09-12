const XLSX = require('xlsx');
const path = require('path');

// 构造「补传台账」测试文件：张忠华 8/29 新增1条巡查记录
// 表头与 grid fieldMapping 对齐；避免与既有记录去重键冲突（upload_time 唯一）
const headers = [
  '片区/班组', '姓名', '提交时间', '日期', '网格等级', '所属岗位',
  '违章人姓名', '违章人性别', '违章人年龄', '车辆类型/保洁员', '上报状态',
  '三违行为', '三违类型', '需要整改', '整改执行人',
];
const row = [
  '长官镇', '张忠华', '2026/08/30 08:00', '2026-08-29', '三级网格长', '管理员',
  '测试整改人', '男', '45', '', '已上报',
  '无三违行为', '', '否', '测试整改人',
];
const aoa = [headers, row];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = headers.map(() => ({ wch: 14 }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '三违检查记录');
const out = path.join(__dirname, '_r6_backfill_zhangzhonghua.xlsx');
XLSX.writeFile(wb, out);
console.log('written:', out);
