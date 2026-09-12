/**
 * 驾驶员违章 Excel 解析（前端浏览器内解析，零后端）
 * 复用 monorepo 已安装的 xlsx 依赖（web-naive 通过 ambient module 声明跳过 typecheck）。
 *
 * 表头别名与后端 server/routes/import.js 的 driver-violation.fieldMapping 对齐，
 * 因此「驾驶员五年违章记录汇总.xlsx」原表可直接上传，无需另存为模板格式。
 */
declare module 'xlsx';
import * as XLSX from 'xlsx';

import type { ViolationInput } from './riskRules';

/** 解析后的内部字段名（含 ViolationInput 之外的 name） */
type ParsedField = keyof ViolationInput | 'name';

/** 表头别名 → 内部字段（与 import.js driver-violation 映射一致） */
const HEADER_ALIAS: Record<string, ParsedField> = {
  违章日期: 'date',
  违章时间: 'date',
  发生时间: 'date',
  时间: 'date',
  司机姓名: 'name',
  姓名: 'name',
  驾驶员姓名: 'name',
  驾车人: 'name',
  违章事由: 'desc',
  违章事实描述: 'desc',
  事实描述: 'desc',
  违章事实: 'desc',
  描述: 'desc',
  计分: 'points',
  扣分: 'points',
  扣分数: 'points',
  罚款: 'fine',
  罚款金额: 'fine',
  '罚款(元)': 'fine',
  备注: 'note',
  说明: 'note',
};

export interface ParsedViolation extends ViolationInput {
  name: string;
}

/**
 * 解析违章 Excel → 结构化记录数组
 * @param file 用户选择的 .xlsx / .xls 文件
 * @returns { rows, skipped } rows=有效记录；skipped=因缺姓名跳过的行数
 */
export async function readViolationExcel(file: File): Promise<{
  rows: ParsedViolation[];
  skipped: number;
  sheetName: string;
}> {
  const buf = await file.arrayBuffer();
  // cellDates: true → 日期单元格直接给 Date 对象，避免自行换算 Excel 序列号
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0] || '';
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheetName || !sheet) return { rows: [], skipped: 0, sheetName };

  // 注意：必须保持 raw 默认（true）。若用 raw:false，xlsx 会把日期单元格按显示格式
  // 转成 "5/9/25 7:42" 这类区域化字符串，parseDate 无法还原，判定窗口会整体失效。
  // raw:true + cellDates:true → 日期单元格直接给 Date 对象；文本脏日期仍给字符串，
  // 由 riskRules.parseDate 的脏串抢救分支兜底。
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: '',
  });

  const rows: ParsedViolation[] = [];
  let skipped = 0;
  for (const r of raw) {
    const mapped: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = String(k).trim();
      const field = HEADER_ALIAS[key];
      if (field) mapped[field] = v;
    }
    const name = String(mapped.name ?? '').trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    rows.push({
      name,
      date: mapped.date ?? '',
      desc: mapped.desc ?? '',
      points: mapped.points ?? 0,
      fine: mapped.fine ?? '',
      note: mapped.note ?? '',
    });
  }
  return { rows, skipped, sheetName };
}
